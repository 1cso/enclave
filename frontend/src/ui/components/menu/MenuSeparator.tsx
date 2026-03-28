import React from "react";

export function MenuSeparator(props: { role?: string }) {
  return <div className="appMenuSep" role={props.role ?? "separator"} />;
}
