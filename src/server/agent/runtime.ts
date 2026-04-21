import { getMockUberAdapter } from "@/server/adapters/mock-uber";
import { getAgentBrain } from "@/server/agent/openai-brain";
import { createMessage, setActiveRide } from "@/server/domain/session";
import { ChatResponse } from "@/server/domain/types";
import { getOrCreateSession, saveSession } from "@/server/store/session-store";
import { executeConfirmedBooking } from "@/server/tools";

export async function handleChat(input: {
  sessionId?: string;
  message: string;
}): Promise<ChatResponse> {
  const session = getOrCreateSession(input.sessionId);
  const adapter = getMockUberAdapter();
  const brain = getAgentBrain();
  const response = await brain.reply(input.message, {
    session,
    adapter
  });

  saveSession(session);
  return response;
}

export async function handleConfirmation(input: {
  sessionId: string;
  proposalId: string;
  approved: boolean;
}): Promise<ChatResponse> {
  const session = getOrCreateSession(input.sessionId);
  const adapter = getMockUberAdapter();

  if (!session.pendingProposal || session.pendingProposal.proposalId !== input.proposalId) {
    return {
      kind: "error",
      session,
      text: "The confirmation proposal is missing or stale."
    };
  }

  if (!input.approved) {
    session.pendingProposal = undefined;
    session.messages.push(
      createMessage("agent", "The booking was not approved. No ride was booked.")
    );
    saveSession(session);
    return {
      kind: "message",
      session,
      text: "The booking was not approved. No ride was booked."
    };
  }

  try {
    const booking = await executeConfirmedBooking(
      { session, adapter },
      {
        proposal: session.pendingProposal,
        approved: input.approved
      }
    );

    setActiveRide(session, booking.result);
    session.messages.push(
      createMessage(
        "agent",
        `Booked ${booking.result.option.productName} with ${booking.result.driver.name}. ${booking.result.driver.vehicle} is on the way.`
      )
    );
    saveSession(session);
    return {
      kind: "message",
      session,
      text: `Booked ${booking.result.option.productName} with ${booking.result.driver.name}. ${booking.result.driver.vehicle} is on the way.`
    };
  } catch (error) {
    const text =
      error instanceof Error ? error.message : "The booking confirmation failed.";
    session.messages.push(createMessage("agent", text));
    saveSession(session);
    return {
      kind: "error",
      session,
      text
    };
  }
}

export function getSessionState(sessionId?: string) {
  return getOrCreateSession(sessionId);
}
