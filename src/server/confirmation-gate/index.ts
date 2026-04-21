import { RideMarketplaceAdapter } from "@/server/adapters/types";
import { createMessage, setActiveRide } from "@/server/domain/session";
import { ChatResponse, SessionState } from "@/server/domain/types";
import { recordAction } from "@/server/logging/record-action";
import { executeConfirmedBooking } from "@/server/tools";

type ConfirmationGateInput = {
  session: SessionState;
  adapter: RideMarketplaceAdapter;
  proposalId: string;
  approved: boolean;
};

// Booking is impossible from chat alone. The only booking path runs through this module.
export async function resolveBookingConfirmation(
  input: ConfirmationGateInput
): Promise<ChatResponse> {
  const { session, adapter, proposalId, approved } = input;
  const proposal = session.pendingProposal;

  if (!proposal || proposal.proposalId !== proposalId) {
    await recordAction(session, {
      action: "confirmation_gate_decision",
      userRequest: `Review booking proposal ${proposalId}`,
      verified: {
        pendingProposalExists: Boolean(proposal),
        proposalMatchesSession: proposal?.proposalId === proposalId
      },
      executed: {},
      outcome: {
        error: "The confirmation proposal is missing or stale."
      },
      success: false
    });

    return {
      kind: "error",
      session,
      text: "The confirmation proposal is missing or stale."
    };
  }

  if (!approved) {
    session.pendingProposal = undefined;
    await recordAction(session, {
      action: "confirmation_gate_decision",
      userRequest: `Reject booking proposal ${proposalId}`,
      verified: {
        proposalReviewed: true,
        explicitUserApproval: false,
        bookingStillBlocked: true
      },
      executed: {
        proposalDismissed: true
      },
      outcome: {
        message: "The prepared booking was rejected. No ride was booked."
      },
      success: true
    });

    const text = "The prepared booking was rejected. No ride was booked.";
    session.messages.push(createMessage("agent", text));
    return {
      kind: "message",
      session,
      text
    };
  }

  try {
    const booking = await executeConfirmedBooking(
      { session, adapter },
      {
        proposal,
        approved
      }
    );

    setActiveRide(session, booking.result);
    await recordAction(session, {
      action: "confirmation_gate_decision",
      userRequest: `Approve booking proposal ${proposalId}`,
      verified: {
        proposalReviewed: true,
        explicitUserApproval: true,
        bookingOnlyAllowedHere: true
      },
      executed: {
        confirmedProposalId: proposalId,
        bookedRideId: booking.result.rideId
      },
      outcome: {
        message: `Ride booked successfully with ${booking.result.driver.name}.`
      },
      success: true
    });

    const text = `Booked ${booking.result.option.productName} with ${booking.result.driver.name}. ${booking.result.driver.vehicle} is on the way.`;
    session.messages.push(createMessage("agent", text));
    return {
      kind: "message",
      session,
      text
    };
  } catch (error) {
    const text =
      error instanceof Error ? error.message : "The booking confirmation failed.";
    session.messages.push(createMessage("agent", text));
    return {
      kind: "error",
      session,
      text
    };
  }
}
