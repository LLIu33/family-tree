import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthUser } from "../../auth/interfaces/auth.interface";
import { MIN_ROLE_KEY } from "../decorators/min-role.decorator";
import { TreeRole } from "../enums/tree-role.enum";
import { TreeAccessService } from "../services/tree-access.service";

@Injectable()
export class MinRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly treeAccess: TreeAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const minRole = this.reflector.getAllAndOverride<TreeRole>(MIN_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!minRole) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<{ user: AuthUser }>();
    await this.treeAccess.assertMinRole(user.userId, user.treeId, minRole);
    return true;
  }
}
