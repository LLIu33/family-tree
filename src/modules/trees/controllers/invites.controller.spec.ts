import { TreeRole } from "../enums/tree-role.enum";
import { AuthUser } from "../../auth/interfaces/auth.interface";
import { InviteService } from "../services/invite.service";
import { InvitesController } from "./invites.controller";

describe("InvitesController", () => {
  let controller: InvitesController;
  let inviteService: { acceptInvite: jest.Mock };

  const user: AuthUser = {
    userId: "user-1",
    email: "ada@example.com",
    name: "Ada",
    treeId: "tree-1",
    treeName: "Owned Tree",
    role: TreeRole.OWNER,
  };

  beforeEach(() => {
    inviteService = { acceptInvite: jest.fn() };
    controller = new InvitesController(
      inviteService as unknown as InviteService,
    );
  });

  it("accepts an invite token for the current user", async () => {
    inviteService.acceptInvite.mockResolvedValue({
      accessToken: "signed-token",
      user: { ...user, treeId: "tree-2", role: TreeRole.VIEWER },
    });

    await expect(controller.accept(user, "raw-token")).resolves.toMatchObject({
      accessToken: "signed-token",
      user: { treeId: "tree-2", role: TreeRole.VIEWER },
    });
    expect(inviteService.acceptInvite).toHaveBeenCalledWith(
      "user-1",
      "raw-token",
    );
  });
});
