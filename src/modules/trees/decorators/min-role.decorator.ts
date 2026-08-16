import { SetMetadata } from "@nestjs/common";
import { TreeRole } from "../enums/tree-role.enum";

export const MIN_ROLE_KEY = "minRole";

export const MinRole = (role: TreeRole) => SetMetadata(MIN_ROLE_KEY, role);
