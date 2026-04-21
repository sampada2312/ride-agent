import { beforeEach, describe, expect, it } from "vitest";
import { handleChat, handleConfirmation } from "@/server/agent/runtime";

declare global {
  var __rideAgentSessions: Map<string, unknown> | undefined;
}

beforeEach(() => {
  globalThis.__rideAgentSessions = new Map();
});

describe("ride agent flow", () => {
  it("requires explicit confirmation before booking", async () => {
    const first = await handleChat({
      message: "Book a ride from Mission Dolores Park to Salesforce Tower"
    });

    expect(first.kind).toBe("confirmation_required");
    expect(first.session.pendingProposal).toBeDefined();
    expect(first.session.activeRide).toBeUndefined();

    const reject = await handleConfirmation({
      sessionId: first.session.sessionId,
      proposalId: first.session.pendingProposal!.proposalId,
      approved: false
    });

    expect(reject.text).toMatch(/No ride was booked/);
    expect(reject.session.activeRide).toBeUndefined();

    const second = await handleChat({
      sessionId: first.session.sessionId,
      message: "Book a ride from Mission Dolores Park to Salesforce Tower"
    });

    const confirm = await handleConfirmation({
      sessionId: second.session.sessionId,
      proposalId: second.session.pendingProposal!.proposalId,
      approved: true
    });

    expect(confirm.kind).toBe("message");
    expect(confirm.session.activeRide?.phase).toBe("driver_assigned");
  });

  it("supports price comparison before proposal selection", async () => {
    const response = await handleChat({
      message: "Compare prices from 1 Market St, San Francisco to SFO Airport"
    });

    expect(response.kind).toBe("quote_options");
    if (response.kind !== "quote_options") {
      return;
    }

    expect(response.options).toHaveLength(3);
    expect(response.text).toMatch(/current Uber options/);
  });

  it("logs failed address verification with the required audit fields", async () => {
    const response = await handleChat({
      message: "Book a ride from Atlantis Ave to Pier 39"
    });

    expect(response.kind).toBe("error");
    expect(response.session.actionLog).toHaveLength(1);
    const entry = response.session.actionLog[0];
    expect(entry).toHaveProperty("requested");
    expect(entry).toHaveProperty("verified");
    expect(entry).toHaveProperty("executed");
    expect(entry).toHaveProperty("happened");
    expect(entry.happened.ok).toBe(false);
  });

  it("tracks and cancels an active ride", async () => {
    const proposal = await handleChat({
      message: "Book a ride from Mission Dolores Park to Salesforce Tower"
    });
    const confirm = await handleConfirmation({
      sessionId: proposal.session.sessionId,
      proposalId: proposal.session.pendingProposal!.proposalId,
      approved: true
    });

    const tracked = await handleChat({
      sessionId: confirm.session.sessionId,
      message: "Track my ride"
    });

    expect(tracked.kind).toBe("tracking_update");

    const cancelled = await handleChat({
      sessionId: confirm.session.sessionId,
      message: "Cancel the ride"
    });

    expect(cancelled.text).toMatch(/cancelled/i);
  });
});
