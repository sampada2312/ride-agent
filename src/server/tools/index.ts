import { z } from "zod";
import { appendActionLog } from "@/server/logging/action-log";
import { RideMarketplaceAdapter } from "@/server/adapters/types";
import {
  ActionLogEntry,
  BookedRide,
  ConfirmationProposal,
  RideOption,
  SessionState,
  ToolResult,
  ValidatedLocation
} from "@/server/domain/types";
import { createId, nowIso } from "@/server/domain/session";

type LoggedToolContext = {
  session: SessionState;
  adapter: RideMarketplaceAdapter;
};

async function runLoggedTool<T>({
  context,
  toolName,
  requested,
  verified,
  execute
}: {
  context: LoggedToolContext;
  toolName: string;
  requested: Record<string, unknown>;
  verified: Record<string, unknown>;
  execute: () => Promise<T>;
}): Promise<ToolResult<T>> {
  let happened: Record<string, unknown>;
  let result: T;

  try {
    result = await execute();
    happened = { ok: true };
  } catch (error) {
    happened = {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown tool failure"
    };
    const entry = buildLogEntry(
      context.session.sessionId,
      toolName,
      requested,
      verified,
      {},
      happened
    );
    context.session.actionLog.push(entry);
    await appendActionLog(entry);
    throw error;
  }

  const entry = buildLogEntry(
    context.session.sessionId,
    toolName,
    requested,
    verified,
    summarizeExecution(result),
    happened
  );

  context.session.actionLog.push(entry);
  await appendActionLog(entry);

  return { result, logEntry: entry };
}

function buildLogEntry(
  sessionId: string,
  toolName: string,
  requested: Record<string, unknown>,
  verified: Record<string, unknown>,
  executed: Record<string, unknown>,
  happened: Record<string, unknown>
): ActionLogEntry {
  return {
    id: createId("log"),
    sessionId,
    timestamp: nowIso(),
    toolName,
    requested,
    verified,
    executed,
    happened
  };
}

function summarizeExecution(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    return { type: "array", count: value.length };
  }
  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    const summaryKeys = Object.keys(objectValue).slice(0, 6);
    return Object.fromEntries(summaryKeys.map((key) => [key, objectValue[key]]));
  }

  return { value };
}

const rideRequestSchema = z.object({
  pickup: z.string().min(3),
  dropoff: z.string().min(3)
});

export async function validateLocations(
  context: LoggedToolContext,
  input: { pickup: string; dropoff: string }
) {
  const parsed = rideRequestSchema.parse(input);

  return runLoggedTool<{
    pickup: ValidatedLocation;
    dropoff: ValidatedLocation;
  }>({
    context,
    toolName: "validate_locations",
    requested: parsed,
    verified: {
      adapter: context.adapter.marketplaceName,
      confirmationGate: "not_applicable"
    },
    execute: async () => {
      const pickup = await context.adapter.validateLocation(parsed.pickup);
      const dropoff = await context.adapter.validateLocation(parsed.dropoff);
      return { pickup, dropoff };
    }
  });
}

export async function discoverRideOptions(
  context: LoggedToolContext,
  input: { pickup: ValidatedLocation; dropoff: ValidatedLocation }
) {
  return runLoggedTool<RideOption[]>({
    context,
    toolName: "discover_ride_options",
    requested: {
      pickup: input.pickup.canonical,
      dropoff: input.dropoff.canonical
    },
    verified: {
      pickupVerified: true,
      dropoffVerified: true,
      marketplace: context.adapter.marketplaceName
    },
    execute: async () => context.adapter.getRideOptions(input)
  });
}

export async function proposeBooking(
  context: LoggedToolContext,
  input: {
    pickup: ValidatedLocation;
    dropoff: ValidatedLocation;
    option: RideOption;
  }
) {
  return runLoggedTool<ConfirmationProposal>({
    context,
    toolName: "propose_booking",
    requested: {
      pickup: input.pickup.canonical,
      dropoff: input.dropoff.canonical,
      optionId: input.option.optionId,
      productName: input.option.productName
    },
    verified: {
      explicitUserConfirmation: false,
      quoteStillPresent: context.session.rideOptions.some(
        (option) => option.optionId === input.option.optionId
      )
    },
    execute: async () => {
      return {
        proposalId: createId("proposal"),
        createdAt: nowIso(),
        pickup: input.pickup,
        dropoff: input.dropoff,
        option: input.option,
        marketplace: context.adapter.marketplaceName,
        summary: `${input.option.productName} from ${input.pickup.canonical} to ${input.dropoff.canonical} for $${(
          input.option.priceCents / 100
        ).toFixed(2)}`
      };
    }
  });
}

export async function executeConfirmedBooking(
  context: LoggedToolContext,
  input: {
    proposal: ConfirmationProposal;
    approved: boolean;
  }
) {
  return runLoggedTool<BookedRide>({
    context,
    toolName: "execute_confirmed_booking",
    requested: {
      proposalId: input.proposal.proposalId,
      approved: input.approved
    },
    verified: {
      confirmationProposalExists:
        context.session.pendingProposal?.proposalId === input.proposal.proposalId,
      explicitUserConfirmation: input.approved
    },
    execute: async () => {
      if (!input.approved) {
        throw new Error("Booking was not confirmed by the user.");
      }

      return context.adapter.bookRide({
        pickup: input.proposal.pickup,
        dropoff: input.proposal.dropoff,
        option: input.proposal.option
      });
    }
  });
}

export async function trackRide(
  context: LoggedToolContext,
  input: { rideId: string }
) {
  return runLoggedTool<BookedRide>({
    context,
    toolName: "track_ride",
    requested: input,
    verified: {
      activeRideMatches: context.session.activeRide?.rideId === input.rideId
    },
    execute: async () => context.adapter.getRideStatus(input.rideId)
  });
}

export async function cancelRide(
  context: LoggedToolContext,
  input: { rideId: string }
) {
  return runLoggedTool<{
    ride: BookedRide;
    feeChargedCents: number;
  }>({
    context,
    toolName: "cancel_ride",
    requested: input,
    verified: {
      activeRideMatches: context.session.activeRide?.rideId === input.rideId,
      ridePhase: context.session.activeRide?.phase ?? "unknown"
    },
    execute: async () => context.adapter.cancelRide(input.rideId)
  });
}
