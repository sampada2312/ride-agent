import { z } from "zod";
import { RideMarketplaceAdapter } from "@/server/adapters/types";
import { createId, nowIso } from "@/server/domain/session";
import {
  BookedRide,
  ConfirmationProposal,
  RideOption,
  SessionState,
  ToolResult,
  ValidatedLocation
} from "@/server/domain/types";
import { recordAction } from "@/server/logging/record-action";

export type ToolRuntime = {
  session: SessionState;
  adapter: RideMarketplaceAdapter;
};

async function runLoggedTool<T>({
  runtime,
  action,
  userRequest,
  verified,
  execute,
  summarizeResult
}: {
  runtime: ToolRuntime;
  action: string;
  userRequest: string;
  verified: Record<string, unknown>;
  execute: () => Promise<T>;
  summarizeResult?: (result: T) => Record<string, unknown>;
}): Promise<ToolResult<T>> {
  try {
    const result = await execute();
    const logEntry = await recordAction(runtime.session, {
      action,
      userRequest,
      verified,
      executed: summarizeResult ? summarizeResult(result) : summarizeExecution(result),
      outcome: { message: "Action completed successfully." },
      success: true
    });

    return { result, logEntry };
  } catch (error) {
    await recordAction(runtime.session, {
      action,
      userRequest,
      verified,
      executed: {},
      outcome: {
        error: error instanceof Error ? error.message : "Unknown tool failure"
      },
      success: false
    });
    throw error;
  }
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
  runtime: ToolRuntime,
  input: { pickup: string; dropoff: string }
) {
  const parsed = rideRequestSchema.parse(input);

  return runLoggedTool<{
    pickup: ValidatedLocation;
    dropoff: ValidatedLocation;
  }>({
    runtime,
    action: "validate_locations",
    userRequest: `Validate pickup "${parsed.pickup}" and dropoff "${parsed.dropoff}"`,
    verified: {
      adapter: runtime.adapter.marketplaceName,
      confirmationGateRequiredForBooking: false
    },
    summarizeResult: (result) => ({
      pickup: result.pickup.canonical,
      dropoff: result.dropoff.canonical
    }),
    execute: async () => {
      const pickup = await runtime.adapter.validateLocation(parsed.pickup);
      const dropoff = await runtime.adapter.validateLocation(parsed.dropoff);
      return { pickup, dropoff };
    }
  });
}

export async function discoverRideOptions(
  runtime: ToolRuntime,
  input: { pickup: ValidatedLocation; dropoff: ValidatedLocation }
) {
  return runLoggedTool<RideOption[]>({
    runtime,
    action: "discover_ride_options",
    userRequest: `Find ride options from ${input.pickup.canonical} to ${input.dropoff.canonical}`,
    verified: {
      pickupVerified: true,
      dropoffVerified: true,
      marketplace: runtime.adapter.marketplaceName
    },
    summarizeResult: (options) => ({
      quoteCount: options.length,
      products: options.map((option) => option.productName)
    }),
    execute: async () => runtime.adapter.getRideOptions(input)
  });
}

// The agent can only prepare a booking review. It cannot execute booking here.
export async function prepareBookingForConfirmation(
  runtime: ToolRuntime,
  input: {
    pickup: ValidatedLocation;
    dropoff: ValidatedLocation;
    option: RideOption;
  }
) {
  return runLoggedTool<ConfirmationProposal>({
    runtime,
    action: "prepare_booking_for_confirmation",
    userRequest: `Prepare ${input.option.productName} from ${input.pickup.canonical} to ${input.dropoff.canonical} for user review`,
    verified: {
      quoteStillPresent: runtime.session.rideOptions.some(
        (option) => option.optionId === input.option.optionId
      ),
      bookingExecutedFromChat: false,
      confirmationGateRequired: true
    },
    summarizeResult: (proposal) => ({
      proposalId: proposal.proposalId,
      option: proposal.option.productName,
      summary: proposal.summary
    }),
    execute: async () => {
      return {
        proposalId: createId("proposal"),
        createdAt: nowIso(),
        pickup: input.pickup,
        dropoff: input.dropoff,
        option: input.option,
        marketplace: runtime.adapter.marketplaceName,
        summary: `${input.option.productName} from ${input.pickup.canonical} to ${input.dropoff.canonical} for $${(
          input.option.priceCents / 100
        ).toFixed(2)}`
      };
    }
  });
}

export async function executeConfirmedBooking(
  runtime: ToolRuntime,
  input: {
    proposal: ConfirmationProposal;
    approved: boolean;
  }
) {
  return runLoggedTool<BookedRide>({
    runtime,
    action: "execute_confirmed_booking",
    userRequest: `Execute confirmed booking for proposal ${input.proposal.proposalId}`,
    verified: {
      confirmationProposalExists:
        runtime.session.pendingProposal?.proposalId === input.proposal.proposalId,
      explicitUserConfirmation: input.approved,
      bookingCalledFromConfirmationGate: true
    },
    summarizeResult: (ride) => ({
      rideId: ride.rideId,
      option: ride.option.productName,
      driver: ride.driver.name,
      phase: ride.phase
    }),
    execute: async () => {
      if (!input.approved) {
        throw new Error("Booking was not confirmed by the user.");
      }

      return runtime.adapter.bookRide({
        pickup: input.proposal.pickup,
        dropoff: input.proposal.dropoff,
        option: input.proposal.option
      });
    }
  });
}

export async function trackRide(runtime: ToolRuntime, input: { rideId: string }) {
  return runLoggedTool<BookedRide>({
    runtime,
    action: "track_ride",
    userRequest: `Track ride ${input.rideId}`,
    verified: {
      activeRideMatches: runtime.session.activeRide?.rideId === input.rideId
    },
    summarizeResult: (ride) => ({
      rideId: ride.rideId,
      phase: ride.phase,
      driver: ride.driver.name
    }),
    execute: async () => runtime.adapter.getRideStatus(input.rideId)
  });
}

export async function cancelRide(runtime: ToolRuntime, input: { rideId: string }) {
  return runLoggedTool<{
    ride: BookedRide;
    feeChargedCents: number;
  }>({
    runtime,
    action: "cancel_ride",
    userRequest: `Cancel ride ${input.rideId}`,
    verified: {
      activeRideMatches: runtime.session.activeRide?.rideId === input.rideId,
      ridePhase: runtime.session.activeRide?.phase ?? "unknown"
    },
    summarizeResult: (result) => ({
      rideId: result.ride.rideId,
      phase: result.ride.phase,
      feeChargedCents: result.feeChargedCents
    }),
    execute: async () => runtime.adapter.cancelRide(input.rideId)
  });
}
