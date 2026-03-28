import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { loadAppConfig, pushRecentContainer, setPreferences } from "./services/appConfig.js";
import { containerClose, containerCreate, containerOpen, getOpenContainer } from "./services/containerSession.js";
import { addFolderNode, createEmptyFileNode, deleteNode, listTree, renameNode, searchTree } from "./services/tree.js";
import { readDecryptedFileStream } from "./services/viewer.js";
import { importFilesToNode } from "./services/importExport.js";
import { exportNodeAsZipStream } from "./services/importExport.js";
import { ensureDir } from "./services/fsUtil.js";
import { asCitadelError, CitadelError } from "./services/errors.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number.parseInt(process.env.PORT ?? "8787", 10);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";
const ROOT = path.resolve(__dirname, "../..");

function asciiFallbackFilename(name: string) {
  const cleaned = name
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  const ascii = cleaned
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
  return ascii || "download";
}

function contentDisposition(name: string, disposition: "inline" | "attachment") {
  const fallback = asciiFallbackFilename(name).replace(/"/g, "");
  const utf8 = encodeURIComponent(name);
  // RFC 5987 / RFC 6266: include both filename and filename*
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${utf8}`;
}

function withUtf8Charset(mime: string) {
  if (mime.startsWith("text/")) return `${mime}; charset=utf-8`;
  if (mime === "application/json" || mime === "application/xml") return `${mime}; charset=utf-8`;
  return mime;
}

const app = express();
app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));
app.use(express.json({ limit: "2mb" }));
const ah =
  (fn: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<unknown>) =>
  (req: express.Request, res: express.Response, next: express.NextFunction) =>
    void Promise.resolve(fn(req, res, next)).catch(next);

app.get("/api/health", (_req, res) => res.json({ ok: true, name: "citadelDOC" }));

app.get("/api/config", ah(async (_req, res) => {
  const cfg = await loadAppConfig();
  res.json(cfg);
}));

app.post("/api/preferences", ah(async (req, res) => {
  const body = z
    .object({
      theme: z.enum(["dark", "light"]).optional(),
      locale: z.enum(["en_EN", "ru_RU"]).optional()
    })
    .parse(req.body);

  const cfg = await setPreferences(body);
  res.json(cfg);
}));

app.post("/api/container/create", ah(async (req, res) => {
  const body = z
    .object({
      containerPath: z.string().min(1),
      name: z.string().min(1),
      password: z.string().min(1)
    })
    .parse(req.body);

  await ensureDir(path.dirname(body.containerPath));
  const opened = await containerCreate(body.containerPath, body.name, body.password);
  await pushRecentContainer({ path: opened.containerPath, name: opened.name });
  res.json({ ok: true, container: opened.publicInfo });
}));

app.post("/api/container/open", ah(async (req, res) => {
  const body = z
    .object({
      containerPath: z.string().min(1),
      password: z.string().min(1)
    })
    .parse(req.body);

  const opened = await containerOpen(body.containerPath, body.password);
  await pushRecentContainer({ path: opened.containerPath, name: opened.name });
  res.json({ ok: true, container: opened.publicInfo });
}));

app.post("/api/container/close", ah(async (_req, res) => {
  containerClose();
  res.json({ ok: true });
}));

app.get("/api/tree", ah(async (_req, res) => {
  const c = getOpenContainer();
  if (!c) return res.status(409).json({ ok: false, error: "NO_CONTAINER_OPEN" });
  res.json({ ok: true, tree: await listTree(c) });
}));

app.get("/api/search", ah(async (req, res) => {
  const c = getOpenContainer();
  if (!c) return res.status(409).json({ ok: false, error: "NO_CONTAINER_OPEN" });
  const q = z.string().catch("").parse(req.query.q);
  res.json({ ok: true, results: await searchTree(c, q) });
}));

app.post("/api/node/:id/rename", ah(async (req, res) => {
  const c = getOpenContainer();
  if (!c) return res.status(409).json({ ok: false, error: "NO_CONTAINER_OPEN" });
  const id = z.string().min(1).parse(req.params.id);
  const body = z.object({ name: z.string().min(1) }).parse(req.body);
  const node = await renameNode(c, id, body.name);
  res.json({ ok: true, node });
}));

app.post("/api/node/:id/delete", ah(async (req, res) => {
  const c = getOpenContainer();
  if (!c) return res.status(409).json({ ok: false, error: "NO_CONTAINER_OPEN" });
  const id = z.string().min(1).parse(req.params.id);
  const out = await deleteNode(c, id);
  res.json({ ok: true, ...out });
}));

app.post("/api/node/:id/mkdir", ah(async (req, res) => {
  const c = getOpenContainer();
  if (!c) return res.status(409).json({ ok: false, error: "NO_CONTAINER_OPEN" });
  const id = z.string().min(1).parse(req.params.id);
  const body = z.object({ name: z.string().min(1) }).parse(req.body);
  const node = await addFolderNode(c, id, body.name);
  res.json({ ok: true, node });
}));

app.post("/api/node/:id/file", ah(async (req, res) => {
  const c = getOpenContainer();
  if (!c) return res.status(409).json({ ok: false, error: "NO_CONTAINER_OPEN" });
  const id = z.string().min(1).parse(req.params.id);
  const body = z.object({ name: z.string().min(1) }).parse(req.body);
  const node = await createEmptyFileNode(c, id, body.name);
  res.json({ ok: true, node });
}));

app.get("/api/file/:id", ah(async (req, res) => {
  const c = getOpenContainer();
  if (!c) return res.status(409).json({ ok: false, error: "NO_CONTAINER_OPEN" });
  const id = z.string().min(1).parse(req.params.id);
  const streamInfo = await readDecryptedFileStream(c, id);

  res.setHeader("Content-Type", withUtf8Charset(streamInfo.mime));
  res.setHeader("Content-Disposition", contentDisposition(streamInfo.name, "inline"));
  streamInfo.stream.pipe(res);
}));

import multer from "multer";
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 250 * 1024 * 1024 } });

app.post("/api/import", upload.array("files"), ah(async (req, res) => {
  const c = getOpenContainer();
  if (!c) return res.status(409).json({ ok: false, error: "NO_CONTAINER_OPEN" });
  const targetNodeId = z.string().min(1).parse(req.body.targetNodeId);
  const files = (req.files ?? []) as Express.Multer.File[];
  const result = await importFilesToNode(c, targetNodeId, files);
  res.json({ ok: true, imported: result });
}));

app.get("/api/export/:nodeId", ah(async (req, res) => {
  const c = getOpenContainer();
  if (!c) return res.status(409).json({ ok: false, error: "NO_CONTAINER_OPEN" });
  const nodeId = z.string().min(1).parse(req.params.nodeId);

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", contentDisposition("citadelDOC-export.zip", "attachment"));
  const zipStream = await exportNodeAsZipStream(c, nodeId);
  zipStream.pipe(res);
}));

// Static app resources (themes, locales, icons)
app.use("/app-assets/assets", express.static(path.join(ROOT, "assets")));
app.use("/app-assets/themes", express.static(path.join(ROOT, "themes")));
app.use("/app-assets/locales", express.static(path.join(ROOT, "locales")));

// Serve built frontend (optional for production)
app.use(express.static(path.join(__dirname, "../../frontend/dist")));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  if (req.path.startsWith("/app-assets/")) return next();
  res.sendFile(path.join(__dirname, "../../frontend/dist/index.html"));
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const e = asCitadelError(err);
  if (!(e instanceof CitadelError) || e.httpStatus >= 500) console.error(err);
  res.status(e.httpStatus).json({ ok: false, error: e.code, message: e.message });
});

app.listen(PORT, () => {
  console.log(`citadelDOC backend listening on http://localhost:${PORT}`);
});

