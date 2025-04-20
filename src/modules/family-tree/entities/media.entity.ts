import { Node, Property, Relationship } from "@neo4j/graphql";
import { Individual } from "./individual.entity";
import { Event } from "./event.entity";

@Node("Media")
export class Media {
  @Property({ primary: true })
  id: string;

  @Property()
  type: "PHOTO" | "DOCUMENT" | "AUDIO" | "VIDEO";

  @Property()
  url: string;

  @Property()
  thumbnailUrl: string;

  @Property({ nullable: true })
  description?: string;

  @Property()
  createdAt: string;

  @Property({ nullable: true })
  dateTaken?: string;

  @Relationship("ATTACHED_TO", { direction: "IN" })
  individual?: Individual;

  @Relationship("DOCUMENTS", { direction: "IN" })
  event?: Event;
}
