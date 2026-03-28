import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

type OverlayScrollAreaProps = Omit<React.HTMLAttributes<HTMLDivElement>, "children"> & {
  children: React.ReactNode;
  /** Auto-hide after the user stops interacting */
  autoHideMs?: number;
  /** Thumb size in px (square scrollbar look) */
  sizePx?: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export const OverlayScrollArea = React.forwardRef<HTMLDivElement, OverlayScrollAreaProps>(function OverlayScrollArea(
  { children, autoHideMs = 1200, sizePx = 10, className, style, onScroll, ...rest },
  forwardedRef
) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const vThumbRef = useRef<HTMLDivElement | null>(null);
  const hThumbRef = useRef<HTMLDivElement | null>(null);

  const mergeRef = useCallback(
    (el: HTMLDivElement | null) => {
      viewportRef.current = el;
      if (typeof forwardedRef === "function") forwardedRef(el);
      else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    },
    [forwardedRef]
  );

  const [isOverlayVisible, setOverlayVisible] = useState(false);
  const hideTimerRef = useRef<number | null>(null);
  const lastShowAtRef = useRef<number>(0);

  const showTemporarily = useCallback(() => {
    lastShowAtRef.current = Date.now();
    setOverlayVisible(true);
    updateThumbs();
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      // Only hide if nothing else happened after the timer was started.
      const elapsed = Date.now() - lastShowAtRef.current;
      if (elapsed >= autoHideMs - 30) setOverlayVisible(false);
    }, autoHideMs);
  }, [autoHideMs]);

  const updateThumbs = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const vThumb = vThumbRef.current;
    const hThumb = hThumbRef.current;
    if (!vThumb && !hThumb) return;

    const clientH = el.clientHeight;
    const scrollH = el.scrollHeight;
    const clientW = el.clientWidth;
    const scrollW = el.scrollWidth;

    const canV = scrollH > clientH + 1;
    const canH = scrollW > clientW + 1;

    if (vThumb) {
      if (!canV) {
        vThumb.style.opacity = "0";
      } else {
        const trackH = clientH;
        const thumbH = clamp((clientH / scrollH) * trackH, 18, trackH);
        const maxTop = trackH - thumbH;
        const ratio = (el.scrollTop || 0) / Math.max(1, scrollH - clientH);
        const top = clamp(ratio * maxTop, 0, maxTop);
        vThumb.style.opacity = "1";
        vThumb.style.height = `${thumbH}px`;
        vThumb.style.transform = `translateY(${top}px)`;
      }
    }

    if (hThumb) {
      if (!canH) {
        hThumb.style.opacity = "0";
      } else {
        const trackW = clientW;
        const thumbW = clamp((clientW / scrollW) * trackW, 18, trackW);
        const maxLeft = trackW - thumbW;
        const ratio = (el.scrollLeft || 0) / Math.max(1, scrollW - clientW);
        const left = clamp(ratio * maxLeft, 0, maxLeft);
        hThumb.style.opacity = "1";
        hThumb.style.width = `${thumbW}px`;
        hThumb.style.transform = `translateX(${left}px)`;
      }
    }
  }, []);

  // Keep thumb positions in sync.
  useLayoutEffect(() => {
    updateThumbs();
  }, [updateThumbs]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      updateThumbs();
    });
    ro.observe(el);

    const roContent = ro; // We observe the viewport; for most layouts it's enough.

    return () => {
      roContent.disconnect();
    };
  }, [updateThumbs]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, []);

  const onPointerDownThumb = useCallback((e: React.PointerEvent, axis: "v" | "h") => {
    const el = viewportRef.current;
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    showTemporarily();

    el.setPointerCapture?.(e.pointerId);

    const startScrollTop = el.scrollTop;
    const startScrollLeft = el.scrollLeft;
    const startY = e.clientY;
    const startX = e.clientX;

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const clientH = el.clientHeight;
      const scrollH = el.scrollHeight;
      const clientW = el.clientWidth;
      const scrollW = el.scrollWidth;

      if (axis === "v") {
        const maxScroll = Math.max(1, scrollH - clientH);
        const trackH = clientH;
        const thumbH = clamp((clientH / scrollH) * trackH, 18, trackH);
        const maxThumbTop = Math.max(1, trackH - thumbH);
        const ratioDelta = dy / maxThumbTop;
        el.scrollTop = clamp(startScrollTop + ratioDelta * maxScroll, 0, maxScroll);
      } else {
        const maxScroll = Math.max(1, scrollW - clientW);
        const trackW = clientW;
        const thumbW = clamp((clientW / scrollW) * trackW, 18, trackW);
        const maxThumbLeft = Math.max(1, trackW - thumbW);
        const ratioDelta = dx / maxThumbLeft;
        el.scrollLeft = clamp(startScrollLeft + ratioDelta * maxScroll, 0, maxScroll);
      }
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [showTemporarily]);

  const wrapperStyle = useMemo<React.CSSProperties>(
    () => ({
      ...(style ?? {}),
      ["--overlay-scroll-size" as any]: `${sizePx}px`
    }),
    [style, sizePx]
  );

  return (
    <div className="overlayScrollWrapper" style={wrapperStyle}>
      <div
        ref={mergeRef}
        className={`overlayScrollViewport${className ? ` ${className}` : ""}`}
        onMouseEnter={() => showTemporarily()}
        onMouseMove={() => showTemporarily()}
        onFocus={() => showTemporarily()}
        onScroll={(e) => {
          showTemporarily();
          updateThumbs();
          onScroll?.(e);
        }}
        {...rest}
      >
        {children}
      </div>

      {/* Overlay thumbs */}
      <div
        className="overlayScrollThumbTrack overlayScrollThumbTrackV"
        aria-hidden
        style={{ opacity: isOverlayVisible ? 1 : 0, transition: "opacity 160ms linear" }}
      >
        <div
          ref={vThumbRef}
          className="overlayScrollThumb overlayScrollThumbV"
          style={{ width: `${sizePx}px`, right: 0, top: 0, height: 18, transform: "translateY(0px)" }}
          onPointerDown={(e) => onPointerDownThumb(e, "v")}
        />
      </div>

      <div
        className="overlayScrollThumbTrack overlayScrollThumbTrackH"
        aria-hidden
        style={{ opacity: isOverlayVisible ? 1 : 0, transition: "opacity 160ms linear" }}
      >
        <div
          ref={hThumbRef}
          className="overlayScrollThumb overlayScrollThumbH"
          style={{ height: `${sizePx}px`, bottom: 0, left: 0, width: 18, transform: "translateX(0px)" }}
          onPointerDown={(e) => onPointerDownThumb(e, "h")}
        />
      </div>
    </div>
  );
});

