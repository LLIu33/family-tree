import { Injectable, Logger } from "@nestjs/common";
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

@Injectable()
export class FamilyTreeService {
  private readonly logger = new Logger(FamilyTreeService.name);

  constructor(private readonly neo4jService: Neo4jService) {}

  // ========== Individuals ==========

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
    individual.relationships = record
      .get("relationships")
      .map((rel: { type: string; node: unknown }) => ({
        type: rel.type,
        node: Neo4jResultUtils.normalizeValue(rel.node),
      }));

    return individual;
  }

  // ========== Families ==========

  async createFamily(createFamilyDto: CreateFamilyDto): Promise<Family> {
    const familyId =
      createFamilyDto.gedcomId || GedcomParserUtils.generateGedcomId("FAM");

    const query = `
      CREATE (f:Family {
        id: $id,
        gedcomId: $gedcomId,
        marriageDate: $marriageDate,
        divorceDate: $divorceDate,
        marriagePlace: $marriagePlace,
        createdAt: datetime()
      })
      RETURN f
    `;

    const params = {
      id: familyId,
      gedcomId: familyId,
      ...createFamilyDto,
    };

    const result = await this.neo4jService.write(query, params);
    const family = Neo4jResultUtils.getFirstResult<Family>(result.records);
    if (!family) {
      throw new Error(`Failed to create family ${familyId}`);
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
             collect(child) as children
    `;

    const result = await this.neo4jService.read(query, { id });
    if (result.records.length === 0) return null;

    const record = result.records[0];
    const family = Neo4jResultUtils.normalizeValue(record.get("f")) as Family;
    family.husband = Neo4jResultUtils.normalizeValue(record.get("husband"));
    family.wife = Neo4jResultUtils.normalizeValue(record.get("wife"));
    family.children = record
      .get("children")
      .map((child: unknown) => Neo4jResultUtils.normalizeValue(child));

    return family;
  }

  // ========== Relationships ==========

  async createRelationship(
    createRelationshipDto: CreateRelationshipDto
  ): Promise<boolean> {
    const { fromIndividualId, toIndividualId, relationshipType } =
      createRelationshipDto;

    let queries: string[] = [];
    const params = {
      fromId: fromIndividualId,
      toId: toIndividualId,
    };

    switch (relationshipType) {
      case RelationType.PARENT:
        queries.push(`
          MATCH (parent:Individual {id: $fromId})
          MATCH (child:Individual {id: $toId})
          MERGE (child)-[:CHILD_OF]->(parent)
        `);
        break;

      case RelationType.SPOUSE:
        queries = [
          `MATCH (a:Individual {id: $fromId}), (b:Individual {id: $toId})
           MERGE (a)-[:SPOUSE]->(b)`,
          `MATCH (a:Individual {id: $fromId}), (b:Individual {id: $toId})
           MERGE (a)<-[:SPOUSE]-(b)`,
        ];
        break;

      case RelationType.SIBLING:
        queries = [
          `MATCH (a:Individual {id: $fromId})-[:CHILD_OF]->(parents:Family)
           MATCH (b:Individual {id: $toId})-[:CHILD_OF]->(parents)
           MERGE (a)-[:SIBLING]->(b)`,
          `MATCH (a:Individual {id: $fromId})-[:CHILD_OF]->(parents:Family)
           MATCH (b:Individual {id: $toId})-[:CHILD_OF]->(parents)
           MERGE (a)<-[:SIBLING]-(b)`,
        ];
        break;

      default:
        throw new Error(
          `Unsupported relationship type: ${relationshipType}`
        );
    }

    for (const query of queries) {
      await this.neo4jService.write(query, params);
    }

    return true;
  }

  // ========== Tree Navigation ==========

  async getAncestors(
    individualId: string,
    generations: number = 3
  ): Promise<Individual[]> {
    const query = `
      MATCH (i:Individual {id: $individualId})
      WITH i, $generations AS generations
      
      MATCH path = (i)-[:CHILD_OF*1..generations]->(ancestor:Individual)
      WITH nodes(path) AS nodes
      
      UNWIND nodes AS ancestor
      RETURN DISTINCT ancestor
      ORDER BY ancestor.birthDate
    `;

    const result = await this.neo4jService.read(query, {
      individualId,
      generations,
    });

    return result.records.map((record) =>
      Neo4jResultUtils.normalizeValue(record.get("ancestor"))
    );
  }

  async getDescendants(
    individualId: string,
    generations: number = 3
  ): Promise<Individual[]> {
    const query = `
      MATCH (i:Individual {id: $individualId})
      WITH i, $generations AS generations
      
      MATCH path = (i)<-[:CHILD_OF*1..generations]-(descendant:Individual)
      WITH nodes(path) AS nodes
      
      UNWIND nodes AS descendant
      RETURN DISTINCT descendant
      ORDER BY descendant.birthDate
    `;

    const result = await this.neo4jService.read(query, {
      individualId,
      generations,
    });

    return result.records.map((record) =>
      Neo4jResultUtils.normalizeValue(record.get("descendant"))
    );
  }

  async visualizeTree(rootId: string, depth: number = 3): Promise<any> {
    const query = `
      MATCH (root:Individual {id: $rootId})
      CALL apoc.path.subgraphNodes(root, {
        relationshipFilter: 'CHILD_OF>|<SPOUSE',
        minLevel: 0,
        maxLevel: $depth
      }) YIELD node
      
      WITH collect(node) as nodes
      
      UNWIND nodes as n
      OPTIONAL MATCH (n)-[r:CHILD_OF|SPOUSE]->(m)
      WHERE m IN nodes
      
      RETURN {
        nodes: [node IN nodes | node { .* }],
        relationships: collect({
          source: id(startNode(r)),
          target: id(endNode(r)),
          type: type(r)
        })
      } as tree
    `;

    const result = await this.neo4jService.read(query, {
      rootId,
      depth,
    });

    const tree = Neo4jResultUtils.getFirstField<any>(result.records, "tree");
    return tree || { nodes: [], relationships: [] };
  }

  // ========== Advanced Queries ==========

  async findPossibleRelationships(
    individualId1: string,
    individualId2: string
  ): Promise<{ path: string[]; degree: number; types: string[] }[]> {
    const query = `
      MATCH path = shortestPath((i1:Individual {id: $id1})-[*]-(i2:Individual {id: $id2}))
      WHERE all(r IN relationships(path) WHERE type(r) IN ['CHILD_OF', 'SPOUSE', 'SIBLING'])
      RETURN [n IN nodes(path) | n.id] as path,
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
}
