import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseInterceptors,
  UseFilters,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  Query,
  UploadedFile,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { FamilyTreeService } from "../services/family-tree.service";
import { MediaService } from "../services/media.service";
import { GedcomParserService } from "../services/gedcom-parser.service";
import {
  AddChildDto,
  CreateIndividualDto,
  CreateFamilyDto,
  CreateRelationshipDto,
  ImportGedcomDto,
  UpdateIndividualDto,
} from "../dto";
import { Neo4jErrorFilter } from "../../../common/filters/neo4j-error.filter";
import { GEDCOMValidationFilter } from "../../../common/filters/gedcom-validation.filter";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { AuthUser } from "../../auth/interfaces/auth.interface";

@ApiTags("Family Tree")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
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
  async createIndividual(
    @CurrentUser() user: AuthUser,
    @Body() createIndividualDto: CreateIndividualDto
  ) {
    return this.familyTreeService.createIndividual(
      user.treeId,
      createIndividualDto
    );
  }

  @Get("individuals")
  @ApiOperation({ summary: "Search individuals in the current tree" })
  async searchIndividuals(
    @CurrentUser() user: AuthUser,
    @Query("q") q = "",
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number
  ) {
    return this.familyTreeService.searchIndividuals(user.treeId, q, limit);
  }

  @Get("graph")
  @ApiOperation({
    summary: "Full family graph for the current tree (largest component)",
  })
  async getFullGraph(@CurrentUser() user: AuthUser) {
    return this.familyTreeService.getFullGraph(user.treeId);
  }

  @Get("individuals/:id")
  @ApiOperation({ summary: "Get individual by ID" })
  @ApiResponse({ status: 200, description: "Individual found" })
  @ApiResponse({ status: 404, description: "Individual not found" })
  async getIndividual(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const individual = await this.familyTreeService.getIndividual(
      user.treeId,
      id
    );
    if (!individual) {
      throw new NotFoundException(`Individual ${id} not found`);
    }
    return individual;
  }

  @Post("individuals/:id/children")
  @ApiOperation({
    summary: "Add a child to this individual (and unique spouse)",
  })
  async addChild(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: AddChildDto
  ) {
    return this.familyTreeService.addChild(user.treeId, id, dto);
  }

  @Patch("individuals/:id")
  @ApiOperation({ summary: "Update individual in the current tree" })
  async updateIndividual(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateIndividualDto
  ) {
    return this.familyTreeService.updateIndividual(user.treeId, id, dto);
  }

  @Get("individuals/:id/ancestors")
  @ApiOperation({ summary: "Get ancestors of an individual" })
  async getAncestors(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Query("generations", new DefaultValuePipe(3), ParseIntPipe)
    generations: number
  ) {
    return this.familyTreeService.getAncestors(user.treeId, id, generations);
  }

  @Get("individuals/:id/descendants")
  @ApiOperation({ summary: "Get descendants of an individual" })
  async getDescendants(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Query("generations", new DefaultValuePipe(3), ParseIntPipe)
    generations: number
  ) {
    return this.familyTreeService.getDescendants(user.treeId, id, generations);
  }

  @Post("families")
  @ApiOperation({ summary: "Create a new family" })
  async createFamily(
    @CurrentUser() user: AuthUser,
    @Body() createFamilyDto: CreateFamilyDto
  ) {
    return this.familyTreeService.createFamily(user.treeId, createFamilyDto);
  }

  @Get("families/:id")
  @ApiOperation({ summary: "Get family by ID" })
  async getFamily(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.familyTreeService.getFamily(user.treeId, id);
  }

  @Post("relationships")
  @ApiOperation({ summary: "Create relationship between individuals" })
  async createRelationship(
    @CurrentUser() user: AuthUser,
    @Body() createRelationshipDto: CreateRelationshipDto
  ) {
    return this.familyTreeService.createRelationship(
      user.treeId,
      createRelationshipDto
    );
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
    @CurrentUser() user: AuthUser,
    @Param("id") individualId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body("description") description?: string,
    @Body("dateTaken") dateTaken?: Date
  ) {
    return this.mediaService.createMedia(user.treeId, file, {
      attachedToId: individualId,
      description,
      dateTaken: dateTaken?.toISOString(),
    } as any);
  }

  @Post("import/gedcom")
  @ApiOperation({ summary: "Import family tree from GEDCOM file" })
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    })
  )
  async importGedcom(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() importGedcomDto: ImportGedcomDto
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException("GEDCOM file is required");
    }
    const gedcomText = file.buffer.toString("utf-8");
    return this.gedcomParserService.parseAndImport(
      user.treeId,
      gedcomText,
      importGedcomDto.source || "web"
    );
  }

  @Get("visualize/:rootId")
  @ApiOperation({ summary: "Visualize family tree from root individual" })
  async visualizeTree(
    @CurrentUser() user: AuthUser,
    @Param("rootId") rootId: string,
    @Query("depth", new DefaultValuePipe(3), ParseIntPipe) depth: number
  ) {
    return this.familyTreeService.visualizeTree(user.treeId, rootId, depth);
  }
}
