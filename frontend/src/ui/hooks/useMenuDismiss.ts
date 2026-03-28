import { useEffect, useRef } from "react";

/** Return true to keep the menu open (click is considered “inside” the menu UI). */
export type MenuDismissIgnore = (target: EventTarget | null) => boolean;

export function useMenuDismiss(options: {
  open: boolean;
  onClose: () => void;
  ignoreInside?: MenuDismissIgnore;
}) {
  const { open, onClose } = options;
  const ignoreRef = useRef(options.ignoreInside);
  ignoreRef.current = options.ignoreInside;

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (ignoreRef.current?.(e.target)) return;
      onClose();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
}
