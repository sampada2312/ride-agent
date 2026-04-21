import {
  SessionState
} from "@/server/domain/types";
import {
  createSession,
  touchSession
} from "@/server/domain/session";

declare global {
  var __rideAgentSessions: Map<string, SessionState> | undefined;
}

function getSessionMap() {
  if (!globalThis.__rideAgentSessions) {
    globalThis.__rideAgentSessions = new Map<string, SessionState>();
  }

  return globalThis.__rideAgentSessions;
}

export function getOrCreateSession(sessionId?: string) {
  const sessions = getSessionMap();

  if (sessionId && sessions.has(sessionId)) {
    return sessions.get(sessionId)!;
  }

  const session = createSession(sessionId);
  sessions.set(session.sessionId, session);
  return session;
}

export function saveSession(session: SessionState) {
  touchSession(session);
  getSessionMap().set(session.sessionId, session);
  return session;
}

export function listSessions() {
  return [...getSessionMap().values()];
}
