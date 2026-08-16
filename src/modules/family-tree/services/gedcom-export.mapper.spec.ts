import { readGedcom, type GedcomDate } from "gedcom-typescript";
import { Family, Individual } from "../entities";
import { Sex } from "../enums/sex.enum";
import {
  buildGedcomFile,
  serializeGedcomFile,
  toGedcomXref,
} from "./gedcom-export.mapper";

describe("gedcom-export.mapper", () => {
  it("toGedcomXref wraps and sanitizes xrefs", () => {
    expect(toGedcomXref("I1", "I")).toBe("@I1@");
    expect(toGedcomXref("@I1@", "I")).toBe("@I1@");
    expect(toGedcomXref("bad id!", "F")).toBe("@Fbad_id_@");
  });

  it("exports a couple with child and round-trips via writeGedcom/readGedcom", () => {
    const husband = Object.assign(new Individual(), {
      id: "h1",
      gedcomId: "I-H",
      firstName: "James",
      lastName: "Potter",
      sex: Sex.MALE,
      birthDate: new Date(Date.UTC(1960, 2, 27)),
    });
    const wife = Object.assign(new Individual(), {
      id: "w1",
      gedcomId: "I-W",
      firstName: "Lily",
      lastName: "Evans",
      sex: Sex.FEMALE,
      marriedName: "Potter",
    });
    const child = Object.assign(new Individual(), {
      id: "c1",
      gedcomId: "I-C",
      firstName: "Harry",
      lastName: "Potter",
      sex: Sex.MALE,
      birthDate: new Date(Date.UTC(1980, 6, 31)),
      biography: "The boy who lived",
    });
    const family = Object.assign(new Family(), {
      id: "f1",
      gedcomId: "F1",
      husband: Object.assign(new Individual(), {
        id: husband.id,
        gedcomId: husband.gedcomId,
      }),
      wife: Object.assign(new Individual(), {
        id: wife.id,
        gedcomId: wife.gedcomId,
      }),
      children: [
        Object.assign(new Individual(), {
          id: child.id,
          gedcomId: child.gedcomId,
        }),
      ],
      marriageDate: "1978-10-31",
    });

    const file = buildGedcomFile({
      individuals: [husband, wife, child],
      families: [family],
    });
    const text = serializeGedcomFile(file);

    expect(text).toContain("0 @I-H@ INDI");
    expect(text).toContain("1 NAME James /Potter/");
    expect(text).toContain("1 NAME Lily /Evans/");
    expect(text).toContain("1 NAME Harry /Potter/");
    expect(text).toContain("1 HUSB @I-H@");
    expect(text).toContain("1 WIFE @I-W@");
    expect(text).toContain("1 CHIL @I-C@");
    expect(text).toContain("1 MARR");
    expect(text).toMatch(/2 DATE 31 OCT 1978|2 DATE \(1978-10-31\)/);
    expect(text).toContain("1 NOTE The boy who lived");
    const wifeBlock = recordBlock(text, "0 @I-W@ INDI");
    const wifeNameBlock = childBlock(wifeBlock, "1 NAME");
    expect(wifeNameBlock).toContain("2 GIVN Lily");
    expect(wifeNameBlock).toContain("2 SURN Evans");
    expect(wifeNameBlock).toContain("2 _MARNM Potter");
    expect(wifeNameBlock.indexOf("2 _MARNM Potter")).toBeGreaterThan(
      wifeNameBlock.indexOf("2 SURN Evans")
    );
    expect(wifeBlock).not.toContain("1 _MARNM Potter");
    expect(text).not.toContain("1 NOTE Married name: Potter");

    const parsed = readGedcom(text);

    expect(parsed.individuals.size).toBe(3);
    expect(parsed.families.size).toBe(1);

    const parsedHusband = parsed.individuals.get("@I-H@");
    const parsedWife = parsed.individuals.get("@I-W@");
    const parsedChild = parsed.individuals.get("@I-C@");
    const parsedFamily = parsed.families.get("@F1@");

    expect(parsedHusband?.names[0]).toMatchObject({
      value: "James /Potter/",
      given: "James",
      surname: "Potter",
    });
    expect(parsedHusband?.sex).toBe("M");
    expect(exactYear(parsedHusband?.birth?.date)).toBe(1960);
    expect(parsedWife?.names[0]).toMatchObject({
      value: "Lily /Evans/",
      given: "Lily",
      surname: "Evans",
    });
    expect(parsedWife?.sex).toBe("F");
    expect(parsedWife?.notes).toBeUndefined();
    expect(parsedChild?.names[0]).toMatchObject({
      value: "Harry /Potter/",
      given: "Harry",
      surname: "Potter",
    });
    expect(parsedChild?.sex).toBe("M");
    expect(parsedChild?.birth?.date).toMatchObject({
      type: "exact",
      date: { day: 31, month: "JUL", year: 1980 },
    });
    expect(parsedFamily?.husband).toBe("@I-H@");
    expect(parsedFamily?.wife).toBe("@I-W@");
    expect(parsedFamily?.children).toEqual(["@I-C@"]);
    expect(parsedFamily?.marriage?.date).toMatchObject({
      type: "exact",
      date: { day: 31, month: "OCT", year: 1978 },
    });
  });

  it("builds a minimal file for an empty tree", () => {
    const text = serializeGedcomFile(
      buildGedcomFile({ individuals: [], families: [] })
    );

    expect(text).toContain("0 HEAD");
    expect(text).toContain("0 TRLR");
  });
});

function exactYear(date: GedcomDate | undefined): number | undefined {
  return date?.type === "exact" ? date.date.year : undefined;
}

function recordBlock(text: string, recordHeader: string): string {
  const start = text.indexOf(recordHeader);
  expect(start).toBeGreaterThanOrEqual(0);
  const nextRecord = text.indexOf("\n0 ", start + recordHeader.length);
  return nextRecord === -1 ? text.slice(start) : text.slice(start, nextRecord);
}

function childBlock(parentBlock: string, childPrefix: string): string {
  const start = parentBlock.indexOf(childPrefix);
  expect(start).toBeGreaterThanOrEqual(0);
  const nextSibling = parentBlock.indexOf("\n1 ", start + childPrefix.length);
  return nextSibling === -1
    ? parentBlock.slice(start)
    : parentBlock.slice(start, nextSibling);
}
