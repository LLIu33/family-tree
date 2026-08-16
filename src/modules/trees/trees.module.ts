import { forwardRef, Module } from "@nestjs/common";
import { Neo4jModule } from "../../neo4j/neo4j.module";
import { AuthModule } from "../auth/auth.module";
import { InvitesController } from "./controllers/invites.controller";
import { TreesController } from "./controllers/trees.controller";
import { InviteService } from "./services/invite.service";
import { TreeAccessService } from "./services/tree-access.service";

@Module({
  imports: [Neo4jModule, forwardRef(() => AuthModule)],
  controllers: [TreesController, InvitesController],
  providers: [TreeAccessService, InviteService],
  exports: [TreeAccessService],
})
export class TreesModule {}
