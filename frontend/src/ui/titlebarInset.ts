/** Syncs --window-controls-width: WCO API > IPC (DPI-aware) > static preload fallback. */

type WindowControlsOverlayApi = {
  visible?: boolean;
  getBoundingClientRect?: () => DOMRect;
  addEventListener?: (type: "geometrychange", listener: (ev: Event) => void) => void;
};

function readControlsWidthFromOverlay(): number | null {
  const nav = navigator as Navigator & { windowControlsOverlay?: WindowControlsOverlayApi };
  const wco = nav.windowControlsOverlay;
  if (!wco || typeof wco.getBoundingClientRect !== "function") return null;
  try {
    const r = wco.getBoundingClientRect();
    const iw = window.innerWidth;
    const fromRight = Math.round(iw - r.left);
    const w = Math.ceil(r.width);
    const inset = fromRight > 0 && fromRight < iw ? fromRight : w > 0 && w < iw ? w : 0;
    if (inset > 0 && inset < iw * 0.45) return inset;
  } catch {
    /* ignore */
  }
  return null;
}

function fallbackInsetPx(): number {
  const ea = window.electronApp?.windowControlsRightInset;
  return typeof ea === "number" && ea >= 0 ? ea : 0;
}

async function ipcInsetPx(): Promise<number | null> {
  const fn = window.electronApp?.getWindowControlsInset;
  if (typeof fn !== "function") return null;
  try {
    const v = await fn();
    return typeof v === "number" && v >= 0 ? v : null;
  } catch {
    return null;
  }
}

export async function syncWindowControlsInset(): Promise<void> {
  let px = readControlsWidthFromOverlay();
  if (px == null) {
    px = (await ipcInsetPx()) ?? fallbackInsetPx();
  }
  document.documentElement.style.setProperty("--window-controls-width", `${px}px`);
}

export function installWindowControlsInsetListeners(): void {
  void syncWindowControlsInset();
  window.addEventListener("resize", () => void syncWindowControlsInset());

  const nav = navigator as Navigator & { windowControlsOverlay?: WindowControlsOverlayApi };
  const wco = nav.windowControlsOverlay;
  if (wco?.addEventListener) {
    wco.addEventListener("geometrychange", () => void syncWindowControlsInset());
  }
}
