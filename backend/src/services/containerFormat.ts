import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { nanoid } from "nanoid";

import { atomicWriteFile, ensureDir, fileExists, safeUnlink } from "./fsUtil.js";
import { decryptAead, deriveKey, encryptAead, randomB64, type KdfParams } from "./crypto.js";
import { CitadelError } from "./errors.js";
import type { ContainerMeta, Manifest, OpenContainer, TreeNode } from "./types.js";

const CONTAINER_META_FILE = "container.yaml";
const MANIFEST_FILE = "manifest.enc";
const BLOBS_DIR = "blobs";

function nowIso() {
  return new Date().toISOString();
}

export function containerPaths(containerPath: string) {
  return {
    containerPath,
    metaPath: path.join(containerPath, CONTAINER_META_FILE),
    manifestPath: path.join(containerPath, MANIFEST_FILE),
    blobsDir: path.join(containerPath, BLOBS_DIR)
  };
}

export async function createContainer(containerPath: string, name: string, password: string): Promise<OpenContainer> {
  const p = containerPaths(containerPath);
  await ensureDir(containerPath);
  await ensureDir(p.blobsDir);

  if (await fileExists(p.metaPath)) {
    throw new CitadelError("CONTAINER_EXISTS", "Container already exists", 409);
  }

  const meta: ContainerMeta = {
    version: 1,
    name,
    createdAt: nowIso(),
    kdf: {
      alg: "scrypt",
      saltB64: randomB64(16),
      N: 1 << 15,
      r: 8,
      p: 1,
      dkLen: 32
    }
  };
  const kdfParams: KdfParams = {
    saltB64: meta.kdf.saltB64,
    N: meta.kdf.N,
    r: meta.kdf.r,
    p: meta.kdf.p,
    dkLen: meta.kdf.dkLen
  };
  const key = await deriveKey(password, kdfParams);

  const rootId = nanoid();
  const rootNode: TreeNode = {
    id: rootId,
    type: "folder",
    name,
    parentId: null,
    childrenIds: [],
    createdAt: nowIso()
  };
  const manifest: Manifest = {
    version: 1,
    rootId,
    nodes: { [rootId]: rootNode }
  };

  const aad = Buffer.from(`citadelDOC|manifest|v${manifest.version}`, "utf8");
  const env = encryptAead(Buffer.from(JSON.stringify(manifest), "utf8"), key, aad);

  await atomicWriteFile(p.metaPath, yaml.dump(meta));
  await atomicWriteFile(p.manifestPath, JSON.stringify(env, null, 2));
  return { containerPath, name, meta, key };
}

export async function openContainer(containerPath: string, password: string): Promise<OpenContainer> {
  const p = containerPaths(containerPath);
  if (!(await fileExists(p.metaPath)) || !(await fileExists(p.manifestPath))) {
    throw new CitadelError("CONTAINER_NOT_FOUND", "Container not found", 404);
  }
  const metaRaw = await fs.readFile(p.metaPath, "utf8");
  const meta = (yaml.load(metaRaw) ?? {}) as ContainerMeta;
  if (!meta?.kdf?.saltB64) throw new CitadelError("BAD_CONTAINER", "Invalid container metadata", 400);

  const kdfParams: KdfParams = {
    saltB64: meta.kdf.saltB64,
    N: meta.kdf.N,
    r: meta.kdf.r,
    p: meta.kdf.p,
    dkLen: meta.kdf.dkLen
  };
  const key = await deriveKey(password, kdfParams);

  // Validate password by decrypting manifest once.
  await readManifest({ containerPath, name: meta.name, meta, key });
  await ensureDir(p.blobsDir);
  return { containerPath, name: meta.name, meta, key };
}

export async function readManifest(c: OpenContainer): Promise<Manifest> {
  const p = containerPaths(c.containerPath);
  const raw = await fs.readFile(p.manifestPath, "utf8");
  const env = JSON.parse(raw) as any;
  const aad = Buffer.from(`citadelDOC|manifest|v1`, "utf8");
  const plaintext = decryptAead(env, c.key, aad);
  const manifest = JSON.parse(plaintext.toString("utf8")) as Manifest;
  if (!manifest?.rootId || !manifest?.nodes?.[manifest.rootId]) {
    throw new CitadelError("BAD_CONTAINER", "Manifest corrupted", 400);
  }
  return manifest;
}

export async function writeManifest(c: OpenContainer, manifest: Manifest) {
  const p = containerPaths(c.containerPath);
  const aad = Buffer.from(`citadelDOC|manifest|v${manifest.version}`, "utf8");
  const env = encryptAead(Buffer.from(JSON.stringify(manifest), "utf8"), c.key, aad);
  await atomicWriteFile(p.manifestPath, JSON.stringify(env, null, 2));
}

export async function writeEncryptedBlob(c: OpenContainer, blobId: string, plaintext: Buffer): Promise<void> {
  const p = containerPaths(c.containerPath);
  const aad = Buffer.from(`citadelDOC|blob|${blobId}`, "utf8");
  const env = encryptAead(plaintext, c.key, aad);
  const filePath = path.join(p.blobsDir, `${blobId}.json`);
  await atomicWriteFile(filePath, JSON.stringify(env));
}

export async function readDecryptedBlob(c: OpenContainer, blobId: string): Promise<Buffer> {
  const p = containerPaths(c.containerPath);
  const filePath = path.join(p.blobsDir, `${blobId}.json`);
  if (!(await fileExists(filePath))) throw new CitadelError("BLOB_NOT_FOUND", "Blob not found", 404);
  const raw = await fs.readFile(filePath, "utf8");
  const env = JSON.parse(raw) as any;
  const aad = Buffer.from(`citadelDOC|blob|${blobId}`, "utf8");
  return decryptAead(env, c.key, aad);
}

export async function deleteBlob(c: OpenContainer, blobId: string) {
  const p = containerPaths(c.containerPath);
  const filePath = path.join(p.blobsDir, `${blobId}.json`);
  await safeUnlink(filePath);
}

