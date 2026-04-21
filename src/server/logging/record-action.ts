import { createId, nowIso } from "@/server/domain/session";
import { appendActionLog } from "@/server/logging/action-log";
import { ActionLogEntry, SessionState } from "@/server/domain/types";

export async function recordAction(
  session: SessionState,
  input: {
    action: string;
    userRequest: string;
    verified: Record<string, unknown>;
    executed: Record<string, unknown>;
    outcome: Record<string, unknown>;
    success: boolean;
  }
) {
  const entry: ActionLogEntry = {
    id: createId("log"),
    sessionId: session.sessionId,
    timestamp: nowIso(),
    action: input.action,
    userRequest: input.userRequest,
    verified: input.verified,
    executed: input.executed,
    outcome: input.outcome,
    success: input.success
  };

  session.actionLog.push(entry);
  await appendActionLog(entry);

  return entry;
}
