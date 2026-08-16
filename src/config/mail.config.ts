import { registerAs } from "@nestjs/config";

export interface MailConfig {
  driver: "log";
  appPublicUrl: string;
  passwordResetTtlMs: number;
}

export const mailConfig = registerAs(
  "mail",
  (): MailConfig => ({
    driver: "log",
    appPublicUrl:
      process.env.APP_PUBLIC_URL || "http://localhost:5173",
    passwordResetTtlMs: parseInt(
      process.env.PASSWORD_RESET_TTL_MS || "3600000",
      10,
    ),
  }),
);
