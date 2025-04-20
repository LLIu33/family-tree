import { registerAs } from "@nestjs/config";
import { validateConfig } from "./validation-schema";

export interface StorageConfig {
  type: "s3" | "local";
  localPath?: string;
  s3?: {
    accessKey: string;
    secretKey: string;
    region: string;
    bucket: string;
  };
  maxFileSizeMB: number;
  allowedMimeTypes: string;
}

export const storageConfig = registerAs("storage", (): StorageConfig => {
  const config: StorageConfig = {
    type: process.env.STORAGE_TYPE as "s3" | "local",
    maxFileSizeMB: parseInt(process.env.GEDCOM_MAX_FILE_SIZE || "10", 10),
    allowedMimeTypes: process.env.STORAGE_ALLOWED_MIME_TYPES!,
  };

  if (config.type === "local") {
    config.localPath = process.env.STORAGE_LOCAL_PATH || "./uploads";
  } else {
    config.s3 = {
      accessKey: process.env.AWS_ACCESS_KEY_ID!,
      secretKey: process.env.AWS_SECRET_ACCESS_KEY!,
      region: process.env.AWS_REGION!,
      bucket: process.env.AWS_S3_BUCKET!,
    };
  }

  validateConfig(config as any);
  return config;
});
