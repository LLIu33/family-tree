import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { AuthService } from "../../auth/auth.service";
import { Neo4jService } from "../../../neo4j/neo4j.service";
import { TreeRole } from "../enums/tree-role.enum";
import { TreeAccessService } from "./tree-access.service";
import { InviteService } from "./invite.service";
import { createHash } from "crypto";

describe("InviteService", () => {
  let service: InviteService;
  let neo4j: { read: jest.Mock; write: jest.Mock };
  let treeAccess: { assertMinRole: jest.Mock };
  let authService: { issueSessionForTree: jest.Mock };

  const record = (values: Record<string, unknown>) => ({
    get: (key: string) => values[key],
  });

  beforeEach(() => {
    neo4j = { read: jest.fn(), write: jest.fn() };
    treeAccess = { assertMinRole: jest.fn().mockResolvedValue(TreeRole.OWNER) };
    authService = { issueSessionForTree: jest.fn() };
    service = new InviteService(
      neo4j as unknown as Neo4jService,
      treeAccess as unknown as TreeAccessService,
      authService as unknown as AuthService,
    );
  });

  it("creates an invite with a raw token response and only a hash in storage", async () => {
    neo4j.write.mockResolvedValue({
      records: [
        record({
          id: "invite-1",
          role: TreeRole.EDITOR,
          expiresAt: "2026-08-30T09:00:00.000Z",
        }),
      ],
    });

    const result = await service.createInvite(
      "owner-1",
      "tree-1",
      TreeRole.EDITOR,
    );

    const params = neo4j.write.mock.calls[0][1];
    expect(treeAccess.assertMinRole).toHaveBeenCalledWith(
      "owner-1",
      "tree-1",
      TreeRole.OWNER,
    );
    expect(result.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(result.inviteUrl).toBe(`/invite/${result.token}`);
    expect(params.tokenHash).toBe(
      createHash("sha256").update(result.token).digest("hex"),
    );
    expect(params.tokenHash).not.toBe(result.token);
    expect(params.role).toBe(TreeRole.EDITOR);
  });

  it("rejects invite creation by a viewer", async () => {
    treeAccess.assertMinRole.mockRejectedValue(
      new ForbiddenException("Insufficient tree access"),
    );

    await expect(
      service.createInvite("viewer-1", "tree-1", TreeRole.VIEWER),
    ).rejects.toThrow(ForbiddenException);
    expect(neo4j.write).not.toHaveBeenCalled();
  });

  it("lists active invites without token hashes", async () => {
    neo4j.read.mockResolvedValue({
      records: [
        record({
          id: "invite-1",
          role: TreeRole.VIEWER,
          expiresAt: "2026-08-30T09:00:00.000Z",
          createdAt: "2026-08-16T09:00:00.000Z",
        }),
      ],
    });

    await expect(service.listInvites("owner-1", "tree-1")).resolves.toEqual([
      {
        id: "invite-1",
        role: TreeRole.VIEWER,
        expiresAt: "2026-08-30T09:00:00.000Z",
        createdAt: "2026-08-16T09:00:00.000Z",
      },
    ]);
    expect(neo4j.read.mock.calls[0][0]).not.toContain("tokenHash");
  });

  it("revokes an active invite by id", async () => {
    neo4j.write.mockResolvedValue({ records: [record({ id: "invite-1" })] });

    await expect(
      service.revokeInvite("owner-1", "tree-1", "invite-1"),
    ).resolves.toEqual({ id: "invite-1", revoked: true });
    expect(treeAccess.assertMinRole).toHaveBeenCalledWith(
      "owner-1",
      "tree-1",
      TreeRole.OWNER,
    );
  });

  it("returns not found when revoking a missing invite", async () => {
    neo4j.write.mockResolvedValue({ records: [] });

    await expect(
      service.revokeInvite("owner-1", "tree-1", "missing"),
    ).rejects.toThrow(NotFoundException);
  });

  it("rejects revoked or expired invite tokens", async () => {
    neo4j.read.mockResolvedValue({ records: [] });

    await expect(service.acceptInvite("user-1", "bad-token")).rejects.toThrow(
      NotFoundException,
    );
    expect(authService.issueSessionForTree).not.toHaveBeenCalled();
  });

  it("rejects listing or revoking invites by a viewer", async () => {
    treeAccess.assertMinRole.mockRejectedValue(
      new ForbiddenException("Insufficient tree access"),
    );

    await expect(service.listInvites("viewer-1", "tree-1")).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      service.revokeInvite("viewer-1", "tree-1", "invite-1"),
    ).rejects.toThrow(ForbiddenException);
    expect(neo4j.read).not.toHaveBeenCalled();
    expect(neo4j.write).not.toHaveBeenCalled();
  });

  it("keeps an existing membership role and still switches the session", async () => {
    neo4j.read.mockResolvedValue({
      records: [
        record({
          id: "invite-1",
          treeId: "tree-1",
          role: TreeRole.EDITOR,
        }),
      ],
    });
    neo4j.write.mockResolvedValue({ records: [] });
    authService.issueSessionForTree.mockResolvedValue({
      accessToken: "signed-token",
      user: { userId: "user-1", treeId: "tree-1", role: TreeRole.VIEWER },
    });

    await expect(
      service.acceptInvite("user-1", "valid-token"),
    ).resolves.toMatchObject({
      accessToken: "signed-token",
      user: { treeId: "tree-1", role: TreeRole.VIEWER },
    });
    expect(neo4j.write.mock.calls[0][0]).toContain("membership IS NULL");
    expect(neo4j.write.mock.calls[0][0]).not.toContain("ON MATCH SET");
    expect(authService.issueSessionForTree).toHaveBeenCalledWith(
      "user-1",
      "tree-1",
    );
  });

  it("lets an owner accept their own tree invite by switching without new membership", async () => {
    neo4j.read.mockResolvedValue({
      records: [
        record({
          id: "invite-1",
          treeId: "tree-1",
          role: TreeRole.VIEWER,
        }),
      ],
    });
    neo4j.write.mockResolvedValue({ records: [] });
    authService.issueSessionForTree.mockResolvedValue({
      accessToken: "signed-token",
      user: { userId: "owner-1", treeId: "tree-1", role: TreeRole.OWNER },
    });

    await expect(
      service.acceptInvite("owner-1", "valid-token"),
    ).resolves.toMatchObject({
      user: { treeId: "tree-1", role: TreeRole.OWNER },
    });
    expect(neo4j.write.mock.calls[0][0]).toContain("owns IS NULL");
  });

  it("accepts a valid invite, creates membership, and returns a switched session", async () => {
    neo4j.read.mockResolvedValue({
      records: [
        record({
          id: "invite-1",
          treeId: "tree-1",
          role: TreeRole.VIEWER,
        }),
      ],
    });
    neo4j.write.mockResolvedValue({ records: [record({ created: true })] });
    authService.issueSessionForTree.mockResolvedValue({
      accessToken: "signed-token",
      user: { userId: "user-1", treeId: "tree-1", role: TreeRole.VIEWER },
    });

    await expect(
      service.acceptInvite("user-1", "valid-token"),
    ).resolves.toMatchObject({
      accessToken: "signed-token",
      user: { treeId: "tree-1", role: TreeRole.VIEWER },
    });
    expect(neo4j.write.mock.calls[0][0]).toContain("MERGE");
    expect(neo4j.write.mock.calls[0][1]).toMatchObject({
      userId: "user-1",
      treeId: "tree-1",
      role: TreeRole.VIEWER,
    });
    expect(authService.issueSessionForTree).toHaveBeenCalledWith(
      "user-1",
      "tree-1",
    );
  });
});
