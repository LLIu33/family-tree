import { registerAs } from "@nestjs/config";

export interface Neo4jConfig {
  scheme: string;
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

export const neo4jConfig = registerAs("neo4j", (): Neo4jConfig => {
  return {
    scheme: process.env.NEO4J_SCHEME || "bolt",
    host: process.env.NEO4J_HOST || "localhost",
    port: parseInt(process.env.NEO4J_PORT || "7687", 10),
    username: process.env.NEO4J_USERNAME || "neo4j",
    password: process.env.NEO4J_PASSWORD || "your_password",
    database: process.env.NEO4J_DATABASE || "neo4j",
  };
});
