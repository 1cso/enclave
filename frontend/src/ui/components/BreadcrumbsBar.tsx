import React, { useMemo } from "react";
import type { TreeNode } from "../api";
import { ThemeIcon } from "../icons";

export function BreadcrumbsBar(props: {
  path: TreeNode[];
  onSelect: (node: TreeNode) => void;
  /** Глобально активный файл (последний сегмент в хлебных крошках должен быть белым только у него). */
  activeFileId?: string | null;
  /** root label может отличаться от root.name (не используем сейчас) */
}) {
  const crumbs = useMemo(() => props.path.filter(Boolean), [props.path]);

  if (crumbs.length <= 1) return null;

  return (
    <div className="editorBreadcrumbsBar" role="navigation" aria-label="Breadcrumbs">
      {crumbs.map((node, idx) => {
        const isLast = idx === crumbs.length - 1;
        const isFolder = node.type === "folder";
        const clickable = !isLast && isFolder;
        const isActiveFile = isLast && props.activeFileId != null && node.id === props.activeFileId;

        return (
          <React.Fragment key={node.id}>
            <button
              type="button"
              className={`breadcrumbItem ${clickable ? "breadcrumbItemLink" : "breadcrumbItemText"} ${
                isLast ? "breadcrumbItemLast" : ""
              } ${isActiveFile ? "breadcrumbItemActive" : ""}`}
              onClick={() => {
                if (!clickable) return;
                props.onSelect(node);
              }}
              aria-current={isLast ? "page" : undefined}
              disabled={!clickable}
              title={node.name}
            >
              {node.name}
            </button>
            {!isLast ? (
              <span className="breadcrumbSep" aria-hidden="true">
                <ThemeIcon name="chevron-right" size={16} className="breadcrumbSepIcon" />
              </span>
            ) : null}
          </React.Fragment>
        );
      })}
    </div>
  );
}

