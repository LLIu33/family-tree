import { TreeRole } from "../../trees/enums/tree-role.enum";

export interface JwtPayload {
  sub: string;
  email: string;
  treeId: string;
  role: TreeRole;
  pwd?: number;
}

export interface AuthUser {
  userId: string;
  email: string;
  treeId: string;
  treeName: string;
  name: string;
  role: TreeRole;
}
