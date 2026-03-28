export type Theme = "dark" | "light";

let currentLink: HTMLLinkElement | null = null;

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;

  const href = `/app-assets/themes/${theme}/theme.css`;
  if (currentLink?.href.endsWith(href)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
  if (currentLink) currentLink.remove();
  currentLink = link;
}

