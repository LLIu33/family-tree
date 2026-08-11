import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsNotEmpty, IsOptional } from "class-validator";

export class ImportGedcomDto {
  @ApiProperty({
    example: "web",
    description: "Источник данных GEDCOM",
    required: false,
  })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiProperty({
    example: "1.0",
    description: "Версия формата GEDCOM",
    required: false,
  })
  @IsOptional()
  @IsString()
  version?: string;

  @ApiProperty({
    example: "2023-01-15",
    description: "Дата создания файла",
    required: false,
  })
  @IsOptional()
  @IsString()
  fileDate?: string;

  @ApiProperty({
    example: "UTF-8",
    description: "Кодировка файла",
    required: false,
  })
  @IsOptional()
  @IsString()
  encoding?: string;

  @ApiProperty({
    example: "true",
    description: "Пропускать дубликаты при импорте",
    required: false,
  })
  @IsOptional()
  @IsString()
  skipDuplicates?: boolean;
}
