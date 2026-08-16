import { EventType } from "../enums/event-type.enum";
import { Neo4jService } from "../../../neo4j/neo4j.service";
import { EventService } from "./event.service";

describe("EventService", () => {
  let service: EventService;
  let neo4j: { read: jest.Mock; write: jest.Mock };

  beforeEach(() => {
    neo4j = {
      read: jest.fn(),
      write: jest.fn(),
    };
    service = new EventService(neo4j as unknown as Neo4jService);
  });

  it("createEventQuery builds params with null defaults", async () => {
    const { query, params } = await service.createEventQuery(
      "tree-1",
      "indi-1",
      EventType.BIRTH,
    );

    expect(query).toContain("HAS_EVENT");
    expect(params).toMatchObject({
      treeId: "tree-1",
      individualId: "indi-1",
      type: EventType.BIRTH,
      date: null,
      place: null,
    });
    expect(params.eventId).toMatch(/^event_/);
  });

  it("createEventQuery keeps provided date and place", async () => {
    const { params } = await service.createEventQuery(
      "tree-1",
      "indi-1",
      EventType.DEATH,
      "1900",
      "Moscow",
    );

    expect(params).toMatchObject({
      date: "1900",
      place: "Moscow",
    });
  });

  it("getEventsForIndividual maps event properties", async () => {
    neo4j.read.mockResolvedValue({
      records: [
        { get: () => ({ properties: { id: "e1", type: EventType.BIRTH } }) },
      ],
    });

    await expect(service.getEventsForIndividual("indi-1")).resolves.toEqual([
      { id: "e1", type: EventType.BIRTH },
    ]);
    expect(neo4j.read).toHaveBeenCalledWith(
      expect.stringContaining("HAS_EVENT"),
      { individualId: "indi-1" },
    );
  });

  it("createFamilyEvent writes and returns properties", async () => {
    neo4j.write.mockResolvedValue({
      records: [
        { get: () => ({ properties: { id: "e2", type: EventType.MARRIAGE } }) },
      ],
    });

    await expect(
      service.createFamilyEvent("fam-1", EventType.MARRIAGE, "1980", "Kyiv"),
    ).resolves.toEqual({ id: "e2", type: EventType.MARRIAGE });
    expect(neo4j.write).toHaveBeenCalledWith(
      expect.stringContaining("HAS_EVENT"),
      expect.objectContaining({
        familyId: "fam-1",
        type: EventType.MARRIAGE,
        date: "1980",
        place: "Kyiv",
      }),
    );
  });

  it("linkEventToMedia returns true on success and false on error", async () => {
    neo4j.write.mockResolvedValueOnce({ records: [] });
    await expect(service.linkEventToMedia("e1", "m1")).resolves.toBe(true);

    neo4j.write.mockRejectedValueOnce(new Error("boom"));
    await expect(service.linkEventToMedia("e1", "m1")).resolves.toBe(false);
  });

  it("getEventsByType and getEventsByDateRange map records", async () => {
    neo4j.read
      .mockResolvedValueOnce({
        records: [{ get: () => ({ properties: { id: "e3" } }) }],
      })
      .mockResolvedValueOnce({
        records: [{ get: () => ({ properties: { id: "e4" } }) }],
      });

    await expect(
      service.getEventsByType(EventType.BURIAL, 10),
    ).resolves.toEqual([{ id: "e3" }]);
    await expect(
      service.getEventsByDateRange("1800", "1900", 5),
    ).resolves.toEqual([{ id: "e4" }]);
  });

  it("deleteEvent returns true on success and false on error", async () => {
    neo4j.write.mockResolvedValueOnce({ records: [] });
    await expect(service.deleteEvent("e1")).resolves.toBe(true);

    neo4j.write.mockRejectedValueOnce(new Error("gone"));
    await expect(service.deleteEvent("e1")).resolves.toBe(false);
  });
});
