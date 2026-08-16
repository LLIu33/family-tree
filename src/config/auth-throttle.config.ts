import { registerAs } from "@nestjs/config";

export interface AuthThrottleConfig {
  ttlMs: number;
  loginLimit: number;
  registerLimit: number;
  forgotLimit: number;
  resetLimit: number;
}

export const authThrottleConfig = registerAs(
  "authThrottle",
  (): AuthThrottleConfig => ({
    ttlMs: parseInt(process.env.AUTH_THROTTLE_TTL || "60000", 10),
    loginLimit: parseInt(process.env.AUTH_THROTTLE_LIMIT_LOGIN || "5", 10),
    registerLimit: parseInt(
      process.env.AUTH_THROTTLE_LIMIT_REGISTER || "3",
      10,
    ),
    forgotLimit: parseInt(process.env.AUTH_THROTTLE_LIMIT_FORGOT || "3", 10),
    resetLimit: parseInt(process.env.AUTH_THROTTLE_LIMIT_RESET || "5", 10),
  }),
);
