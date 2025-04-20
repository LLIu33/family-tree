import { registerAs } from "@nestjs/config";
import { validateConfig } from "./validation-schema";

export interface Neo4jConfig {
  scheme: string;
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

export const neo4jConfig = registerAs("neo4j", (): Neo4jConfig => {
  const config = {
    scheme: process.env.NEO4J_SCHEME!,
    host: process.env.NEO4J_HOST!,
    port: parseInt(process.env.NEO4J_PORT!, 10),
    username: process.env.NEO4J_USERNAME!,
    password: process.env.NEO4J_PASSWORD!,
    database: process.env.NEO4J_DATABASE || "neo4j",
  };

  validateConfig(config);
  return config;
});
