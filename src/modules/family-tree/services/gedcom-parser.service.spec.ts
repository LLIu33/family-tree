import { GedcomParserService } from "./gedcom-parser.service";
import { EventService } from "./event.service";
import { Neo4jService } from "../../../neo4j/neo4j.service";

describe("GedcomParserService", () => {
  it("parses individuals and families without gedcom-ts", async () => {
    const neo4j = {
      executeTransaction: jest.fn().mockResolvedValue([]),
    };
    const events = {
      createEventQuery: jest.fn().mockResolvedValue({
        query: "RETURN 1",
        params: {},
      }),
    };

    const service = new GedcomParserService(
      neo4j as unknown as Neo4jService,
      events as unknown as EventService
    );

    const gedcom = `0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Harry /Potter/
1 SEX M
1 BIRT
2 DATE 31 JUL 1980
1 FAMC @F1@
0 @I2@ INDI
1 NAME James /Potter/
1 SEX M
1 FAMS @F1@
0 @I3@ INDI
1 NAME Lily /Evans/
1 SEX F
1 FAMS @F1@
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I3@
1 CHIL @I1@
0 TRLR
`;

    const result = await service.parseAndImport("tree-1", gedcom);

    expect(result).toEqual({ individuals: 3, families: 1 });
    expect(neo4j.executeTransaction).toHaveBeenCalled();
    const queries = neo4j.executeTransaction.mock.calls[0][0] as Array<{
      query: string;
    }>;
    expect(queries.some((q) => q.query.includes("[:HUSBAND]"))).toBe(true);
    expect(queries.some((q) => q.query.includes("[:WIFE]"))).toBe(true);
    expect(queries.some((q) => q.query.includes("[:CHILD]"))).toBe(true);
    expect(queries.some((q) => q.query.includes("FAMILY_MEMBER"))).toBe(false);
  });

  it("merges multiple BIRT facts and stores UTC calendar dates", async () => {
    const neo4j = {
      executeTransaction: jest.fn().mockResolvedValue([]),
    };
    const events = {
      createEventQuery: jest.fn().mockResolvedValue({
        query: "RETURN 1",
        params: {},
      }),
    };

    const service = new GedcomParserService(
      neo4j as unknown as Neo4jService,
      events as unknown as EventService
    );

    const gedcom = `0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I500001@ INDI
1 NAME Георгий /Ткаченко/
1 SEX M
1 BIRT
2 DATE 5 NOV 1956
2 PLAC Таганрог
1 BIRT
2 PLAC Таганрог, Ростовская область, Россия
0 TRLR
`;

    await service.parseAndImport("tree-1", gedcom);

    const queries = neo4j.executeTransaction.mock.calls[0][0] as Array<{
      query: string;
      params?: { id?: string; properties?: Record<string, unknown> };
    }>;
    const individualQuery = queries.find(
      (q) => q.params?.id === "I500001" && q.params?.properties
    );

    expect(individualQuery?.params?.properties).toMatchObject({
      birthDate: "1956-11-05T00:00:00.000Z",
      birthPlace: "Таганрог, Ростовская область, Россия",
    });
  });
});
