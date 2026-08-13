import {
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Neo4jError } from "neo4j-driver";
import { Request, Response } from "express";

@Catch(Neo4jError)
export class Neo4jErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(Neo4jErrorFilter.name);

  catch(exception: Neo4jError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    this.logger.error(`Neo4j Error: ${exception.message}`, exception.stack);

    const { status, message } = this.mapNeo4jError(exception);

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: message,
      neo4jErrorCode: exception.code,
    });
  }

  private mapNeo4jError(error: Neo4jError): {
    status: number;
    message: string;
  } {
    const errorMapping: Record<string, { status: number; message: string }> = {
      "Neo.ClientError.Schema.ConstraintValidationFailed": {
        status: HttpStatus.CONFLICT,
        message: "Entity already exists",
      },
      "Neo.ClientError.Statement.EntityNotFound": {
        status: HttpStatus.NOT_FOUND,
        message: "Requested entity not found",
      },
      "Neo.ClientError.Statement.ParameterMissing": {
        status: HttpStatus.BAD_REQUEST,
        message: "Required parameter is missing",
      },
      "Neo.ClientError.Transaction.DeadlockDetected": {
        status: HttpStatus.CONFLICT,
        message: "Database deadlock occurred, please retry",
      },
      "Neo.ClientError.Security.Unauthorized": {
        status: HttpStatus.UNAUTHORIZED,
        message: "Database authentication failed",
      },
      "Neo.ClientError.General.DatabaseUnavailable": {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        message: "Database is currently unavailable",
      },
    };

    return (
      errorMapping[error.code] || {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: "Database operation failed",
      }
    );
  }
}
