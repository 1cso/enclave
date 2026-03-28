import archiver from "archiver";
import { nanoid } from "nanoid";
import mime from "mime-types";
import { PassThrough } from "node:stream";

import type { OpenContainer, TreeNode } from "./types.js";
import { readManifest, readDecryptedBlob, writeEncryptedBlob } from "./containerFormat.js";
import { addFileNode } from "./tree.js";
import { CitadelError } from "./errors.js";

export async function importFilesToNode(
  c: OpenContainer,
  targetNodeId: string,
  files: Array<{ originalname: string; mimetype: string; buffer: Buffer; size: number }>
) {
  const imported: TreeNode[] = [];
  for (const f of files) {
    const blobId = nanoid();
    await writeEncryptedBlob(c, blobId, f.buffer);
    const inferredMime = f.mimetype && f.mimetype !== "application/octet-stream" ? f.mimetype : (mime.lookup(f.originalname) || "application/octet-stream").toString();
    const node = await addFileNode(c, targetNodeId, f.originalname, inferredMime, f.size, blobId);
    imported.push(node);
  }
  return imported;
}

function collectNodeIds(manifest: any, nodeId: string): string[] {
  const node = manifest.nodes[nodeId];
  if (!node) throw new CitadelError("NODE_NOT_FOUND", "Node not found", 404);
  const out: string[] = [nodeId];
  if (node.type === "folder") {
    for (const childId of node.childrenIds ?? []) {
      out.push(...collectNodeIds(manifest, childId));
    }
  }
  return out;
}

function buildPath(manifest: any, nodeId: string): string {
  const parts: string[] = [];
  let cur = manifest.nodes[nodeId];
  while (cur) {
    parts.push(cur.name);
    if (!cur.parentId) break;
    cur = manifest.nodes[cur.parentId];
  }
  return parts.reverse().join("/");
}

export async function exportNodeAsZipStream(c: OpenContainer, nodeId: string) {
  const manifest = await readManifest(c);
  const ids = collectNodeIds(manifest, nodeId);

  const pass = new PassThrough();
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (err: Error) => pass.destroy(err));
  archive.pipe(pass);

  for (const id of ids) {
    const node = manifest.nodes[id] as TreeNode;
    if (node.type === "file" && node.blobId) {
      const data = await readDecryptedBlob(c, node.blobId);
      const p = buildPath(manifest, id);
      archive.append(data, { name: p });
    }
  }

  void archive.finalize();
  return pass;
}

