import * as crypto from "crypto";

export class GedcomParserUtils {
  private static readonly GEDCOM_ID_PREFIX = "GED";
  private static readonly ID_LENGTH = 12;
  private static readonly ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  private static readonly ID_SEPARATOR = "_";

  private static readonly EN_MONTHS: Record<string, number> = {
    JAN: 0,
    FEB: 1,
    MAR: 2,
    APR: 3,
    MAY: 4,
    JUN: 5,
    JUL: 6,
    AUG: 7,
    SEP: 8,
    OCT: 9,
    NOV: 10,
    DEC: 11,
  };

  /** Russian month stems → 0-based month index (MyHeritage / localized GEDCOM). */
  private static readonly RU_MONTHS: Array<{ stem: string; month: number }> = [
    { stem: "янв", month: 0 },
    { stem: "фев", month: 1 },
    { stem: "мар", month: 2 },
    { stem: "апр", month: 3 },
    { stem: "ма", month: 4 }, // май / мая
    { stem: "июн", month: 5 },
    { stem: "июл", month: 6 },
    { stem: "авг", month: 7 },
    { stem: "сен", month: 8 }, // сен / сент
    { stem: "окт", month: 9 },
    { stem: "ноя", month: 10 },
    { stem: "дек", month: 11 },
  ];

  /**
   * Generates a GEDCOM-compatible ID with optional prefix
   * @param entityType Optional entity type prefix (e.g., 'INDI', 'FAM')
   * @returns Generated GEDCOM ID (e.g., "GED_INDI_AB12CD34EF56")
   */
  static generateGedcomId(entityType?: string): string {
    const randomPart = this.generateRandomId(this.ID_LENGTH);

    const parts = [this.GEDCOM_ID_PREFIX];
    if (entityType) {
      parts.push(entityType);
    }
    parts.push(randomPart);

    return parts.join(this.ID_SEPARATOR);
  }

  /**
   * Generates a random ID of specified length
   * @param length Length of the ID to generate
   * @returns Random ID string
   */
  private static generateRandomId(length: number): string {
    const bytes = crypto.randomBytes(length);
    let result = "";

    for (let i = 0; i < length; i++) {
      const randomIndex = bytes[i] % this.ID_CHARS.length;
      result += this.ID_CHARS[randomIndex];
    }

    return result;
  }

  /**
   * Validates if a string is a valid GEDCOM ID
   * @param id ID to validate
   * @returns true if valid, false otherwise
   */
  static isValidGedcomId(id: string): boolean {
    if (!id) return false;

    const parts = id.split(this.ID_SEPARATOR);
    if (parts.length < 2) return false;
    if (parts[0] !== this.GEDCOM_ID_PREFIX) return false;

    const idPart = parts[parts.length - 1];
    if (idPart.length !== this.ID_LENGTH) return false;

    return true;
  }

  /**
   * Extracts entity type from GEDCOM ID
   * @param id GEDCOM ID to parse
   * @returns Entity type or undefined if not present
   */
  static extractEntityType(id: string): string | undefined {
    if (!this.isValidGedcomId(id)) return undefined;

    const parts = id.split(this.ID_SEPARATOR);
    if (parts.length === 3) {
      return parts[1];
    }
    return undefined;
  }

  /**
   * Normalizes GEDCOM date strings to ISO calendar day (YYYY-MM-DD).
   * Supports English months, Russian abbreviations, DD.MM.YYYY, and ABT/EST/….
   */
  static normalizeGedcomDate(gedcomDate: string): string | null {
    if (!gedcomDate) return null;

    try {
      let raw = gedcomDate.trim();
      if (!raw) return null;

      // Strip leading modifiers; take first date of a BET … AND … range.
      raw = raw.replace(
        /^(ABT|ABOUT|CIR|CIRCA|EST|CAL|BEF|AFT|FROM|TO)\s+/i,
        ""
      );
      const bet = raw.match(/^BET\s+(.+?)\s+AND\s+/i);
      if (bet) {
        raw = bet[1].trim();
      }

      // DD.MM.YYYY / D.M.YYYY (do not treat as year-only via parseInt)
      const dotted = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      if (dotted) {
        return this.utcDay(
          parseInt(dotted[3], 10),
          parseInt(dotted[2], 10) - 1,
          parseInt(dotted[1], 10)
        );
      }

      const parts = raw.split(/\s+/).filter(Boolean);
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = this.monthIndex(parts[1]);
        const year = parseInt(parts[2], 10);
        if (isNaN(day) || month === undefined || isNaN(year)) return null;
        return this.utcDay(year, month, day);
      }
      if (parts.length === 2) {
        const month = this.monthIndex(parts[0]);
        const year = parseInt(parts[1], 10);
        if (month === undefined || isNaN(year)) return null;
        return this.utcDay(year, month, 1);
      }
      if (parts.length === 1) {
        // Strict year-only — reject values with punctuation (e.g. 07.10.1957)
        if (!/^\d{1,4}$/.test(parts[0])) return null;
        const year = parseInt(parts[0], 10);
        if (isNaN(year)) return null;
        return this.utcDay(year, 0, 1);
      }
    } catch {
      return null;
    }

    return null;
  }

  private static monthIndex(token: string): number | undefined {
    const cleaned = token.replace(/\./g, "").trim();
    const en = this.EN_MONTHS[cleaned.toUpperCase()];
    if (en !== undefined) return en;

    const lower = cleaned.toLowerCase();
    for (const { stem, month } of this.RU_MONTHS) {
      if (lower.startsWith(stem)) return month;
    }
    return undefined;
  }

  private static utcDay(
    year: number,
    monthIndex: number,
    day: number
  ): string | null {
    if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) return null;
    const iso = new Date(Date.UTC(year, monthIndex, day))
      .toISOString()
      .split("T")[0];
    return iso;
  }

  /**
   * Parses GEDCOM name format into components
   * @param gedcomName GEDCOM name string (e.g., "John /Doe/")
   * @returns Object with name components
   */
  static parseGedcomName(gedcomName: string): {
    givenName: string;
    surname: string;
    prefix?: string;
    suffix?: string;
  } {
    if (!gedcomName) {
      return { givenName: "", surname: "" };
    }

    // Handle GEDCOM name format (e.g., "John /Doe/", "John /Van Der Berg/")
    const parts = gedcomName.split("/").map((p) => p.trim());

    if (parts.length === 3) {
      // Format: "First /Last/"
      return {
        givenName: parts[0].trim(),
        surname: parts[1].trim(),
      };
    } else if (parts.length === 5) {
      // Format: "Prefix First /Last/ Suffix"
      return {
        prefix: parts[0].trim(),
        givenName: parts[1].trim(),
        surname: parts[2].trim(),
        suffix: parts[3].trim(),
      };
    }

    // Fallback for other formats
    const lastSpaceIndex = gedcomName.lastIndexOf(" ");
    if (lastSpaceIndex > 0) {
      return {
        givenName: gedcomName.substring(0, lastSpaceIndex).trim(),
        surname: gedcomName.substring(lastSpaceIndex + 1).trim(),
      };
    }

    return {
      givenName: gedcomName.trim(),
      surname: "",
    };
  }
}
