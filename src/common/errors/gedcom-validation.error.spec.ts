import { GEDCOMValidationError } from "./gedcom-validation.error";

describe("GEDCOMValidationError", () => {
  it("stores errors and optional file metadata", () => {
    const errors = [{ type: "syntax", message: "bad line", line: 3 }];
    const meta = { fileName: "a.ged", size: 10, encoding: "utf-8" };
    const error = new GEDCOMValidationError(errors, meta);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("GEDCOMValidationError");
    expect(error.message).toBe("GEDCOM validation failed");
    expect(error.errors).toEqual(errors);
    expect(error.fileMetadata).toEqual(meta);
  });
});
