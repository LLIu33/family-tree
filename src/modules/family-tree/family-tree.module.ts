import { Module } from "@nestjs/common";
import { FamilyTreeService } from "./services/family-tree.service";
import { GedcomParserService } from "./services/gedcom-parser.service";
import { EventService } from "./services/event.service";
import { FamilyTreeResolver } from "./resolvers/family-tree.resolver";
import { FamilyTreeController } from "./controllers/family-tree.controller";
import { MediaController } from "./controllers/media.controller";
import { MediaService } from "./services/media.service";
import { StorageService } from "./services/storage.service";
import { Neo4jModule } from "../../neo4j/neo4j.module";

@Module({
  imports: [Neo4jModule],
  controllers: [FamilyTreeController, MediaController],
  providers: [
    FamilyTreeService,
    GedcomParserService,
    EventService,
    FamilyTreeResolver,
    MediaService,
    StorageService,
  ],
})
export class FamilyTreeModule {}
