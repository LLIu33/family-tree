import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { v4 as uuidV4 } from "uuid";
import sharp from "sharp";
import AWS from "aws-sdk";

@Injectable()
export class StorageService {
  private s3: any;

  constructor(private readonly configService: ConfigService) {
    this.s3 = new AWS.S3({
      accessKeyId: this.configService.get("AWS_ACCESS_KEY_ID"),
      secretAccessKey: this.configService.get("AWS_SECRET_ACCESS_KEY"),
      region: this.configService.get("AWS_REGION"),
    });
  }

  async uploadFile(
    file: Express.Multer.File,
    type: string
  ): Promise<{ url: string; thumbnailUrl: string }> {
    const bucketName = this.configService.get("AWS_S3_BUCKET");
    const uploadId = uuidV4();

    // Загрузка основного файла
    const fileKey = `${type.toLowerCase()}/${uploadId}_original.${file.originalname
      .split(".")
      .pop()}`;
    await this.s3
      .upload({
        Bucket: bucketName,
        Key: fileKey,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: "public-read",
      })
      .promise();

    // Создание и загрузка превью (для изображений)
    let thumbnailKey = "";
    if (type === "PHOTO") {
      thumbnailKey = `${type.toLowerCase()}/${uploadId}_thumbnail.webp`;
      const thumbnailBuffer = await sharp(file.buffer)
        .resize(300, 300, { fit: "inside" })
        .webp()
        .toBuffer();

      await this.s3
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
    const bucketName = this.configService.get("AWS_S3_BUCKET");
    const key = url.replace(`https://${bucketName}.s3.amazonaws.com/`, "");

    await this.s3
      .deleteObject({
        Bucket: bucketName,
        Key: key,
      })
      .promise();
  }
}
