import { Injectable, BadRequestException } from "@nestjs/common";
import { Neo4jService } from "../../../neo4j/neo4j.service";
import { StorageService } from "./storage.service";
import { CreateMediaDto, MediaType } from "../dto/create-media.dto";

@Injectable()
export class MediaService {
  constructor(
    private readonly neo4jService: Neo4jService,
    private readonly storageService: StorageService,
  ) {}

  async createMedia(
    treeId: string,
    file: Express.Multer.File,
    createMediaDto: CreateMediaDto,
  ): Promise<Record<string, unknown>> {
    const mediaType = createMediaDto.type || MediaType.PHOTO;
    const { url, thumbnailUrl } = await this.storageService.uploadFile(
      file,
      mediaType,
    );

    const mediaId = `media_${Date.now()}`;
    const mediaData = {
      id: mediaId,
      treeId,
      type: mediaType,
      url,
      thumbnailUrl,
      description: createMediaDto.description,
      dateTaken: createMediaDto.dateTaken,
      createdAt: new Date().toISOString(),
    };

    await this.neo4jService.write(
      `CREATE (m:Media $mediaData)
             WITH m
             MATCH (n:Individual {id: $attachedToId, treeId: $treeId})
             CREATE (n)-[:HAS_MEDIA]->(m)
             RETURN m`,
      {
        mediaData,
        attachedToId: createMediaDto.attachedToId,
        treeId,
      },
    );

    return mediaData;
  }

  async getMediaForIndividual(
    treeId: string,
    individualId: string,
  ): Promise<unknown[]> {
    const result = await this.neo4jService.read(
      `MATCH (i:Individual {id: $individualId, treeId: $treeId})-[:HAS_MEDIA]->(m:Media)
             RETURN m ORDER BY m.dateTaken DESC`,
      { individualId, treeId },
    );

    return result.records.map((record) => record.get("m").properties);
  }

  async deleteMedia(treeId: string, mediaId: string): Promise<boolean> {
    const result = await this.neo4jService.read(
      `MATCH (m:Media {id: $mediaId, treeId: $treeId})
             RETURN m.url AS url, m.thumbnailUrl AS thumbnailUrl`,
      { mediaId, treeId },
    );

    if (result.records.length === 0) {
      throw new BadRequestException("Media not found");
    }

    const { url, thumbnailUrl } = result.records[0].toObject();

    await this.storageService.deleteFile(url);
    if (thumbnailUrl) {
      await this.storageService.deleteFile(thumbnailUrl);
    }

    await this.neo4jService.write(
      `MATCH (m:Media {id: $mediaId, treeId: $treeId})
             OPTIONAL MATCH (m)-[r]-()
             DELETE r, m`,
      { mediaId, treeId },
    );

    return true;
  }
}
