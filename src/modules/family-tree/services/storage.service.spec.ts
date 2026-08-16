import { ConfigService } from "@nestjs/config";
import { StorageService } from "./storage.service";

const uploadPromise = jest.fn().mockResolvedValue({});
const deletePromise = jest.fn().mockResolvedValue({});
const upload = jest.fn(() => ({ promise: uploadPromise }));
const deleteObject = jest.fn(() => ({ promise: deletePromise }));

const S3Mock = jest.fn().mockImplementation(() => ({
  upload,
  deleteObject,
}));

const sharpToBuffer = jest.fn().mockResolvedValue(Buffer.from("thumb"));
const sharpWebp = jest.fn(() => ({ toBuffer: sharpToBuffer }));
const sharpResize = jest.fn(() => ({ webp: sharpWebp }));
const sharpMock = jest.fn(() => ({ resize: sharpResize }));

jest.mock("aws-sdk", () => ({
  __esModule: true,
  default: { S3: S3Mock },
}));

jest.mock("sharp", () => ({
  __esModule: true,
  default: sharpMock,
}));

jest.mock("uuid", () => ({
  v4: () => "fixed-uuid",
}));

describe("StorageService", () => {
  let configGet: jest.Mock;
  let service: StorageService;

  beforeEach(() => {
    jest.clearAllMocks();
    configGet = jest.fn((key: string) => {
      const values: Record<string, unknown> = {
        "storage.type": "s3",
        "storage.s3.bucket": "my-bucket",
        "storage.s3.endpoint": "storage.yandexcloud.net",
        "storage.s3.accessKey": "key",
        "storage.s3.secretKey": "secret",
        "storage.s3.region": "ru-central1",
        "storage.s3.publicUrlBase":
          "https://storage.yandexcloud.net/my-bucket",
        "storage.s3.forcePathStyle": true,
      };
      return values[key];
    });
    service = new StorageService({
      get: configGet,
    } as unknown as ConfigService);
  });

  it("uploadFile uploads original and thumbnail for PHOTO", async () => {
    const file = {
      originalname: "face.jpg",
      mimetype: "image/jpeg",
      buffer: Buffer.from("img"),
    } as Express.Multer.File;

    const result = await service.uploadFile(file, "PHOTO");

    expect(S3Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "https://storage.yandexcloud.net",
        s3ForcePathStyle: true,
        signatureVersion: "v4",
      }),
    );
    expect(upload).toHaveBeenCalledTimes(2);
    expect(sharpMock).toHaveBeenCalled();
    expect(result).toEqual({
      url: "https://storage.yandexcloud.net/my-bucket/photo/fixed-uuid_original.jpg",
      thumbnailUrl:
        "https://storage.yandexcloud.net/my-bucket/photo/fixed-uuid_thumbnail.webp",
    });
  });

  it("uploadFile skips thumbnail for non-PHOTO types", async () => {
    const file = {
      originalname: "doc.pdf",
      mimetype: "application/pdf",
      buffer: Buffer.from("pdf"),
    } as Express.Multer.File;

    const result = await service.uploadFile(file, "DOCUMENT");

    expect(upload).toHaveBeenCalledTimes(1);
    expect(sharpMock).not.toHaveBeenCalled();
    expect(result.thumbnailUrl).toBe("");
    expect(result.url).toContain("document/fixed-uuid_original.pdf");
  });

  it("deleteFile deletes extracted object key", async () => {
    await service.deleteFile(
      "https://storage.yandexcloud.net/my-bucket/photo/a.jpg",
    );

    expect(deleteObject).toHaveBeenCalledWith({
      Bucket: "my-bucket",
      Key: "photo/a.jpg",
    });
  });

  it("rejects when storage type is not s3", async () => {
    configGet.mockImplementation((key: string) =>
      key === "storage.type" ? "local" : undefined,
    );
    service = new StorageService({
      get: configGet,
    } as unknown as ConfigService);

    await expect(
      service.uploadFile(
        {
          originalname: "a.jpg",
          mimetype: "image/jpeg",
          buffer: Buffer.from("x"),
        } as Express.Multer.File,
        "PHOTO",
      ),
    ).rejects.toThrow("S3 storage is not configured");
  });
});
