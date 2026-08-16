import { UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { Neo4jService } from "../../neo4j/neo4j.service";
import { TreeRole } from "../trees/enums/tree-role.enum";
import { TreeAccessService } from "../trees/services/tree-access.service";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./strategies/jwt.strategy";

jest.mock("bcrypt", () => ({
  hash: jest.fn().mockResolvedValue("hashed-password"),
  compare: jest.fn().mockResolvedValue(true),
}));

describe("AuthService", () => {
  let service: AuthService;
  let neo4j: { read: jest.Mock; write: jest.Mock };
  let jwtService: { signAsync: jest.Mock };
  let treeAccess: { getEffectiveRole: jest.Mock; assertMinRole: jest.Mock };

  const record = (values: Record<string, unknown>) => ({
    get: (key: string) => values[key],
  });

  beforeEach(() => {
    neo4j = { read: jest.fn(), write: jest.fn() };
    jwtService = { signAsync: jest.fn().mockResolvedValue("signed-token") };
    treeAccess = { getEffectiveRole: jest.fn(), assertMinRole: jest.fn() };
    service = new (AuthService as unknown as new (
      neo4j: Neo4jService,
      jwtService: JwtService,
      treeAccess: TreeAccessService,
    ) => AuthService)(
      neo4j as unknown as Neo4jService,
      jwtService as unknown as JwtService,
      treeAccess as unknown as TreeAccessService,
    );
  });

  it("returns the role for a shared token tree", async () => {
    treeAccess.getEffectiveRole.mockResolvedValue(TreeRole.EDITOR);
    neo4j.read.mockResolvedValue({
      records: [
        record({
          u: { id: "user-1", email: "ada@example.com", name: "Ada" },
          t: { id: "tree-2", name: "Shared Tree" },
        }),
      ],
    });

    await expect(service.getProfile("user-1", "tree-2")).resolves.toEqual({
      userId: "user-1",
      email: "ada@example.com",
      name: "Ada",
      treeId: "tree-2",
      treeName: "Shared Tree",
      role: TreeRole.EDITOR,
    });
    expect(treeAccess.getEffectiveRole).toHaveBeenCalledWith("user-1", "tree-2");
  });

  it("falls back to the owned tree when token tree is inaccessible", async () => {
    treeAccess.getEffectiveRole.mockResolvedValue(null);
    neo4j.read.mockResolvedValue({
      records: [
        record({
          u: { id: "user-1", email: "ada@example.com", name: "Ada" },
          t: { id: "tree-1", name: "Owned Tree" },
        }),
      ],
    });

    await expect(service.getProfile("user-1", "tree-2")).resolves.toMatchObject({
      treeId: "tree-1",
      treeName: "Owned Tree",
      role: TreeRole.OWNER,
    });
  });

  it("rejects profile lookup when no token tree or owned tree is available", async () => {
    treeAccess.getEffectiveRole.mockResolvedValue(null);
    neo4j.read.mockResolvedValue({ records: [] });

    await expect(service.getProfile("user-1", "tree-2")).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("signs login sessions with owner role", async () => {
    neo4j.read.mockResolvedValue({
      records: [
        record({
          u: {
            id: "user-1",
            email: "ada@example.com",
            passwordHash: "hashed-password",
            name: "Ada",
          },
          t: { id: "tree-1", name: "Owned Tree" },
        }),
      ],
    });

    const result = await service.login({
      email: "Ada@Example.com",
      password: "secret123",
    });

    expect(result.user.role).toBe(TreeRole.OWNER);
    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: "user-1",
      email: "ada@example.com",
      treeId: "tree-1",
      role: TreeRole.OWNER,
    });
  });

  it("signs register sessions with owner role", async () => {
    neo4j.read.mockResolvedValue({ records: [] });

    const result = await service.register({
      email: "Ada@Example.com",
      password: "secret123",
      name: "Ada",
      treeName: "Lovelace Tree",
    });

    expect(result.user.role).toBe(TreeRole.OWNER);
    expect(jwtService.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ role: TreeRole.OWNER }),
    );
  });

  it("issues a switched session for an accessible member tree", async () => {
    treeAccess.assertMinRole.mockResolvedValue(TreeRole.VIEWER);
    neo4j.read.mockResolvedValue({
      records: [
        record({
          u: { id: "user-1", email: "ada@example.com", name: "Ada" },
          t: { id: "tree-2", name: "Shared Tree" },
        }),
      ],
    });

    const result = await service.issueSessionForTree("user-1", "tree-2");

    expect(treeAccess.assertMinRole).toHaveBeenCalledWith(
      "user-1",
      "tree-2",
      TreeRole.VIEWER,
    );
    expect(result).toEqual({
      accessToken: "signed-token",
      user: {
        userId: "user-1",
        email: "ada@example.com",
        name: "Ada",
        treeId: "tree-2",
        treeName: "Shared Tree",
        role: TreeRole.VIEWER,
      },
    });
    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: "user-1",
      email: "ada@example.com",
      treeId: "tree-2",
      role: TreeRole.VIEWER,
    });
  });
});

describe("JwtStrategy", () => {
  it("loads the profile for the tree carried in the token", async () => {
    const authService = {
      getProfile: jest.fn().mockResolvedValue({
        userId: "user-1",
        email: "ada@example.com",
        name: "Ada",
        treeId: "tree-2",
        treeName: "Shared Tree",
        role: TreeRole.VIEWER,
      }),
    };
    const config = { get: jest.fn().mockReturnValue("secret") };
    const strategy = new JwtStrategy(
      config as unknown as ConfigService,
      authService as unknown as AuthService,
    );

    await strategy.validate({
      sub: "user-1",
      email: "ada@example.com",
      treeId: "tree-2",
      role: TreeRole.VIEWER,
    });

    expect(authService.getProfile).toHaveBeenCalledWith("user-1", "tree-2");
  });
});
