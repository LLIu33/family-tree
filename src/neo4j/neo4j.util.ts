import { Driver, driver, auth } from "neo4j-driver";
import { Neo4jConfig } from "./interfaces/neo4j-config.interface";

export const createDriver = async (config: Neo4jConfig): Promise<Driver> => {
  const { uri, scheme, host, port, username, password } = config;
  const connectionUri =
    uri?.trim() || `${scheme}://${host}:${port}`;

  return driver(connectionUri, auth.basic(username, password));
};
