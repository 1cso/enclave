export type EditorLeaf = {
  kind: "leaf";
  id: string;
  /** Вкладки группы (порядок в полосе). */
  tabIds: string[];
  /** Активная вкладка для превью в этой панели. */
  activeTabId: string | null;
};
export type EditorSplit = { kind: "split"; id: string; dir: "v" | "h"; ratio: number; a: EditorNode; b: EditorNode };
export type EditorNode = EditorLeaf | EditorSplit;

/** Максимум панелей редактора (глубина split ограничена). */
export const MAX_EDITOR_LEAVES = 64;

/** Вкладка в полосе редактора (id панели ≠ id файла). */
export type EditorOpenTab = { tabId: string; fileId: string };

function newId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      /* insecure context / blocked */
    }
  }
  return `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 11)}`;
}

/** Уникальный id вкладки (панели редактора). */
export function newEditorTabId(): string {
  return newId();
}

export function createLeaf(tabId: string): EditorLeaf {
  return { kind: "leaf", id: newId(), tabIds: [tabId], activeTabId: tabId };
}

function findLeafNode(node: EditorNode, leafId: string): EditorLeaf | null {
  if (node.kind === "leaf") return node.id === leafId ? node : null;
  return findLeafNode(node.a, leafId) ?? findLeafNode(node.b, leafId);
}

/**
 * Split: слева вся группа вкладок без изменений; справа — одна новая вкладка (тот же файл, что у активной).
 * newTabId уже должен быть добавлен в openTabs вызывающим кодом.
 */
export function splitFocusedLeaf(
  node: EditorNode,
  leafId: string,
  dir: "v" | "h",
  newTabId: string
): { root: EditorNode; newFocusId: string; newTabId: string } | null {
  if (node.kind === "leaf") {
    if (node.id !== leafId) return null;
    if (!node.activeTabId || !node.tabIds.includes(node.activeTabId)) return null;
    const newFocusId = newId();
    const a: EditorLeaf = {
      kind: "leaf",
      id: newId(),
      tabIds: [...node.tabIds],
      activeTabId: node.activeTabId
    };
    const b: EditorLeaf = {
      kind: "leaf",
      id: newFocusId,
      tabIds: [newTabId],
      activeTabId: newTabId
    };
    return { root: { kind: "split", id: newId(), dir, ratio: 0.5, a, b }, newFocusId, newTabId };
  }
  const left = splitFocusedLeaf(node.a, leafId, dir, newTabId);
  if (left) return { root: { ...node, a: left.root }, newFocusId: left.newFocusId, newTabId: left.newTabId };
  const right = splitFocusedLeaf(node.b, leafId, dir, newTabId);
  if (right) return { root: { ...node, b: right.root }, newFocusId: right.newFocusId, newTabId: right.newTabId };
  return null;
}

export function setLeafFile(node: EditorNode, leafId: string, fileId: string | null): EditorNode {
  if (node.kind === "leaf") return node;
  return { ...node, a: setLeafFile(node.a, leafId, fileId), b: setLeafFile(node.b, leafId, fileId) };
}

export function setLeafTabAndFile(
  node: EditorNode,
  leafId: string,
  _fileId: string | null,
  tabId: string | null
): EditorNode {
  if (node.kind === "leaf") {
    if (node.id !== leafId) return node;
    if (tabId === null) return { ...node, tabIds: [], activeTabId: null };
    const tabIds = node.tabIds.includes(tabId) ? node.tabIds : [...node.tabIds, tabId];
    return { ...node, tabIds, activeTabId: tabId };
  }
  return {
    ...node,
    a: setLeafTabAndFile(node.a, leafId, _fileId, tabId),
    b: setLeafTabAndFile(node.b, leafId, _fileId, tabId)
  };
}

function leafContains(node: EditorNode, leafId: string): boolean {
  if (node.kind === "leaf") return node.id === leafId;
  return leafContains(node.a, leafId) || leafContains(node.b, leafId);
}

export type SplitPathForLeafEntry = {
  splitId: string;
  ratio: number;
  dir: "v" | "h";
  /** true если leaf расположен внутри node.a, иначе leaf внутри node.b */
  inA: boolean;
};

/**
 * Возвращает цепочку split-ов, которые содержат leaf.
 * Порядок: от ближайшего split-а к leaf (внутреннего) к внешнему.
 */
export function findSplitPathForLeaf(root: EditorNode, leafId: string): SplitPathForLeafEntry[] {
  const res: SplitPathForLeafEntry[] = [];

  function walk(node: EditorNode): void {
    if (node.kind !== "split") return;
    const inA = leafContains(node.a, leafId);
    const inB = leafContains(node.b, leafId);
    if (!inA && !inB) return;

    res.unshift({ splitId: node.id, ratio: node.ratio, dir: node.dir, inA });
    walk(inA ? node.a : node.b);
  }

  walk(root);
  return res;
}

export function findLeafIdByTabId(node: EditorNode, tabId: string): string | null {
  if (node.kind === "leaf") {
    return node.tabIds.includes(tabId) ? node.id : null;
  }
  return findLeafIdByTabId(node.a, tabId) ?? findLeafIdByTabId(node.b, tabId);
}

export function findLeafActiveTabId(node: EditorNode, leafId: string): string | null {
  const L = findLeafNode(node, leafId);
  return L?.activeTabId ?? null;
}

export function findLeafTabCount(node: EditorNode, leafId: string): number {
  const L = findLeafNode(node, leafId);
  return L?.tabIds.length ?? 0;
}

export function findLeafFileId(node: EditorNode, leafId: string, openTabs: EditorOpenTab[]): string | null {
  const L = findLeafNode(node, leafId);
  if (!L?.activeTabId) return null;
  return openTabs.find((t) => t.tabId === L.activeTabId)?.fileId ?? null;
}

/** Убрать лист и схлопнуть split (как закрытие панели). */
export function setSplitRatio(node: EditorNode, splitId: string, ratio: number): EditorNode {
  if (node.kind === "split") {
    if (node.id === splitId) return { ...node, ratio: Math.max(0.15, Math.min(0.85, ratio)) };
    return { ...node, a: setSplitRatio(node.a, splitId, ratio), b: setSplitRatio(node.b, splitId, ratio) };
  }
  return node;
}

export function removeLeaf(node: EditorNode, leafId: string): EditorNode | null {
  if (node.kind === "leaf") {
    return node.id === leafId ? null : node;
  }
  const a = removeLeaf(node.a, leafId);
  const b = removeLeaf(node.b, leafId);
  if (a === null && b === null) return null;
  if (a === null) return b;
  if (b === null) return a;
  return { ...node, a, b };
}

/** Удалить вкладку из группы листа. */
export function removeTabFromLeaf(node: EditorNode, leafId: string, tabId: string): EditorNode {
  if (node.kind === "leaf") {
    if (node.id !== leafId) return node;
    const tabIds = node.tabIds.filter((id) => id !== tabId);
    let activeTabId = node.activeTabId;
    if (activeTabId === tabId) {
      activeTabId = tabIds.length ? tabIds[tabIds.length - 1]! : null;
    }
    return { ...node, tabIds, activeTabId };
  }
  return {
    ...node,
    a: removeTabFromLeaf(node.a, leafId, tabId),
    b: removeTabFromLeaf(node.b, leafId, tabId)
  };
}

/** Удалить листья, чья группа не содержит ни одной валидной вкладки; подчистить tabIds. */
export function pruneEditorToTabs(node: EditorNode, validTabIds: Set<string>): EditorNode | null {
  if (node.kind === "leaf") {
    const tabIds = node.tabIds.filter((id) => validTabIds.has(id));
    if (tabIds.length === 0) return null;
    let activeTabId = node.activeTabId;
    if (!activeTabId || !tabIds.includes(activeTabId)) {
      activeTabId = tabIds[tabIds.length - 1] ?? null;
    }
    return { ...node, tabIds, activeTabId };
  }
  const a = pruneEditorToTabs(node.a, validTabIds);
  const b = pruneEditorToTabs(node.b, validTabIds);
  if (a === null && b === null) return null;
  if (a === null) return b;
  if (b === null) return a;
  return { ...node, a, b };
}

/** После закрытия вкладки: убрать fileId или подставить fallback. */
export function remapFileId(node: EditorNode, removedId: string, fallbackId: string | null): EditorNode {
  if (node.kind === "leaf") return node;
  return {
    ...node,
    a: remapFileId(node.a, removedId, fallbackId),
    b: remapFileId(node.b, removedId, fallbackId)
  };
}

export function firstLeafId(node: EditorNode): string {
  if (node.kind === "leaf") return node.id;
  return firstLeafId(node.a);
}

export function collectLeafIds(node: EditorNode): string[] {
  if (node.kind === "leaf") return [node.id];
  return [...collectLeafIds(node.a), ...collectLeafIds(node.b)];
}

export function countLeaves(node: EditorNode): number {
  if (node.kind === "leaf") return 1;
  return countLeaves(node.a) + countLeaves(node.b);
}

/** Вкладки для полосы над конкретным листом (группа). */
export function tabsForLeaf(root: EditorNode, leafId: string, openTabs: EditorOpenTab[]): EditorOpenTab[] {
  const leaf = findLeafNode(root, leafId);
  if (!leaf) return [];
  const order = new Map(leaf.tabIds.map((id, i) => [id, i]));
  return openTabs
    .filter((t) => leaf.tabIds.includes(t.tabId))
    .sort((a, b) => (order.get(a.tabId) ?? 0) - (order.get(b.tabId) ?? 0));
}

export function leafUsesFile(node: EditorNode, fileId: string, openTabs: EditorOpenTab[]): boolean {
  if (node.kind === "leaf") {
    return node.tabIds.some((tid) => openTabs.find((t) => t.tabId === tid)?.fileId === fileId);
  }
  return leafUsesFile(node.a, fileId, openTabs) || leafUsesFile(node.b, fileId, openTabs);
}
