import React from "react";

export type MenuPanelVariant = "dropdown" | "dropdownEnd" | "fixed" | "anchorRight";

function panelClassName(variant: MenuPanelVariant, wide?: boolean): string {
  const parts = ["appMenu"];
  if (variant === "dropdown") parts.push("appMenu--dropdown");
  else if (variant === "dropdownEnd") parts.push("appMenu--dropdown", "appMenu--dropdownEnd");
  else if (variant === "fixed") parts.push("appMenu--fixed");
  else if (variant === "anchorRight") parts.push("appMenu--anchorRight");
  if (wide) parts.push("appMenu--wide");
  return parts.join(" ");
}

export type MenuPanelProps = {
  variant: MenuPanelVariant;
  wide?: boolean;
  className?: string;
  style?: React.CSSProperties;
  role?: "menu" | "presentation";
  children: React.ReactNode;
  onMouseDown?: React.MouseEventHandler<HTMLDivElement>;
};

export const MenuPanel = React.forwardRef<HTMLDivElement, MenuPanelProps>(function MenuPanel(
  { variant, wide, className, style, role = "menu", children, onMouseDown },
  ref
) {
  return (
    <div
      ref={ref}
      className={[panelClassName(variant, wide), className].filter(Boolean).join(" ")}
      style={style}
      role={role}
      data-app-menu=""
      onMouseDown={onMouseDown}
    >
      {children}
    </div>
  );
});
