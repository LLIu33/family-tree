import { auth, driver } from "neo4j-driver";
import { createDriver } from "./neo4j.util";

jest.mock("neo4j-driver", () => ({
  driver: jest.fn().mockReturnValue({ mocked: true }),
  auth: { basic: jest.fn().mockReturnValue("auth-token") },
}));

describe("createDriver", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uses explicit uri when provided", async () => {
    await createDriver({
      uri: " neo4j+s://example.com ",
      scheme: "bolt",
      host: "localhost",
      port: 7687,
      username: "neo4j",
      password: "secret",
    });

    expect(auth.basic).toHaveBeenCalledWith("neo4j", "secret");
    expect(driver).toHaveBeenCalledWith(
      "neo4j+s://example.com",
      "auth-token",
    );
  });

  it("builds uri from scheme/host/port when uri is empty", async () => {
    await createDriver({
      uri: "  ",
      scheme: "bolt",
      host: "db.local",
      port: 7687,
      username: "u",
      password: "p",
    });

    expect(driver).toHaveBeenCalledWith("bolt://db.local:7687", "auth-token");
  });
});
