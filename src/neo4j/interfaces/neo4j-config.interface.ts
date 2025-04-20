export interface Neo4jConfig {
  scheme: string;
  host: string;
  port: number | string;
  username: string;
  password: string;
  database?: string;
}
