import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
} from "class-validator";

export class RegisterDto {
  @ApiProperty({ example: "ada@lovelace.dev" })
  @IsEmail()
  email: string;

  @ApiProperty({ example: "secret123" })
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password: string;

  @ApiProperty({ example: "Ada Lovelace" })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: "Lovelace Family" })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  treeName?: string;
}
