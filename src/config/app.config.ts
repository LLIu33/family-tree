import { registerAs } from "@nestjs/config";

export interface AppConfig {
  nodeEnv: string;
  port: number;
  apiPrefix: string;
  isSwaggerEnabled: boolean;
}

export const appConfig = registerAs("app", (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "3000", 10),
  apiPrefix: process.env.API_PREFIX || "api",
  isSwaggerEnabled: process.env.SWAGGER_ENABLED === "true",
}));
