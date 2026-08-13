import { Individual } from "./individual.entity";
import { Event } from "./event.entity";

export class Media {
  id: string;
  type: "PHOTO" | "DOCUMENT" | "AUDIO" | "VIDEO";
  url: string;
  thumbnailUrl: string;
  description?: string;
  createdAt: string;
  dateTaken?: string;
  individual?: Individual;
  event?: Event;
}
