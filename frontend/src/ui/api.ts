export type Preferences = { theme: "dark" | "light"; locale: "en_EN" | "ru_RU" };

export type AppConfig = {
  version: number;
  preferences: Preferences;
  recentContainers: Array<{ path: string; name: string; lastOpenedAt: string }>;
};

export type ContainerInfo = { name: string; containerPath: string };

export type TreeNode = {
  id: string;
  type: "folder" | "file";
  name: string;
  parentId: string | null;
  childrenIds?: string[];
  mime?: string;
  size?: number;
  createdAt: string;
};

export type Manifest = { version: number; rootId: string; nodes: Record<string, TreeNode> };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.message ?? `Request failed: ${res.status}`);
    (err as any).code = data?.error ?? "HTTP_ERROR";
    throw err;
  }
  return data as T;
}

export const Api = {
  health: () => api<{ ok: true; name: string }>("/api/health"),
  config: () => api<AppConfig>("/api/config"),
  setPreferences: (p: Partial<Preferences>) => api<AppConfig>("/api/preferences", { method: "POST", body: JSON.stringify(p) }),
  createContainer: (body: { containerPath: string; name: string; password: string }) =>
    api<{ ok: true; container: ContainerInfo }>("/api/container/create", { method: "POST", body: JSON.stringify(body) }),
  openContainer: (body: { containerPath: string; password: string }) =>
    api<{ ok: true; container: ContainerInfo }>("/api/container/open", { method: "POST", body: JSON.stringify(body) }),
  closeContainer: () => api<{ ok: true }>("/api/container/close", { method: "POST", body: JSON.stringify({}) }),
  tree: () => api<{ ok: true; tree: Manifest }>("/api/tree"),
  search: (q: string) => api<{ ok: true; results: TreeNode[] }>(`/api/search?q=${encodeURIComponent(q)}`),
  renameNode: (nodeId: string, name: string) =>
    api<{ ok: true; node: TreeNode }>(`/api/node/${encodeURIComponent(nodeId)}/rename`, {
      method: "POST",
      body: JSON.stringify({ name })
    }),
  deleteNode: (nodeId: string) =>
    api<{ ok: true; deletedIds: string[] }>(`/api/node/${encodeURIComponent(nodeId)}/delete`, {
      method: "POST",
      body: JSON.stringify({})
    }),
  mkdir: (parentNodeId: string, name: string) =>
    api<{ ok: true; node: TreeNode }>(`/api/node/${encodeURIComponent(parentNodeId)}/mkdir`, {
      method: "POST",
      body: JSON.stringify({ name })
    }),
  createFile: (parentNodeId: string, name: string) =>
    api<{ ok: true; node: TreeNode }>(`/api/node/${encodeURIComponent(parentNodeId)}/file`, {
      method: "POST",
      body: JSON.stringify({ name })
    }),
  exportZipUrl: (nodeId: string) => `/api/export/${encodeURIComponent(nodeId)}`,
  fileUrl: (nodeId: string) => `/api/file/${encodeURIComponent(nodeId)}`,
  importFiles: async (targetNodeId: string, files: File[]) => {
    const form = new FormData();
    form.set("targetNodeId", targetNodeId);
    for (const f of files) form.append("files", f, f.name);
    const res = await fetch("/api/import", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.message ?? `Request failed: ${res.status}`);
      (err as any).code = data?.error ?? "HTTP_ERROR";
      throw err;
    }
    return data as { ok: true; imported: TreeNode[] };
  }
};

