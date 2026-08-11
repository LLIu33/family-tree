export interface JwtPayload {
  sub: string;
  email: string;
  treeId: string;
}

export interface AuthUser {
  userId: string;
  email: string;
  treeId: string;
  treeName: string;
  name: string;
}
