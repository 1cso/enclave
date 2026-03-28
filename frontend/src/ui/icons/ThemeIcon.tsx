import React, { memo, useMemo } from "react";
import { getSvgHtml } from "./svgRegistry";

export type ThemeIconProps = {
  /** Basename of `assets/dark/<name>.svg`, or `app` for `assets/app.svg` */
  name: string;
  className?: string;
  /** Size in CSS pixels (width/height of the icon box) */
  size?: number;
  title?: string;
};

export const ThemeIcon = memo(function ThemeIcon({ name, className, size = 16, title }: ThemeIconProps) {
  const html = useMemo(() => getSvgHtml(name), [name]);
  return (
    <span
      className={className ? `themeIcon ${className}` : "themeIcon"}
      style={{ width: size, height: size, fontSize: size }}
      dangerouslySetInnerHTML={{ __html: html }}
      aria-hidden={title ? undefined : true}
      title={title}
    />
  );
});
