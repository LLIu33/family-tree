import { session } from "neo4j-driver";
import { Neo4jService } from "./neo4j.service";

describe("Neo4jService", () => {
  let readSession: {
    run: jest.Mock;
    close: jest.Mock;
  };
  let writeSession: {
    run: jest.Mock;
    close: jest.Mock;
    beginTransaction: jest.Mock;
  };
  let transaction: {
    run: jest.Mock;
    commit: jest.Mock;
    rollback: jest.Mock;
  };
  let driver: {
    session: jest.Mock;
    close: jest.Mock;
  };
  let service: Neo4jService;

  beforeEach(() => {
    readSession = {
      run: jest.fn().mockResolvedValue({ records: [] }),
      close: jest.fn().mockResolvedValue(undefined),
    };
    transaction = {
      run: jest.fn().mockResolvedValue({ records: [{ id: 1 }] }),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
    };
    writeSession = {
      run: jest.fn().mockResolvedValue({ records: [] }),
      close: jest.fn().mockResolvedValue(undefined),
      beginTransaction: jest.fn().mockReturnValue(transaction),
    };
    driver = {
      session: jest.fn((opts: { defaultAccessMode: string }) =>
        opts.defaultAccessMode === session.READ ? readSession : writeSession,
      ),
      close: jest.fn().mockResolvedValue(undefined),
    };

    service = new Neo4jService(driver as any, { database: "neo4j" } as any);
  });

  it("verifyConnection runs RETURN 1 on a read session", async () => {
    await service.verifyConnection();
    expect(readSession.run).toHaveBeenCalledWith("RETURN 1");
    expect(readSession.close).toHaveBeenCalled();
  });

  it("exposes the driver", () => {
    expect(service.getDriver()).toBe(driver);
  });

  it("read and write close sessions in finally", async () => {
    await service.read("MATCH (n) RETURN n", { a: 1 });
    expect(readSession.run).toHaveBeenCalledWith("MATCH (n) RETURN n", {
      a: 1,
    });
    expect(readSession.close).toHaveBeenCalled();

    await service.write("CREATE (n)", { b: 2 }, "other");
    expect(driver.session).toHaveBeenCalledWith(
      expect.objectContaining({
        database: "other",
        defaultAccessMode: session.WRITE,
      }),
    );
    expect(writeSession.run).toHaveBeenCalledWith("CREATE (n)", { b: 2 });
    expect(writeSession.close).toHaveBeenCalled();
  });

  it("executeTransaction commits successful queries", async () => {
    const results = await service.executeTransaction([
      { query: "CREATE (a)", params: { x: 1 } },
      { query: "CREATE (b)" },
    ]);

    expect(transaction.run).toHaveBeenCalledTimes(2);
    expect(transaction.commit).toHaveBeenCalled();
    expect(transaction.rollback).not.toHaveBeenCalled();
    expect(writeSession.close).toHaveBeenCalled();
    expect(results).toHaveLength(2);
  });

  it("executeTransaction rolls back and rethrows on failure", async () => {
    transaction.run.mockRejectedValueOnce(new Error("tx failed"));

    await expect(
      service.executeTransaction([{ query: "CREATE (a)" }]),
    ).rejects.toThrow("tx failed");
    expect(transaction.rollback).toHaveBeenCalled();
    expect(writeSession.close).toHaveBeenCalled();
  });

  it("closes the driver on shutdown", async () => {
    await service.onApplicationShutdown();
    expect(driver.close).toHaveBeenCalled();
  });
});
