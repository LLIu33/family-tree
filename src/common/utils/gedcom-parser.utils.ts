import * as crypto from "crypto";

export class GedcomParserUtils {
  private static readonly GEDCOM_ID_PREFIX = "GED";
  private static readonly ID_LENGTH = 12;
  private static readonly ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  private static readonly ID_SEPARATOR = "_";

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
   * Normalizes GEDCOM date strings to ISO format
   * @param gedcomDate GEDCOM date string (e.g., "1 JAN 1990")
   * @returns ISO date string or null if invalid
   */
  static normalizeGedcomDate(gedcomDate: string): string | null {
    if (!gedcomDate) return null;

    try {
      const months: Record<string, number> = {
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

      // Handle different GEDCOM date formats
      const parts = gedcomDate.trim().split(/\s+/);
      if (parts.length === 3) {
        // Format: "1 JAN 1990"
        const day = parseInt(parts[0], 10);
        const month = months[parts[1].toUpperCase()];
        const year = parseInt(parts[2], 10);

        if (isNaN(day)) return null;
        if (month === undefined) return null;
        if (isNaN(year)) return null;

        const date = new Date(year, month, day);
        return date.toISOString().split("T")[0];
      } else if (parts.length === 2) {
        // Format: "JAN 1990"
        const month = months[parts[0].toUpperCase()];
        const year = parseInt(parts[1], 10);

        if (month === undefined) return null;
        if (isNaN(year)) return null;

        const date = new Date(year, month, 1);
        return date.toISOString().split("T")[0];
      } else if (parts.length === 1) {
        // Format: "1990"
        const year = parseInt(parts[0], 10);
        if (isNaN(year)) return null;

        const date = new Date(year, 0, 1);
        return date.toISOString().split("T")[0];
      }
    } catch (e) {
      return null;
    }

    return null;
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
