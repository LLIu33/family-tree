import { GedcomParserUtils } from "./gedcom-parser.utils";

describe("GedcomParserUtils.normalizeGedcomDate", () => {
  it("keeps calendar day in UTC+3 (no off-by-one)", () => {
    expect(GedcomParserUtils.normalizeGedcomDate("5 NOV 1956")).toBe(
      "1956-11-05"
    );
    expect(GedcomParserUtils.normalizeGedcomDate("1 MAR 1963")).toBe(
      "1963-03-01"
    );
    expect(GedcomParserUtils.normalizeGedcomDate("21 DEC 1987")).toBe(
      "1987-12-21"
    );
  });

  it("normalizes year-only and month-year without TZ shift", () => {
    expect(GedcomParserUtils.normalizeGedcomDate("1896")).toBe("1896-01-01");
    expect(GedcomParserUtils.normalizeGedcomDate("JAN 1990")).toBe(
      "1990-01-01"
    );
  });
});
