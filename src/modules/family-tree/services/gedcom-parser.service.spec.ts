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

  it("imports OCCU/NOTE and non-English birth dates", async () => {
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
0 @I500095@ INDI
1 NAME Игорь /Гречко/
2 GIVN Игорь
2 SURN Гречко
1 SEX M
1 BIRT
2 DATE 16 сент. 1955
1 OCCU Инженер
1 NOTE <p>Предположительно умер</p>
0 @I500096@ INDI
1 NAME Любовь Ивановна //
2 GIVN Любовь Ивановна
1 SEX F
1 BIRT
2 DATE 07.10.1957
0 @I500011@ INDI
1 NAME Лидия /Мокроусова/
1 SEX F
1 DEAT Y
2 DATE ABT 2002
2 PLAC Рига
0 TRLR
`;

    await service.parseAndImport("tree-1", gedcom);
    const queries = neo4j.executeTransaction.mock.calls[0][0] as Array<{
      params?: { id?: string; properties?: Record<string, unknown> };
    }>;
    const byId = (id: string) =>
      queries.find((q) => q.params?.id === id)?.params?.properties;

    expect(byId("I500095")).toMatchObject({
      birthDate: "1955-09-16T00:00:00.000Z",
      occupation: "Инженер",
      biography: "Предположительно умер",
    });
    expect(byId("I500096")).toMatchObject({
      birthDate: "1957-10-07T00:00:00.000Z",
    });
    expect(byId("I500011")).toMatchObject({
      deathDate: "2002-01-01T00:00:00.000Z",
      deathPlace: "Рига",
    });
  });

  it("imports married name, email, burial, cause, EVEN, RETI", async () => {
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
1 NAME Виктория /Ткаченко/
2 GIVN Виктория
2 SURN Ткаченко
2 _MARNM Гречко
2 NPFX капитан
1 SEX F
1 DEAT Y
2 DATE 24 JUL 2023
2 PLAC Таганрог
2 CAUS Естественная смерть
1 BURI
2 PLAC Николаевское кладбище
1 RESI
2 EMAIL tashana@@hotbox.ru
1 RESI
2 EMAIL other@@mail.ru
1 EVEN звание: полковник
2 TYPE Military Service
1 RETI Подполковник полиции в отставке
2 DATE 2018 год
0 TRLR
`;

    await service.parseAndImport("tree-1", gedcom);
    const queries = neo4j.executeTransaction.mock.calls[0][0] as Array<{
      params?: { id?: string; properties?: Record<string, unknown> };
    }>;
    const props = queries.find((q) => q.params?.id === "I1")?.params
      ?.properties;

    expect(props).toMatchObject({
      marriedName: "Гречко",
      namePrefix: "капитан",
      deathCause: "Естественная смерть",
      burialPlace: "Николаевское кладбище",
      email: "tashana@hotbox.ru; other@mail.ru",
      extraEvents: "Military Service: звание: полковник",
      retirementNote: "Подполковник полиции в отставке (2018 год)",
    });
  });

  it("uses _MARNM as lastName when surname is empty", async () => {
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
0 @I500096@ INDI
1 NAME Любовь Ивановна //
2 GIVN Любовь Ивановна
2 _MARNM Гречко
1 SEX F
0 TRLR
`;

    await service.parseAndImport("tree-1", gedcom);
    const queries = neo4j.executeTransaction.mock.calls[0][0] as Array<{
      params?: { id?: string; properties?: Record<string, unknown> };
    }>;
    const props = queries.find((q) => q.params?.id === "I500096")?.params
      ?.properties;

    expect(props).toMatchObject({
      firstName: "Любовь",
      middleName: "Ивановна",
      lastName: "Гречко",
      marriedName: "Гречко",
    });
  });
});
