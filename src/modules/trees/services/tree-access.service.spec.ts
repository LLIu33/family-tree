import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Neo4jService } from "../../../neo4j/neo4j.service";
import { TreeRole, roleAtLeast } from "../enums/tree-role.enum";
import { TreeAccessService } from "./tree-access.service";

describe("roleAtLeast", () => {
  it("orders owner above editor above viewer", () => {
    expect(roleAtLeast(TreeRole.OWNER, TreeRole.VIEWER)).toBe(true);
    expect(roleAtLeast(TreeRole.OWNER, TreeRole.EDITOR)).toBe(true);
    expect(roleAtLeast(TreeRole.EDITOR, TreeRole.VIEWER)).toBe(true);
    expect(roleAtLeast(TreeRole.VIEWER, TreeRole.EDITOR)).toBe(false);
  });
});

describe("TreeAccessService", () => {
  let service: TreeAccessService;
  let neo4j: { read: jest.Mock; write: jest.Mock };

  const record = (values: Record<string, unknown>) => ({
    get: (key: string) => values[key],
  });

  beforeEach(() => {
    neo4j = { read: jest.fn(), write: jest.fn() };
    service = new TreeAccessService(neo4j as unknown as Neo4jService);
  });

  it("returns owner when the user owns the tree", async () => {
    neo4j.read.mockResolvedValue({
      records: [record({ isOwner: true, memberRole: null })],
    });

    await expect(
      service.getEffectiveRole("user-1", "tree-1"),
    ).resolves.toBe(TreeRole.OWNER);
  });

  it("returns editor or viewer from membership when not owner", async () => {
    neo4j.read
      .mockResolvedValueOnce({
        records: [record({ isOwner: false, memberRole: "editor" })],
      })
      .mockResolvedValueOnce({
        records: [record({ isOwner: false, memberRole: "viewer" })],
      });

    await expect(
      service.getEffectiveRole("user-1", "tree-1"),
    ).resolves.toBe(TreeRole.EDITOR);
    await expect(
      service.getEffectiveRole("user-1", "tree-2"),
    ).resolves.toBe(TreeRole.VIEWER);
  });

  it("returns null when the tree exists but user has no access", async () => {
    neo4j.read.mockResolvedValue({
      records: [record({ isOwner: false, memberRole: null })],
    });

    await expect(service.getEffectiveRole("user-1", "tree-1")).resolves.toBe(
      null,
    );
  });

  it("asserts minimum role and rejects missing or insufficient access", async () => {
    neo4j.read
      .mockResolvedValueOnce({
        records: [record({ isOwner: false, memberRole: "editor" })],
      })
      .mockResolvedValueOnce({
        records: [record({ isOwner: false, memberRole: null })],
      })
      .mockResolvedValueOnce({ records: [] });

    await expect(
      service.assertMinRole("user-1", "tree-1", TreeRole.VIEWER),
    ).resolves.toBe(TreeRole.EDITOR);
    await expect(
      service.assertMinRole("user-1", "tree-1", TreeRole.EDITOR),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.assertMinRole("user-1", "missing-tree", TreeRole.VIEWER),
    ).rejects.toThrow(NotFoundException);
  });

  it("lists accessible trees and prefers owner role over membership", async () => {
    neo4j.read.mockResolvedValue({
      records: [
        record({ id: "tree-1", name: "Owned", role: "owner" }),
        record({ id: "tree-2", name: "Shared", role: "viewer" }),
      ],
    });

    await expect(service.listAccessibleTrees("user-1")).resolves.toEqual([
      { id: "tree-1", name: "Owned", role: TreeRole.OWNER },
      { id: "tree-2", name: "Shared", role: TreeRole.VIEWER },
    ]);
    expect(neo4j.read.mock.calls[0][0]).toContain("OWNS");
    expect(neo4j.read.mock.calls[0][0]).toContain("MEMBER_OF");
  });

  it("lists the owner and members of a tree", async () => {
    neo4j.read
      .mockResolvedValueOnce({
        records: [record({ isOwner: true, memberRole: null })],
      })
      .mockResolvedValueOnce({
        records: [
          record({
            userId: "owner-1",
            email: "ada@example.com",
            name: "Ada",
            role: TreeRole.OWNER,
            joinedAt: null,
          }),
          record({
            userId: "user-2",
            email: "ed@example.com",
            name: "Ed",
            role: TreeRole.EDITOR,
            joinedAt: "2026-08-16T09:00:00.000Z",
          }),
        ],
      });

    await expect(service.listMembers("owner-1", "tree-1")).resolves.toEqual([
      {
        userId: "owner-1",
        email: "ada@example.com",
        name: "Ada",
        role: TreeRole.OWNER,
        joinedAt: null,
      },
      {
        userId: "user-2",
        email: "ed@example.com",
        name: "Ed",
        role: TreeRole.EDITOR,
        joinedAt: "2026-08-16T09:00:00.000Z",
      },
    ]);
  });

  it("rejects listing members by a viewer", async () => {
    neo4j.read.mockResolvedValue({
      records: [record({ isOwner: false, memberRole: "viewer" })],
    });

    await expect(service.listMembers("viewer-1", "tree-1")).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("removes a member relationship and refuses to remove the owner", async () => {
    neo4j.read
      .mockResolvedValueOnce({
        records: [record({ isOwner: true, memberRole: null })],
      })
      .mockResolvedValueOnce({
        records: [record({ isOwner: false, memberRole: "editor" })],
      })
      .mockResolvedValueOnce({
        records: [record({ isOwner: true, memberRole: null })],
      })
      .mockResolvedValueOnce({
        records: [record({ isOwner: true, memberRole: null })],
      });
    neo4j.write.mockResolvedValue({ records: [] });

    await expect(
      service.removeMember("owner-1", "tree-1", "user-2"),
    ).resolves.toEqual({ removed: true });
    expect(neo4j.write.mock.calls[0][0]).toContain("MEMBER_OF");
    expect(neo4j.write.mock.calls[0][1]).toEqual({
      memberUserId: "user-2",
      treeId: "tree-1",
    });

    await expect(
      service.removeMember("owner-1", "tree-1", "owner-1"),
    ).rejects.toThrow(BadRequestException);
    expect(neo4j.write).toHaveBeenCalledTimes(1);
  });
});
