import { Neo4jService } from "../../../neo4j/neo4j.service";
import { Sex } from "../enums/sex.enum";
import { GedcomExportService } from "./gedcom-export.service";

describe("GedcomExportService", () => {
  let neo4j: { read: jest.Mock };
  let service: GedcomExportService;

  beforeEach(() => {
    neo4j = { read: jest.fn() };
    service = new GedcomExportService(neo4j as unknown as Neo4jService);
  });

  it("returns HEAD/TRLR for empty tree", async () => {
    neo4j.read
      .mockResolvedValueOnce({ records: [] })
      .mockResolvedValueOnce({ records: [] });

    const text = await service.exportTree("tree-1");

    expect(text).toContain("0 HEAD");
    expect(text).toContain("0 TRLR");
    expect(neo4j.read).toHaveBeenCalledTimes(2);
    expect(neo4j.read.mock.calls[0][1]).toEqual({ treeId: "tree-1" });
    expect(neo4j.read.mock.calls[1][1]).toEqual({ treeId: "tree-1" });
  });

  it("exports normalized individuals and touching legacy families", async () => {
    const husband = node({
      id: "h1",
      gedcomId: "I-H",
      firstName: "James",
      lastName: "Potter",
      sex: Sex.MALE,
      treeId: "tree-1",
    });
    const wife = node({
      id: "w1",
      gedcomId: "I-W",
      firstName: "Lily",
      lastName: "Evans",
      marriedName: "Potter",
      sex: Sex.FEMALE,
      treeId: "tree-1",
    });
    const child = node({
      id: "c1",
      gedcomId: "I-C",
      firstName: "Harry",
      lastName: "Potter",
      sex: Sex.MALE,
      treeId: "tree-1",
    });
    const family = node({
      id: "f1",
      gedcomId: "F1",
      treeId: null,
      marriageDate: "1978-10-31",
    });

    neo4j.read
      .mockResolvedValueOnce({
        records: [
          record({ i: husband }),
          record({ i: wife }),
          record({ i: child }),
        ],
      })
      .mockResolvedValueOnce({
        records: [
          record({ f: family, husband, wife, children: [child] }),
          record({
            f: node({ id: "orphan-family", gedcomId: "F-orphan", treeId: null }),
            husband: null,
            wife: null,
            children: [],
          }),
        ],
      });

    const text = await service.exportTree("tree-1");

    expect(text).toContain("0 @I-H@ INDI");
    expect(text).toContain("1 NAME James /Potter/");
    expect(text).toContain("0 @F1@ FAM");
    expect(text).toContain("1 HUSB @I-H@");
    expect(text).toContain("1 WIFE @I-W@");
    expect(text).toContain("1 CHIL @I-C@");
    expect(text).toContain("2 _MARNM Potter");
    expect(text).not.toContain("1 _MARNM Potter");
    expect(text).not.toContain("1 NOTE Married name: Potter");
    expect(text).not.toContain("@F-orphan@");
  });
});

function node(properties: Record<string, unknown>) {
  return {
    identity: { toNumber: () => 1, inSafeRange: () => true },
    labels: [],
    properties,
  };
}

function record(values: Record<string, unknown>) {
  return {
    get: (key: string) => values[key],
  };
}
