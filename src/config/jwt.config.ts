import { registerAs } from "@nestjs/config";

export interface JwtConfig {
  secret: string;
  expiresIn: string;
}

export const jwtConfig = registerAs(
  "jwt",
  (): JwtConfig => ({
    secret: process.env.JWT_SECRET || "dev-family-tree-secret-change-me",
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  })
);
