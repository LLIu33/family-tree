import { Injectable, BadRequestException } from "@nestjs/common";
import { GraphQLUpload } from "graphql-upload";
import { Neo4jService } from "../../../neo4j/neo4j.service";
import { StorageService } from "./storage.service";
import { CreateMediaDto } from "../dto/create-media.dto";

@Injectable()
export class MediaService {
  constructor(
    private readonly neo4jService: Neo4jService,
    private readonly storageService: StorageService
  ) {}

  async uploadMedia(
    upload: Promise<GraphQLUpload>,
    createMediaDto: CreateMediaDto
  ): Promise<any> {
    // Получаем файл из промиса
    const { createReadStream, filename, mimetype } = await upload;

    // Создаем временный файл для загрузки
    const file: Express.Multer.File = {
      fieldname: "file",
      originalname: filename,
      encoding: "7bit",
      mimetype,
      stream: createReadStream(),
      destination: "",
      filename: filename,
      path: "",
      size: 0, // Размер будет определен при сохранении
      buffer: null as any,
    };

    // Используем существующий метод createMedia
    return this.createMedia(file, createMediaDto);
  }

  async createMedia(
    file: Express.Multer.File,
    createMediaDto: CreateMediaDto
  ): Promise<any> {
    // Загрузка файла в хранилище
    const { url, thumbnailUrl } = await this.storageService.uploadFile(
      file,
      createMediaDto.type
    );

    // Создание записи в Neo4j
    const mediaId = `media_${Date.now()}`;
    const mediaData = {
      id: mediaId,
      type: createMediaDto.type,
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

  async getMediaForIndividual(individualId: string): Promise<any[]> {
    const result = await this.neo4jService.read(
      `MATCH (i:Individual {id: $individualId})-[:HAS_MEDIA]->(m:Media)
             RETURN m ORDER BY m.dateTaken DESC`,
      { individualId }
    );

    return result.records.map((record) => record.get("m").properties);
  }

  async deleteMedia(mediaId: string): Promise<void> {
    // Получаем информацию о файле перед удалением
    const result = await this.neo4jService.read(
      `MATCH (m:Media {id: $mediaId})
             RETURN m.url, m.thumbnailUrl`,
      { mediaId }
    );

    if (result.records.length === 0) {
      throw new BadRequestException("Media not found");
    }

    const { url, thumbnailUrl } = result.records[0].toObject();

    // Удаляем файлы из хранилища
    await this.storageService.deleteFile(url);
    if (thumbnailUrl) {
      await this.storageService.deleteFile(thumbnailUrl);
    }

    // Удаляем запись из Neo4j
    await this.neo4jService.write(
      `MATCH (m:Media {id: $mediaId}) DETACH DELETE m`,
      { mediaId }
    );
  }
}
