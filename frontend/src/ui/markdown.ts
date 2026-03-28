import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({
  gfm: true,
  breaks: true
});

export function renderMarkdownToSafeHtml(markdown: string): string {
  const html = marked.parse(markdown) as string;
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true }
  });
}

