import { normalizeSvgForTheme } from "./normalizeSvg";

/* Explicit list keeps the bundle small (avoid glob over entire assets/dark). */
import appSvgRaw from "../../../../assets/app.svg?raw";

import accountSvgRaw from "../../../../assets/dark/account.svg?raw";
import arrowLeftSvgRaw from "../../../../assets/dark/arrow-left.svg?raw";
import arrowRightSvgRaw from "../../../../assets/dark/arrow-right.svg?raw";
import chevronDownSvgRaw from "../../../../assets/dark/chevron-down.svg?raw";
import chevronRightSvgRaw from "../../../../assets/dark/chevron-right.svg?raw";
import closeSvgRaw from "../../../../assets/dark/close.svg?raw";
import cloudUploadSvgRaw from "../../../../assets/dark/cloud-upload.svg?raw";
import collapseAllSvgRaw from "../../../../assets/dark/collapse-all.svg?raw";
import ellipsisSvgRaw from "../../../../assets/dark/ellipsis.svg?raw";
import exportSvgRaw from "../../../../assets/dark/export.svg?raw";
import extensionsSvgRaw from "../../../../assets/dark/extensions.svg?raw";
import filesSvgRaw from "../../../../assets/dark/files.svg?raw";
import menuSvgRaw from "../../../../assets/dark/menu.svg?raw";
import refreshSvgRaw from "../../../../assets/dark/refresh.svg?raw";
import searchSvgRaw from "../../../../assets/dark/search.svg?raw";
import settingsSvgRaw from "../../../../assets/dark/settings.svg?raw";
import settingsGearSvgRaw from "../../../../assets/dark/settings-gear.svg?raw";
import splitHorizontalSvgRaw from "../../../../assets/dark/split-horizontal.svg?raw";
import splitVerticalSvgRaw from "../../../../assets/dark/split-vertical.svg?raw";
import symbolFileSvgRaw from "../../../../assets/dark/symbol-file.svg?raw";

const rawByName: Record<string, string> = {
  app: appSvgRaw,
  account: accountSvgRaw,
  "arrow-left": arrowLeftSvgRaw,
  "arrow-right": arrowRightSvgRaw,
  "chevron-down": chevronDownSvgRaw,
  "chevron-right": chevronRightSvgRaw,
  close: closeSvgRaw,
  "cloud-upload": cloudUploadSvgRaw,
  "collapse-all": collapseAllSvgRaw,
  ellipsis: ellipsisSvgRaw,
  export: exportSvgRaw,
  extensions: extensionsSvgRaw,
  files: filesSvgRaw,
  menu: menuSvgRaw,
  refresh: refreshSvgRaw,
  search: searchSvgRaw,
  settings: settingsSvgRaw,
  "split-horizontal": splitHorizontalSvgRaw,
  "split-vertical": splitVerticalSvgRaw,
  "symbol-file": symbolFileSvgRaw,
  "settings-gear": settingsGearSvgRaw
};

const htmlCache = new Map<string, string>();

export function getSvgHtml(iconName: string): string {
  const cached = htmlCache.get(iconName);
  if (cached) return cached;
  const raw = rawByName[iconName];
  if (raw === undefined) {
    throw new Error(`[icons] Unknown icon "${iconName}". Add assets/dark/${iconName}.svg to svgRegistry.ts`);
  }
  const html = normalizeSvgForTheme(raw);
  htmlCache.set(iconName, html);
  return html;
}

export function hasIcon(iconName: string): boolean {
  return iconName in rawByName;
}
