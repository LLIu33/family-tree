import { registerAs } from "@nestjs/config";

export interface SwaggerConfig {
  enabled: boolean;
  title: string;
  description: string;
  version: string;
  path: string;
}

export const swaggerConfig = registerAs("swagger", (): SwaggerConfig => ({
  enabled: process.env.SWAGGER_ENABLED === "true",
  title: process.env.SWAGGER_TITLE || "Древо API",
  description:
    process.env.SWAGGER_DESCRIPTION ||
    "API for managing genealogical data and family trees",
  version: process.env.SWAGGER_VERSION || "1.0",
  path: process.env.SWAGGER_PATH || "api-docs",
}));
