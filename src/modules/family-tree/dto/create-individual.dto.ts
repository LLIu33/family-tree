import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsDateString,
  MaxLength,
  MinLength,
  IsArray,
} from "class-validator";
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

  @ApiPropertyOptional({ description: "Name prefix (e.g. military rank)" })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  namePrefix?: string;

  @ApiPropertyOptional({ description: "Married / alternate surname" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  marriedName?: string;

  @ApiPropertyOptional({ description: "Cause of death" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  deathCause?: string;

  @ApiPropertyOptional({ description: "Burial place" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  burialPlace?: string;

  @ApiPropertyOptional({ description: "Email address" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string;

  @ApiPropertyOptional({ description: "Retirement note" })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  retirementNote?: string;

  @ApiPropertyOptional({ description: "Additional GEDCOM EVEN lines" })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  extraEvents?: string;

  @ApiProperty({
    description: "Notes / additional information",
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  biography?: string;

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
