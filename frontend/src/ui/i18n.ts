import yaml from "js-yaml";

export type LocaleKey = "en_EN" | "ru_RU";
export type Dict = Record<string, any>;

function getPath(dict: Dict, path: string): string | undefined {
  const parts = path.split(".");
  let cur: any = dict;
  for (const p of parts) {
    cur = cur?.[p];
  }
  return typeof cur === "string" ? cur : undefined;
}

export async function loadLocale(locale: LocaleKey): Promise<Dict> {
  const res = await fetch(`/app-assets/locales/${locale}.yaml`);
  const text = await res.text();
  return (yaml.load(text) ?? {}) as Dict;
}

export function t(dict: Dict, key: string): string {
  return getPath(dict, key) ?? key;
}

