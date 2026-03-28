export type AppConfig = {
  version: number;
  preferences: {
    theme: "dark" | "light";
    locale: "en_EN" | "ru_RU";
  };
  recentContainers: Array<{ path: string; name: string; lastOpenedAt: string }>;
};

export type ContainerMeta = {
  version: number;
  name: string;
  createdAt: string;
  kdf: {
    alg: "scrypt";
    saltB64: string;
    N: number;
    r: number;
    p: number;
    dkLen: number;
  };
};

export type NodeType = "folder" | "file";

export type TreeNode = {
  id: string;
  type: NodeType;
  name: string;
  parentId: string | null;
  childrenIds?: string[];
  blobId?: string;
  mime?: string;
  size?: number;
  createdAt: string;
};

export type Manifest = {
  version: number;
  rootId: string;
  nodes: Record<string, TreeNode>;
};

export type OpenContainer = {
  containerPath: string;
  name: string;
  meta: ContainerMeta;
  key: Buffer; // derived, never persisted
};

