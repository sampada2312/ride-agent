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

    const chatOnlyAttempt = await handleChat({
      sessionId: first.session.sessionId,
      message: "yes, book it now"
    });

    expect(chatOnlyAttempt.kind).toBe("confirmation_required");
    expect(chatOnlyAttempt.session.activeRide).toBeUndefined();

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

  it("accepts a simpler '<pickup> to <dropoff>' route format", async () => {
    const response = await handleChat({
      message: "Mission Dolores Park to Salesforce Tower"
    });

    expect(response.kind).toBe("confirmation_required");
    expect(response.session.pendingProposal).toBeDefined();
  });

  it("logs failed address verification with the required audit fields", async () => {
    const response = await handleChat({
      message: "Book a ride from Atlantis Ave to Pier 39"
    });

    expect(response.kind).toBe("error");
    expect(response.session.actionLog).toHaveLength(1);
    const entry = response.session.actionLog[0];
    expect(entry).toHaveProperty("timestamp");
    expect(entry).toHaveProperty("userRequest");
    expect(entry).toHaveProperty("verified");
    expect(entry).toHaveProperty("executed");
    expect(entry).toHaveProperty("outcome");
    expect(entry.success).toBe(false);
    expect(response.suggestions?.length).toBeGreaterThan(0);
    expect(response.suggestions?.[0]?.prompt).toMatch(/to Pier 39$/);
  });

  it("preserves the valid pickup when the dropoff is invalid", async () => {
    const response = await handleChat({
      message: "Book a ride from Mission Dolores Park to Atlantis Ave"
    });

    expect(response.kind).toBe("error");
    expect(response.suggestions?.length).toBeGreaterThan(0);
    expect(response.suggestions?.[0]?.prompt).toMatch(/^from Mission Dolores Park to /);
  });

  it("returns recovery suggestions for ambiguous comma-separated input", async () => {
    const response = await handleChat({
      message: "Pier 39, SFO Airport, Salesforce Tower"
    });

    expect(response.kind).toBe("message");
    expect(response.text).toMatch(/not sure which one is pickup versus dropoff/i);
    expect(response.suggestions?.length).toBeGreaterThan(0);
  });

  it("can prepare a specific option after comparison", async () => {
    const compared = await handleChat({
      message: "Compare prices from 1 Market St, San Francisco to SFO Airport"
    });

    const selected = await handleChat({
      sessionId: compared.session.sessionId,
      message: "Book Comfort"
    });

    expect(selected.kind).toBe("confirmation_required");
    if (selected.kind !== "confirmation_required") {
      return;
    }

    expect(selected.proposal.option.productName).toBe("Comfort");
  });

  it("rejecting one prepared option and selecting another prepares the new option", async () => {
    const first = await handleChat({
      message: "Book a ride from Mission Dolores Park to Salesforce Tower"
    });

    expect(first.kind).toBe("confirmation_required");
    if (first.kind !== "confirmation_required") {
      return;
    }

    const rejected = await handleConfirmation({
      sessionId: first.session.sessionId,
      proposalId: first.proposal.proposalId,
      approved: false
    });

    expect(rejected.session.pendingProposal).toBeUndefined();

    const reselection = await handleChat({
      sessionId: first.session.sessionId,
      message: "Book UberXL"
    });

    expect(reselection.kind).toBe("confirmation_required");
    if (reselection.kind !== "confirmation_required") {
      return;
    }

    expect(reselection.proposal.option.productName).toBe("UberXL");
    expect(reselection.session.pendingProposal?.option.productName).toBe("UberXL");
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

  it("records confirmation-gate approval as a separate audited action", async () => {
    const proposal = await handleChat({
      message: "Book a ride from Mission Dolores Park to Salesforce Tower"
    });

    const confirm = await handleConfirmation({
      sessionId: proposal.session.sessionId,
      proposalId: proposal.session.pendingProposal!.proposalId,
      approved: true
    });

    const gateEntry = confirm.session.actionLog.find(
      (entry) => entry.action === "confirmation_gate_decision"
    );

    expect(gateEntry).toBeDefined();
    expect(gateEntry?.verified).toMatchObject({
      explicitUserApproval: true,
      bookingOnlyAllowedHere: true
    });
  });
});
