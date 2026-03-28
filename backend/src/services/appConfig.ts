import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { atomicWriteFile, ensureDir, fileExists } from "./fsUtil.js";
import type { AppConfig } from "./types.js";

const ROOT = path.resolve(process.cwd(), "..");
const APP_CONFIG_PATH = path.join(ROOT, "config", "app.yaml");

const defaultConfig: AppConfig = {
  version: 1,
  preferences: { theme: "dark", locale: "en_EN" },
  recentContainers: []
};

export async function loadAppConfig(): Promise<AppConfig> {
  await ensureDir(path.dirname(APP_CONFIG_PATH));
  if (!(await fileExists(APP_CONFIG_PATH))) {
    await atomicWriteFile(APP_CONFIG_PATH, yaml.dump(defaultConfig));
    return defaultConfig;
  }
  const raw = await fs.readFile(APP_CONFIG_PATH, "utf8");
  const parsed = (yaml.load(raw) ?? {}) as Partial<AppConfig>;
  return {
    version: typeof parsed.version === "number" ? parsed.version : 1,
    preferences: {
      theme: parsed.preferences?.theme === "light" ? "light" : "dark",
      locale: parsed.preferences?.locale === "ru_RU" ? "ru_RU" : "en_EN"
    },
    recentContainers: Array.isArray(parsed.recentContainers)
      ? parsed.recentContainers
          .filter((x: any) => x && typeof x.path === "string" && typeof x.name === "string")
          .slice(0, 20)
          .map((x: any) => ({
            path: x.path,
            name: x.name,
            lastOpenedAt: typeof x.lastOpenedAt === "string" ? x.lastOpenedAt : new Date().toISOString()
          }))
      : []
  };
}

export async function saveAppConfig(cfg: AppConfig) {
  await atomicWriteFile(APP_CONFIG_PATH, yaml.dump(cfg));
}

export async function pushRecentContainer(entry: { path: string; name: string }) {
  const cfg = await loadAppConfig();
  const now = new Date().toISOString();
  const normalized = path.resolve(entry.path);
  const updated = [
    { path: normalized, name: entry.name, lastOpenedAt: now },
    ...cfg.recentContainers.filter((c) => path.resolve(c.path) !== normalized)
  ].slice(0, 20);
  const next: AppConfig = { ...cfg, recentContainers: updated };
  await saveAppConfig(next);
  return next;
}

export async function setPreferences(prefs: Partial<AppConfig["preferences"]>) {
  const cfg = await loadAppConfig();
  const next: AppConfig = {
    ...cfg,
    preferences: {
      theme: prefs.theme ?? cfg.preferences.theme,
      locale: prefs.locale ?? cfg.preferences.locale
    }
  };
  await saveAppConfig(next);
  return next;
}

