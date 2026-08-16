import { ForbiddenException } from "@nestjs/common";
import { TreeRole } from "../enums/tree-role.enum";
import { TreeAccessService } from "../services/tree-access.service";
import { AuthService } from "../../auth/auth.service";
import { AuthUser } from "../../auth/interfaces/auth.interface";
import { TreesController } from "./trees.controller";
import { InviteService } from "../services/invite.service";

describe("TreesController", () => {
  let controller: TreesController;
  let treeAccess: {
    listAccessibleTrees: jest.Mock;
    listMembers: jest.Mock;
    removeMember: jest.Mock;
  };
  let authService: { issueSessionForTree: jest.Mock };
  let inviteService: {
    createInvite: jest.Mock;
    listInvites: jest.Mock;
    revokeInvite: jest.Mock;
  };

  const user: AuthUser = {
    userId: "user-1",
    email: "ada@example.com",
    name: "Ada",
    treeId: "tree-1",
    treeName: "Owned Tree",
    role: TreeRole.OWNER,
  };

  beforeEach(() => {
    treeAccess = {
      listAccessibleTrees: jest.fn(),
      listMembers: jest.fn(),
      removeMember: jest.fn(),
    };
    authService = { issueSessionForTree: jest.fn() };
    inviteService = {
      createInvite: jest.fn(),
      listInvites: jest.fn(),
      revokeInvite: jest.fn(),
    };
    controller = new TreesController(
      treeAccess as unknown as TreeAccessService,
      authService as unknown as AuthService,
      inviteService as unknown as InviteService,
    );
  });

  it("lists trees accessible to the current user", async () => {
    treeAccess.listAccessibleTrees.mockResolvedValue([
      { id: "tree-1", name: "Owned Tree", role: TreeRole.OWNER },
    ]);

    await expect(controller.list(user)).resolves.toEqual([
      { id: "tree-1", name: "Owned Tree", role: TreeRole.OWNER },
    ]);
    expect(treeAccess.listAccessibleTrees).toHaveBeenCalledWith("user-1");
  });

  it("rejects switching to a tree the user cannot access", async () => {
    authService.issueSessionForTree.mockRejectedValue(
      new ForbiddenException("Insufficient tree access"),
    );

    await expect(controller.switch(user, "tree-2")).rejects.toThrow(
      ForbiddenException,
    );
    expect(authService.issueSessionForTree).toHaveBeenCalledWith(
      "user-1",
      "tree-2",
    );
  });

  it("switches to an accessible member tree and returns its role", async () => {
    authService.issueSessionForTree.mockResolvedValue({
      accessToken: "signed-token",
      user: { ...user, treeId: "tree-2", role: TreeRole.EDITOR },
    });

    await expect(controller.switch(user, "tree-2")).resolves.toMatchObject({
      accessToken: "signed-token",
      user: { treeId: "tree-2", role: TreeRole.EDITOR },
    });
  });

  it("creates an invite for the selected tree", async () => {
    inviteService.createInvite.mockResolvedValue({
      id: "invite-1",
      token: "raw-token",
      inviteUrl: "/invite/raw-token",
      role: TreeRole.VIEWER,
      expiresAt: "2026-08-30T09:00:00.000Z",
    });

    await expect(
      controller.createInvite(user, "tree-1", { role: TreeRole.VIEWER }),
    ).resolves.toMatchObject({
      inviteUrl: "/invite/raw-token",
      role: TreeRole.VIEWER,
    });
    expect(inviteService.createInvite).toHaveBeenCalledWith(
      "user-1",
      "tree-1",
      TreeRole.VIEWER,
      undefined,
    );
  });

  it("lists and revokes invites for the selected tree", async () => {
    inviteService.listInvites.mockResolvedValue([{ id: "invite-1" }]);
    inviteService.revokeInvite.mockResolvedValue({
      id: "invite-1",
      revoked: true,
    });

    await expect(controller.listInvites(user, "tree-1")).resolves.toEqual([
      { id: "invite-1" },
    ]);
    await expect(
      controller.revokeInvite(user, "tree-1", "invite-1"),
    ).resolves.toEqual({ id: "invite-1", revoked: true });
  });

  it("lists and removes members for the selected tree", async () => {
    treeAccess.listMembers.mockResolvedValue([
      { userId: "user-1", role: TreeRole.OWNER },
      { userId: "user-2", role: TreeRole.VIEWER },
    ]);
    treeAccess.removeMember.mockResolvedValue({ removed: true });

    await expect(controller.listMembers(user, "tree-1")).resolves.toEqual([
      { userId: "user-1", role: TreeRole.OWNER },
      { userId: "user-2", role: TreeRole.VIEWER },
    ]);
    await expect(
      controller.removeMember(user, "tree-1", "user-2"),
    ).resolves.toEqual({ removed: true });
    expect(treeAccess.listMembers).toHaveBeenCalledWith("user-1", "tree-1");
    expect(treeAccess.removeMember).toHaveBeenCalledWith(
      "user-1",
      "tree-1",
      "user-2",
    );
  });
});
