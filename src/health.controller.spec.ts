import { HealthController } from "./health.controller";

describe("HealthController", () => {
  it("returns ok", () => {
    const controller = new HealthController();
    expect(controller.health()).toEqual({ ok: true });
  });
});
