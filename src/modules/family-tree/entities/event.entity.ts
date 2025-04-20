import { Node, Property, Relationship } from "@neo4j/graphql";
import { Individual } from "./individual.entity";
import { Media } from "./media.entity";
import { EventType } from "../enums/event-type.enum";

@Node("Event")
export class Event {
  @Property({ primary: true })
  id: string;

  @Property()
  type: EventType;

  @Property({ nullable: true })
  date?: string;

  @Property({ nullable: true })
  place?: string;

  @Relationship("SUBJECT_OF", { direction: "IN" })
  individual?: Individual;

  @Relationship("HAS_MEDIA", { direction: "OUT" })
  media?: Media[];
}
