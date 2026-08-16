import { ApiProperty } from "@nestjs/swagger";
import { IsEmail } from "class-validator";

export class ForgotPasswordDto {
  @ApiProperty({ example: "ada@lovelace.dev" })
  @IsEmail()
  email: string;
}
