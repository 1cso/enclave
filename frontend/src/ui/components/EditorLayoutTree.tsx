import React, { useEffect, useRef } from "react";
import type { Manifest, TreeNode } from "../api";
import { t, type Dict } from "../i18n";
import type { EditorNode, EditorOpenTab } from "../editorLayout";
import { findSplitPathForLeaf, tabsForLeaf } from "../editorLayout";
import type { Theme } from "../theme";
import { ThemeIcon } from "../icons";
import { Browser } from "./Browser";
import { OverlayScrollArea } from "./OverlayScrollArea";
import { BreadcrumbsBar } from "./BreadcrumbsBar";

export function EditorLayoutTree(props: {
  node: EditorNode;
  editorRoot: EditorNode;
  manifest: Manifest;
  dict: Dict;
  theme: Theme;
  onSelectFromBreadcrumb?: (node: TreeNode) => void;
  onError: (e: unknown) => void;
  onFocusLeaf: (id: string) => void;
  openTabs: EditorOpenTab[];
  activeTabId: string | null;
  altSplitPreview: boolean;
  canSplitMore: boolean;
  onSelectTab: (leafId: string, entry: EditorOpenTab, fileNode: TreeNode) => void;
  onCloseTab: (tabId: string) => void;
  onSplitLeaf: (leafId: string, e: React.MouseEvent | React.PointerEvent) => void;
  onEllipsisLeaf: (leafId: string, e: React.PointerEvent) => void;
  onSplitRatioChange: (splitId: string, ratio: number) => void;
  /** Split только у сфокусированной панели; More — на каждой. */
  toolbarHostLeafId: string | null;
}) {
  const tabsScrollRef = useRef<HTMLDivElement | null>(null);
  const overflowAdjustCountRef = useRef(0);
  const lastHostTabCountRef = useRef<number>(-1);

  useEffect(() => {
    if (props.node.kind !== "leaf") return;
    if (!props.toolbarHostLeafId) return;
    const leaf = props.node;
    if (leaf.id !== props.toolbarHostLeafId) return;
    const activeTabId = leaf.activeTabId;
    if (!activeTabId) return;
    const el = tabsScrollRef.current?.querySelector<HTMLElement>(`[data-tab-id="${activeTabId}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [props.node, props.toolbarHostLeafId]);

  useEffect(() => {
    if (props.node.kind !== "leaf") return;
    if (!props.toolbarHostLeafId) return;
    const leaf = props.node;
    if (leaf.id !== props.toolbarHostLeafId) return;

    const el = tabsScrollRef.current;
    if (!el) return;

    const barTabs = tabsForLeaf(props.editorRoot, leaf.id, props.openTabs);
    const tabCount = barTabs.length;
    if (lastHostTabCountRef.current !== tabCount) {
      lastHostTabCountRef.current = tabCount;
      overflowAdjustCountRef.current = 0;
    }

    // Оцениваем переполнение именно в этой зоне вкладок.
    const overW = el.scrollWidth > el.clientWidth + 1;
    const overH = el.scrollHeight > el.clientHeight + 1;
    if (!overW && !overH) return;
    if (overflowAdjustCountRef.current >= 6) return; // защитимся от зацикливания при постоянном overflow

    const splitPath = findSplitPathForLeaf(props.editorRoot, leaf.id);
    if (splitPath.length === 0) return;

    // Для разных dir влияет только соответствующее направление:
    // dir="v" => ratio двигает ширину, dir="h" => ratio двигает высоту.
    const step = 0.04; // маленький шаг, чтобы не "прыгали" панели
    for (const entry of splitPath) {
      const needsAdjust = entry.dir === "v" ? overW : overH;
      if (!needsAdjust) continue;

      const nextRatio = entry.inA ? entry.ratio + step : entry.ratio - step;
      const clamped = Math.max(0.15, Math.min(0.85, nextRatio));
      if (Math.abs(clamped - entry.ratio) < 1e-6) continue; // уперлись в границы, пробуем внешний split

      overflowAdjustCountRef.current += 1;
      props.onSplitRatioChange(entry.splitId, clamped);
      return;
    }
  }, [props.node, props.toolbarHostLeafId, props.editorRoot, props.openTabs, props.onSplitRatioChange]);

  if (props.node.kind === "leaf") {
    const leaf = props.node;
    const activeEntry = leaf.activeTabId
      ? props.openTabs.find((t) => t.tabId === leaf.activeTabId)
      : undefined;
    const n = activeEntry ? props.manifest.nodes[activeEntry.fileId] : undefined;
    const fileNode = n?.type === "file" ? n : undefined;
    const globalActiveEntry =
      props.activeTabId != null ? props.openTabs.find((t) => t.tabId === props.activeTabId) : undefined;
    const activeFileId = globalActiveEntry?.fileId ?? null;
    const barTabs = tabsForLeaf(props.editorRoot, leaf.id, props.openTabs);
    const canSplit = Boolean(fileNode && fileNode.type === "file" && props.canSplitMore);
    const showSplitTool = props.toolbarHostLeafId === leaf.id;

    return (
      <div
        className="editorLeaf"
        onMouseDown={(e) => {
          if (!(e.target as HTMLElement).closest(".tabsBarToolbar")) props.onFocusLeaf(leaf.id);
        }}
        role="presentation"
      >
        <div className="tabsBarWrap">
          <OverlayScrollArea ref={tabsScrollRef} className="tabsBarScroll">
            <div className="tabsBar" role="tablist" aria-label="Open files">
              {barTabs.map((entry) => {
                const tNode = props.manifest.nodes[entry.fileId];
                if (!tNode) return null;
                const isHostLeaf = props.toolbarHostLeafId === leaf.id;
                // Визуальный "active" должен соответствовать глобально активной вкладке.
                // После split внутренний activeTabId в не-сфокусированном листе может отличаться,
                // и тогда неактивная вкладка не должна получать 1px border-top accent.
                const isActive = isHostLeaf && props.activeTabId != null && entry.tabId === props.activeTabId;
                const isSingleInLeaf = barTabs.length === 1;
                return (
                  <div
                    key={entry.tabId}
                    className={`tab ${isActive ? "tabActive" : ""} ${!isActive && isSingleInLeaf ? "tabSingle" : ""}`}
                    role="tab"
                    aria-selected={isActive}
                    data-tab-id={entry.tabId}
                    onClick={() => props.onSelectTab(leaf.id, entry, tNode)}
                    title={tNode.name}
                  >
                    <span className="tabLabel">{tNode.name}</span>
                    <button
                      type="button"
                      className="tabClose"
                      onClick={(e) => {
                        e.stopPropagation();
                        props.onCloseTab(entry.tabId);
                      }}
                      title="Close tab"
                      aria-label="Close tab"
                    >
                      <ThemeIcon name="close" className="tabCloseIcon" size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          </OverlayScrollArea>
          <div className="tabsBarToolbar">
            {showSplitTool ? (
              <button
                type="button"
                className="tabsBarToolBtn tabsBarToolBtnSplit"
                disabled={!canSplit}
                title={`${t(props.dict, "tabs.split_hint")} · ${props.altSplitPreview ? t(props.dict, "tabs.split_down") : t(props.dict, "tabs.split_right")}`}
                aria-label={props.altSplitPreview ? t(props.dict, "tabs.split_down") : t(props.dict, "tabs.split_right")}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  props.onSplitLeaf(leaf.id, e);
                }}
              >
                <ThemeIcon
                  name={props.altSplitPreview ? "split-vertical" : "split-horizontal"}
                  className="tabsBarToolIcon"
                  size={16}
                />
              </button>
            ) : null}
            <button
              type="button"
              className="tabsBarToolBtn"
              title={t(props.dict, "tabs.more")}
              aria-label={t(props.dict, "tabs.more")}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                props.onEllipsisLeaf(leaf.id, e);
              }}
            >
              <ThemeIcon name="ellipsis" className="tabsBarToolIcon" size={16} />
            </button>
          </div>
        </div>

        {fileNode ? (
          <BreadcrumbsBar
            path={(() => {
              // Build chain root -> ... -> current file.
              const out: TreeNode[] = [];
              let cur: TreeNode | undefined = fileNode;
              while (cur) {
                out.push(cur);
                if (!cur.parentId) break;
                cur = props.manifest.nodes[cur.parentId];
              }
              return out.reverse();
            })()}
            activeFileId={activeFileId}
            onSelect={(node) => props.onSelectFromBreadcrumb?.(node)}
          />
        ) : null}

        {fileNode ? (
          <Browser
            dict={props.dict}
            node={fileNode}
            onError={props.onError}
            embed
            theme={props.theme}
          />
        ) : (
          <div className="editorLeafEmpty">
            <span className="muted">{t(props.dict, "editor.empty")}</span>
          </div>
        )}
      </div>
    );
  }

  const split = props.node;
  const isRow = split.dir === "v";
  const r = split.ratio ?? 0.5;
  const className = isRow ? "editorEqualRow" : "editorEqualCol";
  const paneStyleA = isRow
    ? { flex: `${r} 1 0`, minWidth: 0, minHeight: 0 }
    : { flex: `${r} 1 0`, minWidth: 0, minHeight: 0 };
  const paneStyleB = isRow
    ? { flex: `${1 - r} 1 0`, minWidth: 0, minHeight: 0 }
    : { flex: `${1 - r} 1 0`, minWidth: 0, minHeight: 0 };

  const onSashMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      const container = (e.target as HTMLElement).closest(".editorEqualRow, .editorEqualCol");
      const rect = container?.getBoundingClientRect();
      if (!rect || !container) return;
      const total = isRow ? rect.width : rect.height;
      if (total <= 0) return;
      const pos = isRow ? ev.clientX - rect.left : ev.clientY - rect.top;
      const newRatio = Math.max(0.15, Math.min(0.85, pos / total));
      props.onSplitRatioChange(split.id, newRatio);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = isRow ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
  };

  return (
    <div className={className}>
      <div className="editorEqualPane" style={paneStyleA}>
        <EditorLayoutTree {...props} node={split.a} />
      </div>
      <div
        className={`editorSash ${isRow ? "editorSashV" : "editorSashH"}`}
        onMouseDown={onSashMouseDown}
        role="separator"
        aria-orientation={isRow ? "vertical" : "horizontal"}
      />
      <div className="editorEqualPane" style={paneStyleB}>
        <EditorLayoutTree {...props} node={split.b} />
      </div>
    </div>
  );
}
