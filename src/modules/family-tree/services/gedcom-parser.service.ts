import { Injectable, Logger } from "@nestjs/common";
import { ReadGed } from "gedcom-ts";
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

/** gedcom-ts typings do not match the runtime API used here */
type GedcomDocument = any;
type GedcomPerson = any;
type GedcomFamily = any;

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
      const gedcom: GedcomDocument = new ReadGed(gedcomText);

      this.validateVersion(gedcom);

      const { individuals, families, errors } = this.extractData(gedcom);

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

  private validateVersion(gedcom: GedcomDocument) {
    const header = gedcom.getHeader?.();
    const version = header?.getVersion?.()?.getValue?.();

    if (!version || !this.SUPPORTED_VERSIONS.includes(version)) {
      throw new Error(
        `Unsupported GEDCOM version: ${version}. Supported versions: ${this.SUPPORTED_VERSIONS.join(
          ", "
        )}`
      );
    }
  }

  private extractData(gedcom: GedcomDocument): {
    individuals: Individual[];
    families: FamilyImportRecord[];
    errors: Array<{ type: string; message: string; xref?: string }>;
  } {
    const individuals: Individual[] = [];
    const families: FamilyImportRecord[] = [];
    const errors: Array<{ type: string; message: string; xref?: string }> = [];

    const people: GedcomPerson[] = gedcom.getPeople?.() || [];
    people.forEach((person: GedcomPerson) => {
      try {
        individuals.push(this.mapIndividual(person));
      } catch (error) {
        errors.push({
          type: "INDIVIDUAL_PARSE_ERROR",
          message: (error as Error).message,
          xref: person.getId?.()?.getValue?.(),
        });
      }
    });

    const gedcomFamilies: GedcomFamily[] = gedcom.getFamilies?.() || [];
    gedcomFamilies.forEach((family: GedcomFamily) => {
      try {
        families.push(this.mapFamily(family));
      } catch (error) {
        errors.push({
          type: "FAMILY_PARSE_ERROR",
          message: (error as Error).message,
          xref: family.getId?.()?.getValue?.(),
        });
      }
    });

    return { individuals, families, errors };
  }

  private mapIndividual(person: GedcomPerson): Individual {
    const xref =
      person.getId?.()?.getValue?.() ||
      GedcomParserUtils.generateGedcomId("INDI");
    const name = person.getName?.();
    const [firstName, lastName] = this.parseName(
      name?.getValue?.() || "Unknown /Unknown/"
    );

    const individual = new Individual();
    individual.id = xref;
    individual.gedcomId = xref;
    individual.firstName = firstName;
    individual.lastName = lastName;
    individual.sex = person.getSex?.()?.getValue?.()?.charAt(0) || "U";
    individual.birthDate = this.parseDate(
      this.getEventDate(person.getBirth?.())
    );
    individual.birthPlace = this.getEventPlace(person.getBirth?.());
    individual.deathDate = this.parseDate(
      this.getEventDate(person.getDeath?.())
    );
    individual.deathPlace = this.getEventPlace(person.getDeath?.());

    return individual;
  }

  private mapFamily(family: GedcomFamily): FamilyImportRecord {
    const xref =
      family.getId?.()?.getValue?.() ||
      GedcomParserUtils.generateGedcomId("FAM");
    const marriage = family.getMarriage?.();
    const children = family.getChildren?.() || [];

    return {
      id: xref,
      gedcomId: xref,
      husbandId: family.getHusband?.()?.getValue?.()?.replace(/@/g, ""),
      wifeId: family.getWife?.()?.getValue?.()?.replace(/@/g, ""),
      childrenIds: children
        .map((child: GedcomPerson) =>
          child.getValue?.()?.replace(/@/g, "")
        )
        .filter((id: string | undefined): id is string => Boolean(id)),
      marriageDate: this.getEventDate(marriage),
      divorceDate: this.getEventDate(family.getDivorce?.()),
    };
  }

  private getEventDate(event: unknown): string | undefined {
    return (event as { getDate?: () => { getValue?: () => string } })
      ?.getDate?.()
      ?.getValue?.();
  }

  private getEventPlace(event: unknown): string | undefined {
    return (event as { getPlace?: () => { getValue?: () => string } })
      ?.getPlace?.()
      ?.getValue?.();
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
