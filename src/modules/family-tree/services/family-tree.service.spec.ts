import { NotFoundException } from "@nestjs/common";
import { FamilyTreeService } from "./family-tree.service";
import { RelationType } from "../enums/relation-type.enum";
import { Sex } from "../enums/sex.enum";
import { Neo4jService } from "../../../neo4j/neo4j.service";
import { Neo4jResultUtils } from "../../../common/utils/neo4j-result.utils";

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
