import { Injectable, Logger, Inject, OnApplicationShutdown } from "@nestjs/common";
import { Driver, Session, session, QueryResult } from "neo4j-driver";
import { Neo4jConfig } from "./interfaces/neo4j-config.interface";
import { NEO4J_DRIVER, NEO4J_OPTIONS } from "./neo4j.constants";

@Injectable()
export class Neo4jService implements OnApplicationShutdown {
  private readonly logger = new Logger(Neo4jService.name);
  private readonly database?: string;

  constructor(
    @Inject(NEO4J_DRIVER) private readonly driver: Driver,
    @Inject(NEO4J_OPTIONS) options: Neo4jConfig
  ) {
    this.database = options.database;
    this.verifyConnection()
      .then(() => this.logger.log("Successfully connected to Neo4j"))
      .catch((error) => {
        this.logger.error("Failed to connect to Neo4j", error);
      });
  }

  async verifyConnection(): Promise<void> {
    const readSession = this.getReadSession();
    try {
      await readSession.run("RETURN 1");
    } finally {
      await readSession.close();
    }
  }

  getDriver(): Driver {
    return this.driver;
  }

  getReadSession(database?: string): Session {
    return this.driver.session({
      database: database || this.database,
      defaultAccessMode: session.READ,
      fetchSize: 1000,
    });
  }

  getWriteSession(database?: string): Session {
    return this.driver.session({
      database: database || this.database,
      defaultAccessMode: session.WRITE,
      fetchSize: 1000,
    });
  }

  async read(
    cypher: string,
    params?: Record<string, unknown>,
    database?: string
  ): Promise<QueryResult> {
    const readSession = this.getReadSession(database);
    try {
      this.logger.debug(`Running read query: ${cypher}`);
      return await readSession.run(cypher, params);
    } finally {
      await readSession.close();
    }
  }

  async write(
    cypher: string,
    params?: Record<string, unknown>,
    database?: string
  ): Promise<QueryResult> {
    const writeSession = this.getWriteSession(database);
    try {
      this.logger.debug(`Running write query: ${cypher}`);
      return await writeSession.run(cypher, params);
    } finally {
      await writeSession.close();
    }
  }

  async executeTransaction(
    queries: Array<{ query: string; params?: Record<string, unknown> }>,
    database?: string
  ): Promise<QueryResult[]> {
    const writeSession = this.getWriteSession(database);
    const transaction = writeSession.beginTransaction();

    try {
      const results: QueryResult[] = [];
      for (const { query, params } of queries) {
        this.logger.debug(`Running transaction query: ${query}`);
        const result = await transaction.run(query, params);
        results.push(result);
      }
      await transaction.commit();
      return results;
    } catch (error) {
      await transaction.rollback();
      this.logger.error("Transaction failed", error as Error);
      throw error;
    } finally {
      await writeSession.close();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.driver.close();
    this.logger.log("Neo4j driver has been closed");
  }

  async findNodesByLabel(label: string, limit: number = 100): Promise<unknown[]> {
    const query = `MATCH (n:${label}) RETURN n LIMIT $limit`;
    const result = await this.read(query, { limit });
    return result.records.map((record) => record.get("n").properties);
  }

  async checkRelationshipExists(
    fromId: string,
    toId: string,
    relationshipType: string
  ): Promise<boolean> {
    const query = `
      MATCH (a {id: $fromId})-[r]->(b {id: $toId})
      WHERE type(r) = $relationshipType
      RETURN COUNT(r) > 0 AS exists
    `;
    const result = await this.read(query, { fromId, toId, relationshipType });
    return result.records[0].get("exists");
  }
}
