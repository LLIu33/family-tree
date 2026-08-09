import { registerAs } from "@nestjs/config";

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
  const type = (process.env.STORAGE_TYPE as "s3" | "local") || "s3";
  const config: StorageConfig = {
    type,
    maxFileSizeMB: parseInt(
      process.env.STORAGE_MAX_FILE_SIZE_MB ||
        process.env.MAX_FILE_SIZE_MB ||
        "10",
      10
    ),
    allowedMimeTypes:
      process.env.STORAGE_ALLOWED_MIME_TYPES ||
      "image/jpeg,image/png,image/webp,application/pdf",
  };

  if (config.type === "local") {
    config.localPath = process.env.STORAGE_LOCAL_PATH || "./uploads";
  } else {
    config.s3 = {
      accessKey: process.env.AWS_ACCESS_KEY_ID || "",
      secretKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      region: process.env.AWS_REGION || "us-east-1",
      bucket: process.env.AWS_S3_BUCKET || "",
    };
  }

  return config;
});
