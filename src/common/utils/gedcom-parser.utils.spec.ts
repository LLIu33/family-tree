import { GedcomParserUtils } from "./gedcom-parser.utils";

describe("GedcomParserUtils.normalizeGedcomDate", () => {
  it("keeps calendar day in UTC (no off-by-one)", () => {
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
    expect(GedcomParserUtils.normalizeGedcomDate("APR 1919")).toBe(
      "1919-04-01"
    );
  });

  it("strips GEDCOM date modifiers (ABT/EST/…)", () => {
    expect(GedcomParserUtils.normalizeGedcomDate("ABT 2002")).toBe(
      "2002-01-01"
    );
    expect(GedcomParserUtils.normalizeGedcomDate("EST 1945")).toBe(
      "1945-01-01"
    );
    expect(GedcomParserUtils.normalizeGedcomDate("BEF 1 JAN 1900")).toBe(
      "1900-01-01"
    );
  });

  it("parses dotted European dates DD.MM.YYYY", () => {
    expect(GedcomParserUtils.normalizeGedcomDate("07.10.1957")).toBe(
      "1957-10-07"
    );
    expect(GedcomParserUtils.normalizeGedcomDate("7.10.1957")).toBe(
      "1957-10-07"
    );
  });

  it("parses Russian month abbreviations", () => {
    expect(GedcomParserUtils.normalizeGedcomDate("16 сент. 1955")).toBe(
      "1955-09-16"
    );
    expect(GedcomParserUtils.normalizeGedcomDate("1 янв 2000")).toBe(
      "2000-01-01"
    );
  });

  it("returns null for empty/invalid input", () => {
    expect(GedcomParserUtils.normalizeGedcomDate("")).toBeNull();
    expect(GedcomParserUtils.normalizeGedcomDate("not-a-date")).toBeNull();
  });
});
