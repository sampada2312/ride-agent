import { getMockUberAdapter } from "@/server/adapters/mock-uber";
import { getAgentBrain } from "@/server/agent/openai-brain";
import { resolveBookingConfirmation } from "@/server/confirmation-gate";
import { ChatResponse } from "@/server/domain/types";
import { getOrCreateSession, saveSession } from "@/server/store/session-store";

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
  const response = await resolveBookingConfirmation({
    session,
    adapter,
    proposalId: input.proposalId,
    approved: input.approved
  });

  saveSession(session);
  return response;
}

export function getSessionState(sessionId?: string) {
  return getOrCreateSession(sessionId);
}
