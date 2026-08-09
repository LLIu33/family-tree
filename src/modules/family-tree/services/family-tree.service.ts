import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Neo4jService } from "../../../neo4j/neo4j.service";
import { Individual, Family } from "../entities";
import {
  CreateIndividualDto,
  CreateFamilyDto,
  CreateRelationshipDto,
} from "../dto";
import { RelationType } from "../enums/relation-type.enum";
import { Neo4jResultUtils } from "../../../common/utils/neo4j-result.utils";
import { GedcomParserUtils } from "../../../common/utils/gedcom-parser.utils";
import { Sex } from "../enums/sex.enum";

const MAX_GENERATIONS = 10;

@Injectable()
export class FamilyTreeService {
  private readonly logger = new Logger(FamilyTreeService.name);

  constructor(private readonly neo4jService: Neo4jService) {}

  async createIndividual(
    createIndividualDto: CreateIndividualDto
  ): Promise<Individual> {
    const individualId =
      createIndividualDto.gedcomId ||
      GedcomParserUtils.generateGedcomId("INDI");

    const query = `
      CREATE (i:Individual {
        id: $id,
        gedcomId: $gedcomId,
        firstName: $firstName,
        lastName: $lastName,
        sex: $sex,
        birthDate: $birthDate,
        deathDate: $deathDate,
        birthPlace: $birthPlace,
        deathPlace: $deathPlace,
        occupation: $occupation,
        createdAt: datetime()
      })
      RETURN i
    `;

    const params = {
      id: individualId,
      gedcomId: individualId,
      ...createIndividualDto,
    };

    const result = await this.neo4jService.write(query, params);
    return Neo4jResultUtils.getFirstResult<Individual>(result.records)!;
  }

  async getIndividual(id: string): Promise<Individual | null> {
    const query = `
      MATCH (i:Individual {id: $id})
      OPTIONAL MATCH (i)-[r]->(related)
      RETURN i,
             collect({type: type(r), node: related}) as relationships
    `;

    const result = await this.neo4jService.read(query, { id });
    if (result.records.length === 0) return null;

    const record = result.records[0];
    const individual = Neo4jResultUtils.normalizeValue(
      record.get("i")
    ) as Individual;
    (individual as Individual & { relationships: unknown }).relationships =
      record.get("relationships").map((rel: { type: string; node: unknown }) => ({
        type: rel.type,
        node: Neo4jResultUtils.normalizeValue(rel.node),
      }));

    return individual;
  }

  async createFamily(createFamilyDto: CreateFamilyDto): Promise<Family> {
    const familyId =
      createFamilyDto.gedcomId || GedcomParserUtils.generateGedcomId("FAM");

    const queries: Array<{ query: string; params?: Record<string, unknown> }> =
      [
        {
          query: `
            CREATE (f:Family {
              id: $id,
              gedcomId: $gedcomId,
              marriageDate: $marriageDate,
              divorceDate: $divorceDate,
              marriagePlace: $marriagePlace,
              createdAt: datetime()
            })
            RETURN f
          `,
          params: {
            id: familyId,
            gedcomId: familyId,
            marriageDate: createFamilyDto.marriageDate || null,
            divorceDate: createFamilyDto.divorceDate || null,
            marriagePlace: createFamilyDto.marriagePlace || null,
          },
        },
      ];

    if (createFamilyDto.husbandId) {
      queries.push({
        query: `
          MATCH (i:Individual {id: $indId})
          MATCH (f:Family {id: $famId})
          MERGE (i)-[:HUSBAND]->(f)
        `,
        params: { indId: createFamilyDto.husbandId, famId: familyId },
      });
    }

    if (createFamilyDto.wifeId) {
      queries.push({
        query: `
          MATCH (i:Individual {id: $indId})
          MATCH (f:Family {id: $famId})
          MERGE (i)-[:WIFE]->(f)
        `,
        params: { indId: createFamilyDto.wifeId, famId: familyId },
      });
    }

    for (const childId of createFamilyDto.childrenIds || []) {
      queries.push({
        query: `
          MATCH (i:Individual {id: $indId})
          MATCH (f:Family {id: $famId})
          MERGE (i)-[:CHILD]->(f)
        `,
        params: { indId: childId, famId: familyId },
      });
    }

    await this.neo4jService.executeTransaction(queries);
    const family = await this.getFamily(familyId);
    if (!family) {
      throw new NotFoundException(`Family ${familyId} was not created`);
    }
    return family;
  }

  async getFamily(id: string): Promise<Family | null> {
    const query = `
      MATCH (f:Family {id: $id})
      OPTIONAL MATCH (husband:Individual)-[:HUSBAND]->(f)
      OPTIONAL MATCH (wife:Individual)-[:WIFE]->(f)
      OPTIONAL MATCH (child:Individual)-[:CHILD]->(f)
      RETURN f,
             husband,
             wife,
             collect(DISTINCT child) as children
    `;

    const result = await this.neo4jService.read(query, { id });
    if (result.records.length === 0) return null;

    const record = result.records[0];
    const family = Neo4jResultUtils.normalizeValue(record.get("f")) as Family;
    family.husband = Neo4jResultUtils.normalizeValue(record.get("husband"));
    family.wife = Neo4jResultUtils.normalizeValue(record.get("wife"));
    family.children = record
      .get("children")
      .filter((child: unknown) => child != null)
      .map((child: unknown) => Neo4jResultUtils.normalizeValue(child));

    return family;
  }

  async createRelationship(
    createRelationshipDto: CreateRelationshipDto
  ): Promise<boolean> {
    const { fromIndividualId, toIndividualId, relationshipType } =
      createRelationshipDto;

    if (!relationshipType) {
      throw new BadRequestException("relationshipType is required");
    }

    switch (relationshipType) {
      case RelationType.PARENT:
        await this.linkParentChild(fromIndividualId, toIndividualId);
        return true;
      case RelationType.CHILD:
        await this.linkParentChild(toIndividualId, fromIndividualId);
        return true;
      case RelationType.SPOUSE:
      case RelationType.MARRIED:
      case RelationType.PARTNER:
        await this.linkSpouses(fromIndividualId, toIndividualId);
        return true;
      case RelationType.SIBLING:
        await this.linkSiblings(fromIndividualId, toIndividualId);
        return true;
      default:
        throw new BadRequestException(
          `Unsupported relationship type: ${relationshipType}`
        );
    }
  }

  async getAncestors(
    individualId: string,
    generations: number = 3
  ): Promise<Individual[]> {
    const maxGen = this.clampGenerations(generations);
    const found = new Map<string, Individual>();
    let frontier = [individualId];

    for (let depth = 0; depth < maxGen; depth++) {
      if (frontier.length === 0) break;
      const parents = await this.getParentsOfMany(frontier);
      frontier = [];
      for (const parent of parents) {
        if (!found.has(parent.id)) {
          found.set(parent.id, parent);
          frontier.push(parent.id);
        }
      }
    }

    return Array.from(found.values());
  }

  async getDescendants(
    individualId: string,
    generations: number = 3
  ): Promise<Individual[]> {
    const maxGen = this.clampGenerations(generations);
    const found = new Map<string, Individual>();
    let frontier = [individualId];

    for (let depth = 0; depth < maxGen; depth++) {
      if (frontier.length === 0) break;
      const children = await this.getChildrenOfMany(frontier);
      frontier = [];
      for (const child of children) {
        if (!found.has(child.id)) {
          found.set(child.id, child);
          frontier.push(child.id);
        }
      }
    }

    return Array.from(found.values());
  }

  async visualizeTree(
    rootId: string,
    depth: number = 3
  ): Promise<{
    nodes: Individual[];
    relationships: Array<{
      source: string;
      target: string;
      type: string;
      familyId: string;
    }>;
  }> {
    const maxDepth = this.clampGenerations(depth);
    const root = await this.getIndividual(rootId);
    if (!root) {
      return { nodes: [], relationships: [] };
    }

    const nodes = new Map<string, Individual>([[root.id, root]]);
    const relationships: Array<{
      source: string;
      target: string;
      type: string;
      familyId: string;
    }> = [];
    const seenRel = new Set<string>();

    let frontier = [rootId];
    for (let level = 0; level < maxDepth; level++) {
      if (frontier.length === 0) break;

      const familyRows = await this.getFamilyLinksForIndividuals(frontier);
      const nextFrontier: string[] = [];

      for (const row of familyRows) {
        const relKey = `${row.individualId}:${row.type}:${row.familyId}`;
        if (!seenRel.has(relKey)) {
          seenRel.add(relKey);
          relationships.push({
            source: row.individualId,
            target: row.familyId,
            type: row.type,
            familyId: row.familyId,
          });
        }

        for (const member of row.members) {
          if (!nodes.has(member.id)) {
            nodes.set(member.id, member);
            nextFrontier.push(member.id);
          }
        }
      }

      frontier = nextFrontier;
    }

    return {
      nodes: Array.from(nodes.values()),
      relationships,
    };
  }

  async findPossibleRelationships(
    individualId1: string,
    individualId2: string
  ): Promise<{ path: string[]; degree: number; types: string[] }[]> {
    const query = `
      MATCH path = shortestPath(
        (i1:Individual {id: $id1})-[:HUSBAND|WIFE|CHILD*1..20]-(i2:Individual {id: $id2})
      )
      RETURN [n IN nodes(path) WHERE n:Individual | n.id] as path,
             length(path) as degree,
             [r IN relationships(path) | type(r)] as types
    `;

    const result = await this.neo4jService.read(query, {
      id1: individualId1,
      id2: individualId2,
    });

    return result.records.map((record) => ({
      path: record.get("path"),
      degree: record.get("degree"),
      types: record.get("types"),
    }));
  }

  private clampGenerations(generations: number): number {
    if (!Number.isFinite(generations) || generations < 1) {
      return 1;
    }
    return Math.min(Math.floor(generations), MAX_GENERATIONS);
  }

  private spouseRoleForSex(sex?: string): "HUSBAND" | "WIFE" {
    return sex === Sex.FEMALE || sex === "F" ? "WIFE" : "HUSBAND";
  }

  private async linkParentChild(
    parentId: string,
    childId: string
  ): Promise<void> {
    const parent = await this.getIndividual(parentId);
    const child = await this.getIndividual(childId);
    if (!parent || !child) {
      throw new NotFoundException("Parent or child individual not found");
    }

    const role = this.spouseRoleForSex(parent.sex as string);
    const existingFamilyId = await this.findSharedParentChildFamily(
      parentId,
      childId
    );
    if (existingFamilyId) {
      return;
    }

    const childFamilyId = await this.findChildFamilyId(childId);
    if (childFamilyId) {
      await this.neo4jService.write(
        `
          MATCH (parent:Individual {id: $parentId})
          MATCH (f:Family {id: $familyId})
          MERGE (parent)-[:${role}]->(f)
        `,
        { parentId, familyId: childFamilyId }
      );
      return;
    }

    const parentFamilyId = await this.findSpouseFamilyId(parentId);
    if (parentFamilyId) {
      await this.neo4jService.write(
        `
          MATCH (child:Individual {id: $childId})
          MATCH (f:Family {id: $familyId})
          MERGE (child)-[:CHILD]->(f)
        `,
        { childId, familyId: parentFamilyId }
      );
      return;
    }

    const familyId = GedcomParserUtils.generateGedcomId("FAM");
    await this.neo4jService.executeTransaction([
      {
        query: `
          CREATE (f:Family {
            id: $familyId,
            gedcomId: $familyId,
            createdAt: datetime()
          })
        `,
        params: { familyId },
      },
      {
        query: `
          MATCH (parent:Individual {id: $parentId})
          MATCH (child:Individual {id: $childId})
          MATCH (f:Family {id: $familyId})
          MERGE (parent)-[:${role}]->(f)
          MERGE (child)-[:CHILD]->(f)
        `,
        params: { parentId, childId, familyId },
      },
    ]);
  }

  private async linkSpouses(aId: string, bId: string): Promise<void> {
    const a = await this.getIndividual(aId);
    const b = await this.getIndividual(bId);
    if (!a || !b) {
      throw new NotFoundException("One or both individuals not found");
    }

    const shared = await this.findSharedSpouseFamily(aId, bId);
    if (shared) {
      return;
    }

    const aFamily = await this.findSpouseFamilyId(aId);
    const bFamily = await this.findSpouseFamilyId(bId);
    const roleA = this.spouseRoleForSex(a.sex as string);
    const roleB = this.spouseRoleForSex(b.sex as string);

    if (aFamily && roleA !== roleB) {
      await this.neo4jService.write(
        `
          MATCH (b:Individual {id: $bId})
          MATCH (f:Family {id: $familyId})
          MERGE (b)-[:${roleB}]->(f)
        `,
        { bId, familyId: aFamily }
      );
      return;
    }

    if (bFamily && roleA !== roleB) {
      await this.neo4jService.write(
        `
          MATCH (a:Individual {id: $aId})
          MATCH (f:Family {id: $familyId})
          MERGE (a)-[:${roleA}]->(f)
        `,
        { aId, familyId: bFamily }
      );
      return;
    }

    const familyId = GedcomParserUtils.generateGedcomId("FAM");
    await this.neo4jService.executeTransaction([
      {
        query: `
          CREATE (f:Family {
            id: $familyId,
            gedcomId: $familyId,
            createdAt: datetime()
          })
        `,
        params: { familyId },
      },
      {
        query: `
          MATCH (a:Individual {id: $aId})
          MATCH (b:Individual {id: $bId})
          MATCH (f:Family {id: $familyId})
          MERGE (a)-[:${roleA}]->(f)
          MERGE (b)-[:${roleB}]->(f)
        `,
        params: { aId, bId, familyId },
      },
    ]);
  }

  private async linkSiblings(aId: string, bId: string): Promise<void> {
    const a = await this.getIndividual(aId);
    const b = await this.getIndividual(bId);
    if (!a || !b) {
      throw new NotFoundException("One or both individuals not found");
    }

    const shared = await this.findSharedChildFamily(aId, bId);
    if (shared) {
      return;
    }

    const aFamily = await this.findChildFamilyId(aId);
    if (aFamily) {
      await this.neo4jService.write(
        `
          MATCH (b:Individual {id: $bId})
          MATCH (f:Family {id: $familyId})
          MERGE (b)-[:CHILD]->(f)
        `,
        { bId, familyId: aFamily }
      );
      return;
    }

    const bFamily = await this.findChildFamilyId(bId);
    if (bFamily) {
      await this.neo4jService.write(
        `
          MATCH (a:Individual {id: $aId})
          MATCH (f:Family {id: $familyId})
          MERGE (a)-[:CHILD]->(f)
        `,
        { aId, familyId: bFamily }
      );
      return;
    }

    const familyId = GedcomParserUtils.generateGedcomId("FAM");
    await this.neo4jService.executeTransaction([
      {
        query: `
          CREATE (f:Family {
            id: $familyId,
            gedcomId: $familyId,
            createdAt: datetime()
          })
        `,
        params: { familyId },
      },
      {
        query: `
          MATCH (a:Individual {id: $aId})
          MATCH (b:Individual {id: $bId})
          MATCH (f:Family {id: $familyId})
          MERGE (a)-[:CHILD]->(f)
          MERGE (b)-[:CHILD]->(f)
        `,
        params: { aId, bId, familyId },
      },
    ]);
  }

  private async findSharedParentChildFamily(
    parentId: string,
    childId: string
  ): Promise<string | null> {
    const result = await this.neo4jService.read(
      `
        MATCH (parent:Individual {id: $parentId})-[:HUSBAND|WIFE]->(f:Family)
              <-[:CHILD]-(child:Individual {id: $childId})
        RETURN f.id AS familyId
        LIMIT 1
      `,
      { parentId, childId }
    );
    return result.records[0]?.get("familyId") ?? null;
  }

  private async findSharedSpouseFamily(
    aId: string,
    bId: string
  ): Promise<string | null> {
    const result = await this.neo4jService.read(
      `
        MATCH (a:Individual {id: $aId})-[:HUSBAND|WIFE]->(f:Family)
              <-[:HUSBAND|WIFE]-(b:Individual {id: $bId})
        RETURN f.id AS familyId
        LIMIT 1
      `,
      { aId, bId }
    );
    return result.records[0]?.get("familyId") ?? null;
  }

  private async findSharedChildFamily(
    aId: string,
    bId: string
  ): Promise<string | null> {
    const result = await this.neo4jService.read(
      `
        MATCH (a:Individual {id: $aId})-[:CHILD]->(f:Family)
              <-[:CHILD]-(b:Individual {id: $bId})
        RETURN f.id AS familyId
        LIMIT 1
      `,
      { aId, bId }
    );
    return result.records[0]?.get("familyId") ?? null;
  }

  private async findChildFamilyId(individualId: string): Promise<string | null> {
    const result = await this.neo4jService.read(
      `
        MATCH (i:Individual {id: $individualId})-[:CHILD]->(f:Family)
        RETURN f.id AS familyId
        LIMIT 1
      `,
      { individualId }
    );
    return result.records[0]?.get("familyId") ?? null;
  }

  private async findSpouseFamilyId(individualId: string): Promise<string | null> {
    const result = await this.neo4jService.read(
      `
        MATCH (i:Individual {id: $individualId})-[:HUSBAND|WIFE]->(f:Family)
        RETURN f.id AS familyId
        LIMIT 1
      `,
      { individualId }
    );
    return result.records[0]?.get("familyId") ?? null;
  }

  private async getParentsOfMany(ids: string[]): Promise<Individual[]> {
    const result = await this.neo4jService.read(
      `
        MATCH (child:Individual)-[:CHILD]->(:Family)<-[:HUSBAND|WIFE]-(parent:Individual)
        WHERE child.id IN $ids
        RETURN DISTINCT parent
      `,
      { ids }
    );
    return result.records.map((record) =>
      Neo4jResultUtils.normalizeValue(record.get("parent"))
    );
  }

  private async getChildrenOfMany(ids: string[]): Promise<Individual[]> {
    const result = await this.neo4jService.read(
      `
        MATCH (parent:Individual)-[:HUSBAND|WIFE]->(:Family)<-[:CHILD]-(child:Individual)
        WHERE parent.id IN $ids
        RETURN DISTINCT child
      `,
      { ids }
    );
    return result.records.map((record) =>
      Neo4jResultUtils.normalizeValue(record.get("child"))
    );
  }

  private async getFamilyLinksForIndividuals(ids: string[]): Promise<
    Array<{
      individualId: string;
      familyId: string;
      type: string;
      members: Individual[];
    }>
  > {
    const result = await this.neo4jService.read(
      `
        MATCH (i:Individual)-[r:HUSBAND|WIFE|CHILD]->(f:Family)
        WHERE i.id IN $ids
        OPTIONAL MATCH (member:Individual)-[:HUSBAND|WIFE|CHILD]->(f)
        WHERE member.id <> i.id
        RETURN i.id AS individualId,
               f.id AS familyId,
               type(r) AS type,
               collect(DISTINCT member) AS members
      `,
      { ids }
    );

    return result.records.map((record) => ({
      individualId: record.get("individualId"),
      familyId: record.get("familyId"),
      type: record.get("type"),
      members: record
        .get("members")
        .filter((member: unknown) => member != null)
        .map((member: unknown) => Neo4jResultUtils.normalizeValue(member)),
    }));
  }
}
