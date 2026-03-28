/**
 * Adapted from VS Code workbench layout logic.
 * Contains only titlebar-related layout helpers.
 */

import { DEFAULT_TITLEBAR_HEIGHT } from "./layoutService";

export interface IWindowLikeLayoutState {
  readonly width: number;
  readonly height: number;
}

export interface ITitlebarMetrics {
  readonly visible: boolean;
  readonly topOffset: number;
  readonly height: number;
  readonly width: number;
}

export function computeTitlebarMetrics(
  viewport: IWindowLikeLayoutState,
  options?: { visible?: boolean; height?: number }
): ITitlebarMetrics {
  const visible = options?.visible !== false;
  const height = visible ? Math.max(0, options?.height ?? DEFAULT_TITLEBAR_HEIGHT) : 0;
  return {
    visible,
    topOffset: 0,
    height,
    width: Math.max(0, viewport.width)
  };
}

export function getContentTopOffset(metrics: ITitlebarMetrics): number {
  return metrics.visible ? metrics.height : 0;
}

