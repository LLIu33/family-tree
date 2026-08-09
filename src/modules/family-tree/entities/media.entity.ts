import { Field, ID, ObjectType } from "@nestjs/graphql";
import { Individual } from "./individual.entity";
import { Event } from "./event.entity";

@ObjectType()
export class Media {
  @Field(() => ID)
  id: string;

  @Field()
  type: "PHOTO" | "DOCUMENT" | "AUDIO" | "VIDEO";

  @Field()
  url: string;

  @Field()
  thumbnailUrl: string;

  @Field({ nullable: true })
  description?: string;

  @Field()
  createdAt: string;

  @Field({ nullable: true })
  dateTaken?: string;

  individual?: Individual;
  event?: Event;
}
