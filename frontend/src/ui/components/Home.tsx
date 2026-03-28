import React, { useMemo } from "react";
import type { AppConfig } from "../api";
import type { Dict } from "../i18n";
import { t } from "../i18n";
import { OverlayScrollArea } from "./OverlayScrollArea";

export function Home(props: {
  dict: Dict;
  cfg: AppConfig;
  onCreateRequest: () => void;
  onOpenRequest: () => void;
  onOpenRecentRequest: (containerPath: string) => void;
}) {
  const recents = useMemo(() => props.cfg.recentContainers ?? [], [props.cfg.recentContainers]);

  return (
    <div className="panelInner">
      <div className="panelHeader">
        <div style={{ fontWeight: 600 }}>{t(props.dict, "home.title")}</div>
      </div>
      <OverlayScrollArea className="panelBody">
        <div className="stack">
          <div className="card">
            <div className="homeStartActions">
              <button className="btn btnPrimary" type="button" onClick={props.onCreateRequest}>
                {t(props.dict, "container.create")}
              </button>
              <button className="btn" type="button" onClick={props.onOpenRequest}>
                {t(props.dict, "home.open")}
              </button>
            </div>
          </div>

          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 8 }}>{t(props.dict, "home.recent")}</div>
            {recents.length === 0 ? <div className="muted">—</div> : null}
            <div className="homeRecentList">
              {recents.map((r) => (
                <button
                  key={r.path}
                  type="button"
                  className="homeRecentRow"
                  onClick={() => props.onOpenRecentRequest(r.path)}
                  title={r.path}
                >
                  <span className="homeRecentName">{r.name}</span>
                  <span className="homeRecentPath">{r.path}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </OverlayScrollArea>
    </div>
  );
}

