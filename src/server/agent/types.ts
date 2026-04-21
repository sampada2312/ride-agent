import { RideMarketplaceAdapter } from "@/server/adapters/types";
import { SessionState } from "@/server/domain/types";

export type AgentContext = {
  session: SessionState;
  adapter: RideMarketplaceAdapter;
};

export interface AgentBrain {
  reply(input: string, context: AgentContext): Promise<import("@/server/domain/types").ChatResponse>;
}
