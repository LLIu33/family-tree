import { Driver, driver, auth, Session } from "neo4j-driver";
import { Neo4jConfig } from "./interfaces/neo4j-config.interface";

export const createDriver = async (config: Neo4jConfig) => {
  const { scheme, host, port, username, password, database } = config;

  const neo4jDriver: Driver = driver(
    `${scheme}://${host}:${port}`,
    auth.basic(username, password)
  );

  await neo4jDriver.verifyConnectivity();

  return neo4jDriver;
};
