import { Injectable } from "@nestjs/common";
import { Node, Record as Neo4jRecord } from "neo4j-driver";
import { Neo4jResultUtils } from "../../../common/utils/neo4j-result.utils";
import { Neo4jService } from "../../../neo4j/neo4j.service";
import { Family, Individual } from "../entities";
import { buildGedcomFile, serializeGedcomFile } from "./gedcom-export.mapper";

type FamilyWithTreeId = Family & { treeId?: string | null };

@Injectable()
export class GedcomExportService {
  constructor(private readonly neo4jService: Neo4jService) {}

  async exportTree(treeId: string): Promise<string> {
    const individuals = await this.loadIndividuals(treeId);
    const families = await this.loadFamilies(treeId);

    return serializeGedcomFile(buildGedcomFile({ individuals, families }));
  }

  private async loadIndividuals(treeId: string): Promise<Individual[]> {
    const result = await this.neo4jService.read(
      `
      MATCH (i:Individual {treeId: $treeId})
      RETURN i
      ORDER BY i.lastName, i.firstName, i.id
      `,
      { treeId }
    );

    return result.records
      .map((record) => this.normalizeIndividual(record.get("i")))
      .filter((individual): individual is Individual => individual !== null);
  }

  private async loadFamilies(treeId: string): Promise<Family[]> {
    const result = await this.neo4jService.read(
      `
      MATCH (f:Family)
      WHERE f.treeId = $treeId OR f.treeId IS NULL
      OPTIONAL MATCH (h:Individual {treeId: $treeId})-[:HUSBAND]->(f)
      OPTIONAL MATCH (w:Individual {treeId: $treeId})-[:WIFE]->(f)
      OPTIONAL MATCH (c:Individual {treeId: $treeId})-[:CHILD]->(f)
      WITH f, h AS husband, w AS wife, collect(DISTINCT c) AS children
      WHERE f.treeId = $treeId
        OR husband IS NOT NULL
        OR wife IS NOT NULL
        OR size(children) > 0
      RETURN f, husband, wife, children
      `,
      { treeId }
    );

    return result.records
      .map((record) => this.normalizeFamilyRecord(record, treeId))
      .filter((family): family is Family => family !== null);
  }

  private normalizeFamilyRecord(
    record: Neo4jRecord,
    treeId: string
  ): Family | null {
    const family = this.normalizeFamily(record.get("f"));
    if (!family) return null;

    family.husband = this.normalizeIndividual(record.get("husband")) ?? undefined;
    family.wife = this.normalizeIndividual(record.get("wife")) ?? undefined;
    family.children = this.normalizeChildren(record.get("children"));

    return this.familyTouchesTree(family, treeId) ? family : null;
  }

  private normalizeChildren(value: unknown): Individual[] {
    if (!Array.isArray(value)) return [];

    return value
      .map((child) => this.normalizeIndividual(child))
      .filter((child): child is Individual => child !== null);
  }

  private normalizeFamily(value: unknown): FamilyWithTreeId | null {
    const normalized = this.normalizeValue<Partial<FamilyWithTreeId>>(value);
    return normalized ? Object.assign(new Family(), normalized) : null;
  }

  private normalizeIndividual(value: unknown): Individual | null {
    if (this.isNeo4jNode(value)) return Individual.fromNeo4j(value);

    const normalized = this.normalizeValue<Partial<Individual>>(value);
    return normalized ? Object.assign(new Individual(), normalized) : null;
  }

  private normalizeValue<T>(value: unknown): T | null {
    return Neo4jResultUtils.normalizeValue(value) as T | null;
  }

  private familyTouchesTree(family: FamilyWithTreeId, treeId: string): boolean {
    return (
      family.treeId === treeId ||
      Boolean(family.husband) ||
      Boolean(family.wife) ||
      Boolean(family.children?.length)
    );
  }

  private isNeo4jNode(value: unknown): value is Node {
    return (
      typeof value === "object" &&
      value !== null &&
      "identity" in value &&
      "labels" in value &&
      "properties" in value
    );
  }
}
