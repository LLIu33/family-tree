import { registerAs } from "@nestjs/config";
import type { Neo4jConfig } from "../neo4j/interfaces/neo4j-config.interface";

export type { Neo4jConfig };

export const neo4jConfig = registerAs("neo4j", (): Neo4jConfig => ({
  uri: process.env.NEO4J_URI || undefined,
  scheme: process.env.NEO4J_SCHEME || "bolt",
  host: process.env.NEO4J_HOST || "localhost",
  port: parseInt(process.env.NEO4J_PORT || "7687", 10),
  username: process.env.NEO4J_USERNAME || "neo4j",
  password: process.env.NEO4J_PASSWORD || "your_password",
  database: process.env.NEO4J_DATABASE || "neo4j",
}));
