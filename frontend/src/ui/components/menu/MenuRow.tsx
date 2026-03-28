import React from "react";

export type MenuRowProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  muted?: boolean;
};

export function MenuRow({ muted, className, children, ...rest }: MenuRowProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className={["appMenuRow", muted ? "appMenuRow--muted" : "", className].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}

export function MenuRowKbd(props: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className="appMenuRowKbd" {...props} />;
}
