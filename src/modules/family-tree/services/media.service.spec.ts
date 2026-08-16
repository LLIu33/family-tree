import { BadRequestException } from "@nestjs/common";
import { Neo4jService } from "../../../neo4j/neo4j.service";
import { MediaType } from "../dto/create-media.dto";
import { MediaService } from "./media.service";
import { StorageService } from "./storage.service";

describe("MediaService", () => {
  let service: MediaService;
  let neo4j: { read: jest.Mock; write: jest.Mock };
  let storage: { uploadFile: jest.Mock; deleteFile: jest.Mock };

  const file = {
    originalname: "photo.jpg",
    mimetype: "image/jpeg",
    buffer: Buffer.from("img"),
  } as Express.Multer.File;

  beforeEach(() => {
    neo4j = { read: jest.fn(), write: jest.fn().mockResolvedValue({ records: [] }) };
    storage = {
      uploadFile: jest.fn().mockResolvedValue({
        url: "https://cdn.example/photo.jpg",
        thumbnailUrl: "https://cdn.example/thumb.webp",
      }),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    };
    service = new MediaService(
      neo4j as unknown as Neo4jService,
      storage as unknown as StorageService,
    );
  });

  it("createMedia uploads, writes graph node, and returns media data", async () => {
    const result = await service.createMedia("tree-1", file, {
      type: MediaType.PHOTO,
      attachedToId: "indi-1",
      description: "portrait",
      dateTaken: "2000-01-01",
    });

    expect(storage.uploadFile).toHaveBeenCalledWith(file, MediaType.PHOTO);
    expect(neo4j.write).toHaveBeenCalledWith(
      expect.stringContaining("HAS_MEDIA"),
      expect.objectContaining({
        attachedToId: "indi-1",
        treeId: "tree-1",
        mediaData: expect.objectContaining({
          treeId: "tree-1",
          type: MediaType.PHOTO,
          url: "https://cdn.example/photo.jpg",
          thumbnailUrl: "https://cdn.example/thumb.webp",
          description: "portrait",
          dateTaken: "2000-01-01",
        }),
      }),
    );
    expect(result.id).toMatch(/^media_/);
  });

  it("createMedia defaults type to PHOTO", async () => {
    await service.createMedia("tree-1", file, {
      attachedToId: "indi-1",
    } as any);

    expect(storage.uploadFile).toHaveBeenCalledWith(file, MediaType.PHOTO);
  });

  it("getMediaForIndividual maps media properties", async () => {
    neo4j.read.mockResolvedValue({
      records: [
        { get: () => ({ properties: { id: "m1", url: "https://x/a.jpg" } }) },
      ],
    });

    await expect(
      service.getMediaForIndividual("tree-1", "indi-1"),
    ).resolves.toEqual([{ id: "m1", url: "https://x/a.jpg" }]);
  });

  it("deleteMedia removes storage objects and graph node", async () => {
    neo4j.read.mockResolvedValue({
      records: [
        {
          toObject: () => ({
            url: "https://cdn.example/photo.jpg",
            thumbnailUrl: "https://cdn.example/thumb.webp",
          }),
        },
      ],
    });

    await expect(service.deleteMedia("tree-1", "m1")).resolves.toBe(true);
    expect(storage.deleteFile).toHaveBeenCalledWith(
      "https://cdn.example/photo.jpg",
    );
    expect(storage.deleteFile).toHaveBeenCalledWith(
      "https://cdn.example/thumb.webp",
    );
    expect(neo4j.write).toHaveBeenCalledWith(
      expect.stringContaining("DELETE r, m"),
      { mediaId: "m1", treeId: "tree-1" },
    );
  });

  it("deleteMedia skips thumbnail delete when absent", async () => {
    neo4j.read.mockResolvedValue({
      records: [
        {
          toObject: () => ({
            url: "https://cdn.example/doc.pdf",
            thumbnailUrl: "",
          }),
        },
      ],
    });

    await service.deleteMedia("tree-1", "m2");
    expect(storage.deleteFile).toHaveBeenCalledTimes(1);
    expect(storage.deleteFile).toHaveBeenCalledWith(
      "https://cdn.example/doc.pdf",
    );
  });

  it("deleteMedia throws when media is missing", async () => {
    neo4j.read.mockResolvedValue({ records: [] });

    await expect(service.deleteMedia("tree-1", "missing")).rejects.toThrow(
      BadRequestException,
    );
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });
});
