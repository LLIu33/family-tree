import { ApiProperty } from "@nestjs/swagger";
import {
  IsString,
  IsOptional,
  IsDateString,
  IsArray,
  MaxLength,
} from "class-validator";

export class CreateFamilyDto {
  @ApiProperty({
    example: "F12345",
    description: "GEDCOM identifier",
    required: false,
  })
  @IsOptional()
  @IsString()
  gedcomId?: string;

  @ApiProperty({
    example: "I123",
    description: "ID of the husband",
    required: false,
  })
  @IsOptional()
  @IsString()
  husbandId?: string;

  @ApiProperty({
    example: "I456",
    description: "ID of the wife",
    required: false,
  })
  @IsOptional()
  @IsString()
  wifeId?: string;

  @ApiProperty({
    example: ["I789", "I101"],
    description: "Array of children IDs",
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  childrenIds?: string[];

  @ApiProperty({
    example: "2005-06-18",
    description: "Marriage date in YYYY-MM-DD format",
    required: false,
  })
  @IsOptional()
  @IsDateString()
  marriageDate?: string;

  @ApiProperty({
    example: "Las Vegas, Nevada",
    description: "Marriage place",
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  marriagePlace?: string;

  @ApiProperty({
    example: "2010-11-20",
    description: "Divorce date in YYYY-MM-DD format",
    required: false,
  })
  @IsOptional()
  @IsDateString()
  divorceDate?: string;

  @ApiProperty({
    example: ["E123", "E456"],
    description: "Array of event IDs associated with this family",
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  eventIds?: string[];
}
