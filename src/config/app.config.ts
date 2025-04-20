import { registerAs } from "@nestjs/config";
import { validateConfig } from "./validation-schema";

export interface AppConfig {
  nodeEnv: string;
  port: number;
  apiPrefix: string;
  isSwaggerEnabled: boolean;
}

export const appConfig = registerAs("app", (): AppConfig => {
  const config: AppConfig = {
    nodeEnv: process.env.NODE_ENV!,
    port: parseInt(process.env.PORT || "3000", 10),
    apiPrefix: process.env.API_PREFIX || "api",
    isSwaggerEnabled: process.env.SWAGGER_ENABLED === "true",
  };

  validateConfig(config as any);
  return config;
});
