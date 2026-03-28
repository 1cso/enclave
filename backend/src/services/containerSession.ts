import type { OpenContainer } from "./types.js";
import { createContainer, openContainer } from "./containerFormat.js";

let open: (OpenContainer & { publicInfo: { name: string; containerPath: string } }) | null = null;

export function getOpenContainer(): OpenContainer | null {
  return open;
}

export function containerClose() {
  open = null;
}

export async function containerCreate(containerPath: string, name: string, password: string) {
  const c = await createContainer(containerPath, name, password);
  open = Object.assign(c, { publicInfo: { name: c.name, containerPath: c.containerPath } });
  return open;
}

export async function containerOpen(containerPath: string, password: string) {
  const c = await openContainer(containerPath, password);
  open = Object.assign(c, { publicInfo: { name: c.name, containerPath: c.containerPath } });
  return open;
}

