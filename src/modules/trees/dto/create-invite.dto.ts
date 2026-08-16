import { IsEnum, IsInt, IsOptional, Max, Min } from "class-validator";
import { TreeRole } from "../enums/tree-role.enum";

export class CreateInviteDto {
  @IsEnum([TreeRole.EDITOR, TreeRole.VIEWER])
  role!: TreeRole.EDITOR | TreeRole.VIEWER;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  expiresInDays?: number;
}
