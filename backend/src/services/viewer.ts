import { Readable } from "node:stream";
import type { OpenContainer } from "./types.js";
import { readManifest, readDecryptedBlob } from "./containerFormat.js";
import { CitadelError } from "./errors.js";

export async function readDecryptedFileStream(c: OpenContainer, nodeId: string): Promise<{
  name: string;
  mime: string;
  stream: Readable;
}> {
  const manifest = await readManifest(c);
  const node = manifest.nodes[nodeId];
  if (!node) throw new CitadelError("NODE_NOT_FOUND", "File not found", 404);
  if (node.type !== "file" || !node.blobId) throw new CitadelError("NOT_A_FILE", "Not a file", 400);
  const data = await readDecryptedBlob(c, node.blobId);
  return {
    name: node.name,
    mime: node.mime ?? "application/octet-stream",
    stream: Readable.from(data)
  };
}

