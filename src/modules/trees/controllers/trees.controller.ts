import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthService } from "../../auth/auth.service";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { AuthUser } from "../../auth/interfaces/auth.interface";
import { CreateInviteDto } from "../dto/create-invite.dto";
import { InviteService } from "../services/invite.service";
import { TreeAccessService } from "../services/tree-access.service";

@ApiTags("Trees")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("trees")
export class TreesController {
  constructor(
    private readonly treeAccess: TreeAccessService,
    private readonly authService: AuthService,
    private readonly inviteService: InviteService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List trees accessible to the current user" })
  list(@CurrentUser() user: AuthUser) {
    return this.treeAccess.listAccessibleTrees(user.userId);
  }

  @Post(":treeId/switch")
  @ApiOperation({ summary: "Switch active tree and issue a new session" })
  switch(@CurrentUser() user: AuthUser, @Param("treeId") treeId: string) {
    return this.authService.issueSessionForTree(user.userId, treeId);
  }

  @Post(":treeId/invites")
  @ApiOperation({ summary: "Create an invite for a tree" })
  createInvite(
    @CurrentUser() user: AuthUser,
    @Param("treeId") treeId: string,
    @Body() dto: CreateInviteDto,
  ) {
    return this.inviteService.createInvite(
      user.userId,
      treeId,
      dto.role,
      dto.expiresInDays,
    );
  }

  @Get(":treeId/invites")
  @ApiOperation({ summary: "List active invites for a tree" })
  listInvites(@CurrentUser() user: AuthUser, @Param("treeId") treeId: string) {
    return this.inviteService.listInvites(user.userId, treeId);
  }

  @Delete(":treeId/invites/:inviteId")
  @ApiOperation({ summary: "Revoke an invite" })
  revokeInvite(
    @CurrentUser() user: AuthUser,
    @Param("treeId") treeId: string,
    @Param("inviteId") inviteId: string,
  ) {
    return this.inviteService.revokeInvite(user.userId, treeId, inviteId);
  }

  @Get(":treeId/members")
  @ApiOperation({ summary: "List members of a tree" })
  listMembers(@CurrentUser() user: AuthUser, @Param("treeId") treeId: string) {
    return this.treeAccess.listMembers(user.userId, treeId);
  }

  @Delete(":treeId/members/:userId")
  @ApiOperation({ summary: "Remove a member from a tree" })
  removeMember(
    @CurrentUser() user: AuthUser,
    @Param("treeId") treeId: string,
    @Param("userId") memberUserId: string,
  ) {
    return this.treeAccess.removeMember(user.userId, treeId, memberUserId);
  }
}
