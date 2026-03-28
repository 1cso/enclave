import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function SplitPane(props: {
  left: React.ReactNode;
  right: React.ReactNode;
  initialLeftWidthPx?: number;
  rootClassName?: string;
}) {
  const initial = props.initialLeftWidthPx ?? 360;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [leftW, setLeftW] = useState<number>(initial);
  const drag = useRef<{ startX: number; startW: number } | null>(null);

  const onDown = useCallback((e: React.MouseEvent) => {
    drag.current = { startX: e.clientX, startW: leftW };
    e.preventDefault();
  }, [leftW]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!drag.current) return;
      const root = rootRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      const next = drag.current.startW + (e.clientX - drag.current.startX);
      const min = 220;
      const max = Math.max(min, rect.width - 260);
      setLeftW(Math.min(max, Math.max(min, next)));
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

  const leftStyle = useMemo(() => ({ width: leftW }), [leftW]);

  return (
    <div className={props.rootClassName ?? "splitRoot"} ref={rootRef}>
      <div className="panel" style={leftStyle}>
        {props.left}
      </div>
      <div className="splitter" onMouseDown={onDown} />
      <div className="panel" style={{ flex: 1 }}>
        {props.right}
      </div>
    </div>
  );
}

