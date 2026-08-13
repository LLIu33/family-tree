import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { v4 as uuidV4 } from "uuid";
import AWS from "aws-sdk";

@Injectable()
export class StorageService {
  private s3: AWS.S3 | null = null;

  constructor(private readonly configService: ConfigService) {
    const storageType =
      this.configService.get<string>("storage.type") ||
      this.configService.get<string>("STORAGE_TYPE") ||
      "s3";
    if (storageType === "s3") {
      this.s3 = new AWS.S3({
        accessKeyId: this.configService.get("AWS_ACCESS_KEY_ID"),
        secretAccessKey: this.configService.get("AWS_SECRET_ACCESS_KEY"),
        region: this.configService.get("AWS_REGION"),
      });
    }
  }

  private requireS3(): AWS.S3 {
    if (!this.s3) {
      throw new Error("S3 storage is not configured (STORAGE_TYPE is not s3)");
    }
    return this.s3;
  }

  async uploadFile(
    file: Express.Multer.File,
    type: string
  ): Promise<{ url: string; thumbnailUrl: string }> {
    const s3 = this.requireS3();
    const bucketName = this.configService.get("AWS_S3_BUCKET");
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
      url: `https://${bucketName}.s3.amazonaws.com/${fileKey}`,
      thumbnailUrl: thumbnailKey
        ? `https://${bucketName}.s3.amazonaws.com/${thumbnailKey}`
        : "",
    };
  }

  async deleteFile(url: string): Promise<void> {
    const s3 = this.requireS3();
    const bucketName = this.configService.get("AWS_S3_BUCKET");
    const key = url.replace(`https://${bucketName}.s3.amazonaws.com/`, "");

    await s3
      .deleteObject({
        Bucket: bucketName,
        Key: key,
      })
      .promise();
  }
}
