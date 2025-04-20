import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import { Driver, Session, session, Result, auth, driver } from "neo4j-driver";
import { Neo4jConfig } from "../../config/neo4j.config";
import { ConfigService } from "@nestjs/config";
import { Logger } from "../../common/logger/logger.service";

@Injectable()
export class Neo4jService implements OnApplicationShutdown {
  private readonly driver: Driver;
  private readonly logger: Logger;

  constructor(private readonly configService: ConfigService) {
    const neo4jConfig = this.configService.get<Neo4jConfig>("neo4j");
    this.logger = new Logger("Neo4jService");

    try {
      this.driver = driver(
        `${neo4jConfig.scheme}://${neo4jConfig.host}:${neo4jConfig.port}`,
        auth.basic(neo4jConfig.username, neo4jConfig.password),
        {
          maxConnectionPoolSize: 50,
          connectionTimeout: 30000, // 30 seconds
          logging: {
            level: "info",
            logger: (level, message) =>
              this.logger.log(`Neo4j: ${level} - ${message}`),
          },
        }
      );

      this.verifyConnection()
        .then(() => this.logger.log("Successfully connected to Neo4j"))
        .catch((error) => {
          this.logger.error("Failed to connect to Neo4j", error);
          process.exit(1);
        });
    } catch (error) {
      this.logger.error("Error creating Neo4j driver", error);
      throw error;
    }
  }

  async verifyConnection(): Promise<void> {
    const session = this.getReadSession();
    try {
      await session.run("RETURN 1");
    } finally {
      await session.close();
    }
  }

  getDriver(): Driver {
    return this.driver;
  }

  getReadSession(database?: string): Session {
    return this.driver.session({
      database: database || this.driver.session().config.database,
      defaultAccessMode: session.READ,
      fetchSize: 1000, // Оптимизация для больших запросов
    });
  }

  getWriteSession(database?: string): Session {
    return this.driver.session({
      database: database || this.driver.session().config.database,
      defaultAccessMode: session.WRITE,
      fetchSize: 1000,
    });
  }

  async read(
    cypher: string,
    params?: Record<string, any>,
    database?: string
  ): Promise<Result> {
    const session = this.getReadSession(database);
    try {
      this.logger.debug(`Running read query: ${cypher}`, params);
      return await session.run(cypher, params);
    } finally {
      await session.close();
    }
  }

  async write(
    cypher: string,
    params?: Record<string, any>,
    database?: string,
    config?: transactionConfig
  ): Promise<Result> {
    const session = this.getWriteSession(database);
    try {
      this.logger.debug(`Running write query: ${cypher}`, params);
      return await session.run(cypher, params, config);
    } finally {
      await session.close();
    }
  }

  async executeTransaction(
    queries: Array<{ query: string; params?: Record<string, any> }>,
    database?: string
  ): Promise<Result[]> {
    const session = this.getWriteSession(database);
    const transaction = session.beginTransaction();

    try {
      const results: Result[] = [];
      for (const { query, params } of queries) {
        this.logger.debug(`Running transaction query: ${query}`, params);
        const result = await transaction.run(query, params);
        results.push(result);
      }
      await transaction.commit();
      return results;
    } catch (error) {
      await transaction.rollback();
      this.logger.error("Transaction failed", error);
      throw error;
    } finally {
      await session.close();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.driver.close();
    this.logger.log("Neo4j driver has been closed");
  }

  // ========== Family Tree Specific Methods ==========

  async findNodesByLabel(label: string, limit: number = 100): Promise<any[]> {
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
            MATCH (a {id: $fromId})-[r:${relationshipType}]->(b {id: $toId})
            RETURN COUNT(r) > 0 AS exists
        `;
    const result = await this.read(query, { fromId, toId });
    return result.records[0].get("exists");
  }

  async batchCreateNodes(
    nodes: Array<{ label: string; properties: Record<string, any> }>,
    batchSize: number = 100
  ): Promise<void> {
    for (let i = 0; i < nodes.length; i += batchSize) {
      const batch = nodes.slice(i, i + batchSize);
      const query = `
                UNWIND $batch AS node
                CREATE (n:\${node.label})
                SET n = node.properties
            `;
      await this.write(query, { batch });
    }
  }
}
