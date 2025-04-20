import { Injectable, Logger } from "@nestjs/common";
import { EventType } from "../enums/event-type.enum";
import { Neo4jService } from "../../../neo4j/neo4j.service";

@Injectable()
export class EventService {
  private readonly logger = new Logger(EventService.name);

  constructor(private readonly neo4jService: Neo4jService) {}

  async createEventQuery(
    individualId: string,
    type: EventType,
    date?: string,
    place?: string
  ): Promise<{ query: string; params: any }> {
    const eventId = `event_${Date.now()}`;
    return {
      query: `
        MATCH (i:Individual {id: $individualId})
        CREATE (e:Event {
          id: $eventId,
          type: $type,
          date: $date,
          place: $place,
          createdAt: datetime()
        })
        CREATE (i)-[:HAS_EVENT]->(e)
        RETURN e
      `,
      params: {
        eventId,
        individualId,
        type,
        date: date || null,
        place: place || null,
      },
    };
  }

  async getEventsForIndividual(individualId: string): Promise<any[]> {
    const result = await this.neo4jService.read(
      `MATCH (i:Individual {id: $individualId})-[:HAS_EVENT]->(e:Event)
       RETURN e ORDER BY e.date`,
      { individualId }
    );

    return result.records.map((record) => record.get("e").properties);
  }

  async createFamilyEvent(
    familyId: string,
    type: EventType,
    date?: string,
    place?: string
  ): Promise<any> {
    const eventId = `event_${Date.now()}`;
    const result = await this.neo4jService.write(
      `MATCH (f:Family {id: $familyId})
       CREATE (e:Event {
         id: $eventId,
         type: $type,
         date: $date,
         place: $place,
         createdAt: datetime()
       })
       CREATE (f)-[:HAS_EVENT]->(e)
       RETURN e`,
      {
        eventId,
        familyId,
        type,
        date: date || null,
        place: place || null,
      }
    );

    return result.records[0]?.get("e").properties;
  }

  async linkEventToMedia(eventId: string, mediaId: string): Promise<boolean> {
    try {
      await this.neo4jService.write(
        `MATCH (e:Event {id: $eventId})
         MATCH (m:Media {id: $mediaId})
         CREATE (e)-[:HAS_MEDIA]->(m)
         RETURN count(*) > 0 AS linked`,
        { eventId, mediaId }
      );
      return true;
    } catch (error) {
      this.logger.error(`Failed to link event to media: ${error.message}`);
      return false;
    }
  }

  async getEventsByType(type: EventType, limit: number = 100): Promise<any[]> {
    const result = await this.neo4jService.read(
      `MATCH (e:Event {type: $type})
       RETURN e ORDER BY e.date DESC LIMIT $limit`,
      { type, limit }
    );

    return result.records.map((record) => record.get("e").properties);
  }

  async getEventsByDateRange(
    startDate: string,
    endDate: string,
    limit: number = 100
  ): Promise<any[]> {
    const result = await this.neo4jService.read(
      `MATCH (e:Event)
       WHERE e.date >= $startDate AND e.date <= $endDate
       RETURN e ORDER BY e.date LIMIT $limit`,
      { startDate, endDate, limit }
    );

    return result.records.map((record) => record.get("e").properties);
  }

  async deleteEvent(eventId: string): Promise<boolean> {
    try {
      await this.neo4jService.write(
        `MATCH (e:Event {id: $eventId}) DETACH DELETE e`,
        { eventId }
      );
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete event: ${error.message}`);
      return false;
    }
  }
}
