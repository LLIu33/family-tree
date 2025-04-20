import { Injectable, Logger } from "@nestjs/common";
import { Place, People, Act, Identificator, GEDCOM, ReadGed } from "gedcom-ts";
import { GEDCOMValidationError } from "../errors/gedcom-validation.error";
import { Individual, Family } from "../entities";
import { generateGedcomId } from "../../common/utils/gedcom-parser.utils";
import { EventService } from "./event.service";
import { Neo4jService } from "../../../neo4j/neo4j.service";

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
      // Парсинг GEDCOM с помощью gedcom-ts
      const gedcom = new ReadGed(gedcomText);

      // Валидация версии
      this.validateVersion(gedcom);

      // Извлечение и преобразование данных
      const { individuals, families, errors } = this.extractData(gedcom);

      if (errors.length > 0) {
        throw new GEDCOMValidationError(errors, {
          fileName: "import.ged",
          source,
          size: gedcomText.length,
          encoding: "UTF-8",
        });
      }

      // Импорт в Neo4j
      return await this.importToNeo4j(individuals, families);
    } catch (error) {
      this.logger.error("GEDCOM parsing failed", error.stack);
      throw new GEDCOMValidationError(
        [{ type: "PARSE_ERROR", message: error.message }],
        { fileName: "import.ged", size: gedcomText.length, encoding: "UTF-8" }
      );
    }
  }

  private validateVersion(gedcom: GEDCOM) {
    const header = gedcom.getHeader();
    const version = header?.getVersion()?.getValue();

    if (!version || !this.SUPPORTED_VERSIONS.includes(version)) {
      throw new Error(
        `Unsupported GEDCOM version: ${version}. Supported versions: ${this.SUPPORTED_VERSIONS.join(
          ", "
        )}`
      );
    }
  }

  private extractData(gedcom: GEDCOM): {
    individuals: Individual[];
    families: Family[];
    errors: any[];
  } {
    const individuals: Individual[] = [];
    const families: Family[] = [];
    const errors: any[] = [];

    // Обработка индивидов
    gedcom.getPeople().forEach((person: People) => {
      try {
        individuals.push(this.mapIndividual(person));
      } catch (error) {
        errors.push({
          type: "INDIVIDUAL_PARSE_ERROR",
          message: error.message,
          xref: person.getId()?.getValue(),
        });
      }
    });

    // Обработка семей
    gedcom.getFamilies().forEach((family: Act) => {
      try {
        families.push(this.mapFamily(family));
      } catch (error) {
        errors.push({
          type: "FAMILY_PARSE_ERROR",
          message: error.message,
          xref: family.getId()?.getValue(),
        });
      }
    });

    return { individuals, families, errors };
  }

  private mapIndividual(person: People): Individual {
    const xref = person.getId()?.getValue() || generateGedcomId("individual");
    const name = person.getName();
    const [firstName, lastName] = this.parseName(
      name?.getValue() || "Unknown /Unknown/"
    );

    const individual: Individual = {
      id: xref,
      gedcomId: xref,
      firstName,
      lastName,
      sex: person.getSex()?.getValue()?.charAt(0) || "U",
      birthDate: this.getEventDate(person.getBirth()),
      birthPlace: this.getEventPlace(person.getBirth()),
      deathDate: this.getEventDate(person.getDeath()),
      deathPlace: this.getEventPlace(person.getDeath()),
    };

    return individual;
  }

  private mapFamily(family: Act): Family {
    const xref = family.getId()?.getValue() || generateGedcomId("family");
    const marriage = family.getMarriage();

    return {
      id: xref,
      gedcomId: xref,
      husbandId: family.getHusband()?.getValue()?.replace("@", ""),
      wifeId: family.getWife()?.getValue()?.replace("@", ""),
      childrenIds: family
        .getChildren()
        .map((child) => child.getValue()?.replace("@", "")),
      marriageDate: this.getEventDate(marriage),
      divorceDate: this.getEventDate(family.getDivorce()),
    };
  }

  private getEventDate(event: any): string | undefined {
    return event?.getDate()?.getValue();
  }

  private getEventPlace(event: any): string | undefined {
    return event?.getPlace()?.getValue();
  }

  private async importToNeo4j(
    individuals: Individual[],
    families: Family[]
  ): Promise<{ individuals: number; families: number }> {
    const queries = [];

    // Импорт индивидов
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
            birthDate: ind.birthDate,
            deathDate: ind.deathDate,
          },
        },
      });

      // Импорт событий индивида
      if (ind.birthDate) {
        queries.push(
          await this.eventService.createEventQuery(
            ind.id,
            "BIRT",
            ind.birthDate,
            ind.birthPlace
          )
        );
      }
      if (ind.deathDate) {
        queries.push(
          await this.eventService.createEventQuery(
            ind.id,
            "DEAT",
            ind.deathDate,
            ind.deathPlace
          )
        );
      }
    }

    // Импорт семей
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
            marriageDate: fam.marriageDate,
            divorceDate: fam.divorceDate,
          },
        },
      });

      // Связи членов семьи
      if (fam.husbandId) {
        queries.push({
          query: `
            MATCH (i:Individual {id: $indId})
            MATCH (f:Family {id: $famId})
            MERGE (i)-[:FAMILY_MEMBER {role: "HUSBAND"}]->(f)
            MERGE (f)-[:HAS_MEMBER {role: "HUSBAND"}]->(i)
          `,
          params: { indId: fam.husbandId, famId: fam.id },
        });
      }

      if (fam.wifeId) {
        queries.push({
          query: `
            MATCH (i:Individual {id: $indId})
            MATCH (f:Family {id: $famId})
            MERGE (i)-[:FAMILY_MEMBER {role: "WIFE"}]->(f)
            MERGE (f)-[:HAS_MEMBER {role: "WIFE"}]->(i)
          `,
          params: { indId: fam.wifeId, famId: fam.id },
        });
      }

      for (const childId of fam.childrenIds) {
        if (!childId) continue;
        queries.push({
          query: `
            MATCH (i:Individual {id: $indId})
            MATCH (f:Family {id: $famId})
            MERGE (i)-[:FAMILY_MEMBER {role: "CHILD"}]->(f)
            MERGE (f)-[:HAS_MEMBER {role: "CHILD"}]->(i)
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
    // Обработка формата GEDCOM: First /Last/
    const parts = name.split("/");
    return [parts[0].trim() || "Unknown", parts[1].trim() || "Unknown"];
  }
}
