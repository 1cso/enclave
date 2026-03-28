/**
 * Adapted from VS Code layout/titlebar contracts.
 * This file intentionally keeps only titlebar-related enums, constants and interfaces.
 */

export enum Parts {
  TITLEBAR_PART = "workbench.parts.titlebar"
}

export enum Position {
  LEFT = "left",
  RIGHT = "right",
  TOP = "top",
  BOTTOM = "bottom"
}

export const DEFAULT_TITLEBAR_HEIGHT = 34;
export const MIN_TITLEBAR_HEIGHT = 30;

export interface ITitlebarLayoutOptions {
  readonly visible: boolean;
  readonly height: number;
}

export interface ITitlebarLayoutService {
  getTitlebarOptions(): ITitlebarLayoutOptions;
  setTitlebarVisible(visible: boolean): void;
  setTitlebarHeight(height: number): void;
}

export class TitlebarLayoutService implements ITitlebarLayoutService {
  private visible = true;
  private height = DEFAULT_TITLEBAR_HEIGHT;

  getTitlebarOptions(): ITitlebarLayoutOptions {
    return { visible: this.visible, height: this.height };
  }

  setTitlebarVisible(visible: boolean): void {
    this.visible = visible;
  }

  setTitlebarHeight(height: number): void {
    this.height = Math.max(MIN_TITLEBAR_HEIGHT, Math.floor(height));
  }
}

