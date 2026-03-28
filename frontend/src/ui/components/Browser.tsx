import React, { useEffect, useMemo, useState } from "react";
import type { TreeNode } from "../api";
import { Api } from "../api";
import type { Dict } from "../i18n";
import { t } from "../i18n";
import { renderMarkdownToSafeHtml } from "../markdown";
import { OverlayScrollArea } from "./OverlayScrollArea";
import type { Theme } from "../theme";
import { MonacoTextViewer } from "./MonacoTextViewer";

function isText(mime?: string) {
  if (!mime) return false;
  return mime.startsWith("text/") || mime === "application/json" || mime === "application/xml";
}

function isMarkdown(node?: TreeNode) {
  const mime = node?.mime ?? "";
  if (mime === "text/markdown") return true;
  return node?.name?.toLocaleLowerCase().endsWith(".md") ?? false;
}

export function Browser(props: {
  dict: Dict;
  node?: TreeNode;
  onError: (e: unknown) => void;
  tabsBar?: React.ReactNode;
  /** Только область просмотра (для сплита редактора). */
  embed?: boolean;
  theme?: Theme;
}) {
  const [text, setText] = useState<string>("");
  const [blobUrl, setBlobUrl] = useState<string>("");

  const mime = props.node?.mime ?? "application/octet-stream";
  const theme: Theme = props.theme ?? "dark";
  const useMonaco = props.node?.type === "file" && isText(mime);

  useEffect(() => {
    setText("");
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlobUrl("");

    const node = props.node;
    if (!node || node.type !== "file") return;

    const load = async () => {
      try {
        if (isText(node.mime)) {
          const res = await fetch(Api.fileUrl(node.id));
          setText(await res.text());
        } else {
          const res = await fetch(Api.fileUrl(node.id));
          const blob = await res.blob();
          setBlobUrl(URL.createObjectURL(blob));
        }
      } catch (e) {
        props.onError(e);
      }
    };
    void load();

    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.node?.id]);

  const body = useMemo(() => {
    const node = props.node;
    if (!node) return <div className="muted">—</div>;
    if (node.type === "folder") return <div className="muted">{node.name}</div>;

    if (useMonaco) {
      return (
        <MonacoTextViewer
          node={node}
          text={text || ""}
          theme={theme}
        />
      );
    }

    if (isMarkdown(node)) {
      const safeHtml = renderMarkdownToSafeHtml(text || "");
      return <div className="md" dangerouslySetInnerHTML={{ __html: safeHtml }} />;
    }

    if (isText(mime)) {
      return (
        <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {text || ""}
        </pre>
      );
    }
    if (mime === "application/pdf") {
      return <iframe className="viewerFrame" src={blobUrl} title={node.name} />;
    }
    if (mime.startsWith("audio/")) {
      return <audio controls src={blobUrl} style={{ width: "100%" }} />;
    }
    if (mime.startsWith("image/")) {
      return <img src={blobUrl} alt={node.name} style={{ maxWidth: "100%", borderRadius: 12 }} />;
    }

    return <div className="muted">{t(props.dict, "viewer.unsupported")}</div>;
  }, [blobUrl, mime, props.dict, props.node, text, theme, useMonaco]);

  if (props.embed) {
    if (useMonaco) {
      return <div className="monacoEditorShell browserEmbed">{body}</div>;
    }
    return (
      <OverlayScrollArea className="browserEmbed panelBody panelBodyTabs">
        {body}
      </OverlayScrollArea>
    );
  }

  return (
    <div className="panelInner">
      {props.tabsBar ? props.tabsBar : null}
      {!props.tabsBar ? (
        <div className="panelHeader">
          <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {props.node ? props.node.name : "Browser"}
          </div>
          {props.node?.type === "file" ? <span className="muted" style={{ marginLeft: "auto" }}>{mime}</span> : null}
          {props.node ? (
            <a className="pill" href={props.node.type === "file" ? Api.fileUrl(props.node.id) : Api.exportZipUrl(props.node.id)} target="_blank" rel="noreferrer">
              Download
            </a>
          ) : null}
        </div>
      ) : null}
      {useMonaco ? (
        <div className={`panelBody ${props.tabsBar ? "panelBodyTabs" : ""} monacoEditorShell`}>{body}</div>
      ) : (
        <OverlayScrollArea className={`panelBody ${props.tabsBar ? "panelBodyTabs" : ""}`}>{body}</OverlayScrollArea>
      )}
    </div>
  );
}

