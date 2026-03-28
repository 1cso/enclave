import React from "react";

export type MenuItemProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  danger?: boolean;
};

export function MenuItem({ danger, className, ...rest }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className={["appMenuItem", danger ? "appMenuItem--danger" : "", className].filter(Boolean).join(" ")}
      {...rest}
    />
  );
}
