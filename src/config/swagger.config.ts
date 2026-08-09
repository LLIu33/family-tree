import { registerAs } from "@nestjs/config";
import { OpenAPIObject } from "@nestjs/swagger";

export interface SwaggerConfig {
  enabled: boolean;
  title: string;
  description: string;
  version: string;
  path: string;
}

export const swaggerConfig = registerAs("swagger", (): SwaggerConfig => ({
  enabled: process.env.SWAGGER_ENABLED === "true",
  title: process.env.SWAGGER_TITLE || "Family Tree API",
  description:
    process.env.SWAGGER_DESCRIPTION ||
    "API for managing genealogical data and family trees",
  version: process.env.SWAGGER_VERSION || "1.0",
  path: process.env.SWAGGER_PATH || "api-docs",
}));

export const SWAGGER_CONFIG: Omit<OpenAPIObject, "paths"> = {
  openapi: "3.0.0",
  info: {
    title: "Family Tree API",
    version: "1.0",
    description: "API for genealogical data management",
  },
  servers: [
    {
      url: "http://localhost:3000",
      description: "Development server",
    },
  ],
};
