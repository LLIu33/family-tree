import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class ResetPasswordDto {
  @ApiProperty({ example: "reset-token" })
  @IsString()
  @MinLength(1)
  token: string;

  @ApiProperty({ example: "secret123" })
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password: string;
}
