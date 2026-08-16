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

@Module({
  imports: [Neo4jModule, AuthModule],
  controllers: [FamilyTreeController, MediaController],
  providers: [
    FamilyTreeService,
    GedcomExportService,
    GedcomParserService,
    EventService,
    MediaService,
    StorageService,
  ],
})
export class FamilyTreeModule {}
