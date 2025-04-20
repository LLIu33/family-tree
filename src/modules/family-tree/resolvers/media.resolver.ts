import { Args, Mutation, Resolver } from "@nestjs/graphql";
import { GraphQLUpload } from "graphql-upload/GraphQLUpload";
import { FileUpload } from "graphql-upload/FileUpload";
import { CreateMediaDto } from "../dto";
import { MediaService } from "../services/media.service";
import { Media } from "../entities/media.entity";

@Resolver()
export class MediaResolver {
  constructor(private readonly mediaService: MediaService) {}

  @Mutation(() => Media)
  async uploadMedia(
    @Args("file", { type: () => GraphQLUpload }) file: Promise<FileUpload>,
    @Args("input") input: CreateMediaDto
  ) {
    return this.mediaService.uploadMedia(file, input);
  }
}
