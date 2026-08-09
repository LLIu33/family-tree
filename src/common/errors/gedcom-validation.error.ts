export class GEDCOMValidationError extends Error {
  constructor(
    public readonly errors: Array<{
      type: string;
      message: string;
      line?: number;
      tag?: string;
      value?: string;
      xref?: string;
    }>,
    public readonly fileMetadata?: {
      fileName: string;
      source?: string;
      size: number;
      encoding: string;
    }
  ) {
    super("GEDCOM validation failed");
    this.name = "GEDCOMValidationError";
  }
}
