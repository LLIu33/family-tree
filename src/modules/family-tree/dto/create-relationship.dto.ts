import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsNotEmpty, IsOptional } from "class-validator";
import { RelationType } from "../enums/relation-type.enum";

export class CreateRelationshipDto {
  @ApiProperty({
    example: "I123",
    description: "ID исходного индивида",
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  fromIndividualId: string;

  @ApiProperty({
    example: "I456",
    description: "ID целевого индивида",
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  toIndividualId: string;

  @ApiProperty({
    example: "PARENT",
    description: "Тип устанавливаемой связи",
    enum: RelationType,
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  relationshipType: RelationType;

  @ApiProperty({
    example: "2020-05-15",
    description: "Дата начала связи (для временных отношений)",
    required: false,
  })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiProperty({
    example: "2023-10-20",
    description: "Дата окончания связи (для разводов и т.п.)",
    required: false,
  })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiProperty({
    example: "New York, USA",
    description: "Место установления связи",
    required: false,
  })
  @IsOptional()
  @IsString()
  place?: string;
}
