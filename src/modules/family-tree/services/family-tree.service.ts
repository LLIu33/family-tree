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
    treeId: string,
    createIndividualDto: CreateIndividualDto
  ): Promise<Individual> {
    const individualId =
      createIndividualDto.gedcomId ||
      GedcomParserUtils.generateGedcomId("INDI");

    const query = `
      CREATE (i:Individual {
        id: $id,
        treeId: $treeId,
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
      treeId,
      gedcomId: individualId,
      ...createIndividualDto,
    };

    const result = await this.neo4jService.write(query, params);
    return Neo4jResultUtils.getFirstResult<Individual>(result.records)!;
  }

  async searchIndividuals(
    treeId: string,
    queryText = "",
    limit = 20
  ): Promise<Individual[]> {
    await this.ensureTreeHasData(treeId);
    const capped = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const q = queryText.trim().toLowerCase();

    const result = await this.neo4jService.read(
      `
      MATCH (i:Individual {treeId: $treeId})
      WHERE $q = '' OR
        toLower(coalesce(i.firstName, '') + ' ' + coalesce(i.lastName, '')) CONTAINS $q OR
        toLower(coalesce(i.id, '')) CONTAINS $q OR
        toLower(coalesce(i.gedcomId, '')) CONTAINS $q
      RETURN i
      ORDER BY i.lastName, i.firstName
      LIMIT ${capped}
      `,
      { treeId, q }
    );

    return result.records.map(
      (record) =>
        Neo4jResultUtils.normalizeValue(record.get("i")) as Individual
    );
  }

  /**
   * Full graph for the user's tree (all people + parent/spouse edges).
   * If several disconnected components exist, returns the largest (first by size).
   */
  async getFullGraph(treeId: string): Promise<{
    nodes: Individual[];
    relationships: Array<{
      source: string;
      target: string;
      type: string;
      familyId: string;
    }>;
    rootId: string | null;
    componentCount: number;
  }> {
    await this.ensureTreeHasData(treeId);

    const peopleResult = await this.neo4jService.read(
      `
      MATCH (i:Individual {treeId: $treeId})
      RETURN i
      ORDER BY i.lastName, i.firstName, i.id
      `,
      { treeId }
    );
    const allNodes = peopleResult.records.map(
      (record) =>
        Neo4jResultUtils.normalizeValue(record.get("i")) as Individual
    );

    if (allNodes.length === 0) {
      return { nodes: [], relationships: [], rootId: null, componentCount: 0 };
    }

    const parentChildResult = await this.neo4jService.read(
      `
      MATCH (parent:Individual {treeId: $treeId})-[:HUSBAND|WIFE]->(f:Family)
            <-[:CHILD]-(child:Individual {treeId: $treeId})
      WHERE f.treeId = $treeId OR f.treeId IS NULL
      RETURN DISTINCT parent.id AS source, child.id AS target, f.id AS familyId
      `,
      { treeId }
    );

    const spouseResult = await this.neo4jService.read(
      `
      MATCH (a:Individual {treeId: $treeId})-[:HUSBAND|WIFE]->(f:Family)
            <-[:HUSBAND|WIFE]-(b:Individual {treeId: $treeId})
      WHERE (f.treeId = $treeId OR f.treeId IS NULL) AND a.id < b.id
      RETURN DISTINCT a.id AS source, b.id AS target, f.id AS familyId
      `,
      { treeId }
    );

    const allRels: Array<{
      source: string;
      target: string;
      type: string;
      familyId: string;
    }> = [
      ...parentChildResult.records.map((record) => ({
        source: record.get("source") as string,
        target: record.get("target") as string,
        type: "PARENT_CHILD",
        familyId: record.get("familyId") as string,
      })),
      ...spouseResult.records.map((record) => ({
        source: record.get("source") as string,
        target: record.get("target") as string,
        type: "SPOUSE",
        familyId: record.get("familyId") as string,
      })),
    ];

    const components = this.connectedComponents(
      allNodes.map((n) => n.id),
      allRels
    );
    const primary = components[0] || allNodes.map((n) => n.id);
    const idSet = new Set(primary);
    const nodes = allNodes.filter((n) => idSet.has(n.id));
    const relationships = allRels.filter(
      (r) => idSet.has(r.source) && idSet.has(r.target)
    );

    // Layout root: oldest generation (no parents in graph). Prefer named people
    // with the most children so we don't land on placeholder "Unknown Unknown".
    const childIds = new Set(
      relationships
        .filter((r) => r.type === "PARENT_CHILD")
        .map((r) => r.target)
    );
    const childCount = new Map<string, number>();
    for (const r of relationships) {
      if (r.type !== "PARENT_CHILD") continue;
      childCount.set(r.source, (childCount.get(r.source) || 0) + 1);
    }
    const roots = nodes.filter((n) => !childIds.has(n.id));
    const scoreRoot = (n: Individual): number => {
      const named = this.hasDisplayName(n) ? 1_000_000 : 0;
      const kids = childCount.get(n.id) || 0;
      const birth = n.birthDate ? new Date(n.birthDate).getTime() : Number.MAX_SAFE_INTEGER;
      // Higher is better: named + more kids; earlier birth as tie-break via negative time.
      return named + kids * 1_000 - birth / 1e13;
    };
    roots.sort((a, b) => scoreRoot(b) - scoreRoot(a));
    const rootId = (roots[0] || nodes[0])?.id ?? null;

    return {
      nodes,
      relationships,
      rootId,
      componentCount: components.length,
    };
  }

  private hasDisplayName(n: Individual): boolean {
    const first = (n.firstName || "").trim().toLowerCase();
    const last = (n.lastName || "").trim().toLowerCase();
    const meaningful = (v: string) => v.length > 0 && v !== "unknown";
    return meaningful(first) || meaningful(last);
  }

  /** If the user's tree is empty, claim legacy nodes imported without treeId. */
  private async ensureTreeHasData(treeId: string): Promise<void> {
    const owned = await this.neo4jService.read(
      `MATCH (i:Individual {treeId: $treeId}) RETURN count(i) AS c`,
      { treeId }
    );
    const rawCount = owned.records[0]?.get("c");
    const count =
      rawCount && typeof rawCount.toNumber === "function"
        ? rawCount.toNumber()
        : Number(rawCount ?? 0);
    if (count > 0) return;

    await this.neo4jService.write(
      `
      MATCH (i:Individual)
      WHERE i.treeId IS NULL
      SET i.treeId = $treeId
      `,
      { treeId }
    );
    await this.neo4jService.write(
      `
      MATCH (f:Family)
      WHERE f.treeId IS NULL
      SET f.treeId = $treeId
      `,
      { treeId }
    );
    await this.neo4jService.write(
      `
      MATCH (e:Event)
      WHERE e.treeId IS NULL
      SET e.treeId = $treeId
      `,
      { treeId }
    );
  }

  private connectedComponents(
    ids: string[],
    relationships: Array<{ source: string; target: string }>
  ): string[][] {
    const adj = new Map<string, Set<string>>();
    for (const id of ids) adj.set(id, new Set());
    for (const rel of relationships) {
      if (!adj.has(rel.source) || !adj.has(rel.target)) continue;
      adj.get(rel.source)!.add(rel.target);
      adj.get(rel.target)!.add(rel.source);
    }

    const seen = new Set<string>();
    const components: string[][] = [];
    for (const id of ids) {
      if (seen.has(id)) continue;
      const stack = [id];
      const comp: string[] = [];
      seen.add(id);
      while (stack.length) {
        const cur = stack.pop()!;
        comp.push(cur);
        for (const next of adj.get(cur) || []) {
          if (!seen.has(next)) {
            seen.add(next);
            stack.push(next);
          }
        }
      }
      components.push(comp);
    }

    components.sort((a, b) => b.length - a.length);
    return components;
  }

  async getIndividual(treeId: string, id: string): Promise<Individual | null> {
    const query = `
      MATCH (i:Individual {id: $id, treeId: $treeId})
      OPTIONAL MATCH (i)-[r]->(related)
      RETURN i,
             collect({type: type(r), node: related}) as relationships
    `;

    const result = await this.neo4jService.read(query, { id, treeId });
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

  async createFamily(treeId: string, createFamilyDto: CreateFamilyDto): Promise<Family> {
    const familyId =
      createFamilyDto.gedcomId || GedcomParserUtils.generateGedcomId("FAM");

    const queries: Array<{ query: string; params?: Record<string, unknown> }> =
      [
        {
          query: `
            CREATE (f:Family {
              id: $id,
              treeId: $treeId,
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
            treeId,
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
          MATCH (i:Individual {id: $indId, treeId: $treeId})
          MATCH (f:Family {id: $famId, treeId: $treeId})
          MERGE (i)-[:HUSBAND]->(f)
        `,
        params: { indId: createFamilyDto.husbandId, famId: familyId, treeId },
      });
    }

    if (createFamilyDto.wifeId) {
      queries.push({
        query: `
          MATCH (i:Individual {id: $indId, treeId: $treeId})
          MATCH (f:Family {id: $famId, treeId: $treeId})
          MERGE (i)-[:WIFE]->(f)
        `,
        params: { indId: createFamilyDto.wifeId, famId: familyId, treeId },
      });
    }

    for (const childId of createFamilyDto.childrenIds || []) {
      queries.push({
        query: `
          MATCH (i:Individual {id: $indId, treeId: $treeId})
          MATCH (f:Family {id: $famId, treeId: $treeId})
          MERGE (i)-[:CHILD]->(f)
        `,
        params: { indId: childId, famId: familyId, treeId },
      });
    }

    await this.neo4jService.executeTransaction(queries);
    const family = await this.getFamily(treeId, familyId);
    if (!family) {
      throw new NotFoundException(`Family ${familyId} was not created`);
    }
    return family;
  }

  async getFamily(treeId: string, id: string): Promise<Family | null> {
    const query = `
      MATCH (f:Family {id: $id, treeId: $treeId})
      OPTIONAL MATCH (husband:Individual {treeId: $treeId})-[:HUSBAND]->(f)
      OPTIONAL MATCH (wife:Individual {treeId: $treeId})-[:WIFE]->(f)
      OPTIONAL MATCH (child:Individual {treeId: $treeId})-[:CHILD]->(f)
      RETURN f,
             husband,
             wife,
             collect(DISTINCT child) as children
    `;

    const result = await this.neo4jService.read(query, { id, treeId });
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
    treeId: string,
    createRelationshipDto: CreateRelationshipDto
  ): Promise<boolean> {
    const { fromIndividualId, toIndividualId, relationshipType } =
      createRelationshipDto;

    if (!relationshipType) {
      throw new BadRequestException("relationshipType is required");
    }

    switch (relationshipType) {
      case RelationType.PARENT:
        await this.linkParentChild(treeId, fromIndividualId, toIndividualId);
        return true;
      case RelationType.CHILD:
        await this.linkParentChild(treeId, toIndividualId, fromIndividualId);
        return true;
      case RelationType.SPOUSE:
      case RelationType.MARRIED:
      case RelationType.PARTNER:
        await this.linkSpouses(treeId, fromIndividualId, toIndividualId);
        return true;
      case RelationType.SIBLING:
        await this.linkSiblings(treeId, fromIndividualId, toIndividualId);
        return true;
      default:
        throw new BadRequestException(
          `Unsupported relationship type: ${relationshipType}`
        );
    }
  }

  async getAncestors(
    treeId: string,
    individualId: string,
    generations: number = 3
  ): Promise<Individual[]> {
    const maxGen = this.clampGenerations(generations);
    const found = new Map<string, Individual>();
    let frontier = [individualId];

    for (let depth = 0; depth < maxGen; depth++) {
      if (frontier.length === 0) break;
      const parents = await this.getParentsOfMany(treeId, frontier);
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
    treeId: string,
    individualId: string,
    generations: number = 3
  ): Promise<Individual[]> {
    const maxGen = this.clampGenerations(generations);
    const found = new Map<string, Individual>();
    let frontier = [individualId];

    for (let depth = 0; depth < maxGen; depth++) {
      if (frontier.length === 0) break;
      const children = await this.getChildrenOfMany(treeId, frontier);
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
    treeId: string,
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
    const root = await this.getIndividual(treeId, rootId);
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

      const familyRows = await this.getFamilyLinksForIndividuals(treeId, frontier);
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
    treeId: string,
    individualId1: string,
    individualId2: string
  ): Promise<{ path: string[]; degree: number; types: string[] }[]> {
    const query = `
      MATCH path = shortestPath(
        (i1:Individual {id: $id1, treeId: $treeId})-[:HUSBAND|WIFE|CHILD*1..20]-(i2:Individual {id: $id2, treeId: $treeId})
      )
      RETURN [n IN nodes(path) WHERE n:Individual | n.id] as path,
             length(path) as degree,
             [r IN relationships(path) | type(r)] as types
    `;

    const result = await this.neo4jService.read(query, {
      treeId,
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
    treeId: string,
    parentId: string,
    childId: string
  ): Promise<void> {
    const parent = await this.getIndividual(treeId, parentId);
    const child = await this.getIndividual(treeId, childId);
    if (!parent || !child) {
      throw new NotFoundException("Parent or child individual not found");
    }

    const role = this.spouseRoleForSex(parent.sex as string);
    const existingFamilyId = await this.findSharedParentChildFamily(
      treeId,
      parentId,
      childId
    );
    if (existingFamilyId) {
      return;
    }

    const childFamilyId = await this.findChildFamilyId(treeId, childId);
    if (childFamilyId) {
      await this.neo4jService.write(
        `
          MATCH (parent:Individual {id: $parentId, treeId: $treeId})
          MATCH (f:Family {id: $familyId, treeId: $treeId})
          MERGE (parent)-[:${role}]->(f)
        `,
        { parentId, familyId: childFamilyId }
      );
      return;
    }

    const parentFamilyId = await this.findSpouseFamilyId(treeId, parentId);
    if (parentFamilyId) {
      await this.neo4jService.write(
        `
          MATCH (child:Individual {id: $childId, treeId: $treeId})
          MATCH (f:Family {id: $familyId, treeId: $treeId})
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
            treeId: $treeId,
            gedcomId: $familyId,
            createdAt: datetime()
          })
        `,
        params: { familyId, treeId },
      },
      {
        query: `
          MATCH (parent:Individual {id: $parentId, treeId: $treeId})
          MATCH (child:Individual {id: $childId, treeId: $treeId})
          MATCH (f:Family {id: $familyId, treeId: $treeId})
          MERGE (parent)-[:${role}]->(f)
          MERGE (child)-[:CHILD]->(f)
        `,
        params: { parentId, childId, familyId, treeId },
      },
    ]);
  }

  private async linkSpouses(treeId: string, aId: string, bId: string): Promise<void> {
    const a = await this.getIndividual(treeId, aId);
    const b = await this.getIndividual(treeId, bId);
    if (!a || !b) {
      throw new NotFoundException("One or both individuals not found");
    }

    const shared = await this.findSharedSpouseFamily(treeId, aId, bId);
    if (shared) {
      return;
    }

    const aFamily = await this.findSpouseFamilyId(treeId, aId);
    const bFamily = await this.findSpouseFamilyId(treeId, bId);
    const roleA = this.spouseRoleForSex(a.sex as string);
    const roleB = this.spouseRoleForSex(b.sex as string);

    if (aFamily && roleA !== roleB) {
      await this.neo4jService.write(
        `
          MATCH (b:Individual {id: $bId, treeId: $treeId})
          MATCH (f:Family {id: $familyId, treeId: $treeId})
          MERGE (b)-[:${roleB}]->(f)
        `,
        { bId, familyId: aFamily, treeId }
      );
      return;
    }

    if (bFamily && roleA !== roleB) {
      await this.neo4jService.write(
        `
          MATCH (a:Individual {id: $aId, treeId: $treeId})
          MATCH (f:Family {id: $familyId, treeId: $treeId})
          MERGE (a)-[:${roleA}]->(f)
        `,
        { aId, familyId: bFamily, treeId }
      );
      return;
    }

    const familyId = GedcomParserUtils.generateGedcomId("FAM");
    await this.neo4jService.executeTransaction([
      {
        query: `
          CREATE (f:Family {
            id: $familyId,
            treeId: $treeId,
            gedcomId: $familyId,
            createdAt: datetime()
          })
        `,
        params: { familyId, treeId },
      },
      {
        query: `
          MATCH (a:Individual {id: $aId, treeId: $treeId})
          MATCH (b:Individual {id: $bId, treeId: $treeId})
          MATCH (f:Family {id: $familyId, treeId: $treeId})
          MERGE (a)-[:${roleA}]->(f)
          MERGE (b)-[:${roleB}]->(f)
        `,
        params: { aId, bId, familyId, treeId },
      },
    ]);
  }

  private async linkSiblings(treeId: string, aId: string, bId: string): Promise<void> {
    const a = await this.getIndividual(treeId, aId);
    const b = await this.getIndividual(treeId, bId);
    if (!a || !b) {
      throw new NotFoundException("One or both individuals not found");
    }

    const shared = await this.findSharedChildFamily(treeId, aId, bId);
    if (shared) {
      return;
    }

    const aFamily = await this.findChildFamilyId(treeId, aId);
    if (aFamily) {
      await this.neo4jService.write(
        `
          MATCH (b:Individual {id: $bId, treeId: $treeId})
          MATCH (f:Family {id: $familyId, treeId: $treeId})
          MERGE (b)-[:CHILD]->(f)
        `,
        { bId, familyId: aFamily, treeId }
      );
      return;
    }

    const bFamily = await this.findChildFamilyId(treeId, bId);
    if (bFamily) {
      await this.neo4jService.write(
        `
          MATCH (a:Individual {id: $aId, treeId: $treeId})
          MATCH (f:Family {id: $familyId, treeId: $treeId})
          MERGE (a)-[:CHILD]->(f)
        `,
        { aId, familyId: bFamily, treeId }
      );
      return;
    }

    const familyId = GedcomParserUtils.generateGedcomId("FAM");
    await this.neo4jService.executeTransaction([
      {
        query: `
          CREATE (f:Family {
            id: $familyId,
            treeId: $treeId,
            gedcomId: $familyId,
            createdAt: datetime()
          })
        `,
        params: { familyId, treeId },
      },
      {
        query: `
          MATCH (a:Individual {id: $aId, treeId: $treeId})
          MATCH (b:Individual {id: $bId, treeId: $treeId})
          MATCH (f:Family {id: $familyId, treeId: $treeId})
          MERGE (a)-[:CHILD]->(f)
          MERGE (b)-[:CHILD]->(f)
        `,
        params: { aId, bId, familyId, treeId },
      },
    ]);
  }

  private async findSharedParentChildFamily(
    treeId: string,
    parentId: string,
    childId: string
  ): Promise<string | null> {
    const result = await this.neo4jService.read(
      `
        MATCH (parent:Individual {id: $parentId, treeId: $treeId})-[:HUSBAND|WIFE]->(f:Family {treeId: $treeId})
              <-[:CHILD]-(child:Individual {id: $childId, treeId: $treeId})
        RETURN f.id AS familyId
        LIMIT 1
      `,
      { treeId, parentId, childId }
    );
    return result.records[0]?.get("familyId") ?? null;
  }

  private async findSharedSpouseFamily(
    treeId: string,
    aId: string,
    bId: string
  ): Promise<string | null> {
    const result = await this.neo4jService.read(
      `
        MATCH (a:Individual {id: $aId, treeId: $treeId})-[:HUSBAND|WIFE]->(f:Family {treeId: $treeId})
              <-[:HUSBAND|WIFE]-(b:Individual {id: $bId, treeId: $treeId})
        RETURN f.id AS familyId
        LIMIT 1
      `,
      { treeId, aId, bId }
    );
    return result.records[0]?.get("familyId") ?? null;
  }

  private async findSharedChildFamily(
    treeId: string,
    aId: string,
    bId: string
  ): Promise<string | null> {
    const result = await this.neo4jService.read(
      `
        MATCH (a:Individual {id: $aId, treeId: $treeId})-[:CHILD]->(f:Family {treeId: $treeId})
              <-[:CHILD]-(b:Individual {id: $bId, treeId: $treeId})
        RETURN f.id AS familyId
        LIMIT 1
      `,
      { treeId, aId, bId }
    );
    return result.records[0]?.get("familyId") ?? null;
  }

  private async findChildFamilyId(treeId: string, individualId: string): Promise<string | null> {
    const result = await this.neo4jService.read(
      `
        MATCH (i:Individual {id: $individualId, treeId: $treeId})-[:CHILD]->(f:Family {treeId: $treeId})
        RETURN f.id AS familyId
        LIMIT 1
      `,
      { treeId, individualId }
    );
    return result.records[0]?.get("familyId") ?? null;
  }

  private async findSpouseFamilyId(treeId: string, individualId: string): Promise<string | null> {
    const result = await this.neo4jService.read(
      `
        MATCH (i:Individual {id: $individualId, treeId: $treeId})-[:HUSBAND|WIFE]->(f:Family {treeId: $treeId})
        RETURN f.id AS familyId
        LIMIT 1
      `,
      { treeId, individualId }
    );
    return result.records[0]?.get("familyId") ?? null;
  }

  private async getParentsOfMany(treeId: string, ids: string[]): Promise<Individual[]> {
    const result = await this.neo4jService.read(
      `
        MATCH (child:Individual {treeId: $treeId})-[:CHILD]->(:Family {treeId: $treeId})<-[:HUSBAND|WIFE]-(parent:Individual {treeId: $treeId})
        WHERE child.id IN $ids
        RETURN DISTINCT parent
      `,
      { treeId, ids }
    );
    return result.records.map((record) =>
      Neo4jResultUtils.normalizeValue(record.get("parent"))
    );
  }

  private async getChildrenOfMany(treeId: string, ids: string[]): Promise<Individual[]> {
    const result = await this.neo4jService.read(
      `
        MATCH (parent:Individual {treeId: $treeId})-[:HUSBAND|WIFE]->(:Family {treeId: $treeId})<-[:CHILD]-(child:Individual {treeId: $treeId})
        WHERE parent.id IN $ids
        RETURN DISTINCT child
      `,
      { treeId, ids }
    );
    return result.records.map((record) =>
      Neo4jResultUtils.normalizeValue(record.get("child"))
    );
  }

  private async getFamilyLinksForIndividuals(treeId: string, ids: string[]): Promise<
    Array<{
      individualId: string;
      familyId: string;
      type: string;
      members: Individual[];
    }>
  > {
    const result = await this.neo4jService.read(
      `
        MATCH (i:Individual {treeId: $treeId})-[r:HUSBAND|WIFE|CHILD]->(f:Family {treeId: $treeId})
        WHERE i.id IN $ids
        OPTIONAL MATCH (member:Individual {treeId: $treeId})-[:HUSBAND|WIFE|CHILD]->(f)
        WHERE member.id <> i.id
        RETURN i.id AS individualId,
               f.id AS familyId,
               type(r) AS type,
               collect(DISTINCT member) AS members
      `,
      { treeId, ids }
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
