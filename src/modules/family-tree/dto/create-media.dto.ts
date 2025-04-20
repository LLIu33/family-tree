import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString } from "class-validator";

export enum MediaType {
  PHOTO = "PHOTO",
  DOCUMENT = "DOCUMENT",
  AUDIO = "AUDIO",
  VIDEO = "VIDEO",
}

export class CreateMediaDto {
  @ApiProperty({ enum: MediaType })
  @IsEnum(MediaType)
  type: MediaType;

  @ApiProperty()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  dateTaken?: string;

  @ApiProperty()
  @IsString()
  attachedToId: string; // ID индивида или события
}
