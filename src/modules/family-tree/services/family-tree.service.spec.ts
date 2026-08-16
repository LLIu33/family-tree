import { NotFoundException } from "@nestjs/common";
import { FamilyTreeService } from "./family-tree.service";
import { RelationType } from "../enums/relation-type.enum";
import { Sex } from "../enums/sex.enum";
import { Neo4jService } from "../../../neo4j/neo4j.service";
import { Neo4jResultUtils } from "../../../common/utils/neo4j-result.utils";
import { TreeRole } from "../../trees/enums/tree-role.enum";

describe("FamilyTreeService relationships (Family hub)", () => {
  let service: FamilyTreeService;
  let neo4j: {
    read: jest.Mock;
    write: jest.Mock;
    executeTransaction: jest.Mock;
  };

  const individual = (id: string, sex: Sex) => ({
    id,
    gedcomId: id,
    firstName: id,
    lastName: "Test",
    sex,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(() => {
    neo4j = {
      read: jest.fn(),
      write: jest.fn().mockResolvedValue({ records: [] }),
      executeTransaction: jest.fn().mockResolvedValue([]),
    };
    service = new FamilyTreeService(neo4j as unknown as Neo4jService);
  });

  it("creates HUSBAND/CHILD family links for PARENT", async () => {
    jest
      .spyOn(service, "getIndividual")
      .mockResolvedValueOnce(individual("p1", Sex.MALE) as any)
      .mockResolvedValueOnce(individual("c1", Sex.UNKNOWN) as any);

    neo4j.read
      .mockResolvedValueOnce({ records: [] }) // shared parent-child
      .mockResolvedValueOnce({ records: [] }) // child family
      .mockResolvedValueOnce({ records: [] }); // parent spouse family

    await service.createRelationship("tree-1", {
      fromIndividualId: "p1",
      toIndividualId: "c1",
      relationshipType: RelationType.PARENT,
    });

    expect(neo4j.executeTransaction).toHaveBeenCalled();
    const queries = neo4j.executeTransaction.mock.calls[0][0] as Array<{
      query: string;
    }>;
    const linkQuery = queries.find((q) => q.query.includes("MERGE"));
    expect(linkQuery?.query).toContain("[:HUSBAND]");
    expect(linkQuery?.query).toContain("[:CHILD]");
    expect(linkQuery?.query).not.toContain("CHILD_OF");
    expect(linkQuery?.query).not.toContain("FAMILY_MEMBER");
  });

  it("creates HUSBAND/WIFE family links for SPOUSE", async () => {
    jest
      .spyOn(service, "getIndividual")
      .mockResolvedValueOnce(individual("a1", Sex.MALE) as any)
      .mockResolvedValueOnce(individual("b1", Sex.FEMALE) as any);

    neo4j.read
      .mockResolvedValueOnce({ records: [] }) // shared spouse
      .mockResolvedValueOnce({ records: [] }) // a family
      .mockResolvedValueOnce({ records: [] }); // b family

    await service.createRelationship("tree-1", {
      fromIndividualId: "a1",
      toIndividualId: "b1",
      relationshipType: RelationType.SPOUSE,
    });

    const queries = neo4j.executeTransaction.mock.calls[0][0] as Array<{
      query: string;
    }>;
    const linkQuery = queries.find((q) =>
      q.query.includes("MERGE (a)-[:HUSBAND]")
    );
    expect(linkQuery?.query).toContain("[:HUSBAND]");
    expect(linkQuery?.query).toContain("[:WIFE]");
    expect(linkQuery?.query).not.toContain("[:SPOUSE]");
  });

  it("links parent to existing child family with treeId", async () => {
    jest
      .spyOn(service, "getIndividual")
      .mockResolvedValueOnce(individual("p1", Sex.MALE) as any)
      .mockResolvedValueOnce(individual("c1", Sex.UNKNOWN) as any);

    neo4j.read
      .mockResolvedValueOnce({ records: [] })
      .mockResolvedValueOnce({
        records: [
          { get: (k: string) => (k === "familyId" ? "FAM-CHILD" : null) },
        ],
      });

    await service.createRelationship("tree-1", {
      fromIndividualId: "p1",
      toIndividualId: "c1",
      relationshipType: RelationType.PARENT,
    });

    expect(neo4j.write).toHaveBeenCalledWith(
      expect.stringContaining("MERGE (parent)-[:HUSBAND]->(f)"),
      { parentId: "p1", familyId: "FAM-CHILD", treeId: "tree-1" },
    );
    expect(neo4j.executeTransaction).not.toHaveBeenCalled();
  });

  it("links child to existing parent spouse family with treeId", async () => {
    jest
      .spyOn(service, "getIndividual")
      .mockResolvedValueOnce(individual("p1", Sex.MALE) as any)
      .mockResolvedValueOnce(individual("c1", Sex.UNKNOWN) as any);

    neo4j.read
      .mockResolvedValueOnce({ records: [] })
      .mockResolvedValueOnce({ records: [] })
      .mockResolvedValueOnce({
        records: [
          { get: (k: string) => (k === "familyId" ? "FAM-PARENT" : null) },
        ],
      });

    await service.createRelationship("tree-1", {
      fromIndividualId: "p1",
      toIndividualId: "c1",
      relationshipType: RelationType.PARENT,
    });

    expect(neo4j.write).toHaveBeenCalledWith(
      expect.stringContaining("MERGE (child)-[:CHILD]->(f)"),
      { childId: "c1", familyId: "FAM-PARENT", treeId: "tree-1" },
    );
    expect(neo4j.executeTransaction).not.toHaveBeenCalled();
  });

  it("rejects unsupported relationship types", async () => {
    await expect(
      service.createRelationship("tree-1", {
        fromIndividualId: "a1",
        toIndividualId: "b1",
        relationshipType: RelationType.GODPARENT,
      })
    ).rejects.toThrow(/Unsupported relationship type/);
  });
});

describe("FamilyTreeService updateIndividual", () => {
  let service: FamilyTreeService;
  let neo4j: { read: jest.Mock; write: jest.Mock; executeTransaction: jest.Mock };

  beforeEach(() => {
    neo4j = {
      read: jest.fn(),
      write: jest.fn(),
      executeTransaction: jest.fn(),
    };
    service = new FamilyTreeService(neo4j as unknown as Neo4jService);
  });

  it("patches provided fields and returns individual", async () => {
    const node = {
      id: "I1",
      firstName: "Иван",
      lastName: "Иванов",
      sex: "M",
      biography: "Заметка",
    };
    neo4j.write.mockResolvedValue({
      records: [
        {
          get: (key: string) => (key === "i" ? { properties: node } : null),
          keys: ["i"],
          toObject: () => ({ i: node }),
        },
      ],
    });
    jest.spyOn(Neo4jResultUtils, "getFirstResult").mockReturnValue(node as any);

    const result = await service.updateIndividual("tree-1", "I1", {
      firstName: "Иван",
      biography: "Заметка",
    });

    expect(neo4j.write).toHaveBeenCalled();
    const [query, params] = neo4j.write.mock.calls[0];
    expect(query).toContain("MATCH (i:Individual {id: $id, treeId: $treeId})");
    expect(query).toContain("SET");
    expect(params.treeId).toBe("tree-1");
    expect(params.id).toBe("I1");
    expect(params.firstName).toBe("Иван");
    expect(params.biography).toBe("Заметка");
    expect(result).toEqual(node);
  });

  it("throws NotFoundException when person missing", async () => {
    neo4j.write.mockResolvedValue({ records: [] });
    jest.spyOn(Neo4jResultUtils, "getFirstResult").mockReturnValue(null as any);

    await expect(
      service.updateIndividual("tree-1", "missing", { firstName: "A" })
    ).rejects.toThrow(NotFoundException);
  });
});

describe("FamilyTreeService getIndividual", () => {
  let service: FamilyTreeService;
  let neo4j: { read: jest.Mock; write: jest.Mock; executeTransaction: jest.Mock };

  beforeEach(() => {
    neo4j = {
      read: jest.fn(),
      write: jest.fn(),
      executeTransaction: jest.fn(),
    };
    service = new FamilyTreeService(neo4j as unknown as Neo4jService);
  });

  it("prefers thumbnail from the latest photo when resolving avatar media", () => {
    const resolved = (service as any).resolveAvatarFromMedia([
      {
        id: "media-document",
        type: "DOCUMENT",
        url: "https://cdn.example/doc.pdf",
        thumbnailUrl: "https://cdn.example/doc-thumb.jpg",
        createdAt: "2024-01-01T00:00:00.000Z",
      },
      {
        id: "media-old-photo",
        type: "PHOTO",
        url: "https://cdn.example/photo-old.jpg",
        thumbnailUrl: "https://cdn.example/photo-old-thumb.jpg",
        createdAt: "2024-02-01T00:00:00.000Z",
      },
      {
        id: "media-new-photo",
        type: "PHOTO",
        url: "https://cdn.example/photo-new.jpg",
        thumbnailUrl: "https://cdn.example/photo-new-thumb.jpg",
        createdAt: "2024-03-01T00:00:00.000Z",
      },
    ]);

    expect(resolved).toEqual({
      avatarUrl: "https://cdn.example/photo-new-thumb.jpg",
      avatarMediaId: "media-new-photo",
    });
  });

  it("returns no avatar when no photos are available", () => {
    expect((service as any).resolveAvatarFromMedia([])).toEqual({});
  });

  it("getIndividual attaches parents, spouses, children", async () => {
    const person = { id: "I1", firstName: "A", lastName: "B", sex: "M" };
    const parent = { id: "P1", firstName: "P", lastName: "B", sex: "M" };
    const spouse = { id: "S1", firstName: "S", lastName: "B", sex: "F" };
    const child = { id: "C1", firstName: "C", lastName: "B", sex: "U" };

    neo4j.read
      .mockResolvedValueOnce({
        records: [
          {
            get: (k: string) => {
              if (k === "i") return person;
              if (k === "relationships") return [];
              return null;
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        records: [{ get: (k: string) => (k === "person" ? parent : null) }],
      })
      .mockResolvedValueOnce({
        records: [{ get: (k: string) => (k === "person" ? spouse : null) }],
      })
      .mockResolvedValueOnce({
        records: [{ get: (k: string) => (k === "person" ? child : null) }],
      });

    jest
      .spyOn(Neo4jResultUtils, "normalizeValue")
      .mockImplementation((v) => v as any);

    const result = await service.getIndividual("tree-1", "I1");
    expect(result?.relatives.parents).toEqual([parent]);
    expect(result?.relatives.spouses).toEqual([spouse]);
    expect(result?.relatives.children).toEqual([child]);
  });

  it("getIndividual attaches avatar fields to detail and relatives", async () => {
    const person = { id: "I1", firstName: "A", lastName: "B", sex: "M" };
    const parent = { id: "P1", firstName: "P", lastName: "B", sex: "M" };
    const spouse = { id: "S1", firstName: "S", lastName: "B", sex: "F" };
    const child = { id: "C1", firstName: "C", lastName: "B", sex: "U" };

    neo4j.read
      .mockResolvedValueOnce({
        records: [
          {
            get: (k: string) => {
              if (k === "i") return person;
              if (k === "relationships") return [];
              return null;
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        records: [{ get: (k: string) => (k === "person" ? parent : null) }],
      })
      .mockResolvedValueOnce({
        records: [{ get: (k: string) => (k === "person" ? spouse : null) }],
      })
      .mockResolvedValueOnce({
        records: [{ get: (k: string) => (k === "person" ? child : null) }],
      })
      .mockResolvedValueOnce({
        records: [
          {
            get: (key: string) =>
              (
                {
                  individualId: "I1",
                  media: [
                    {
                      id: "avatar-main",
                      type: "PHOTO",
                      url: "https://cdn.example/i1.jpg",
                      thumbnailUrl: "https://cdn.example/i1-thumb.jpg",
                      createdAt: "2024-03-01T00:00:00.000Z",
                    },
                  ],
                } as Record<string, unknown>
              )[key],
          },
          {
            get: (key: string) =>
              (
                {
                  individualId: "P1",
                  media: [
                    {
                      id: "avatar-parent",
                      type: "PHOTO",
                      url: "https://cdn.example/p1.jpg",
                      createdAt: "2024-02-01T00:00:00.000Z",
                    },
                  ],
                } as Record<string, unknown>
              )[key],
          },
        ],
      });

    jest
      .spyOn(Neo4jResultUtils, "normalizeValue")
      .mockImplementation((value) => value as any);

    const result = await service.getIndividual("tree-1", "I1");

    expect(result?.avatarUrl).toBe("https://cdn.example/i1-thumb.jpg");
    expect(result?.avatarMediaId).toBe("avatar-main");
    expect(result?.relatives.parents).toEqual([
      {
        ...parent,
        avatarUrl: "https://cdn.example/p1.jpg",
        avatarMediaId: "avatar-parent",
      },
    ]);
    expect(result?.relatives.spouses).toEqual([spouse]);
    expect(result?.relatives.children).toEqual([child]);
  });
});

describe("FamilyTreeService addChild", () => {
  let service: FamilyTreeService;
  let neo4j: { read: jest.Mock; write: jest.Mock; executeTransaction: jest.Mock };

  beforeEach(() => {
    neo4j = {
      read: jest.fn(),
      write: jest.fn(),
      executeTransaction: jest.fn(),
    };
    service = new FamilyTreeService(neo4j as unknown as Neo4jService);
  });

  it("creates child and links only selected parent when no spouse", async () => {
    const child = { id: "C1", firstName: "Child", lastName: "Test", sex: "U" };
    jest.spyOn(service, "getIndividual").mockResolvedValue({
      id: "P1",
      firstName: "Parent",
      lastName: "Test",
      sex: Sex.MALE,
    } as any);
    jest.spyOn(service, "createIndividual").mockResolvedValue(child as any);
    const soleLink = jest
      .spyOn(service as any, "linkSoleParentChild")
      .mockResolvedValue(undefined);
    const sharedLink = jest
      .spyOn(service as any, "linkParentChild")
      .mockResolvedValue(undefined);
    jest.spyOn(service as any, "listSpouseIds").mockResolvedValue([]);

    const result = await service.addChild("tree-1", "P1", {
      firstName: "Child",
      lastName: "Test",
      sex: Sex.UNKNOWN,
    });

    expect(soleLink).toHaveBeenCalledTimes(1);
    expect(soleLink).toHaveBeenCalledWith("tree-1", "P1", "C1");
    expect(sharedLink).not.toHaveBeenCalled();
    expect(result.linkedParentIds).toEqual(["P1"]);
    expect(result.child).toEqual(child);
  });

  it("also links the unique spouse", async () => {
    jest.spyOn(service, "getIndividual").mockResolvedValue({
      id: "P1",
      sex: Sex.MALE,
    } as any);
    jest.spyOn(service, "createIndividual").mockResolvedValue({
      id: "C1",
    } as any);
    const soleLink = jest
      .spyOn(service as any, "linkSoleParentChild")
      .mockResolvedValue(undefined);
    const sharedLink = jest
      .spyOn(service as any, "linkParentChild")
      .mockResolvedValue(undefined);
    jest.spyOn(service as any, "listSpouseIds").mockResolvedValue(["S1"]);

    const result = await service.addChild("tree-1", "P1", {
      firstName: "Child",
      lastName: "Test",
      sex: Sex.UNKNOWN,
    });

    expect(sharedLink).toHaveBeenCalledTimes(2);
    expect(sharedLink).toHaveBeenNthCalledWith(1, "tree-1", "P1", "C1");
    expect(sharedLink).toHaveBeenNthCalledWith(2, "tree-1", "S1", "C1");
    expect(soleLink).not.toHaveBeenCalled();
    expect(result.linkedParentIds).toEqual(["P1", "S1"]);
  });

  it("uses sole-parent linking when multiple spouses", async () => {
    jest.spyOn(service, "getIndividual").mockResolvedValue({ id: "P1" } as any);
    jest.spyOn(service, "createIndividual").mockResolvedValue({ id: "C1" } as any);
    const soleLink = jest
      .spyOn(service as any, "linkSoleParentChild")
      .mockResolvedValue(undefined);
    const sharedLink = jest
      .spyOn(service as any, "linkParentChild")
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, "listSpouseIds")
      .mockResolvedValue(["S1", "S2"]);

    const result = await service.addChild("tree-1", "P1", {
      firstName: "Child",
      lastName: "Test",
      sex: Sex.UNKNOWN,
    });

    expect(soleLink).toHaveBeenCalledTimes(1);
    expect(soleLink).toHaveBeenCalledWith("tree-1", "P1", "C1");
    expect(sharedLink).not.toHaveBeenCalled();
    expect(result.linkedParentIds).toEqual(["P1"]);
  });

  it("throws when parent missing", async () => {
    jest.spyOn(service, "getIndividual").mockResolvedValue(null);
    await expect(
      service.addChild("tree-1", "missing", {
        firstName: "Child",
        lastName: "Test",
        sex: Sex.UNKNOWN,
      })
    ).rejects.toThrow(NotFoundException);
  });
});

describe("FamilyTreeService getFullGraph", () => {
  let service: FamilyTreeService;
  let neo4j: { read: jest.Mock; write: jest.Mock; executeTransaction: jest.Mock };

  const node = (id: string, firstName: string) => ({
    identity: id,
    labels: ["Individual"],
    properties: {
      id,
      gedcomId: id,
      firstName,
      lastName: "Test",
      sex: "U",
    },
  });

  const recordOf = (neo4jNode: ReturnType<typeof node>) => ({
    get: (key: string) => {
      if (key === "i") return neo4jNode;
      return null;
    },
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    neo4j = {
      read: jest.fn(),
      write: jest.fn(),
      executeTransaction: jest.fn(),
    };
    service = new FamilyTreeService(neo4j as unknown as Neo4jService);
    jest.spyOn(service as any, "ensureTreeHasData").mockResolvedValue(undefined);
  });

  it("returns isolated people and every component, not only the largest", async () => {
    // people: A-B family (2) + isolate C
    neo4j.read
      .mockResolvedValueOnce({
        records: [
          recordOf(node("A", "Ann")),
          recordOf(node("B", "Bob")),
          recordOf(node("C", "Cat")),
        ],
      })
      .mockResolvedValueOnce({
        records: [
          {
            get: (k: string) =>
              ({ source: "A", target: "B", familyId: "F1" } as Record<
                string,
                string
              >)[k],
          },
        ],
      }) // parent-child
      .mockResolvedValueOnce({ records: [] }); // spouses

    const graph = await service.getFullGraph("tree-1");
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(["A", "B", "C"]);
    expect(graph.componentCount).toBeGreaterThanOrEqual(2);
    expect(graph.relationships).toHaveLength(1);
  });

  it("attaches avatarUrl to graph nodes", async () => {
    neo4j.read
      .mockResolvedValueOnce({
        records: [recordOf(node("A", "Ann")), recordOf(node("B", "Bob"))],
      })
      .mockResolvedValueOnce({ records: [] })
      .mockResolvedValueOnce({ records: [] })
      .mockResolvedValueOnce({
        records: [
          {
            get: (key: string) =>
              (
                {
                  individualId: "B",
                  media: [
                    {
                      id: "avatar-b",
                      type: "PHOTO",
                      url: "https://cdn.example/b.jpg",
                      thumbnailUrl: "https://cdn.example/b-thumb.jpg",
                      createdAt: "2024-04-01T00:00:00.000Z",
                    },
                  ],
                } as Record<string, unknown>
              )[key],
          },
        ],
      });

    const graph = await service.getFullGraph("tree-1");

    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "A", avatarUrl: undefined }),
        expect.objectContaining({
          id: "B",
          avatarUrl: "https://cdn.example/b-thumb.jpg",
        }),
      ]),
    );
  });
});

describe("FamilyTreeService searchIndividuals", () => {
  let service: FamilyTreeService;
  let neo4j: { read: jest.Mock; write: jest.Mock; executeTransaction: jest.Mock };

  beforeEach(() => {
    neo4j = {
      read: jest.fn(),
      write: jest.fn(),
      executeTransaction: jest.fn(),
    };
    service = new FamilyTreeService(neo4j as unknown as Neo4jService);
    jest.spyOn(service as any, "ensureTreeHasData").mockResolvedValue(undefined);
  });

  it("attaches avatarUrl and avatarMediaId to search results", async () => {
    neo4j.read
      .mockResolvedValueOnce({
        records: [
          {
            get: (key: string) =>
              key === "i"
                ? {
                    id: "I1",
                    firstName: "Ada",
                    lastName: "Lovelace",
                    sex: "F",
                  }
                : null,
          },
        ],
      })
      .mockResolvedValueOnce({
        records: [
          {
            get: (key: string) =>
              (
                {
                  individualId: "I1",
                  media: [
                    {
                      id: "avatar-search",
                      type: "PHOTO",
                      url: "https://cdn.example/search.jpg",
                      thumbnailUrl: "https://cdn.example/search-thumb.jpg",
                      createdAt: "2024-05-01T00:00:00.000Z",
                    },
                  ],
                } as Record<string, unknown>
              )[key],
          },
        ],
      });

    jest
      .spyOn(Neo4jResultUtils, "normalizeValue")
      .mockImplementation((value) => value as any);

    const results = await service.searchIndividuals("tree-1", "ada");

    expect(results).toEqual([
      {
        id: "I1",
        firstName: "Ada",
        lastName: "Lovelace",
        sex: "F",
        avatarUrl: "https://cdn.example/search-thumb.jpg",
        avatarMediaId: "avatar-search",
      },
    ]);
  });
});

describe("FamilyTreeService ensureTreeHasData claim", () => {
  let service: FamilyTreeService;
  let neo4j: { read: jest.Mock; write: jest.Mock; executeTransaction: jest.Mock };

  beforeEach(() => {
    neo4j = {
      read: jest.fn().mockResolvedValue({ records: [] }),
      write: jest.fn().mockResolvedValue({ records: [] }),
      executeTransaction: jest.fn(),
    };
    service = new FamilyTreeService(neo4j as unknown as Neo4jService);
  });

  it.each([TreeRole.VIEWER, TreeRole.EDITOR] as const)(
    "does not claim null treeId nodes for %s on an empty tree",
    async (role) => {
      await service.getFullGraph("shared-tree", role);

      expect(neo4j.write).not.toHaveBeenCalled();
    },
  );

  it("does not claim null treeId nodes when searching as a viewer", async () => {
    await service.searchIndividuals("shared-tree", "", 20, TreeRole.VIEWER);

    expect(neo4j.write).not.toHaveBeenCalled();
  });

  it("claims null treeId nodes for the owner of an empty tree", async () => {
    await service.getFullGraph("owned-tree", TreeRole.OWNER);

    expect(neo4j.write).toHaveBeenCalled();
    expect(neo4j.write.mock.calls[0][0]).toContain("SET i.treeId");
  });
});
