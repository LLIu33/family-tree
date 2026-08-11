import { Injectable, Logger } from "@nestjs/common";
import { GEDCOMValidationError } from "../../../common/errors/gedcom-validation.error";
import { Individual, Family } from "../entities";
import { GedcomParserUtils } from "../../../common/utils/gedcom-parser.utils";
import { EventService } from "./event.service";
import { Neo4jService } from "../../../neo4j/neo4j.service";
import { EventType } from "../enums/event-type.enum";

type FamilyImportRecord = Family & {
  husbandId?: string;
  wifeId?: string;
  childrenIds?: string[];
};

type GedcomRecord = {
  level: number;
  tag: string;
  xref?: string;
  value?: string;
  children: GedcomRecord[];
};

/**
 * Minimal GEDCOM 5.5 parser for INDI/FAM import.
 * Avoids broken npm packages (gedcom-ts ESM paths, fragile gedcom-js).
 */
@Injectable()
export class GedcomParserService {
  private readonly logger = new Logger(GedcomParserService.name);
  private readonly SUPPORTED_VERSIONS = ["5.5.1", "5.5"];

  constructor(
    private readonly neo4jService: Neo4jService,
    private readonly eventService: EventService
  ) {}

  async parseAndImport(
    treeId: string,
    gedcomText: string,
    source: string = "unknown"
  ): Promise<{ individuals: number; families: number }> {
    try {
      const root = this.parseGedcom(gedcomText);
      this.validateVersion(root);

      const { individuals, families, errors } = this.extractData(root);

      if (errors.length > 0) {
        throw new GEDCOMValidationError(errors, {
          fileName: "import.ged",
          source,
          size: gedcomText.length,
          encoding: "UTF-8",
        });
      }

      return await this.importToNeo4j(treeId, individuals, families);
    } catch (error) {
      if (error instanceof GEDCOMValidationError) {
        throw error;
      }
      this.logger.error("GEDCOM parsing failed", (error as Error).stack);
      throw new GEDCOMValidationError(
        [
          {
            type: "PARSE_ERROR",
            message: (error as Error).message,
          },
        ],
        { fileName: "import.ged", size: gedcomText.length, encoding: "UTF-8" }
      );
    }
  }

  private parseGedcom(text: string): GedcomRecord {
    const root: GedcomRecord = { level: -1, tag: "ROOT", children: [] };
    const stack: GedcomRecord[] = [root];

    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trimEnd();
      if (!line.trim()) continue;

      const match = line.match(/^(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?:\s+(.*))?$/);
      if (!match) continue;

      const level = parseInt(match[1], 10);
      const record: GedcomRecord = {
        level,
        xref: match[2],
        tag: match[3],
        value: match[4],
        children: [],
      };

      while (stack.length > 1 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }
      stack[stack.length - 1].children.push(record);
      stack.push(record);
    }

    return root;
  }

  private validateVersion(root: GedcomRecord) {
    const head = root.children.find((child) => child.tag === "HEAD");
    const gedc = head?.children.find((child) => child.tag === "GEDC");
    const version = gedc?.children.find((child) => child.tag === "VERS")?.value;

    if (version && !this.SUPPORTED_VERSIONS.includes(version)) {
      throw new Error(
        `Unsupported GEDCOM version: ${version}. Supported versions: ${this.SUPPORTED_VERSIONS.join(
          ", "
        )}`
      );
    }
  }

  private extractData(root: GedcomRecord): {
    individuals: Individual[];
    families: FamilyImportRecord[];
    errors: Array<{ type: string; message: string; xref?: string }>;
  } {
    const individuals: Individual[] = [];
    const families: FamilyImportRecord[] = [];
    const errors: Array<{ type: string; message: string; xref?: string }> = [];

    for (const record of root.children) {
      if (record.tag === "INDI") {
        try {
          individuals.push(this.mapIndividual(record));
        } catch (error) {
          errors.push({
            type: "INDIVIDUAL_PARSE_ERROR",
            message: (error as Error).message,
            xref: record.xref,
          });
        }
      }

      if (record.tag === "FAM") {
        try {
          families.push(this.mapFamily(record));
        } catch (error) {
          errors.push({
            type: "FAMILY_PARSE_ERROR",
            message: (error as Error).message,
            xref: record.xref,
          });
        }
      }
    }

    return { individuals, families, errors };
  }

  private mapIndividual(record: GedcomRecord): Individual {
    const xref =
      this.cleanXref(record.xref) ||
      GedcomParserUtils.generateGedcomId("INDI");
    const nameRecord = record.children.find((child) => child.tag === "NAME");
    const givn = nameRecord?.children.find((c) => c.tag === "GIVN")?.value;
    const surn = nameRecord?.children.find((c) => c.tag === "SURN")?.value;
    const marriedName =
      nameRecord?.children.find((c) => c.tag === "_MARNM")?.value?.trim() ||
      undefined;
    const [parsedFirst, parsedLast] = this.parseName(
      nameRecord?.value || "Unknown /Unknown/"
    );

    const emptySurname = (value?: string | null): boolean =>
      !value?.trim() || value.trim().toLowerCase() === "unknown";

    let firstName = (givn || parsedFirst || "").trim() || "Unknown";
    let lastName = (surn || parsedLast || "").trim();
    // MyHeritage often leaves maiden SURN empty and puts married name in _MARNM.
    if (emptySurname(lastName)) {
      lastName = marriedName || "Unknown";
    }

    let middleName: string | undefined;
    // "Любовь Ивановна" in GIVN with empty surname → first + patronymic.
    if (emptySurname(surn) && emptySurname(parsedLast)) {
      const parts = firstName.split(/\s+/).filter(Boolean);
      if (
        parts.length >= 2 &&
        /(?:овна|евна|ична|инична|ович|евич|ич)$/i.test(parts[parts.length - 1])
      ) {
        firstName = parts[0];
        middleName = parts.slice(1).join(" ");
      }
    }

    const birth = this.mergeEventFacts(
      record.children.filter((child) => child.tag === "BIRT")
    );
    const death = this.mergeEventFacts(
      record.children.filter((child) => child.tag === "DEAT")
    );
    const burial = this.mergeEventFacts(
      record.children.filter((child) => child.tag === "BURI")
    );

    const individual = new Individual();
    individual.id = xref;
    individual.gedcomId = xref;
    individual.firstName = firstName;
    individual.lastName = lastName;
    individual.middleName = middleName;
    individual.namePrefix =
      nameRecord?.children.find((c) => c.tag === "NPFX")?.value?.trim() ||
      undefined;
    individual.marriedName = marriedName;
    individual.sex =
      record.children.find((child) => child.tag === "SEX")?.value?.charAt(0) ||
      "U";
    individual.birthDate = this.parseDate(birth.date);
    individual.birthPlace = birth.place;
    individual.deathDate = this.parseDate(death.date);
    individual.deathPlace = death.place;
    individual.deathCause = death.cause;
    individual.burialPlace = burial.place;
    individual.occupation = this.childValue(record, "OCCU")?.trim() || undefined;
    individual.email = this.collectEmails(record);
    individual.retirementNote = this.collectRetirement(record);
    individual.extraEvents = this.collectExtraEvents(record);
    individual.biography = this.collectNotes(record);

    return individual;
  }

  private collectEmails(record: GedcomRecord): string | undefined {
    const emails: string[] = [];
    for (const resi of record.children.filter((c) => c.tag === "RESI")) {
      for (const child of resi.children) {
        if (child.tag !== "EMAIL" || !child.value) continue;
        const email = child.value.replace(/@@/g, "@").trim();
        if (email && !emails.includes(email)) emails.push(email);
      }
    }
    return emails.length ? emails.join("; ") : undefined;
  }

  private collectRetirement(record: GedcomRecord): string | undefined {
    const reti = record.children.find((c) => c.tag === "RETI");
    if (!reti) return undefined;
    const value = reti.value?.trim() || "";
    const date = this.childValue(reti, "DATE")?.trim();
    if (!value && !date) return undefined;
    if (value && date) return `${value} (${date})`;
    return value || date;
  }

  private collectExtraEvents(record: GedcomRecord): string | undefined {
    const lines: string[] = [];
    for (const even of record.children.filter((c) => c.tag === "EVEN")) {
      const type = this.childValue(even, "TYPE")?.trim();
      const value = even.value?.trim() || this.childValue(even, "NOTE")?.trim();
      const cleaned = value ? this.stripSimpleHtml(value) : "";
      if (!type && !cleaned) continue;
      lines.push(type && cleaned ? `${type}: ${cleaned}` : type || cleaned);
    }
    return lines.length ? lines.join("\n") : undefined;
  }

  /** Flatten INDI NOTE values (strip simple HTML from MyHeritage). */
  private collectNotes(record: GedcomRecord): string | undefined {
    const notes = record.children
      .filter((child) => child.tag === "NOTE" && child.value)
      .map((child) => this.stripSimpleHtml(child.value!))
      .filter((text) => text.length > 0);
    if (notes.length === 0) return undefined;
    return notes.join("\n\n");
  }

  private stripSimpleHtml(value: string): string {
    return value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/&nbsp;/gi, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /** Merge repeated BIRT/DEAT/BURI blocks (e.g. MyHeritage: date in one, fuller place in another). */
  private mergeEventFacts(records: GedcomRecord[]): {
    date?: string;
    place?: string;
    cause?: string;
  } {
    let date: string | undefined;
    let place: string | undefined;
    let cause: string | undefined;

    for (const record of records) {
      const nextDate = this.childValue(record, "DATE");
      const nextPlace = this.childValue(record, "PLAC");
      const nextCause = this.childValue(record, "CAUS");
      if (!date && nextDate) {
        date = nextDate;
      }
      if (nextPlace && (!place || nextPlace.length > place.length)) {
        place = nextPlace;
      }
      if (nextCause && (!cause || nextCause.length > cause.length)) {
        cause = nextCause;
      }
    }

    return { date, place, cause };
  }

  private mapFamily(record: GedcomRecord): FamilyImportRecord {
    const xref =
      this.cleanXref(record.xref) || GedcomParserUtils.generateGedcomId("FAM");
    const marriage = record.children.find((child) => child.tag === "MARR");
    const divorce = record.children.find((child) => child.tag === "DIV");

    return {
      id: xref,
      gedcomId: xref,
      husbandId: this.cleanXref(
        record.children.find((child) => child.tag === "HUSB")?.value
      ),
      wifeId: this.cleanXref(
        record.children.find((child) => child.tag === "WIFE")?.value
      ),
      childrenIds: record.children
        .filter((child) => child.tag === "CHIL")
        .map((child) => this.cleanXref(child.value))
        .filter((id): id is string => Boolean(id)),
      marriageDate: this.parseDate(this.childValue(marriage, "DATE"))
        ?.toISOString()
        .split("T")[0],
      divorceDate: this.parseDate(this.childValue(divorce, "DATE"))
        ?.toISOString()
        .split("T")[0],
    };
  }

  private childValue(
    parent: GedcomRecord | undefined,
    tag: string
  ): string | undefined {
    return parent?.children.find((child) => child.tag === tag)?.value;
  }

  private cleanXref(value?: string): string | undefined {
    if (!value) return undefined;
    return value.replace(/@/g, "").trim() || undefined;
  }

  private parseDate(value?: string): Date | undefined {
    if (!value) return undefined;
    const normalized = GedcomParserUtils.normalizeGedcomDate(value);
    return normalized ? new Date(normalized) : undefined;
  }

  private async importToNeo4j(
    treeId: string,
    individuals: Individual[],
    families: FamilyImportRecord[]
  ): Promise<{ individuals: number; families: number }> {
    const queries: Array<{ query: string; params?: Record<string, unknown> }> =
      [];

    for (const ind of individuals) {
      queries.push({
        query: `
          MERGE (i:Individual {id: $id, treeId: $treeId})
          SET i += $properties
        `,
        params: {
          id: ind.id,
          treeId,
          properties: {
            gedcomId: ind.gedcomId,
            treeId,
            firstName: ind.firstName,
            lastName: ind.lastName,
            middleName: ind.middleName || null,
            sex: ind.sex,
            birthDate: ind.birthDate ? ind.birthDate.toISOString() : null,
            deathDate: ind.deathDate ? ind.deathDate.toISOString() : null,
            birthPlace: ind.birthPlace || null,
            deathPlace: ind.deathPlace || null,
            deathCause: ind.deathCause || null,
            burialPlace: ind.burialPlace || null,
            occupation: ind.occupation || null,
            retirementNote: ind.retirementNote || null,
            email: ind.email || null,
            namePrefix: ind.namePrefix || null,
            marriedName: ind.marriedName || null,
            biography: ind.biography || null,
            extraEvents: ind.extraEvents || null,
          },
        },
      });

      if (ind.birthDate) {
        queries.push(
          await this.eventService.createEventQuery(
            treeId,
            ind.id,
            EventType.BIRTH,
            ind.birthDate.toISOString(),
            ind.birthPlace
          )
        );
      }
      if (ind.deathDate) {
        queries.push(
          await this.eventService.createEventQuery(
            treeId,
            ind.id,
            EventType.DEATH,
            ind.deathDate.toISOString(),
            ind.deathPlace
          )
        );
      }
    }

    for (const fam of families) {
      queries.push({
        query: `
          MERGE (f:Family {id: $id, treeId: $treeId})
          SET f += $properties
        `,
        params: {
          id: fam.id,
          treeId,
          properties: {
            gedcomId: fam.gedcomId,
            treeId,
            marriageDate: fam.marriageDate || null,
            divorceDate: fam.divorceDate || null,
          },
        },
      });

      if (fam.husbandId) {
        queries.push({
          query: `
            MATCH (i:Individual {id: $indId, treeId: $treeId})
            MATCH (f:Family {id: $famId, treeId: $treeId})
            MERGE (i)-[:HUSBAND]->(f)
          `,
          params: { indId: fam.husbandId, famId: fam.id, treeId },
        });
      }

      if (fam.wifeId) {
        queries.push({
          query: `
            MATCH (i:Individual {id: $indId, treeId: $treeId})
            MATCH (f:Family {id: $famId, treeId: $treeId})
            MERGE (i)-[:WIFE]->(f)
          `,
          params: { indId: fam.wifeId, famId: fam.id, treeId },
        });
      }

      for (const childId of fam.childrenIds || []) {
        queries.push({
          query: `
            MATCH (i:Individual {id: $indId, treeId: $treeId})
            MATCH (f:Family {id: $famId, treeId: $treeId})
            MERGE (i)-[:CHILD]->(f)
          `,
          params: { indId: childId, famId: fam.id, treeId },
        });
      }
    }

    await this.neo4jService.executeTransaction(queries);
    this.logger.log(
      `Imported ${individuals.length} individuals and ${families.length} families`
    );

    return {
      individuals: individuals.length,
      families: families.length,
    };
  }

  private parseName(name: string): [string, string] {
    const parts = name.split("/");
    return [parts[0].trim() || "Unknown", parts[1]?.trim() || ""];
  }
}
