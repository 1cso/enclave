import React, { useCallback, useMemo, useState } from "react";
import type { Preferences } from "../api";
import type { Dict } from "../i18n";
import { t } from "../i18n";
import { ThemeIcon } from "../icons";
import { MenuItem, MenuPanel, MenuSeparator } from "./menu";
import { useMenuDismiss } from "../hooks/useMenuDismiss";

type TopMenuId = "file" | "edit" | "selection" | "view" | "go" | "help";
type MenuOpen = null | TopMenuId;

export function MenuBar(props: {
  dict: Dict;
  prefs: Preferences;
  containerName?: string;
  activeItemName?: string;
  containerOpen: boolean;
  onMenuOpenContainer: () => void;
  onMenuCreateContainer: () => void;
  onMenuCloseContainer: () => void;
  onMenuImport: () => void;
  onMenuExport: () => void;
  onMenuRefresh: () => void;
  onThemeToggle: () => void;
  onLocaleToggle: () => void;
  onTabsPrev?: () => void;
  onTabsNext?: () => void;
  canTabsPrev?: boolean;
  canTabsNext?: boolean;
  /** Back-compat: ранее тут был search input в titlebar. Сейчас не используем. */
  searchQuery?: string;
  onSearchQueryChange?: (q: string) => void;
  onSearchFocusChange?: (focused: boolean) => void;
}) {
  const [open, setOpen] = useState<MenuOpen>(null);

  const setMenu = useCallback((next: TopMenuId) => {
    setOpen((prev) => (prev === next ? null : next));
  }, []);

  const ignoreMenubar = useCallback((target: EventTarget | null) => {
    return target instanceof Element && !!target.closest(".menuBar");
  }, []);

  useMenuDismiss({
    open: open !== null,
    onClose: () => setOpen(null),
    ignoreInside: ignoreMenubar
  });

  const centerTitle = useMemo(() => {
    if (!props.containerOpen) return t(props.dict, "home.title");
    return props.containerName ?? t(props.dict, "home.title");
  }, [props.containerOpen, props.containerName, props.dict]);

  const fileItems = useMemo(() => {
    return [
      { key: "open", label: t(props.dict, "home.open"), onClick: props.onMenuOpenContainer, disabled: false },
      { key: "create", label: t(props.dict, "home.create"), onClick: props.onMenuCreateContainer, disabled: false },
      { key: "sep1", sep: true },
      { key: "import", label: t(props.dict, "explorer.import"), onClick: props.onMenuImport, disabled: !props.containerOpen },
      { key: "export", label: t(props.dict, "explorer.export"), onClick: props.onMenuExport, disabled: !props.containerOpen },
      { key: "sep2", sep: true },
      { key: "close", label: t(props.dict, "menu.close_container"), onClick: props.onMenuCloseContainer, disabled: !props.containerOpen }
    ] as const;
  }, [props]);

  const renderMenuPopup = useCallback(
    (menuId: TopMenuId) => {
      if (menuId === "file") {
        return (
          <MenuPanel variant="dropdown">
            {fileItems.map((it) =>
              (it as any).sep ? (
                <MenuSeparator key={(it as any).key} />
              ) : (
                <MenuItem
                  key={(it as any).key}
                  disabled={(it as any).disabled}
                  onClick={() => {
                    setOpen(null);
                    (it as any).onClick?.();
                  }}
                >
                  {(it as any).label}
                </MenuItem>
              )
            )}
          </MenuPanel>
        );
      }

      if (menuId === "edit") {
        return (
          <MenuPanel variant="dropdown">
            <MenuItem disabled>{t(props.dict, "menu.undo")}</MenuItem>
            <MenuItem disabled>{t(props.dict, "menu.redo")}</MenuItem>
          </MenuPanel>
        );
      }

      if (menuId === "selection") {
        return (
          <MenuPanel variant="dropdown">
            <MenuItem disabled>{t(props.dict, "tabs.empty_menu")}</MenuItem>
          </MenuPanel>
        );
      }

      if (menuId === "view") {
        return (
          <MenuPanel variant="dropdown">
            <MenuItem
              onClick={() => {
                setOpen(null);
                props.onThemeToggle();
              }}
            >
              {t(props.dict, "menu.toggle_theme")}
            </MenuItem>
            <MenuItem
              onClick={() => {
                setOpen(null);
                props.onLocaleToggle();
              }}
            >
              {t(props.dict, "menu.toggle_language")}
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              disabled={!props.containerOpen}
              onClick={() => {
                setOpen(null);
                props.onMenuRefresh();
              }}
            >
              {t(props.dict, "explorer.refresh")}
            </MenuItem>
          </MenuPanel>
        );
      }

      if (menuId === "go") {
        return (
          <MenuPanel variant="dropdown">
            <MenuItem disabled>{t(props.dict, "tabs.empty_menu")}</MenuItem>
          </MenuPanel>
        );
      }

      return (
        <MenuPanel variant="dropdown">
          <MenuItem
            onClick={() => {
              setOpen(null);
              alert(t(props.dict, "app.name"));
            }}
          >
            {t(props.dict, "menu.about")}
          </MenuItem>
        </MenuPanel>
      );
    },
    [fileItems, props]
  );

  return (
    <div className="menuBar">
      <div className="menuBarDragZone" aria-hidden />
      <div className="menuBarSurface">
        <div className="menuBarLeft">
        <div className="menuBarAppIcon" aria-hidden>
          <ThemeIcon name="app" size={20} />
        </div>
        <div className="menuGroup">
          {(["file", "edit", "selection", "view", "go", "help"] as TopMenuId[]).map((menuId) => (
            <div className="menuDrop" key={menuId}>
              <button
                type="button"
                className={`menuBtn ${open === menuId ? "open" : ""}`}
                onClick={() => setMenu(menuId)}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {topLabel(menuId, props.dict)}
              </button>
              {open === menuId ? renderMenuPopup(menuId) : null}
            </div>
          ))}
        </div>
      </div>

        <div className="menuBarCenter">
          <span className="menuCenterIdle">{centerTitle}</span>
        </div>

        <div className="menuBarRight">
        <div className="menuRightActions" />
        </div>
      </div>
    </div>
  );
}

function topLabel(id: TopMenuId, dict: Dict): string {
  if (id === "file") return t(dict, "menu.file");
  if (id === "edit") return t(dict, "menu.edit");
  if (id === "selection") return t(dict, "menu.selection");
  if (id === "view") return t(dict, "menu.view");
  if (id === "go") return t(dict, "menu.go");
  return t(dict, "menu.help");
}
