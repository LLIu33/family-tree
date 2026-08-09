import { Individual } from "./individual.entity";
import { Media } from "./media.entity";
import { EventType } from "../enums/event-type.enum";

export class Event {
  id: string;
  type: EventType;
  date?: string;
  place?: string;
  individual?: Individual;
  media?: Media[];
}
