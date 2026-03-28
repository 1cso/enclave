import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Api, type AppConfig, type ContainerInfo, type Manifest, type Preferences, type TreeNode } from "./api";
import { loadLocale, t, type Dict, type LocaleKey } from "./i18n";
import { applyTheme, type Theme } from "./theme";
import { MenuBar } from "./components/MenuBar";
import { MenuPanel, MenuRow, MenuRowKbd, MenuSeparator } from "./components/menu";
import { useMenuDismiss } from "./hooks/useMenuDismiss";
import { Home } from "./components/Home";
import { SplitPane } from "./SplitPane";
import { Explorer } from "./components/Explorer";
import { EditorLayoutTree } from "./components/EditorLayoutTree";
import {
  collectLeafIds,
  countLeaves,
  createLeaf,
  findLeafActiveTabId,
  findLeafFileId,
  findLeafIdByTabId,
  findLeafTabCount,
  firstLeafId,
  newEditorTabId,
  pruneEditorToTabs,
  removeLeaf,
  removeTabFromLeaf,
  setLeafTabAndFile,
  setSplitRatio,
  MAX_EDITOR_LEAVES,
  splitFocusedLeaf,
  tabsForLeaf,
  type EditorNode,
  type EditorOpenTab
} from "./editorLayout";

const MIN_EDITOR_HEIGHT_FOR_H_SPLIT = 240;

const emptyCfg: AppConfig = { version: 1, preferences: { theme: "dark", locale: "en_EN" }, recentContainers: [] };

function inferDirectoryPath(files: FileList | null): string {
  if (!files || files.length === 0) return "";
  const first = files[0] as File & { path?: string; webkitRelativePath?: string };
  const fullPath = first.path ?? "";
  const rel = first.webkitRelativePath ?? "";
  if (fullPath && rel) {
    const relNorm = rel.replace(/\//g, "\\");
    const rootName = relNorm.split("\\")[0] ?? "";
    const idx = fullPath.toLowerCase().lastIndexOf(relNorm.toLowerCase());
    if (idx >= 0 && rootName) return fullPath.slice(0, idx + rootName.length);
  }
  if (fullPath) {
    const normalized = fullPath.replace(/\//g, "\\");
    const parts = normalized.split("\\");
    if (parts.length > 1) parts.pop();
    return parts.join("\\");
  }
  return "";
}

function joinPath(basePath: string, name: string): string {
  const b = basePath.trim().replace(/[\\/]+$/, "");
  const n = name.trim().replace(/^[\\/]+/, "");
  if (!b) return n;
  if (!n) return b;
  return `${b}\\${n}`;
}

export function App() {
  const [cfg, setCfg] = useState<AppConfig>(emptyCfg);
  const [dict, setDict] = useState<Dict>({});
  const [container, setContainer] = useState<ContainerInfo | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [selected, setSelected] = useState<TreeNode | undefined>(undefined);
  const [openTabs, setOpenTabs] = useState<EditorOpenTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [editorRoot, setEditorRoot] = useState<EditorNode | null>(null);
  const [focusedLeafId, setFocusedLeafId] = useState<string | null>(null);
  const focusedLeafIdRef = useRef<string | null>(null);
  const editorRootRef = useRef<EditorNode | null>(null);
  const activeTabIdRef = useRef<string | null>(null);
  const editorPaneBodyRef = useRef<HTMLDivElement | null>(null);
  const [ellipsisMenu, setEllipsisMenu] = useState<{ x: number; y: number; leafId: string } | null>(null);
  const [altSplitPreview, setAltSplitPreview] = useState(false);
  const [containerDialog, setContainerDialog] = useState<null | "create" | "openPassword">(null);
  const [containerLocationInput, setContainerLocationInput] = useState("");
  const [containerPathInput, setContainerPathInput] = useState("");
  const [containerPasswordInput, setContainerPasswordInput] = useState("");
  const [containerPasswordConfirmInput, setContainerPasswordConfirmInput] = useState("");
  const [containerNameInput, setContainerNameInput] = useState("MyContainer");
  const [openTargetPath, setOpenTargetPath] = useState("");
  const createLocationPickerRef = useRef<HTMLInputElement | null>(null);
  const openContainerPickerRef = useRef<HTMLInputElement | null>(null);
  const menuImportRef = useRef<HTMLInputElement | null>(null);
  const importTargetRef = useRef<string | null>(null);

  useEffect(() => {
    focusedLeafIdRef.current = focusedLeafId;
  }, [focusedLeafId]);

  useEffect(() => {
    editorRootRef.current = editorRoot;
  }, [editorRoot]);

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  const openTabsRef = useRef<EditorOpenTab[]>([]);
  useEffect(() => {
    openTabsRef.current = openTabs;
  }, [openTabs]);

  const requestImport = useCallback((targetFolderId?: string) => {
    importTargetRef.current = targetFolderId ?? null;
    menuImportRef.current?.click();
  }, []);

  const prefs: Preferences = cfg.preferences;
  const theme: Theme = prefs.theme;
  const locale: LocaleKey = prefs.locale;

  useEffect(() => {
    const boot = async () => {
      try {
        const c = await Api.config();
        setCfg(c);
      } catch (e) {
        setError((e as Error).message);
      }
    };
    void boot();
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const run = async () => {
      try {
        setDict(await loadLocale(locale));
      } catch {
        setDict({});
      }
    };
    void run();
  }, [locale]);

  const refreshTree = async () => {
    try {
      const out = await Api.tree();
      setManifest(out.tree);
    } catch (e) {
      const code = (e as any)?.code;
      if (code === "NO_CONTAINER_OPEN") {
        setContainer(null);
        setManifest(null);
        setSelected(undefined);
        setOpenTabs([]);
        setActiveTabId(null);
      } else {
        setError((e as Error).message);
      }
    }
  };

  useEffect(() => {
    if (!container) return;
    void refreshTree();
    setSearchQuery("");
    setSelected(undefined);
    setOpenTabs([]);
    setActiveTabId(null);
    setEditorRoot(null);
    setFocusedLeafId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container?.containerPath]);

  // Keep tabs when file удалён/переименован в manifest (fileId остаётся, узел обновится)
  useEffect(() => {
    if (!manifest) return;
    setOpenTabs((prev) => {
      const next = prev.filter((t) => manifest.nodes[t.fileId]);
      setActiveTabId((aid) => {
        if (aid && next.some((t) => t.tabId === aid)) return aid;
        return next[0]?.tabId ?? null;
      });
      return next;
    });
  }, [manifest]);

  useEffect(() => {
    if (!manifest || !selected) return;
    if (!manifest.nodes[selected.id]) setSelected(undefined);
  }, [manifest, selected]);

  useEffect(() => {
    if (openTabs.length === 0) {
      setActiveTabId(null);
      setEditorRoot(null);
      setFocusedLeafId(null);
      return;
    }
    setActiveTabId((a) =>
      a && openTabs.some((t) => t.tabId === a) ? a : openTabs[0].tabId
    );
  }, [openTabs]);

  useEffect(() => {
    if (openTabs.length === 0) return;
    const valid = new Set(openTabs.map((t) => t.tabId));
    let createdId: string | null = null;
    setEditorRoot((prev) => {
      if (prev === null) {
        const primary =
          openTabs.find((t) => t.tabId === activeTabIdRef.current) ?? openTabs[0];
        const leaf = createLeaf(primary.tabId);
        createdId = leaf.id;
        return leaf;
      }
      return pruneEditorToTabs(prev, valid);
    });
    if (createdId) setFocusedLeafId(createdId);
  }, [openTabs]);

  useEffect(() => {
    if (!editorRoot || !focusedLeafId) return;
    if (!collectLeafIds(editorRoot).includes(focusedLeafId)) {
      setFocusedLeafId(firstLeafId(editorRoot));
    }
  }, [editorRoot, focusedLeafId]);

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.key === "Alt" || e.code === "AltLeft" || e.code === "AltRight") setAltSplitPreview(true);
    };
    const ku = (e: KeyboardEvent) => {
      if (e.key === "Alt" || e.code === "AltLeft" || e.code === "AltRight") setAltSplitPreview(false);
    };
    const blur = () => setAltSplitPreview(false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", blur);
    };
  }, []);

  const onError = (e: unknown) => {
    setError((e as Error).message ?? t(dict, "errors.generic"));
  };

  const resetContainerDialog = useCallback(() => {
    setContainerDialog(null);
    setContainerLocationInput("");
    setContainerPathInput("");
    setContainerPasswordInput("");
    setContainerPasswordConfirmInput("");
    setContainerNameInput("MyContainer");
    setOpenTargetPath("");
  }, []);

  const applyOpenedContainer = useCallback((out: { container: ContainerInfo }) => {
    setContainer(out.container);
    setSelected(undefined);
    setOpenTabs([]);
    setActiveTabId(null);
    setEditorRoot(null);
    setFocusedLeafId(null);
    setError("");
    void Api.config().then(setCfg).catch(() => {});
  }, []);

  const submitContainerDialog = useCallback(async () => {
    try {
      if (!containerDialog) return;
      const password = containerPasswordInput;
      if (!password) return;
      if (containerDialog === "openPassword") {
        const containerPath = openTargetPath.trim();
        if (!containerPath) return;
        const out = await Api.openContainer({ containerPath, password });
        applyOpenedContainer(out);
        resetContainerDialog();
        return;
      }
      const name = containerNameInput.trim();
      const containerPath = containerPathInput.trim();
      if (!name || !containerPath) return;
      if (containerPasswordInput !== containerPasswordConfirmInput) {
        throw new Error("Master password mismatch");
      }
      const out = await Api.createContainer({ containerPath, name, password });
      applyOpenedContainer(out);
      resetContainerDialog();
    } catch (e) {
      onError(e);
    }
  }, [
    applyOpenedContainer,
    containerDialog,
    containerNameInput,
    containerPasswordConfirmInput,
    containerPasswordInput,
    containerPathInput,
    openTargetPath,
    onError,
    resetContainerDialog
  ]);

  useEffect(() => {
    if (containerDialog !== "create") return;
    setContainerPathInput(joinPath(containerLocationInput, containerNameInput));
  }, [containerDialog, containerLocationInput, containerNameInput]);

  const startCreateContainer = useCallback(() => {
    setContainerDialog("create");
    setContainerNameInput("");
    setContainerLocationInput("");
    setContainerPathInput("");
    setContainerPasswordInput("");
    setContainerPasswordConfirmInput("");
  }, []);

  const startOpenContainerFlow = useCallback(() => {
    setContainerDialog(null);
    setOpenTargetPath("");
    setContainerPasswordInput("");
    openContainerPickerRef.current?.click();
  }, []);

  const openRecentContainerFlow = useCallback((containerPath: string) => {
    setOpenTargetPath(containerPath);
    setContainerPasswordInput("");
    setContainerDialog("openPassword");
  }, []);

  const activeFileId = activeTabId ? openTabs.find((t) => t.tabId === activeTabId)?.fileId : undefined;
  const activeTab = manifest && activeFileId ? manifest.nodes[activeFileId] : undefined;

  const containerName = container?.name;
  const containerOpen = Boolean(container && manifest);
  const rootLabelRaw = t(dict, "explorer.root");
  const rootLabelFallback = locale === "ru_RU" ? "Корень" : "Root";
  const rootLabel = rootLabelRaw === "explorer.root" ? rootLabelFallback : rootLabelRaw;
  const openedItemName = (() => {
    if (!containerName) return "";
    if (!manifest) return containerName;
    const isRoot = activeTab?.id === manifest.rootId;
    if (!activeTab || isRoot) return rootLabel;
    return activeTab.name ?? rootLabel;
  })();

  const openFileTab = (node: TreeNode) => {
    if (node.type !== "file") return;
    const root = editorRootRef.current;
    const fl = focusedLeafIdRef.current;
    const sameFile = openTabs.filter((t) => t.fileId === node.id);
    if (sameFile.length > 0) {
      const chosen =
        root && fl
          ? sameFile.find((t) => findLeafIdByTabId(root, t.tabId) === fl) ?? sameFile[0]
          : sameFile[0];
      setActiveTabId(chosen.tabId);
      setSelected(node);
      const leafId = root ? findLeafIdByTabId(root, chosen.tabId) : null;
      if (leafId) setFocusedLeafId(leafId);
      return;
    }
    const tabId = newEditorTabId();
    setOpenTabs((prev) => [...prev, { tabId, fileId: node.id }]);
    setActiveTabId(tabId);
    setSelected(node);
    let createdLeafId: string | null = null;
    setEditorRoot((root) => {
      if (root) {
        const fid = focusedLeafId ?? firstLeafId(root);
        return setLeafTabAndFile(root, fid, node.id, tabId);
      }
      const leaf = createLeaf(tabId);
      createdLeafId = leaf.id;
      return leaf;
    });
    if (createdLeafId) setFocusedLeafId(createdLeafId);
  };

  const onSelectFromBreadcrumb = (node: TreeNode) => {
    setSelected(node);
    if (node.type === "file") openFileTab(node);
  };

  const closeFileTab = useCallback((tabId: string) => {
    setOpenTabs((prev) => {
      const idx = prev.findIndex((t) => t.tabId === tabId);
      if (idx === -1) return prev;
      const nextTabs = prev.filter((t) => t.tabId !== tabId);
      setActiveTabId((cur) => {
        if (cur !== tabId) return cur;
        return nextTabs[Math.max(0, idx - 1)]?.tabId ?? nextTabs[0]?.tabId ?? null;
      });
      setEditorRoot((root) => {
        if (!root) return null;
        const leafLid = findLeafIdByTabId(root, tabId);
        if (!leafLid) return root;
        const afterRemove = removeTabFromLeaf(root, leafLid, tabId);
        if (findLeafTabCount(afterRemove, leafLid) === 0) {
          return removeLeaf(afterRemove, leafLid);
        }
        return afterRemove;
      });
      return nextTabs;
    });
  }, []);

  const ignoreEllipsisMenu = useCallback((target: EventTarget | null) => {
    return target instanceof Element && !!target.closest("[data-app-menu]");
  }, []);

  useMenuDismiss({
    open: ellipsisMenu !== null,
    onClose: () => setEllipsisMenu(null),
    ignoreInside: ignoreEllipsisMenu
  });

  const onSelectEditorTab = useCallback((leafId: string, entry: EditorOpenTab, fileNode: TreeNode) => {
    setActiveTabId(entry.tabId);
    setSelected(fileNode);
    setFocusedLeafId(leafId);
    setEditorRoot((root) => {
      if (!root) return root;
      return setLeafTabAndFile(root, leafId, entry.fileId, entry.tabId);
    });
  }, []);

  const onSplitLeaf = useCallback(
    (leafId: string, e: React.MouseEvent | React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const root = editorRootRef.current;
      const tabs = openTabs;
      if (!root || !manifest) return;
      if (countLeaves(root) >= MAX_EDITOR_LEAVES) return;
      const fileId = findLeafFileId(root, leafId, tabs);
      if (!fileId) return;
      const fileNode = manifest.nodes[fileId];
      if (!fileNode || fileNode.type !== "file") return;
      let dir: "v" | "h" = altSplitPreview || e.altKey ? "h" : "v";
      if (dir === "h") {
        const h = editorPaneBodyRef.current?.getBoundingClientRect().height ?? 0;
        if (h < MIN_EDITOR_HEIGHT_FOR_H_SPLIT) dir = "v";
      }
      const newTabId = newEditorTabId();
      const out = splitFocusedLeaf(root, leafId, dir, newTabId);
      if (!out) return;
      focusedLeafIdRef.current = out.newFocusId;
      setEditorRoot(out.root);
      setOpenTabs((prev) => [...prev, { tabId: newTabId, fileId }]);
      setFocusedLeafId(out.newFocusId);
      setActiveTabId(newTabId);
    },
    [altSplitPreview, manifest, openTabs]
  );

  const onFocusEditorLeaf = useCallback((leafId: string) => {
    setFocusedLeafId(leafId);
    const r = editorRootRef.current;
    if (!r) return;
    const tid = findLeafActiveTabId(r, leafId);
    if (tid) setActiveTabId(tid);
  }, []);

  const closeAllTabsInLeaf = useCallback((leafId: string) => {
    const root = editorRootRef.current;
    if (!root) return;
    const prev = openTabsRef.current;
    const ids = tabsForLeaf(root, leafId, prev).map((t) => t.tabId);
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const nextTabs = prev.filter((t) => !idSet.has(t.tabId));
    let nextRoot: EditorNode | null = root;
    for (const tid of ids) {
      if (!nextRoot) break;
      nextRoot = removeTabFromLeaf(nextRoot, leafId, tid);
    }
    if (nextRoot && findLeafTabCount(nextRoot, leafId) === 0) {
      nextRoot = removeLeaf(nextRoot, leafId) ?? null;
    }
    setOpenTabs(nextTabs);
    setActiveTabId((cur) => {
      if (cur && !idSet.has(cur)) return cur;
      return nextTabs[0]?.tabId ?? null;
    });
    setEditorRoot(nextRoot);
    setEllipsisMenu(null);
    setFocusedLeafId((fid) => {
      if (!nextRoot) return null;
      if (fid && collectLeafIds(nextRoot).includes(fid)) return fid;
      return firstLeafId(nextRoot);
    });
  }, []);

  const moveInFocusedTabGroup = useCallback(
    (step: -1 | 1) => {
      const root = editorRootRef.current;
      const leafId = focusedLeafIdRef.current;
      if (!root || !leafId) return;
      const group = tabsForLeaf(root, leafId, openTabsRef.current);
      if (group.length <= 1) return;
      const activeTid = findLeafActiveTabId(root, leafId) ?? group[0]?.tabId ?? null;
      if (!activeTid) return;
      const idx = group.findIndex((t) => t.tabId === activeTid);
      const cur = idx >= 0 ? idx : 0;
      const nextIdx = Math.max(0, Math.min(group.length - 1, cur + step));
      if (nextIdx === cur) return;
      const next = group[nextIdx];
      if (!next) return;
      const node = manifest?.nodes[next.fileId];
      if (node) setSelected(node);
      setActiveTabId(next.tabId);
      setEditorRoot((r) => (r ? setLeafTabAndFile(r, leafId, next.fileId, next.tabId) : r));
    },
    [manifest]
  );

  const focusedGroup = useMemo(() => {
    if (!editorRoot || !focusedLeafId) return [] as EditorOpenTab[];
    return tabsForLeaf(editorRoot, focusedLeafId, openTabs);
  }, [editorRoot, focusedLeafId, openTabs]);
  const focusedActiveTabId = useMemo(() => {
    if (!editorRoot || !focusedLeafId) return null;
    return findLeafActiveTabId(editorRoot, focusedLeafId);
  }, [editorRoot, focusedLeafId]);
  const focusedActiveIdx = focusedGroup.findIndex((t) => t.tabId === focusedActiveTabId);
  const canTabsPrev = focusedActiveIdx > 0;
  const canTabsNext = focusedActiveIdx >= 0 && focusedActiveIdx < focusedGroup.length - 1;

  useEffect(() => {
    if (!container || !manifest) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k !== "w") return;
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable=true]")) return;
      const fl = focusedLeafIdRef.current;
      const root = editorRootRef.current;
      const tabs = openTabsRef.current;
      if (!fl || !root || tabs.length === 0) return;
      const group = tabsForLeaf(root, fl, tabs);
      if (group.length === 0) return;
      e.preventDefault();
      closeAllTabsInLeaf(fl);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeAllTabsInLeaf, container, manifest]);

  const onEllipsisLeaf = useCallback((leafId: string, e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onFocusEditorLeaf(leafId);
    const rect = e.currentTarget.getBoundingClientRect();
    setEllipsisMenu((prev) =>
      prev?.leafId === leafId ? null : { x: rect.left, y: rect.bottom + 4, leafId }
    );
  }, [onFocusEditorLeaf]);

  const onSplitRatioChange = useCallback((splitId: string, ratio: number) => {
    setEditorRoot((root) => (root ? setSplitRatio(root, splitId, ratio) : root));
  }, []);

  const body = useMemo(() => {
    if (!container || !manifest) {
      return (
        <Home
          dict={dict}
          cfg={cfg}
          onCreateRequest={startCreateContainer}
          onOpenRequest={startOpenContainerFlow}
          onOpenRecentRequest={openRecentContainerFlow}
        />
      );
    }
    const toolbarHostLeafId =
      editorRoot &&
      focusedLeafId &&
      collectLeafIds(editorRoot).includes(focusedLeafId)
        ? focusedLeafId
        : editorRoot
          ? firstLeafId(editorRoot)
          : null;

    return (
      <SplitPane
        left={
          <Explorer
            dict={dict}
            manifest={manifest}
            containerName={container.name}
            activeId={selected?.id}
            onSelect={(n) => {
              setSelected(n);
              if (n.type === "file") openFileTab(n);
            }}
            onRefreshRequested={() => void refreshTree()}
            onError={onError}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            onImportRequest={requestImport}
            onExport={() => {
              const node = selected ?? manifest.nodes[manifest.rootId];
              if (!node) return;
              window.open(Api.exportZipUrl(node.id), "_blank");
            }}
            theme={prefs.theme}
            locale={prefs.locale}
            onThemeToggle={async () => {
              const next = prefs.theme === "dark" ? "light" : "dark";
              try {
                const c = await Api.setPreferences({ theme: next });
                setCfg(c);
              } catch (e) {
                onError(e);
              }
            }}
            onLocaleToggle={async () => {
              const next: LocaleKey = prefs.locale === "en_EN" ? "ru_RU" : "en_EN";
              try {
                const c = await Api.setPreferences({ locale: next });
                setCfg(c);
              } catch (e) {
                onError(e);
              }
            }}
            onMenuRefresh={() => void refreshTree()}
            onMenuCloseContainer={async () => {
              try {
                await Api.closeContainer();
                setContainer(null);
                setManifest(null);
                setSelected(undefined);
                setOpenTabs([]);
                setActiveTabId(null);
                setEditorRoot(null);
                setFocusedLeafId(null);
                setError("");
              } catch (e) {
                onError(e);
              }
            }}
          />
        }
        right={
          openTabs.length === 0 ? (
            <div className="panelInner" role="presentation" />
          ) : (
            <div className="panelInner">
              <div className="editorPaneBody" ref={editorPaneBodyRef}>
                {editorRoot ? (
                  <EditorLayoutTree
                    node={editorRoot}
                    editorRoot={editorRoot}
                    manifest={manifest}
                    dict={dict}
                    theme={theme}
                    onSelectFromBreadcrumb={onSelectFromBreadcrumb}
                    onError={onError}
                    onFocusLeaf={onFocusEditorLeaf}
                    openTabs={openTabs}
                    activeTabId={activeTabId}
                    altSplitPreview={altSplitPreview}
                    canSplitMore={countLeaves(editorRoot) < MAX_EDITOR_LEAVES}
                    toolbarHostLeafId={toolbarHostLeafId}
                    onSelectTab={onSelectEditorTab}
                    onCloseTab={closeFileTab}
                    onSplitLeaf={onSplitLeaf}
                    onEllipsisLeaf={onEllipsisLeaf}
                    onSplitRatioChange={onSplitRatioChange}
                  />
                ) : null}
              </div>
            </div>
          )
        }
      />
    );
  }, [
    activeTabId,
    altSplitPreview,
    cfg,
    closeFileTab,
    container,
    dict,
    editorRoot,
    focusedLeafId,
    manifest,
    theme,
    onError,
    onEllipsisLeaf,
    onFocusEditorLeaf,
    onSelectEditorTab,
    onSplitLeaf,
    onSplitRatioChange,
    requestImport,
    searchQuery,
    selected,
    openTabs,
    startCreateContainer,
    startOpenContainerFlow,
    openRecentContainerFlow
  ]);

  return (
    <>
    <div className="appShell">
      <MenuBar
        dict={dict}
        prefs={prefs}
        containerName={containerName}
        containerOpen={containerOpen}
        activeItemName={openedItemName}
        onMenuOpenContainer={startOpenContainerFlow}
        onMenuCreateContainer={startCreateContainer}
        onMenuCloseContainer={async () => {
          try {
            await Api.closeContainer();
            setContainer(null);
            setManifest(null);
            setSelected(undefined);
            setOpenTabs([]);
            setActiveTabId(null);
            setEditorRoot(null);
            setFocusedLeafId(null);
            setError("");
          } catch (e) {
            onError(e);
          }
        }}
        onMenuImport={() => {
          if (!containerOpen) return;
          requestImport();
        }}
        onMenuExport={() => {
          if (!containerOpen || !manifest) return;
          const node = activeTab ?? manifest.nodes[manifest.rootId];
          if (!node) return;
          window.open(Api.exportZipUrl(node.id), "_blank");
        }}
        onMenuRefresh={() => {
          if (!containerOpen) return;
          void refreshTree();
        }}
        onTabsPrev={() => moveInFocusedTabGroup(-1)}
        onTabsNext={() => moveInFocusedTabGroup(1)}
        canTabsPrev={canTabsPrev}
        canTabsNext={canTabsNext}
        onThemeToggle={async () => {
          const next = prefs.theme === "dark" ? "light" : "dark";
          try {
            const c = await Api.setPreferences({ theme: next });
            setCfg(c);
          } catch (e) {
            onError(e);
          }
        }}
        onLocaleToggle={async () => {
          const next: LocaleKey = prefs.locale === "en_EN" ? "ru_RU" : "en_EN";
          try {
            const c = await Api.setPreferences({ locale: next });
            setCfg(c);
          } catch (e) {
            onError(e);
          }
        }}
      />
      <input
        ref={menuImportRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={async (e) => {
          try {
            if (!manifest) return;
            const files = Array.from(e.target.files ?? []);
            if (files.length === 0) return;
            let targetId = importTargetRef.current;
            importTargetRef.current = null;
            if (!targetId) {
              const target = selected ? manifest.nodes[selected.id] : manifest.nodes[manifest.rootId];
              targetId = target?.type === "folder" ? target.id : target?.parentId ?? manifest.rootId;
            }
            await Api.importFiles(targetId, files);
            e.target.value = "";
            await refreshTree();
          } catch (err) {
            onError(err);
          }
        }}
      />
      <input
        ref={createLocationPickerRef}
        type="file"
        style={{ display: "none" }}
        {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
        onChange={(e) => {
          const base = inferDirectoryPath(e.target.files);
          if (base) setContainerLocationInput(base);
          e.currentTarget.value = "";
        }}
      />
      <input
        ref={openContainerPickerRef}
        type="file"
        style={{ display: "none" }}
        {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
        onChange={(e) => {
          const selectedPath = inferDirectoryPath(e.target.files);
          e.currentTarget.value = "";
          if (!selectedPath) return;
          setOpenTargetPath(selectedPath);
          setContainerPasswordInput("");
          setContainerDialog("openPassword");
        }}
      />
      {containerDialog ? (
        <div className="appDialogBackdrop" onMouseDown={() => resetContainerDialog()}>
          <div className="appDialogCard" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
            <div className="appDialogTitle">
              {containerDialog === "create" ? "Создать контейнер" : "Открыть контейнер"}
            </div>
            <div className="stack" style={{ marginTop: 10 }}>
              {containerDialog === "create" ? (
                <>
                  <input
                    className="input"
                    value={containerNameInput}
                    onChange={(e) => setContainerNameInput(e.target.value)}
                    placeholder="Название контейнера"
                  />
                  <div className="row" style={{ gap: 8 }}>
                    <input
                      className="input"
                      value={containerLocationInput}
                      readOnly
                      placeholder="Расположение"
                      style={{ flex: 1 }}
                    />
                    <button type="button" className="btn" onClick={() => createLocationPickerRef.current?.click()}>
                      Выбрать...
                    </button>
                  </div>
                  <input
                    className="input"
                    value={containerPathInput}
                    readOnly
                    placeholder="Путь контейнера"
                  />
                  <input
                    className="input"
                    type="password"
                    value={containerPasswordInput}
                    onChange={(e) => setContainerPasswordInput(e.target.value)}
                    placeholder="Мастер-пароль"
                  />
                  <input
                    className="input"
                    type="password"
                    value={containerPasswordConfirmInput}
                    onChange={(e) => setContainerPasswordConfirmInput(e.target.value)}
                    placeholder="Повторите мастер-пароль"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void submitContainerDialog();
                    }}
                  />
                </>
              ) : (
                <>
                  <input className="input" value={openTargetPath} readOnly placeholder="Путь контейнера" />
                  <input
                    className="input"
                    type="password"
                    value={containerPasswordInput}
                    onChange={(e) => setContainerPasswordInput(e.target.value)}
                    placeholder="Мастер-пароль"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void submitContainerDialog();
                    }}
                  />
                </>
              )}
              <div className="appDialogActions">
                <button type="button" className="btn" onClick={resetContainerDialog}>
                  Cancel
                </button>
                <button type="button" className="btn btnPrimary" onClick={() => void submitContainerDialog()}>
                  {containerDialog === "create" ? "Создать контейнер" : "Открыть контейнер"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <div className="content">{body}</div>
      <div className={`statusBar${error ? " statusBarError" : ""}`} role="status" aria-live="polite">
        <div className="statusBarLeft">
          <span className="statusBarItem">{containerOpen ? `Container: ${containerName}` : "No Container"}</span>
          {selected ? <span className="statusBarItem">Selected: {selected.name}</span> : null}
          {error ? <span className="statusBarItem statusBarItemError">Error: {error}</span> : null}
        </div>
        <div className="statusBarRight">
          <span className="statusBarItem">{prefs.theme === "dark" ? "Dark+" : "Light+"}</span>
          <span className="statusBarItem">{prefs.locale}</span>
        </div>
      </div>
    </div>
    {ellipsisMenu
      ? createPortal(
          <MenuPanel variant="fixed" wide style={{ left: ellipsisMenu.x, top: ellipsisMenu.y }}>
            <MenuRow onClick={() => closeAllTabsInLeaf(ellipsisMenu.leafId)}>
              <span>{t(dict, "tabs.more_close_all")}</span>
              <MenuRowKbd>
                {t(dict, "tabs.more_close_all_kbd")}{" "}
                <span aria-hidden="true">{t(dict, "tabs.more_close_all_mnemonic")}</span>
              </MenuRowKbd>
            </MenuRow>
            <MenuRow muted disabled>
              <span>{t(dict, "tabs.more_close_saved")}</span>
              <MenuRowKbd>{t(dict, "tabs.more_close_saved_kbd")}</MenuRowKbd>
            </MenuRow>
            <MenuSeparator />
            <MenuRow muted disabled>
              <span>{t(dict, "tabs.more_preview_editors")}</span>
            </MenuRow>
            <MenuSeparator />
            <MenuRow muted disabled>
              <span>{t(dict, "tabs.more_lock_group")}</span>
            </MenuRow>
            <MenuSeparator />
            <MenuRow muted disabled>
              <span>{t(dict, "tabs.more_configure_editors")}</span>
            </MenuRow>
          </MenuPanel>,
          document.body
        )
      : null}
    </>
  );
}

