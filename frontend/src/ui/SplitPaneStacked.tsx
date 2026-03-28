import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** Верх / низ (сплит редактора по горизонтали, как в VS Code). */
export function SplitPaneStacked(props: {
  top: React.ReactNode;
  bottom: React.ReactNode;
  initialTopHeightPx?: number;
}) {
  const initial = props.initialTopHeightPx ?? (typeof window !== "undefined" ? Math.round(window.innerHeight * 0.42) : 280);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [topH, setTopH] = useState<number>(initial);
  const drag = useRef<{ startY: number; startH: number } | null>(null);

  const onDown = useCallback(
    (e: React.MouseEvent) => {
      drag.current = { startY: e.clientY, startH: topH };
      e.preventDefault();
    },
    [topH]
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!drag.current) return;
      const root = rootRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      const next = drag.current.startH + (e.clientY - drag.current.startY);
      const min = 100;
      const max = Math.max(min, rect.height - 100);
      setTopH(Math.min(max, Math.max(min, next)));
    };
    const onUp = () => {
      drag.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const topStyle = useMemo(() => ({ flex: `0 0 ${topH}px` as const }), [topH]);

  return (
    <div className="splitRoot splitRootStacked" ref={rootRef}>
      <div className="panel panelStackedTop" style={topStyle}>
        {props.top}
      </div>
      <div className="splitter splitterRow" onMouseDown={onDown} />
      <div className="panel panelStackedBottom">{props.bottom}</div>
    </div>
  );
}
