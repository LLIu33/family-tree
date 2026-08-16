import { Neo4jResultUtils } from "./neo4j-result.utils";

function record(values: Record<string, unknown>) {
  const keys = Object.keys(values);
  return {
    length: keys.length,
    keys,
    get: (key: string | number) =>
      typeof key === "number" ? values[keys[key]] : values[key],
  };
}

describe("Neo4jResultUtils", () => {
  it("normalizeNeo4jResult returns null for empty input", () => {
    expect(Neo4jResultUtils.normalizeNeo4jResult(null)).toBeNull();
    expect(Neo4jResultUtils.normalizeNeo4jResult(undefined)).toBeNull();
  });

  it("normalizes arrays of records and multi-field records", () => {
    const records = [
      record({ a: 1, b: "x" }),
      record({ a: 2, b: "y" }),
    ] as any;

    expect(Neo4jResultUtils.normalizeNeo4jResult(records)).toEqual([
      { a: 1, b: "x" },
      { a: 2, b: "y" },
    ]);
  });

  it("normalizes single-value records with type hints", () => {
    const node = {
      identity: { toNumber: () => 7, inSafeRange: () => true },
      labels: ["Individual"],
      properties: {
        age: { toNumber: () => 42, inSafeRange: () => true },
        name: "Ada",
      },
    };
    const relationship = {
      identity: { toNumber: () => 3, inSafeRange: () => true },
      type: "CHILD",
      start: { toNumber: () => 1, inSafeRange: () => true },
      end: { toNumber: () => 2, inSafeRange: () => true },
      properties: { since: "2000" },
    };

    expect(
      Neo4jResultUtils.normalizeNeo4jResult(record({ n: node }) as any, "node"),
    ).toEqual({
      _id: 7,
      _labels: ["Individual"],
      age: 42,
      name: "Ada",
    });

    expect(
      Neo4jResultUtils.normalizeNeo4jResult(
        record({ r: relationship }) as any,
        "relationship",
      ),
    ).toEqual({
      _id: 3,
      _type: "CHILD",
      _startId: 1,
      _endId: 2,
      since: "2000",
    });

    expect(
      Neo4jResultUtils.normalizeNeo4jResult(record({ v: "plain" }) as any, "value"),
    ).toBe("plain");
  });

  it("normalizes arrays and nested plain objects", () => {
    expect(
      Neo4jResultUtils.normalizeValue([
        { toNumber: () => 5, inSafeRange: () => true },
        null,
      ]),
    ).toEqual([5, null]);

    expect(
      Neo4jResultUtils.normalizeValue({
        nested: { toNumber: () => 9, inSafeRange: () => true },
      }),
    ).toEqual({ nested: 9 });
  });

  it("getFirstResult and getFirstField extract values", () => {
    const records = [record({ id: "i1", name: "Ada" })] as any;
    expect(Neo4jResultUtils.getFirstResult(records)).toEqual({
      id: "i1",
      name: "Ada",
    });
    expect(Neo4jResultUtils.getFirstField(records, "name")).toBe("Ada");
    expect(Neo4jResultUtils.getFirstResult([])).toBeNull();
    expect(Neo4jResultUtils.getFirstField([], "name")).toBeNull();
  });
});
