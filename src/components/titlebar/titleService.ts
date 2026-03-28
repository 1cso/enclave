/**
 * Adapted from VS Code title service.
 * Simplified, no DI: plain class controlling one or more BrowserTitlebarPart instances.
 */

import { BrowserTitlebarPart, type BrowserTitlebarPartOptions, type ITitlebar, type TitlebarButton } from "./titlebarPart";

export class BrowserTitleService implements ITitlebar {
  private readonly parts: BrowserTitlebarPart[] = [];
  private title = "";
  private icon: string | undefined;
  private buttons: TitlebarButton[] = [];

  constructor(mainContainer?: HTMLElement, options?: BrowserTitlebarPartOptions) {
    if (mainContainer) {
      this.createPart(mainContainer, options);
    }
  }

  createPart(container: HTMLElement, options?: BrowserTitlebarPartOptions): BrowserTitlebarPart {
    const part = new BrowserTitlebarPart(container, {
      ...options,
      title: options?.title ?? this.title,
      icon: options?.icon ?? this.icon,
      buttons: options?.buttons ?? this.buttons
    });
    this.parts.push(part);
    return part;
  }

  getPart(container: HTMLElement): BrowserTitlebarPart | undefined {
    return this.parts.find((p) => {
      const anyPart = p as unknown as { container?: HTMLElement };
      return anyPart.container === container;
    });
  }

  setTitle(title: string): void {
    this.title = title;
    for (const p of this.parts) p.setTitle(title);
  }

  setIcon(icon?: string): void {
    this.icon = icon;
    for (const p of this.parts) p.setIcon(icon);
  }

  setButtons(buttons: TitlebarButton[]): void {
    this.buttons = buttons;
    for (const p of this.parts) p.setButtons(buttons);
  }

  updateStyles(): void {
    for (const p of this.parts) p.updateStyles();
  }

  show(): void {
    for (const p of this.parts) p.show();
  }

  hide(): void {
    for (const p of this.parts) p.hide();
  }

  dispose(): void {
    for (const p of this.parts) p.dispose();
    this.parts.length = 0;
  }
}

