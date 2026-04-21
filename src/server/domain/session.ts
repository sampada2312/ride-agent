import {
  BookedRide,
  ConfirmationProposal,
  ConversationMessage,
  SessionState
} from "@/server/domain/types";

export function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function createMessage(
  actor: ConversationMessage["actor"],
  text: string
) {
  return {
    id: createId("msg"),
    actor,
    text,
    createdAt: nowIso()
  };
}

export function createSession(sessionId?: string): SessionState {
  const timestamp = nowIso();

  return {
    sessionId: sessionId ?? createId("session"),
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: [],
    rideOptions: [],
    actionLog: []
  };
}

export function touchSession(session: SessionState) {
  session.updatedAt = nowIso();
}

export function clearProposal(session: SessionState) {
  session.pendingProposal = undefined;
}

export function setProposal(
  session: SessionState,
  proposal: ConfirmationProposal
) {
  session.pendingProposal = proposal;
  touchSession(session);
}

export function setActiveRide(session: SessionState, ride: BookedRide) {
  session.activeRide = ride;
  session.pendingProposal = undefined;
  touchSession(session);
}
