import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";
import { GEDCOMValidationError } from "../errors/gedcom-validation.error";

@Catch(GEDCOMValidationError)
export class GEDCOMValidationFilter implements ExceptionFilter {
  private readonly logger = new Logger(GEDCOMValidationFilter.name);

  catch(exception: GEDCOMValidationError, host: ArgumentsHost) {
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

  private transformErrors(errors: Array<Record<string, unknown>>) {
    return errors.map((error) => ({
      type: error.type,
      message: error.message,
      line: error.line,
      tag: error.tag,
      value: error.value,
    }));
  }

  private logError(error: GEDCOMValidationError, request: Request) {
    this.logger.error(
      `GEDCOM Validation Failed for request ${request.method} ${request.url}: ${error.message}`,
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
