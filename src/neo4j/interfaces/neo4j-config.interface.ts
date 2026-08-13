export interface Neo4jConfig {
  /** Full URI, e.g. neo4j+s://xxx.databases.neo4j.io — preferred for Aura */
  uri?: string;
  scheme: string;
  host: string;
  port: number | string;
  username: string;
  password: string;
  database?: string;
}
