import { FamilyTreeService } from "./family-tree.service";
import { RelationType } from "../enums/relation-type.enum";
import { Sex } from "../enums/sex.enum";
import { Neo4jService } from "../../../neo4j/neo4j.service";

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

    await service.createRelationship({
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

    await service.createRelationship({
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
      service.createRelationship({
        fromIndividualId: "a1",
        toIndividualId: "b1",
        relationshipType: RelationType.GODPARENT,
      })
    ).rejects.toThrow(/Unsupported relationship type/);
  });
});
