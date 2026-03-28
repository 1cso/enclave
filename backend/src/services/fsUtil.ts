import fs from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function fileExists(p: string) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function atomicWriteFile(filePath: string, data: Buffer | string) {
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.${path.basename(filePath)}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, filePath);
}

export async function safeUnlink(filePath: string) {
  try {
    await fs.unlink(filePath);
  } catch (e: any) {
    if (e?.code === "ENOENT") return;
    throw e;
  }
}

