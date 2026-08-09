import { Driver, driver, auth } from "neo4j-driver";
import { Neo4jConfig } from "./interfaces/neo4j-config.interface";

export const createDriver = async (config: Neo4jConfig): Promise<Driver> => {
  const { scheme, host, port, username, password } = config;

  return driver(`${scheme}://${host}:${port}`, auth.basic(username, password));
};
