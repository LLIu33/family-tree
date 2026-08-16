import { ArgumentsHost, HttpStatus } from "@nestjs/common";
import { GEDCOMValidationError } from "../errors/gedcom-validation.error";
import { GEDCOMValidationFilter } from "./gedcom-validation.filter";

describe("GEDCOMValidationFilter", () => {
  it("responds with 422 and transformed validation errors", () => {
    const filter = new GEDCOMValidationFilter();
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ method: "POST", url: "/family-tree/import/gedcom" }),
      }),
    } as unknown as ArgumentsHost;

    const error = new GEDCOMValidationError(
      [
        {
          type: "syntax",
          message: "bad tag",
          line: 12,
          tag: "XXX",
          value: "1",
        },
      ],
      {
        fileName: "tree.ged",
        size: 100,
        encoding: "utf-8",
      },
    );

    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        path: "/family-tree/import/gedcom",
        message: "GEDCOM Validation Failed",
        errors: [
          {
            type: "syntax",
            message: "bad tag",
            line: 12,
            tag: "XXX",
            value: "1",
          },
        ],
        file: {
          fileName: "tree.ged",
          size: 100,
          encoding: "utf-8",
        },
      }),
    );
  });
});
