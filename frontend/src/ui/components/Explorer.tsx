import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Api, type Manifest, type TreeNode, type Preferences } from "../api";
import type { Dict } from "../i18n";
import { t } from "../i18n";
import { OverlayScrollArea } from "./OverlayScrollArea";
import { MenuItem, MenuPanel, MenuSeparator } from "./menu";
import { useMenuDismiss } from "../hooks/useMenuDismiss";

const INDENT_STEP = 16;
const INDENT_BASE = 4;
// Keep in sync with `.explorerRow { height: 22px; line-height: 22px; }`
const ROW_HEIGHT = 22;
const OVERSCAN = 8;

/** VS Code–style icons from repo `assets/dark` (served as `/app-assets/assets/dark/…`) */
const DARK = (name: string) => `/app-assets/assets/dark/${name}`;

const ICON = {
  ellipsis: DARK("ellipsis.svg"),
  files: DARK("files.svg"),
  search: DARK("search.svg"),
  extensions: DARK("extensions.svg"),
  settingsGear: DARK("settings-gear.svg"),
  account: DARK("account.svg"),
  chevronRight: DARK("chevron-right.svg"),
  chevronDown: DARK("chevron-down.svg"),
  folder: DARK("folder.svg"),
  folderOpened: DARK("folder-opened.svg"),
  file: DARK("symbol-file.svg"),
  newFile: DARK("new-file.svg"),
  newFolder: DARK("new-folder.svg"),
  cloudUpload: DARK("cloud-upload.svg"),
  export: DARK("export.svg"),
  refresh: DARK("refresh.svg"),
  collapseAll: DARK("collapse-all.svg")
} as const;

const TREE_ICON_PX = 18;

function ExplorerIcon(props: { src: string; className?: string; size?: number; title?: string }) {
  const { src, className, size = 16, title } = props;
  return (
    <img
      src={src}
      alt=""
      title={title}
      width={size}
      height={size}
      draggable={false}
      decoding="async"
      className={["explorerSvgImg", className].filter(Boolean).join(" ")}
    />
  );
}

type ExplorerSidebarView = "files" | "search" | "extensions";

/* ---------------- COMPACT FOLDERS (FIXED) ---------------- */

function flatten(manifest: Manifest, expanded: Set<string>) {
  const { nodes, rootId } = manifest;

  const out: Array<{
    node: TreeNode;
    depth: number;
    label: string;
    chain: string[];
  }> = [];

  function walk(id: string, depth: number) {
    let current = nodes[id];
    if (!current) return;

    let label = current.name;
    const chain = [current.id];

    while (current.type === "folder") {
      const children = (current.childrenIds ?? [])
        .map((cid) => nodes[cid])
        .filter(Boolean);

      if (
        children.length === 1 &&
        children[0].type === "folder"
      ) {
        current = children[0];
        label += " / " + current.name;
        chain.push(current.id);
      } else {
        break;
      }
    }

    out.push({
      node: nodes[id],
      depth,
      label,
      chain,
    });

    const last = nodes[chain[chain.length - 1]];

    if (last.type === "folder" && expanded.has(last.id)) {
      for (const childId of last.childrenIds ?? []) {
        walk(childId, depth + 1);
      }
    }
  }

  walk(rootId, 0);
  return out;
}

type ExplorerFlatRow = ReturnType<typeof flatten>[number];

type DisplayRow =
  | { kind: "node"; item: ExplorerFlatRow }
  | { kind: "inlineCreate"; parentId: string; mode: "file" | "folder"; depth: number };

/** Inserts a VS Code–style “type name here” row as the first child under `parentId`. */
function buildDisplayRows(
  manifest: Manifest,
  expanded: Set<string>,
  inline: null | { mode: "file" | "folder"; parentId: string }
): DisplayRow[] {
  const base = flatten(manifest, expanded);
  const nodes = base.map((item) => ({ kind: "node" as const, item }));
  if (!inline) return nodes;

  const firstChildIdx = base.findIndex((r) => {
    const lid = r.chain[r.chain.length - 1];
    return manifest.nodes[lid]?.parentId === inline.parentId;
  });

  let insertAt: number;
  let depth: number;

  if (firstChildIdx >= 0) {
    insertAt = firstChildIdx;
    depth = base[firstChildIdx].depth;
  } else {
    const pIdx = base.findIndex((r) => r.chain[r.chain.length - 1] === inline.parentId);
    if (pIdx >= 0) {
      insertAt = pIdx + 1;
      depth = base[pIdx].depth + 1;
    } else {
      insertAt = base.length;
      depth = 0;
    }
  }

  const copy: DisplayRow[] = [...nodes];
  copy.splice(insertAt, 0, {
    kind: "inlineCreate",
    parentId: inline.parentId,
    mode: inline.mode,
    depth
  });
  return copy;
}

/* ---------------- GUIDES ---------------- */

function computeGuideColumns(rows: Array<{ depth: number }>) {
  const n = rows.length;

  return rows.map((r, i) => {
    const cols: number[] = [];

    for (let level = 1; level < r.depth; level++) {
      let hasBelow = false;

      for (let j = i + 1; j < n; j++) {
        if (rows[j].depth < level) break;
        if (rows[j].depth === level) {
          hasBelow = true;
          break;
        }
      }

      if (hasBelow) cols.push(level);
    }

    return cols;
  });
}

function parentFolderId(manifest: Manifest, node: TreeNode): string {
  if (node.type === "folder") return node.id;
  return node.parentId ?? manifest.rootId;
}

/* ---------------- COMPONENT ---------------- */

export function Explorer(props: {
  dict: Dict;
  manifest: Manifest;
  containerName: string;
  activeId?: string;
  onSelect: (node: TreeNode) => void;
  onRefreshRequested: () => void;
  onError: (e: unknown) => void;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  onImportRequest: (targetFolderId?: string) => void;
  onExport: () => void;
  theme: Preferences["theme"];
  locale: Preferences["locale"];
  onThemeToggle: () => void;
  onLocaleToggle: () => void;
  onMenuRefresh: () => void;
  onMenuCloseContainer: () => void;
}) {
  const explorerRootRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const sideSearchInputRef = useRef<HTMLInputElement | null>(null);
  const renameDismissRef = useRef(false);

  const [sidebarView, setSidebarView] = useState<ExplorerSidebarView>("files");
  const [bottomMenuOpen, setBottomMenuOpen] = useState<null | "settings" | "account">(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [viewportH, setViewportH] = useState(400);

  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set([props.manifest.rootId])
  );

  const [scrollTop, setScrollTop] = useState(0);
  const [hoveredGuide, setHoveredGuide] = useState<number | null>(null);

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [inlineCreate, setInlineCreate] = useState<null | { mode: "file" | "folder"; parentId: string }>(null);
  const [inlineNameDraft, setInlineNameDraft] = useState("");
  const inlineNameInputRef = useRef<HTMLInputElement | null>(null);
  const inlineDismissRef = useRef(false);
  const createSubmittingRef = useRef(false);

  useEffect(() => {
    setExpanded(new Set([props.manifest.rootId]));
  }, [props.manifest.rootId]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight));
    ro.observe(el);
    setViewportH(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const displayRows = useMemo(
    () => buildDisplayRows(props.manifest, expanded, inlineCreate),
    [props.manifest, expanded, inlineCreate]
  );

  const guideDepthRows = useMemo(
    () => displayRows.map((r) => ({ depth: r.kind === "node" ? r.item.depth : r.depth })),
    [displayRows]
  );

  // When selection comes from breadcrumbs (folder clicks), make sure the path is expanded
  // so the selected folder/file becomes visible in the virtual list.
  useEffect(() => {
    if (!props.activeId) return;
    const start = props.manifest.nodes[props.activeId];
    if (!start) return;

    setExpanded((prev) => {
      const next = new Set(prev);
      let changed = false;

      let cur: typeof start | undefined = start;
      while (cur) {
        if (!next.has(cur.id)) {
          next.add(cur.id);
          changed = true;
        }
        if (!cur.parentId) break;
        cur = props.manifest.nodes[cur.parentId];
      }

      return changed ? next : prev;
    });
  }, [props.activeId, props.manifest]);

  const guideColumns = useMemo(
    () => computeGuideColumns(guideDepthRows),
    [guideDepthRows]
  );

  const totalHeight = displayRows.length * ROW_HEIGHT;

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(
    displayRows.length,
    Math.ceil((scrollTop + viewportH) / ROW_HEIGHT) + OVERSCAN
  );

  const visible = displayRows.slice(start, end);

  // Scroll selection into view when activeId changes.
  useEffect(() => {
    if (!props.activeId || inlineCreate) return;
    const idx = displayRows.findIndex(
      (r) => r.kind === "node" && r.item.chain.includes(props.activeId!)
    );
    if (idx < 0) return;
    containerRef.current?.scrollTo({ top: idx * ROW_HEIGHT });
  }, [props.activeId, displayRows, inlineCreate]);

  useEffect(() => {
    if (!inlineCreate) return;
    const idx = displayRows.findIndex((r) => r.kind === "inlineCreate");
    if (idx < 0) return;
    containerRef.current?.scrollTo({ top: Math.max(0, idx - 2) * ROW_HEIGHT });
  }, [inlineCreate, displayRows]);

  const toggleFolder = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const collapseAllFolders = () => {
    setExpanded(new Set([props.manifest.rootId]));
    containerRef.current?.scrollTo({ top: 0 });
  };

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  const ignoreAppMenu = useCallback((target: EventTarget | null) => {
    return target instanceof Element && !!target.closest("[data-app-menu]");
  }, []);

  useMenuDismiss({
    open: ctxMenu !== null,
    onClose: closeCtxMenu,
    ignoreInside: ignoreAppMenu
  });

  const ignoreActivityFlyout = useCallback((target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;
    return !!target.closest(".explorerActBtnWrap") || !!target.closest("[data-app-menu]");
  }, []);

  useMenuDismiss({
    open: bottomMenuOpen !== null,
    onClose: () => setBottomMenuOpen(null),
    ignoreInside: ignoreActivityFlyout
  });

  const ignoreHeaderEllipsis = useCallback((target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;
    return !!target.closest(".explorerHeaderEllipsisWrap") || !!target.closest("[data-app-menu]");
  }, []);

  useMenuDismiss({
    open: headerMenuOpen,
    onClose: () => setHeaderMenuOpen(false),
    ignoreInside: ignoreHeaderEllipsis
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => closeCtxMenu();
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [closeCtxMenu]);

  useEffect(() => {
    if (!renamingId) return;
    const id = requestAnimationFrame(() => {
      const input = renameInputRef.current;
      if (input) {
        input.focus();
        input.select();
      }
    });
    return () => cancelAnimationFrame(id);
  }, [renamingId]);

  useEffect(() => {
    if (sidebarView !== "search") return;
    const id = requestAnimationFrame(() => sideSearchInputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [sidebarView]);

  useEffect(() => {
    if (!inlineCreate) return;
    const id = requestAnimationFrame(() => {
      const el = inlineNameInputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    });
    return () => cancelAnimationFrame(id);
  }, [inlineCreate]);

  const submitRename = async () => {
    if (renameDismissRef.current) {
      renameDismissRef.current = false;
      return;
    }
    const id = renamingId;
    if (!id) return;
    const name = renameDraft.trim();
    setRenamingId(null);
    if (!name) return;
    try {
      await Api.renameNode(id, name);
      props.onRefreshRequested();
    } catch (e) {
      props.onError(e);
    }
  };

  const openCtxAt = (clientX: number, clientY: number, nodeId: string) => {
    const pad = 8;
    const mw = 220;
    const mh = 320;
    const x = Math.min(clientX, window.innerWidth - mw - pad);
    const y = Math.min(clientY, window.innerHeight - mh - pad);
    setCtxMenu({ x, y, nodeId });
  };

  const cancelInlineCreate = useCallback(() => {
    setInlineCreate(null);
    setInlineNameDraft("");
    createSubmittingRef.current = false;
  }, []);

  const startInlineCreateFile = useCallback((parentFolderId: string) => {
    setRenamingId(null);
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(parentFolderId);
      return next;
    });
    setInlineNameDraft("untitled.txt");
    setInlineCreate({ mode: "file", parentId: parentFolderId });
  }, []);

  const startInlineCreateFolder = useCallback((parentFolderId: string) => {
    setRenamingId(null);
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(parentFolderId);
      return next;
    });
    setInlineNameDraft("");
    setInlineCreate({ mode: "folder", parentId: parentFolderId });
  }, []);

  const submitInlineCreate = useCallback(async () => {
    if (inlineDismissRef.current) {
      inlineDismissRef.current = false;
      return;
    }
    if (!inlineCreate || createSubmittingRef.current) return;
    const name = inlineNameDraft.trim();
    if (!name) {
      cancelInlineCreate();
      return;
    }
    createSubmittingRef.current = true;
    const { mode, parentId } = inlineCreate;
    try {
      if (mode === "file") {
        const { node } = await Api.createFile(parentId, name);
        setExpanded((prev) => {
          const next = new Set(prev);
          next.add(parentId);
          return next;
        });
        props.onRefreshRequested();
        props.onSelect(node);
      } else {
        const { node } = await Api.mkdir(parentId, name);
        setExpanded((prev) => {
          const next = new Set(prev);
          next.add(parentId);
          return next;
        });
        props.onRefreshRequested();
        props.onSelect(node);
      }
      cancelInlineCreate();
    } catch (e) {
      props.onError(e);
    } finally {
      createSubmittingRef.current = false;
    }
  }, [
    inlineCreate,
    inlineNameDraft,
    cancelInlineCreate,
    props.onRefreshRequested,
    props.onSelect,
    props.onError
  ]);

  const ctxMenuContent = ctxMenu ? (() => {
    const node = props.manifest.nodes[ctxMenu.nodeId];
    if (!node) return null;
    const isRoot = ctxMenu.nodeId === props.manifest.rootId;
    const folderForActions = parentFolderId(props.manifest, node);

    const runNewFile = () => {
      closeCtxMenu();
      startInlineCreateFile(folderForActions);
    };

    const runNewFolder = () => {
      closeCtxMenu();
      startInlineCreateFolder(folderForActions);
    };

    const runImport = () => {
      closeCtxMenu();
      props.onImportRequest(folderForActions);
    };

    const runExport = () => {
      closeCtxMenu();
      window.open(Api.exportZipUrl(node.id), "_blank");
    };

    const runDelete = async () => {
      closeCtxMenu();
      if (isRoot) return;
      if (!window.confirm(t(props.dict, "explorer.delete_confirm"))) return;
      try {
        await Api.deleteNode(node.id);
        props.onRefreshRequested();
      } catch (e) {
        props.onError(e);
      }
    };

    const runRename = () => {
      closeCtxMenu();
      setRenamingId(node.id);
      setRenameDraft(node.name);
    };

    return (
      <MenuPanel variant="fixed" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
        <MenuItem onClick={runNewFile}>{t(props.dict, "explorer.new_file")}</MenuItem>
        <MenuItem onClick={runNewFolder}>{t(props.dict, "explorer.new_branch")}</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={runImport}>{t(props.dict, "explorer.import")}</MenuItem>
        <MenuItem onClick={runExport}>{t(props.dict, "explorer.export")}</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={runRename}>{t(props.dict, "explorer.rename")}</MenuItem>
        {!isRoot ? (
          <MenuItem danger onClick={runDelete}>
            {t(props.dict, "explorer.delete")}
          </MenuItem>
        ) : null}
      </MenuPanel>
    );
  })() : null;

  const titleText = (props.containerName || t(props.dict, "explorer.title")).trim() || t(props.dict, "explorer.title");

  return (
    <div className="explorerPane" ref={explorerRootRef}>
      <div
        className="explorerActivityBar"
        role="tablist"
        aria-orientation="vertical"
        aria-label={t(props.dict, "explorer.title")}
      >
        <button
          type="button"
          role="tab"
          aria-selected={sidebarView === "files"}
          className={`explorerActBtn ${sidebarView === "files" ? "explorerActBtnActive" : ""}`}
          title={t(props.dict, "explorer.sidebar_files")}
          onClick={() => setSidebarView("files")}
        >
          <ExplorerIcon src={ICON.files} className="explorerActIconImg" size={22} />
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={sidebarView === "search"}
          className={`explorerActBtn ${sidebarView === "search" ? "explorerActBtnActive" : ""}`}
          title={t(props.dict, "explorer.sidebar_search")}
          onClick={() => setSidebarView("search")}
        >
          <ExplorerIcon src={ICON.search} className="explorerActIconImg" size={22} />
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={sidebarView === "extensions"}
          className={`explorerActBtn ${sidebarView === "extensions" ? "explorerActBtnActive" : ""}`}
          title={t(props.dict, "explorer.sidebar_extensions")}
          onClick={() => setSidebarView("extensions")}
        >
          <ExplorerIcon src={ICON.extensions} className="explorerActIconImg" size={22} />
        </button>

        <div className="explorerActBottomGroup" aria-hidden={false}>
          <div className="explorerActBtnWrap">
            <button
              type="button"
              className={`explorerActBtn ${bottomMenuOpen === "settings" ? "explorerActBtnActive" : ""}`}
              title={t(props.dict, "menu.settings")}
              aria-label={t(props.dict, "menu.settings")}
              onClick={() => setBottomMenuOpen((prev) => (prev === "settings" ? null : "settings"))}
            >
              <ExplorerIcon src={ICON.settingsGear} className="explorerActIconImg" size={22} />
            </button>
            {bottomMenuOpen === "settings" ? (
              <MenuPanel variant="anchorRight">
                <MenuItem
                  onClick={() => {
                    setBottomMenuOpen(null);
                    props.onThemeToggle();
                  }}
                >
                  {props.theme === "dark" ? t(props.dict, "menu.theme_dark") : t(props.dict, "menu.theme_light")}
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setBottomMenuOpen(null);
                    props.onLocaleToggle();
                  }}
                >
                  {props.locale}
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  onClick={() => {
                    setBottomMenuOpen(null);
                    props.onMenuRefresh();
                  }}
                >
                  {t(props.dict, "explorer.refresh")}
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setBottomMenuOpen(null);
                    props.onMenuCloseContainer();
                  }}
                >
                  {t(props.dict, "menu.close_container")}
                </MenuItem>
              </MenuPanel>
            ) : null}
          </div>

          <div className="explorerActBtnWrap">
            <button
              type="button"
              className={`explorerActBtn ${bottomMenuOpen === "account" ? "explorerActBtnActive" : ""}`}
              title={t(props.dict, "menu.account")}
              aria-label={t(props.dict, "menu.account")}
              onClick={() => setBottomMenuOpen((prev) => (prev === "account" ? null : "account"))}
            >
              <ExplorerIcon src={ICON.account} className="explorerActIconImg" size={22} />
            </button>
            {bottomMenuOpen === "account" ? (
              <MenuPanel variant="anchorRight">
                <MenuItem
                  onClick={() => {
                    setBottomMenuOpen(null);
                    alert(t(props.dict, "app.name"));
                  }}
                >
                  {t(props.dict, "menu.about")}
                </MenuItem>
              </MenuPanel>
            ) : null}
          </div>
        </div>
      </div>
      <div className="explorerMainColumn">
      <div className="explorerHeader">
        <span className="explorerTitle" title={titleText}>
          {titleText}
        </span>
        <div className="explorerHeaderEllipsisWrap">
          <button
            type="button"
            className="explorerToolBtn explorerEllipsisBtn"
            aria-expanded={headerMenuOpen}
            aria-haspopup="menu"
            aria-label={t(props.dict, "explorer.more_actions")}
            onClick={() => setHeaderMenuOpen((v) => !v)}
          >
            <ExplorerIcon src={ICON.ellipsis} className="explorerEllipsisImg" size={18} />
          </button>
          {headerMenuOpen ? (
            <MenuPanel variant="anchorRight" className="explorerHeaderMenuPanel">
              <MenuItem
                className="explorerMenuItemWithIcon"
                onClick={() => {
                  setHeaderMenuOpen(false);
                  props.onImportRequest();
                }}
              >
                <ExplorerIcon src={ICON.cloudUpload} size={16} className="explorerMenuItemIcon" />
                <span>{t(props.dict, "explorer.import")}</span>
              </MenuItem>
              <MenuItem
                className="explorerMenuItemWithIcon"
                onClick={() => {
                  setHeaderMenuOpen(false);
                  props.onExport();
                }}
              >
                <ExplorerIcon src={ICON.export} size={16} className="explorerMenuItemIcon" />
                <span>{t(props.dict, "explorer.export")}</span>
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                className="explorerMenuItemWithIcon"
                onClick={() => {
                  setHeaderMenuOpen(false);
                  props.onRefreshRequested();
                }}
              >
                <ExplorerIcon src={ICON.refresh} size={16} className="explorerMenuItemIcon" />
                <span>{t(props.dict, "explorer.refresh")}</span>
              </MenuItem>
              <MenuItem
                className="explorerMenuItemWithIcon"
                onClick={() => {
                  setHeaderMenuOpen(false);
                  collapseAllFolders();
                }}
              >
                <ExplorerIcon src={ICON.collapseAll} size={16} className="explorerMenuItemIcon" />
                <span>{t(props.dict, "explorer.collapse_all")}</span>
              </MenuItem>
            </MenuPanel>
          ) : null}
        </div>
      </div>
      <div className="explorerBody">
        {sidebarView === "search" ? (
          <OverlayScrollArea className="explorerSidePanel explorerSideSearch">
            <input
              ref={sideSearchInputRef}
              className="input explorerSideSearchInput"
              value={props.searchQuery}
              onChange={(e) => props.onSearchQueryChange(e.target.value)}
              placeholder={t(props.dict, "explorer.search_placeholder")}
              aria-label={t(props.dict, "explorer.sidebar_search")}
            />
          </OverlayScrollArea>
        ) : null}
        {sidebarView === "extensions" ? (
          <OverlayScrollArea className="explorerSidePanel explorerSideExtensions">
            <p className="explorerSideHint">{t(props.dict, "explorer.extensions_hint")}</p>
          </OverlayScrollArea>
        ) : null}
        {sidebarView === "files" ? (
      <OverlayScrollArea
        ref={containerRef}
        className="explorerContainer"
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        onContextMenu={(e) => {
          if ((e.target as HTMLElement).closest(".explorerRow")) return;
          e.preventDefault();
          openCtxAt(e.clientX, e.clientY, props.manifest.rootId);
        }}
      >
        <div
          className="explorerVirtualInner"
          style={{ minHeight: totalHeight }}
        >
          {start > 0 ? (
            <div className="explorerVirtualPad" style={{ height: start * ROW_HEIGHT }} aria-hidden />
          ) : null}
          {visible.map((row, i) => {
            const index = start + i;
            const guides = guideColumns[index];

            if (row.kind === "inlineCreate") {
              const { depth, mode } = row;
              return (
                <div
                  key="explorer-inline-create"
                  className="explorerRow explorerRowInlineCreate"
                  style={{
                    paddingLeft: depth * INDENT_STEP + INDENT_BASE
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  {guides.map((level) => {
                    const left = INDENT_BASE + level * INDENT_STEP - INDENT_STEP / 2;
                    return (
                      <span
                        key={level}
                        className={`explorerGuide ${hoveredGuide === level ? "hovered" : ""}`}
                        style={{ left }}
                        onMouseEnter={() => setHoveredGuide(level)}
                        onMouseLeave={() => setHoveredGuide(null)}
                      />
                    );
                  })}
                  <span className="explorerChevronPlaceholder" />
                  <ExplorerIcon
                    src={mode === "file" ? ICON.file : ICON.folder}
                    size={TREE_ICON_PX}
                    className="explorerTreeTypeIcon"
                  />
                  <input
                    ref={inlineNameInputRef}
                    className="explorerRenameInput explorerInlineCreateInput"
                    value={inlineNameDraft}
                    onChange={(e) => setInlineNameDraft(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void submitInlineCreate();
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        inlineDismissRef.current = true;
                        cancelInlineCreate();
                      }
                    }}
                    onBlur={() => void submitInlineCreate()}
                    placeholder={
                      mode === "file"
                        ? t(props.dict, "explorer.new_file_prompt")
                        : t(props.dict, "explorer.new_folder_prompt")
                    }
                    aria-label={
                      mode === "file"
                        ? t(props.dict, "explorer.new_file")
                        : t(props.dict, "explorer.new_branch")
                    }
                  />
                </div>
              );
            }

            const { node, depth, label, chain } = row.item;
            const isFolder = node.type === "folder";
            const lastId = chain[chain.length - 1];
            const isExpanded = isFolder && expanded.has(lastId);
            const leafNode = props.manifest.nodes[lastId];
            const isActive = props.activeId && chain.some((id) => id === props.activeId);
            const isRenaming = renamingId === lastId && leafNode;
            const stickyFolder =
              isFolder
                ? {
                    position: "sticky" as const,
                    top: depth * ROW_HEIGHT,
                    zIndex: 20 + depth
                  }
                : {};

            return (
              <div
                key={`${node.id}-${chain.join("-")}-${index}`}
                data-node-id={lastId}
                className={`explorerRow ${isFolder ? "explorerRowFolder" : ""} ${isActive ? "explorerRowActive" : ""} ${isFolder ? "explorerRowRoot" : ""}`}
                style={{
                  paddingLeft: depth * INDENT_STEP + INDENT_BASE,
                  ...stickyFolder
                }}
                onClick={() => {
                  if (renamingId || inlineCreate) return;
                  props.onSelect(props.manifest.nodes[lastId]);
                  if (isFolder) toggleFolder(lastId);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openCtxAt(e.clientX, e.clientY, lastId);
                }}
              >
                {guides.map((level) => {
                  const left = INDENT_BASE + level * INDENT_STEP - INDENT_STEP / 2;

                  return (
                    <span
                      key={level}
                      className={`explorerGuide ${
                        hoveredGuide === level ? "hovered" : ""
                      }`}
                      style={{ left }}
                      onMouseEnter={() => setHoveredGuide(level)}
                      onMouseLeave={() => setHoveredGuide(null)}
                    />
                  );
                })}

                <div className={`explorerRowMain ${isFolder ? "explorerRowMainWithFolderStrip" : ""}`}>
                {isFolder ? (
                  <button
                    type="button"
                    className="explorerChevron"
                    data-expanded={isExpanded}
                    aria-expanded={isExpanded}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFolder(lastId);
                    }}
                  >
                    <ExplorerIcon
                      src={isExpanded ? ICON.chevronDown : ICON.chevronRight}
                      size={TREE_ICON_PX}
                      className="explorerChevronImg"
                    />
                  </button>
                ) : (
                  <span className="explorerChevronPlaceholder" />
                )}

                {isFolder ? (
                  <ExplorerIcon
                    src={isExpanded ? ICON.folderOpened : ICON.folder}
                    size={TREE_ICON_PX}
                    className="explorerTreeTypeIcon"
                  />
                ) : (
                  <ExplorerIcon src={ICON.file} size={TREE_ICON_PX} className="explorerTreeTypeIcon" />
                )}

                {isRenaming && leafNode ? (
                  <input
                    ref={renameInputRef}
                    className="explorerRenameInput"
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void submitRename();
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        renameDismissRef.current = true;
                        setRenamingId(null);
                      }
                    }}
                    onBlur={() => void submitRename()}
                  />
                ) : (
                  <span className="explorerLabel">{label}</span>
                )}
                </div>

                {isFolder ? (
                  <div
                    className="explorerRowRootActions"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="explorerRowRootBtn"
                      title={t(props.dict, "explorer.new_file")}
                      onClick={(e) => {
                        e.stopPropagation();
                        startInlineCreateFile(lastId);
                      }}
                    >
                      <ExplorerIcon src={ICON.newFile} size={TREE_ICON_PX} className="explorerRowRootIcon" />
                    </button>
                    <button
                      type="button"
                      className="explorerRowRootBtn"
                      title={t(props.dict, "explorer.new_branch")}
                      onClick={(e) => {
                        e.stopPropagation();
                        startInlineCreateFolder(lastId);
                      }}
                    >
                      <ExplorerIcon src={ICON.newFolder} size={TREE_ICON_PX} className="explorerRowRootIcon" />
                    </button>
                    <button
                      type="button"
                      className="explorerRowRootBtn"
                      title={t(props.dict, "explorer.import")}
                      onClick={() => props.onImportRequest(lastId)}
                    >
                      <ExplorerIcon src={ICON.cloudUpload} size={TREE_ICON_PX} className="explorerRowRootIcon" />
                    </button>
                    <button
                      type="button"
                      className="explorerRowRootBtn"
                      title={t(props.dict, "explorer.export")}
                      onClick={() => {
                        window.open(Api.exportZipUrl(lastId), "_blank");
                      }}
                    >
                      <ExplorerIcon src={ICON.export} size={TREE_ICON_PX} className="explorerRowRootIcon" />
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
          {end < displayRows.length ? (
            <div
              className="explorerVirtualPad"
              style={{ height: (displayRows.length - end) * ROW_HEIGHT }}
              aria-hidden
            />
          ) : null}
        </div>
      </OverlayScrollArea>
        ) : null}
      </div>
      </div>
      {ctxMenuContent ? createPortal(ctxMenuContent, document.body) : null}
    </div>
  );
}
