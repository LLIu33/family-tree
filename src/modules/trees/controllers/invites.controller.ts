import { Controller, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { AuthUser } from "../../auth/interfaces/auth.interface";
import { InviteService } from "../services/invite.service";

@ApiTags("Invites")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("invites")
export class InvitesController {
  constructor(private readonly inviteService: InviteService) {}

  @Post(":token/accept")
  @ApiOperation({ summary: "Accept an invite and switch into the tree" })
  accept(@CurrentUser() user: AuthUser, @Param("token") token: string) {
    return this.inviteService.acceptInvite(user.userId, token);
  }
}
