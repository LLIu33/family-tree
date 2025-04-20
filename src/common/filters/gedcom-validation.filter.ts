import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";
import { GqlArgumentsHost, GqlExceptionFilter } from "@nestjs/graphql";
import { GraphQLError } from "graphql";
import { GEDCOMValidationError } from "../errors/gedcom-validation.error";

@Catch(GEDCOMValidationError)
export class GEDCOMValidationFilter
  implements ExceptionFilter, GqlExceptionFilter
{
  private readonly logger = new Logger(GEDCOMValidationFilter.name);

  catch(exception: GEDCOMValidationError, host: ArgumentsHost) {
    // Обработка GraphQL ошибок
    const gqlHost = GqlArgumentsHost.create(host);
    const type: string = gqlHost.getType();
    if (type === "graphql") {
      return this.handleGqlError(exception);
    }

    // Обработка REST ошибок
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    this.logError(exception, request);

    response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: "GEDCOM Validation Failed",
      errors: this.transformErrors(exception.errors),
      file: exception.fileMetadata,
    });
  }

  private handleGqlError(exception: GEDCOMValidationError): GraphQLError {
    this.logError(exception);

    return new GraphQLError("GEDCOM Validation Failed", {
      extensions: {
        code: "GEDCOM_VALIDATION_ERROR",
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: exception.errors,
        file: exception.fileMetadata,
      },
    });
  }

  private transformErrors(errors: any[]) {
    return errors.map((error) => ({
      type: error.type,
      message: error.message,
      line: error.line,
      tag: error.tag,
      value: error.value,
    }));
  }

  private logError(error: GEDCOMValidationError, request?: Request) {
    const context = request
      ? `for request ${request.method} ${request.url}`
      : "in GraphQL";

    this.logger.error(
      `GEDCOM Validation Failed ${context}: ${error.message}`,
      error.stack
    );

    if (error.errors?.length) {
      this.logger.debug("Validation details:");
      error.errors.forEach((err) => {
        this.logger.debug(`- Line ${err.line}: [${err.tag}] ${err.message}`);
      });
    }
  }
}
