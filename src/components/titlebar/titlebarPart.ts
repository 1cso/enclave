/**
 * Simplified BrowserTitlebarPart adapted from VS Code's titlebar part.
 * - No VS Code DI / service dependencies
 * - Uses CSS variables for styling
 * - Supports drag region and desktop window controls
 */

export type TitlebarButtonId = "minimize" | "maximize" | "restore" | "close" | string;

export interface TitlebarButton {
  id: TitlebarButtonId;
  label: string;
  icon?: string;
  tooltip?: string;
  onClick?: () => void;
  visible?: boolean;
  enabled?: boolean;
}

export interface ITitlebar {
  setTitle(title: string): void;
  setIcon(icon?: string): void;
  setButtons(buttons: TitlebarButton[]): void;
}

export interface BrowserTitlebarPartOptions {
  title?: string;
  icon?: string;
  buttons?: TitlebarButton[];
  platform?: "win32" | "darwin" | "linux" | "web";
  height?: number;
}

type ElectronControlsApi = {
  minimize?: () => void;
  maximize?: () => void;
  restore?: () => void;
  close?: () => void;
};

function detectPlatform(): BrowserTitlebarPartOptions["platform"] {
  const p = navigator.platform.toLowerCase();
  if (p.includes("mac")) return "darwin";
  if (p.includes("win")) return "win32";
  if (p.includes("linux")) return "linux";
  return "web";
}

function getElectronControlsApi(): ElectronControlsApi {
  const w = window as unknown as { electronWindowControls?: ElectronControlsApi };
  return w.electronWindowControls ?? {};
}

function defaultButtons(platform: BrowserTitlebarPartOptions["platform"]): TitlebarButton[] {
  const controls = getElectronControlsApi();
  const base: TitlebarButton[] = [
    { id: "minimize", label: "—", tooltip: "Minimize", onClick: controls.minimize },
    { id: "maximize", label: "□", tooltip: "Maximize", onClick: controls.maximize },
    { id: "close", label: "✕", tooltip: "Close", onClick: controls.close }
  ];
  return platform === "darwin" ? [...base].reverse() : base;
}

export class BrowserTitlebarPart implements ITitlebar {
  private readonly root: HTMLDivElement;
  private readonly dragRegion: HTMLDivElement;
  private readonly titleRegion: HTMLDivElement;
  private readonly iconEl: HTMLImageElement;
  private readonly titleEl: HTMLSpanElement;
  private readonly controlsRegion: HTMLDivElement;
  private currentButtons: TitlebarButton[] = [];
  private readonly platform: NonNullable<BrowserTitlebarPartOptions["platform"]>;

  constructor(private readonly container: HTMLElement, options: BrowserTitlebarPartOptions = {}) {
    this.platform = options.platform ?? detectPlatform();

    this.root = document.createElement("div");
    this.root.className = "simple-titlebar";
    this.root.style.height = `${options.height ?? 34}px`;
    this.root.style.display = "flex";
    this.root.style.alignItems = "center";
    this.root.style.justifyContent = "space-between";
    this.root.style.padding = "0 8px";
    this.root.style.background = "var(--titlebar-bg, var(--bg, #181818))";
    this.root.style.color = "var(--titlebar-fg, var(--text, #d4d4d4))";
    this.root.style.borderBottom = "1px solid var(--titlebar-border, var(--border, #2b2b2b))";
    this.root.style.userSelect = "none";
    this.root.style.webkitAppRegion = "drag";

    this.dragRegion = document.createElement("div");
    this.dragRegion.className = "simple-titlebar-drag-region";
    this.dragRegion.style.position = "absolute";
    this.dragRegion.style.inset = "0";
    this.dragRegion.style.webkitAppRegion = "drag";

    this.titleRegion = document.createElement("div");
    this.titleRegion.className = "simple-titlebar-title-region";
    this.titleRegion.style.display = "inline-flex";
    this.titleRegion.style.alignItems = "center";
    this.titleRegion.style.gap = "8px";
    this.titleRegion.style.minWidth = "0";
    this.titleRegion.style.position = "relative";
    this.titleRegion.style.zIndex = "1";
    this.titleRegion.style.webkitAppRegion = "drag";

    this.iconEl = document.createElement("img");
    this.iconEl.className = "simple-titlebar-icon";
    this.iconEl.style.width = "16px";
    this.iconEl.style.height = "16px";
    this.iconEl.style.display = "none";
    this.iconEl.draggable = false;

    this.titleEl = document.createElement("span");
    this.titleEl.className = "simple-titlebar-title";
    this.titleEl.style.fontSize = "12px";
    this.titleEl.style.lineHeight = "1";
    this.titleEl.style.whiteSpace = "nowrap";
    this.titleEl.style.overflow = "hidden";
    this.titleEl.style.textOverflow = "ellipsis";

    this.controlsRegion = document.createElement("div");
    this.controlsRegion.className = "simple-titlebar-controls";
    this.controlsRegion.style.display = "inline-flex";
    this.controlsRegion.style.alignItems = "center";
    this.controlsRegion.style.gap = "2px";
    this.controlsRegion.style.position = "relative";
    this.controlsRegion.style.zIndex = "1";
    this.controlsRegion.style.webkitAppRegion = "no-drag";

    this.titleRegion.append(this.iconEl, this.titleEl);
    this.root.append(this.dragRegion, this.titleRegion, this.controlsRegion);
    this.container.appendChild(this.root);

    this.updateTitle(options.title ?? "");
    this.setIcon(options.icon);
    this.setButtons(options.buttons ?? defaultButtons(this.platform));
  }

  updateTitle(title: string): void {
    this.titleEl.textContent = title;
  }

  updateStyles(): void {
    // Styles are driven by CSS variables.
    // Re-apply dynamic computed values if needed by host app.
    this.root.style.background = "var(--titlebar-bg, var(--bg, #181818))";
    this.root.style.color = "var(--titlebar-fg, var(--text, #d4d4d4))";
    this.root.style.borderBottom = "1px solid var(--titlebar-border, var(--border, #2b2b2b))";
  }

  show(): void {
    this.root.style.display = "flex";
  }

  hide(): void {
    this.root.style.display = "none";
  }

  setTitle(title: string): void {
    this.updateTitle(title);
  }

  setIcon(icon?: string): void {
    if (!icon) {
      this.iconEl.style.display = "none";
      this.iconEl.removeAttribute("src");
      return;
    }
    this.iconEl.src = icon;
    this.iconEl.style.display = "block";
  }

  setButtons(buttons: TitlebarButton[]): void {
    this.currentButtons = buttons;
    this.renderButtons();
  }

  private renderButtons(): void {
    this.controlsRegion.textContent = "";
    for (const btn of this.currentButtons) {
      if (btn.visible === false) continue;
      const el = document.createElement("button");
      el.type = "button";
      el.className = `simple-titlebar-btn simple-titlebar-btn-${btn.id}`;
      el.title = btn.tooltip ?? btn.label;
      el.textContent = btn.label;
      el.disabled = btn.enabled === false;
      el.style.width = "34px";
      el.style.height = "28px";
      el.style.padding = "0";
      el.style.border = "none";
      el.style.background = "transparent";
      el.style.color = "inherit";
      el.style.cursor = el.disabled ? "default" : "pointer";
      el.style.borderRadius = "4px";
      el.style.webkitAppRegion = "no-drag";
      el.onmouseenter = () => {
        if (el.disabled) return;
        el.style.background = "var(--titlebar-btn-hover, rgba(255,255,255,0.1))";
      };
      el.onmouseleave = () => {
        el.style.background = "transparent";
      };
      el.onclick = () => btn.onClick?.();
      this.controlsRegion.appendChild(el);
    }
  }

  dispose(): void {
    this.root.remove();
  }
}

