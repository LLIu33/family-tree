import { ArgumentsHost, HttpStatus } from "@nestjs/common";
import { Neo4jError } from "neo4j-driver";
import { Neo4jErrorFilter } from "./neo4j-error.filter";

function makeHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ url: "/family-tree/individuals" }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe("Neo4jErrorFilter", () => {
  const filter = new Neo4jErrorFilter();

  it.each([
    [
      "Neo.ClientError.Schema.ConstraintValidationFailed",
      HttpStatus.CONFLICT,
      "Entity already exists",
    ],
    [
      "Neo.ClientError.Statement.EntityNotFound",
      HttpStatus.NOT_FOUND,
      "Requested entity not found",
    ],
    [
      "Neo.ClientError.Statement.ParameterMissing",
      HttpStatus.BAD_REQUEST,
      "Required parameter is missing",
    ],
    [
      "Neo.ClientError.Transaction.DeadlockDetected",
      HttpStatus.CONFLICT,
      "Database deadlock occurred, please retry",
    ],
    [
      "Neo.ClientError.Security.Unauthorized",
      HttpStatus.UNAUTHORIZED,
      "Database authentication failed",
    ],
    [
      "Neo.ClientError.General.DatabaseUnavailable",
      HttpStatus.SERVICE_UNAVAILABLE,
      "Database is currently unavailable",
    ],
  ] as const)("maps %s", (code, expectedStatus, message) => {
    const { host, status, json } = makeHost();
    const error = new Neo4jError("fail", code, "50N42", "fail");

    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(expectedStatus);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: expectedStatus,
        message,
        neo4jErrorCode: code,
        path: "/family-tree/individuals",
      }),
    );
  });

  it("falls back to 500 for unknown codes", () => {
    const { host, status, json } = makeHost();
    filter.catch(new Neo4jError("weird", "Neo.Unknown", "50N42", "weird"), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Database operation failed",
      }),
    );
  });
});
