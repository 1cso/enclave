import React, { useEffect, useMemo, useState } from "react";
import type { Theme } from "../theme";
import Editor from "@monaco-editor/react";
import type { TreeNode } from "../api";

function guessMonacoLanguage(node: TreeNode, mime: string): string {
  const name = (node.name ?? "").toLowerCase();

  if (mime === "application/json" || name.endsWith(".json")) return "json";
  if (mime === "text/markdown" || name.endsWith(".md")) return "markdown";
  if (name.endsWith(".ts")) return "typescript";
  if (name.endsWith(".tsx")) return "typescript";
  if (name.endsWith(".js")) return "javascript";
  if (name.endsWith(".jsx")) return "javascript";
  if (name.endsWith(".css")) return "css";
  if (name.endsWith(".html") || name.endsWith(".htm")) return "html";
  if (mime === "application/xml" || mime === "text/xml" || name.endsWith(".xml")) return "xml";
  if (name.endsWith(".yml") || name.endsWith(".yaml")) return "yaml";
  if (name.endsWith(".sh")) return "shell";
  if (name.endsWith(".py")) return "python";
  if (name.endsWith(".go")) return "go";
  if (name.endsWith(".rs")) return "rust";
  if (name.endsWith(".java")) return "java";
  if (name.endsWith(".c")) return "c";
  if (name.endsWith(".cpp") || name.endsWith(".cc") || name.endsWith(".cxx")) return "cpp";
  if (name.endsWith(".sql")) return "sql";

  return "plaintext";
}

export function MonacoTextViewer(props: {
  node: TreeNode;
  text: string;
  theme: Theme;
}) {
  const mime = props.node.mime ?? "application/octet-stream";

  const language = useMemo(() => guessMonacoLanguage(props.node, mime), [props.node, mime]);
  const [draft, setDraft] = useState<string>(props.text);

  useEffect(() => {
    setDraft(props.text);
  }, [props.node.id, props.text]);

  return (
    <div style={{ width: "100%", height: "100%", minHeight: 0 }}>
      <Editor
        key={props.node.id}
        value={draft}
        defaultLanguage={language}
        language={language}
        theme={props.theme === "dark" ? "vs-dark" : "vs"}
        options={{
          readOnly: false,
          minimap: { enabled: false },
          wordWrap: "on",
          scrollBeyondLastLine: false,
          lineNumbers: "on",
          glyphMargin: false,
          folding: false
        }}
        height="100%"
        width="100%"
        onChange={(value) => setDraft(value ?? "")}
        loading={null}
      />
    </div>
  );
}

