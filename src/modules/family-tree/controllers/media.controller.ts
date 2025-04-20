import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  Body,
  Get,
  Param,
  Delete,
  UseGuards,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { MediaService } from "../services/media.service";
import { CreateMediaDto } from "../dto/create-media.dto";
// import { JwtAuthGuard } from "../../../auth/guards/jwt-auth.guard";
import { ApiBearerAuth, ApiConsumes, ApiTags } from "@nestjs/swagger";

@ApiTags("Family Tree Media")
@ApiBearerAuth()
// @UseGuards(JwtAuthGuard)
@Controller("family-tree/media")
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post("upload")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file"))
  async uploadMedia(
    @UploadedFile() file: Express.Multer.File,
    @Body() createMediaDto: CreateMediaDto
  ) {
    return this.mediaService.createMedia(file, createMediaDto);
  }

  @Get(":individualId")
  async getMedia(@Param("individualId") individualId: string) {
    return this.mediaService.getMediaForIndividual(individualId);
  }

  @Delete(":mediaId")
  async deleteMedia(@Param("mediaId") mediaId: string) {
    return this.mediaService.deleteMedia(mediaId);
  }
}
