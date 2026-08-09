import { Injectable, BadRequestException } from "@nestjs/common";
import { Neo4jService } from "../../../neo4j/neo4j.service";
import { StorageService } from "./storage.service";
import { CreateMediaDto, MediaType } from "../dto/create-media.dto";

@Injectable()
export class MediaService {
  constructor(
    private readonly neo4jService: Neo4jService,
    private readonly storageService: StorageService
  ) {}

  async createMedia(
    file: Express.Multer.File,
    createMediaDto: CreateMediaDto
  ): Promise<Record<string, unknown>> {
    const mediaType = createMediaDto.type || MediaType.PHOTO;
    const { url, thumbnailUrl } = await this.storageService.uploadFile(
      file,
      mediaType
    );

    const mediaId = `media_${Date.now()}`;
    const mediaData = {
      id: mediaId,
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
             MATCH (n {id: $attachedToId})
             CREATE (n)-[:HAS_MEDIA]->(m)
             RETURN m`,
      {
        mediaData,
        attachedToId: createMediaDto.attachedToId,
      }
    );

    return mediaData;
  }

  async getMediaForIndividual(individualId: string): Promise<unknown[]> {
    const result = await this.neo4jService.read(
      `MATCH (i:Individual {id: $individualId})-[:HAS_MEDIA]->(m:Media)
             RETURN m ORDER BY m.dateTaken DESC`,
      { individualId }
    );

    return result.records.map((record) => record.get("m").properties);
  }

  async deleteMedia(mediaId: string): Promise<void> {
    const result = await this.neo4jService.read(
      `MATCH (m:Media {id: $mediaId})
             RETURN m.url AS url, m.thumbnailUrl AS thumbnailUrl`,
      { mediaId }
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
      `MATCH (m:Media {id: $mediaId}) DETACH DELETE m`,
      { mediaId }
    );
  }
}
