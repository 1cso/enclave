import { nanoid } from "nanoid";
import type { Manifest, OpenContainer, TreeNode } from "./types.js";
import { readManifest, writeEncryptedBlob, writeManifest } from "./containerFormat.js";
import { CitadelError } from "./errors.js";
import { deleteBlob } from "./containerFormat.js";

function lower(s: string) {
  return s.toLocaleLowerCase();
}

export async function listTree(c: OpenContainer) {
  const m = await readManifest(c);
  return m;
}

export async function searchTree(c: OpenContainer, q: string) {
  const m = await readManifest(c);
  const query = lower(q.trim());
  if (!query) return [];
  return Object.values(m.nodes)
    .filter((n) => lower(n.name).includes(query))
    .slice(0, 200);
}

export async function getNode(c: OpenContainer, nodeId: string): Promise<{ manifest: Manifest; node: TreeNode }> {
  const manifest = await readManifest(c);
  const node = manifest.nodes[nodeId];
  if (!node) throw new CitadelError("NODE_NOT_FOUND", "Node not found", 404);
  return { manifest, node };
}

export async function addFileNode(
  c: OpenContainer,
  parentId: string,
  name: string,
  mime: string,
  size: number,
  blobId: string
) {
  const manifest = await readManifest(c);
  const parent = manifest.nodes[parentId];
  if (!parent || parent.type !== "folder") throw new CitadelError("BAD_TARGET", "Target must be a folder", 400);
  const id = nanoid();
  const node: TreeNode = {
    id,
    type: "file",
    name,
    parentId,
    blobId,
    mime,
    size,
    createdAt: new Date().toISOString()
  };
  parent.childrenIds = parent.childrenIds ?? [];
  parent.childrenIds.push(id);
  manifest.nodes[id] = node;
  await writeManifest(c, manifest);
  return node;
}

export async function createEmptyFileNode(c: OpenContainer, parentId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new CitadelError("BAD_NAME", "Name cannot be empty", 400);
  const blobId = nanoid();
  await writeEncryptedBlob(c, blobId, Buffer.alloc(0));
  return addFileNode(c, parentId, trimmed, "text/plain", 0, blobId);
}

export async function addFolderNode(c: OpenContainer, parentId: string, name: string) {
  const manifest = await readManifest(c);
  const parent = manifest.nodes[parentId];
  if (!parent || parent.type !== "folder") throw new CitadelError("BAD_TARGET", "Target must be a folder", 400);
  const id = nanoid();
  const node: TreeNode = {
    id,
    type: "folder",
    name,
    parentId,
    childrenIds: [],
    createdAt: new Date().toISOString()
  };
  parent.childrenIds = parent.childrenIds ?? [];
  parent.childrenIds.push(id);
  manifest.nodes[id] = node;
  await writeManifest(c, manifest);
  return node;
}

export async function renameNode(c: OpenContainer, nodeId: string, newName: string) {
  const manifest = await readManifest(c);
  const node = manifest.nodes[nodeId];
  if (!node) throw new CitadelError("NODE_NOT_FOUND", "Node not found", 404);
  if (!newName.trim()) throw new CitadelError("BAD_NAME", "Name cannot be empty", 400);
  if (node.parentId === null) {
    // root: allow rename but keep container semantics minimal
    node.name = newName.trim();
  } else {
    node.name = newName.trim();
  }
  await writeManifest(c, manifest);
  return node;
}

function collectDescendants(manifest: Manifest, nodeId: string): string[] {
  const node = manifest.nodes[nodeId];
  if (!node) return [];
  const out = [nodeId];
  if (node.type === "folder") {
    for (const childId of node.childrenIds ?? []) {
      out.push(...collectDescendants(manifest, childId));
    }
  }
  return out;
}

export async function deleteNode(c: OpenContainer, nodeId: string) {
  const manifest = await readManifest(c);
  const node = manifest.nodes[nodeId];
  if (!node) throw new CitadelError("NODE_NOT_FOUND", "Node not found", 404);
  if (node.parentId === null) throw new CitadelError("CANNOT_DELETE_ROOT", "Cannot delete root", 400);

  const ids = collectDescendants(manifest, nodeId);

  // remove from parent's children
  const parent = node.parentId ? manifest.nodes[node.parentId] : null;
  if (parent?.type === "folder" && parent.childrenIds) {
    parent.childrenIds = parent.childrenIds.filter((id) => id !== nodeId);
  }

  // delete blobs + nodes
  for (const id of ids) {
    const n = manifest.nodes[id];
    if (!n) continue;
    if (n.type === "file" && n.blobId) {
      await deleteBlob(c, n.blobId);
    }
    delete manifest.nodes[id];
  }

  await writeManifest(c, manifest);
  return { deletedIds: ids };
}

