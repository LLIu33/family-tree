export enum TreeRole {
  OWNER = "owner",
  EDITOR = "editor",
  VIEWER = "viewer",
}

const TREE_ROLE_RANK: Record<TreeRole, number> = {
  [TreeRole.OWNER]: 3,
  [TreeRole.EDITOR]: 2,
  [TreeRole.VIEWER]: 1,
};

export function roleAtLeast(actual: TreeRole, min: TreeRole): boolean {
  return TREE_ROLE_RANK[actual] >= TREE_ROLE_RANK[min];
}
