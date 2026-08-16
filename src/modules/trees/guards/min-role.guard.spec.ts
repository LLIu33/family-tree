import "reflect-metadata";
import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthUser } from "../../auth/interfaces/auth.interface";
import { MinRole } from "../decorators/min-role.decorator";
import { TreeRole } from "../enums/tree-role.enum";
import { TreeAccessService } from "../services/tree-access.service";
import { MinRoleGuard } from "./min-role.guard";

class SampleController {
  @MinRole(TreeRole.VIEWER)
  read() {
    return undefined;
  }

  @MinRole(TreeRole.EDITOR)
  write() {
    return undefined;
  }

  open() {
    return undefined;
  }
}

describe("MinRoleGuard", () => {
  let guard: MinRoleGuard;
  let treeAccess: { assertMinRole: jest.Mock };
  const controller = new SampleController();

  const user: AuthUser = {
    userId: "user-1",
    email: "ada@example.com",
    name: "Ada",
    treeId: "tree-1",
    treeName: "Owned Tree",
    role: TreeRole.VIEWER,
  };

  beforeEach(() => {
    treeAccess = { assertMinRole: jest.fn().mockResolvedValue(TreeRole.VIEWER) };
    guard = new MinRoleGuard(
      new Reflector(),
      treeAccess as unknown as TreeAccessService,
    );
  });

  it("allows a request when assertMinRole succeeds for the required role", async () => {
    treeAccess.assertMinRole.mockResolvedValue(TreeRole.VIEWER);

    await expect(
      guard.canActivate(createContext(controller.read, user)),
    ).resolves.toBe(true);
    expect(treeAccess.assertMinRole).toHaveBeenCalledWith(
      "user-1",
      "tree-1",
      TreeRole.VIEWER,
    );
  });

  it("rejects a viewer when the handler requires editor", async () => {
    treeAccess.assertMinRole.mockRejectedValue(
      new ForbiddenException("Insufficient tree access"),
    );

    await expect(
      guard.canActivate(createContext(controller.write, user)),
    ).rejects.toThrow(ForbiddenException);
    expect(treeAccess.assertMinRole).toHaveBeenCalledWith(
      "user-1",
      "tree-1",
      TreeRole.EDITOR,
    );
  });

  it("skips role checks when a handler has no MinRole metadata", async () => {
    await expect(
      guard.canActivate(createContext(controller.open, user)),
    ).resolves.toBe(true);
    expect(treeAccess.assertMinRole).not.toHaveBeenCalled();
  });
});

function createContext(
  handler: (...args: unknown[]) => unknown,
  user: AuthUser,
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => SampleController,
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}
