import { ApiProperty } from "@nestjs/swagger";
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsDateString,
  MaxLength,
  MinLength,
  IsArray,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { Sex } from "../enums/sex.enum";

export class CreateIndividualDto {
  @ApiProperty({
    example: "John",
    description: "First name of the individual",
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  firstName: string;

  @ApiProperty({
    example: "Doe",
    description: "Last name of the individual",
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  lastName: string;

  @ApiProperty({
    enum: Sex,
    example: Sex.MALE,
    description: "Gender of the individual",
  })
  @IsEnum(Sex)
  sex: Sex;

  @ApiProperty({
    example: "1990-05-15",
    description: "Date of birth in YYYY-MM-DD format",
    required: false,
  })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiProperty({
    example: "New York, USA",
    description: "Place of birth",
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  birthPlace?: string;

  @ApiProperty({
    example: "2020-10-20",
    description: "Date of death in YYYY-MM-DD format",
    required: false,
  })
  @IsOptional()
  @IsDateString()
  deathDate?: string;

  @ApiProperty({
    example: "Los Angeles, USA",
    description: "Place of death",
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deathPlace?: string;

  @ApiProperty({
    example: "Software Engineer",
    description: "Occupation/profession",
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  occupation?: string;

  @ApiProperty({
    example: "I12345",
    description: "GEDCOM identifier",
    required: false,
  })
  @IsOptional()
  @IsString()
  gedcomId?: string;

  @ApiProperty({
    example: ["F123", "F456"],
    description: "Array of family IDs this individual belongs to as a child",
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  parentFamilyIds?: string[];
}
