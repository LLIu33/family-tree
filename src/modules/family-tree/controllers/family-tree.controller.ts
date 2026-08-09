import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseInterceptors,
  UseFilters,
  ParseIntPipe,
  DefaultValuePipe,
  Query,
  UploadedFile,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { FamilyTreeService } from "../services/family-tree.service";
import { MediaService } from "../services/media.service";
import { GedcomParserService } from "../services/gedcom-parser.service";
import {
  CreateIndividualDto,
  CreateFamilyDto,
  CreateRelationshipDto,
  ImportGedcomDto,
} from "../dto";
import { Neo4jErrorFilter } from "../../../common/filters/neo4j-error.filter";
import { GEDCOMValidationFilter } from "../../../common/filters/gedcom-validation.filter";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
} from "@nestjs/swagger";

@ApiTags("Family Tree")
@Controller("family-tree")
@UseFilters(Neo4jErrorFilter, GEDCOMValidationFilter)
export class FamilyTreeController {
  constructor(
    private readonly familyTreeService: FamilyTreeService,
    private readonly mediaService: MediaService,
    private readonly gedcomParserService: GedcomParserService
  ) {}

  @Post("individuals")
  @ApiOperation({ summary: "Create a new individual" })
  @ApiResponse({ status: 201, description: "Individual created" })
  @ApiResponse({ status: 400, description: "Bad request" })
  async createIndividual(@Body() createIndividualDto: CreateIndividualDto) {
    return this.familyTreeService.createIndividual(createIndividualDto);
  }

  @Get("individuals/:id")
  @ApiOperation({ summary: "Get individual by ID" })
  @ApiResponse({ status: 200, description: "Individual found" })
  @ApiResponse({ status: 404, description: "Individual not found" })
  async getIndividual(@Param("id") id: string) {
    return this.familyTreeService.getIndividual(id);
  }

  @Get("individuals/:id/ancestors")
  @ApiOperation({ summary: "Get ancestors of an individual" })
  async getAncestors(
    @Param("id") id: string,
    @Query("generations", new DefaultValuePipe(3), ParseIntPipe)
    generations: number
  ) {
    return this.familyTreeService.getAncestors(id, generations);
  }

  @Get("individuals/:id/descendants")
  @ApiOperation({ summary: "Get descendants of an individual" })
  async getDescendants(
    @Param("id") id: string,
    @Query("generations", new DefaultValuePipe(3), ParseIntPipe)
    generations: number
  ) {
    return this.familyTreeService.getDescendants(id, generations);
  }

  @Post("families")
  @ApiOperation({ summary: "Create a new family" })
  async createFamily(@Body() createFamilyDto: CreateFamilyDto) {
    return this.familyTreeService.createFamily(createFamilyDto);
  }

  @Get("families/:id")
  @ApiOperation({ summary: "Get family by ID" })
  async getFamily(@Param("id") id: string) {
    return this.familyTreeService.getFamily(id);
  }

  @Post("relationships")
  @ApiOperation({ summary: "Create relationship between individuals" })
  async createRelationship(
    @Body() createRelationshipDto: CreateRelationshipDto
  ) {
    return this.familyTreeService.createRelationship(createRelationshipDto);
  }

  @Post("individuals/:id/media")
  @ApiOperation({ summary: "Upload media for individual" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    description: "Media file",
    schema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          format: "binary",
        },
        description: { type: "string" },
        dateTaken: { type: "string", format: "date" },
      },
    },
  })
  @UseInterceptors(FileInterceptor("file"))
  async uploadMedia(
    @Param("id") individualId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body("description") description?: string,
    @Body("dateTaken") dateTaken?: Date
  ) {
    return this.mediaService.createMedia(file, {
      attachedToId: individualId,
      description,
      dateTaken: dateTaken?.toISOString(),
    } as any);
  }

  @Post("import/gedcom")
  @ApiOperation({ summary: "Import family tree from GEDCOM file" })
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file"))
  async importGedcom(
    @UploadedFile() file: Express.Multer.File,
    @Body() _importGedcomDto: ImportGedcomDto
  ) {
    const gedcomText = file.buffer.toString("utf-8");
    return this.gedcomParserService.parseAndImport(gedcomText);
  }

  @Get("visualize/:rootId")
  @ApiOperation({ summary: "Visualize family tree from root individual" })
  async visualizeTree(
    @Param("rootId") rootId: string,
    @Query("depth", new DefaultValuePipe(3), ParseIntPipe) depth: number
  ) {
    return this.familyTreeService.visualizeTree(rootId, depth);
  }
}
