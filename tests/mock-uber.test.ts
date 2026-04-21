import { describe, expect, it } from "vitest";
import { MockUberAdapter } from "@/server/adapters/mock-uber";

describe("MockUberAdapter", () => {
  it("returns surge pricing for airport routes", async () => {
    const adapter = new MockUberAdapter();
    const pickup = await adapter.validateLocation("1 Market St, San Francisco");
    const dropoff = await adapter.validateLocation("SFO Airport");
    const options = await adapter.getRideOptions({ pickup, dropoff });

    expect(options).toHaveLength(3);
    expect(options[0].surgeMultiplier).toBeGreaterThan(1);
  });

  it("rejects unknown addresses", async () => {
    const adapter = new MockUberAdapter();

    await expect(adapter.validateLocation("Atlantis Ave")).rejects.toThrow(
      /Unable to verify address/
    );
  });

  it("books, tracks, and cancels a ride", async () => {
    const adapter = new MockUberAdapter();
    const pickup = await adapter.validateLocation("Mission Dolores Park");
    const dropoff = await adapter.validateLocation("Salesforce Tower");
    const options = await adapter.getRideOptions({ pickup, dropoff });
    const ride = await adapter.bookRide({ pickup, dropoff, option: options[0] });

    const status = await adapter.getRideStatus(ride.rideId);
    expect(["driver_arriving", "in_progress", "completed"]).toContain(status.phase);

    const cancelled = await adapter.cancelRide(ride.rideId);
    expect(cancelled.ride.phase).toBe("cancelled");
  });
});
