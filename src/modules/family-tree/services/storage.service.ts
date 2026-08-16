import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { v4 as uuidV4 } from "uuid";
import {
  buildPublicObjectUrl,
  extractObjectKeyFromUrl,
} from "./storage-url.utils";

type S3Client = {
  upload: (params: Record<string, unknown>) => { promise: () => Promise<unknown> };
  deleteObject: (params: Record<string, unknown>) => {
    promise: () => Promise<unknown>;
  };
};

@Injectable()
export class StorageService {
  private s3: S3Client | null = null;
  private s3Init: Promise<S3Client> | null = null;

  constructor(private readonly configService: ConfigService) {}

  private storageType(): string {
    return (
      this.configService.get<string>("storage.type") ||
      this.configService.get<string>("STORAGE_TYPE") ||
      "s3"
    );
  }

  private bucketName(): string {
    return (
      this.configService.get<string>("storage.s3.bucket") ||
      this.configService.get<string>("AWS_S3_BUCKET") ||
      ""
    );
  }

  private endpoint(): string | undefined {
    const value =
      this.configService.get<string>("storage.s3.endpoint") ||
      this.configService.get<string>("AWS_S3_ENDPOINT") ||
      "";
    return value.trim() || undefined;
  }

  private forcePathStyle(): boolean {
    const configured = this.configService.get<boolean>("storage.s3.forcePathStyle");
    if (configured !== undefined && configured !== null) {
      return configured;
    }
    return Boolean(this.endpoint());
  }

  /** Public base for object URLs (no trailing slash). */
  private publicUrlBase(): string {
    const configured =
      this.configService.get<string>("storage.s3.publicUrlBase") ||
      this.configService.get<string>("AWS_S3_PUBLIC_URL_BASE") ||
      "";
    const trimmed = configured.trim().replace(/\/+$/, "");
    if (trimmed) return trimmed;

    const bucket = this.bucketName();
    return `https://${bucket}.s3.amazonaws.com`;
  }

  private async requireS3(): Promise<S3Client> {
    if (this.storageType() !== "s3") {
      throw new Error("S3 storage is not configured (STORAGE_TYPE is not s3)");
    }
    if (this.s3) return this.s3;
    if (!this.s3Init) {
      this.s3Init = (async () => {
        const AWS = (await import("aws-sdk")).default;
        const endpoint = this.endpoint();
        const client = new AWS.S3({
          accessKeyId:
            this.configService.get("storage.s3.accessKey") ||
            this.configService.get("AWS_ACCESS_KEY_ID"),
          secretAccessKey:
            this.configService.get("storage.s3.secretKey") ||
            this.configService.get("AWS_SECRET_ACCESS_KEY"),
          region:
            this.configService.get("storage.s3.region") ||
            this.configService.get("AWS_REGION"),
          ...(endpoint
            ? {
                endpoint,
                s3ForcePathStyle: this.forcePathStyle(),
              }
            : {}),
        }) as unknown as S3Client;
        this.s3 = client;
        return client;
      })();
    }
    return this.s3Init;
  }

  async uploadFile(
    file: Express.Multer.File,
    type: string
  ): Promise<{ url: string; thumbnailUrl: string }> {
    const s3 = await this.requireS3();
    const bucketName = this.bucketName();
    const publicBase = this.publicUrlBase();
    const uploadId = uuidV4();

    const fileKey = `${type.toLowerCase()}/${uploadId}_original.${file.originalname
      .split(".")
      .pop()}`;
    await s3
      .upload({
        Bucket: bucketName,
        Key: fileKey,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: "public-read",
      })
      .promise();

    let thumbnailKey = "";
    if (type === "PHOTO") {
      const sharp = (await import("sharp")).default;
      thumbnailKey = `${type.toLowerCase()}/${uploadId}_thumbnail.webp`;
      const thumbnailBuffer = await sharp(file.buffer)
        .resize(300, 300, { fit: "inside" })
        .webp()
        .toBuffer();

      await s3
        .upload({
          Bucket: bucketName,
          Key: thumbnailKey,
          Body: thumbnailBuffer,
          ContentType: "image/webp",
          ACL: "public-read",
        })
        .promise();
    }

    return {
      url: buildPublicObjectUrl(publicBase, fileKey),
      thumbnailUrl: thumbnailKey
        ? buildPublicObjectUrl(publicBase, thumbnailKey)
        : "",
    };
  }

  async deleteFile(url: string): Promise<void> {
    const s3 = await this.requireS3();
    const bucketName = this.bucketName();
    const key = extractObjectKeyFromUrl(url, this.publicUrlBase(), bucketName);

    await s3
      .deleteObject({
        Bucket: bucketName,
        Key: key,
      })
      .promise();
  }
}
