import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  Body,
  Get,
  Param,
  Delete,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { MediaService } from "../services/media.service";
import { CreateMediaDto } from "../dto/create-media.dto";
import { ApiBearerAuth, ApiConsumes, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { AuthUser } from "../../auth/interfaces/auth.interface";

@ApiTags("Family Tree Media")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("family-tree/media")
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post("upload")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file"))
  async uploadMedia(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() createMediaDto: CreateMediaDto
  ) {
    return this.mediaService.createMedia(user.treeId, file, createMediaDto);
  }

  @Get(":individualId")
  async getMedia(
    @CurrentUser() user: AuthUser,
    @Param("individualId") individualId: string
  ) {
    return this.mediaService.getMediaForIndividual(user.treeId, individualId);
  }

  @Delete(":mediaId")
  async deleteMedia(
    @CurrentUser() user: AuthUser,
    @Param("mediaId") mediaId: string
  ) {
    return this.mediaService.deleteMedia(user.treeId, mediaId);
  }
}
