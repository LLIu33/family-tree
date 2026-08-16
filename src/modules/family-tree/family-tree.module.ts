import { Module } from "@nestjs/common";
import { FamilyTreeService } from "./services/family-tree.service";
import { GedcomExportService } from "./services/gedcom-export.service";
import { GedcomParserService } from "./services/gedcom-parser.service";
import { EventService } from "./services/event.service";
import { FamilyTreeController } from "./controllers/family-tree.controller";
import { MediaController } from "./controllers/media.controller";
import { MediaService } from "./services/media.service";
import { StorageService } from "./services/storage.service";
import { Neo4jModule } from "../../neo4j/neo4j.module";
import { AuthModule } from "../auth/auth.module";
import { MinRoleGuard } from "../trees/guards/min-role.guard";
import { TreesModule } from "../trees/trees.module";

@Module({
  imports: [Neo4jModule, AuthModule, TreesModule],
  controllers: [FamilyTreeController, MediaController],
  providers: [
    FamilyTreeService,
    GedcomExportService,
    GedcomParserService,
    EventService,
    MediaService,
    StorageService,
    MinRoleGuard,
  ],
})
export class FamilyTreeModule {}
