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

      return await this.importToNeo4j(individuals, families);
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
    const name =
      record.children.find((child) => child.tag === "NAME")?.value ||
      "Unknown /Unknown/";
    const [firstName, lastName] = this.parseName(name);
    const birth = record.children.find((child) => child.tag === "BIRT");
    const death = record.children.find((child) => child.tag === "DEAT");

    const individual = new Individual();
    individual.id = xref;
    individual.gedcomId = xref;
    individual.firstName = firstName;
    individual.lastName = lastName;
    individual.sex =
      record.children.find((child) => child.tag === "SEX")?.value?.charAt(0) ||
      "U";
    individual.birthDate = this.parseDate(this.childValue(birth, "DATE"));
    individual.birthPlace = this.childValue(birth, "PLAC");
    individual.deathDate = this.parseDate(this.childValue(death, "DATE"));
    individual.deathPlace = this.childValue(death, "PLAC");

    return individual;
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
      marriageDate: this.childValue(marriage, "DATE"),
      divorceDate: this.childValue(divorce, "DATE"),
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
    individuals: Individual[],
    families: FamilyImportRecord[]
  ): Promise<{ individuals: number; families: number }> {
    const queries: Array<{ query: string; params?: Record<string, unknown> }> =
      [];

    for (const ind of individuals) {
      queries.push({
        query: `
          MERGE (i:Individual {id: $id})
          SET i += $properties
        `,
        params: {
          id: ind.id,
          properties: {
            gedcomId: ind.gedcomId,
            firstName: ind.firstName,
            lastName: ind.lastName,
            sex: ind.sex,
            birthDate: ind.birthDate ? ind.birthDate.toISOString() : null,
            deathDate: ind.deathDate ? ind.deathDate.toISOString() : null,
            birthPlace: ind.birthPlace || null,
            deathPlace: ind.deathPlace || null,
          },
        },
      });

      if (ind.birthDate) {
        queries.push(
          await this.eventService.createEventQuery(
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
          MERGE (f:Family {id: $id})
          SET f += $properties
        `,
        params: {
          id: fam.id,
          properties: {
            gedcomId: fam.gedcomId,
            marriageDate: fam.marriageDate || null,
            divorceDate: fam.divorceDate || null,
          },
        },
      });

      if (fam.husbandId) {
        queries.push({
          query: `
            MATCH (i:Individual {id: $indId})
            MATCH (f:Family {id: $famId})
            MERGE (i)-[:HUSBAND]->(f)
          `,
          params: { indId: fam.husbandId, famId: fam.id },
        });
      }

      if (fam.wifeId) {
        queries.push({
          query: `
            MATCH (i:Individual {id: $indId})
            MATCH (f:Family {id: $famId})
            MERGE (i)-[:WIFE]->(f)
          `,
          params: { indId: fam.wifeId, famId: fam.id },
        });
      }

      for (const childId of fam.childrenIds || []) {
        queries.push({
          query: `
            MATCH (i:Individual {id: $indId})
            MATCH (f:Family {id: $famId})
            MERGE (i)-[:CHILD]->(f)
          `,
          params: { indId: childId, famId: fam.id },
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
    return [parts[0].trim() || "Unknown", parts[1]?.trim() || "Unknown"];
  }
}
