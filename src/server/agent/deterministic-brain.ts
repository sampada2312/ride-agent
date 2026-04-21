import {
  clearProposal,
  createMessage,
  setActiveRide,
  setProposal
} from "@/server/domain/session";
import { AgentBrain, AgentContext } from "@/server/agent/types";
import {
  ChatResponse,
  RideOption
} from "@/server/domain/types";
import {
  cancelRide,
  discoverRideOptions,
  prepareBookingForConfirmation,
  trackRide,
  validateLocations
} from "@/server/tools";

function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function findSelectedOption(options: RideOption[], message: string) {
  const lower = message.toLowerCase();
  return (
    options.find((option) => lower.includes(option.productName.toLowerCase())) ??
    options[0]
  );
}

function parseRideRequest(text: string) {
  const match = text.match(/from\s+(.+?)\s+to\s+(.+)/i);
  if (!match) {
    return null;
  }

  return {
    pickup: match[1].trim(),
    dropoff: match[2].trim()
  };
}

function optionSummary(options: RideOption[]) {
  return options
    .map((option) => {
      const surge =
        option.surgeMultiplier > 1
          ? `, surge x${option.surgeMultiplier.toFixed(1)}`
          : "";
      return `${option.productName}: ${formatMoney(option.priceCents)} (${option.etaMinutes} min${surge})`;
    })
    .join(" | ");
}

export class DeterministicRideBrain implements AgentBrain {
  async reply(input: string, context: AgentContext): Promise<ChatResponse> {
    const session = context.session;
    const normalized = input.trim().toLowerCase();
    session.messages.push(createMessage("user", input));

    try {
      if (
        session.activeRide &&
        (normalized.includes("track") ||
          normalized.includes("where") ||
          normalized.includes("status") ||
          normalized.includes("eta"))
      ) {
        const { result } = await trackRide(context, {
          rideId: session.activeRide.rideId
        });
        session.activeRide = result;
        const text = `Your ${result.option.productName} is ${result.phase.replaceAll("_", " ")} with ${result.driver.name} in the ${result.driver.vehicle}.`;
        session.messages.push(createMessage("agent", text));
        return { kind: "tracking_update", session, text, ride: result };
      }

      if (session.activeRide && normalized.includes("cancel")) {
        const { result } = await cancelRide(context, {
          rideId: session.activeRide.rideId
        });
        session.activeRide = result.ride;
        const text =
          result.feeChargedCents > 0
            ? `The ride was cancelled. Fee charged: ${formatMoney(result.feeChargedCents)}.`
            : "The ride was cancelled with no fee.";
        session.messages.push(createMessage("agent", text));
        return { kind: "message", session, text };
      }

      if (
        session.pendingProposal &&
        (normalized.includes("why") ||
          normalized.includes("expensive") ||
          normalized.includes("surge"))
      ) {
        const surge = session.pendingProposal.option.surgeMultiplier;
        const text =
          surge > 1
            ? `Pricing is elevated because surge is active at x${surge.toFixed(1)} on this route. I can also show the full option list again if you want to compare before confirming.`
            : "This quote is using normal pricing. I can show the other ride options again if you want to compare.";
        session.messages.push(createMessage("agent", text));
        return { kind: "message", session, text };
      }

      if (
        session.pendingProposal &&
        (normalized.includes("compare") || normalized.includes("options"))
      ) {
        const text = `Current options: ${optionSummary(session.rideOptions)}. Tell me which one you want and I will prepare a fresh confirmation proposal.`;
        session.messages.push(createMessage("agent", text));
        return {
          kind: "quote_options",
          session,
          text,
          options: session.rideOptions
        };
      }

      if (
        session.pendingProposal &&
        (normalized === "no" ||
          normalized.includes("reject") ||
          normalized.includes("don't book"))
      ) {
        clearProposal(session);
        const text = "I dropped the pending booking. Ask for another route whenever you want.";
        session.messages.push(createMessage("agent", text));
        return { kind: "message", session, text };
      }

      if (
        session.pendingProposal &&
        (normalized === "yes" ||
          normalized.includes("confirm") ||
          normalized.includes("book it"))
      ) {
        const text =
          "The ride is ready to book, but I still need the explicit confirmation gate. Use the Confirm Ride button so booking is auditable.";
        session.messages.push(createMessage("agent", text));
        return {
          kind: "confirmation_required",
          session,
          text,
          proposal: session.pendingProposal
        };
      }

      const rideRequest = parseRideRequest(input);
      if (rideRequest) {
        session.lastRideRequest = rideRequest;
        const validated = await validateLocations(context, rideRequest);
        session.lastValidatedPickup = validated.result.pickup;
        session.lastValidatedDropoff = validated.result.dropoff;

        const quotes = await discoverRideOptions(context, validated.result);
        session.rideOptions = quotes.result;

        const compare = normalized.includes("compare") || normalized.includes("cheapest");
        if (compare) {
          const text = `Here are the current ${context.adapter.marketplaceName} options: ${optionSummary(quotes.result)}. Tell me which one you want, or say "book the cheapest ride".`;
          session.messages.push(createMessage("agent", text));
          return {
            kind: "quote_options",
            session,
            text,
            options: quotes.result
          };
        }

        const selectedOption = findSelectedOption(quotes.result, normalized);
        const proposalResult = await prepareBookingForConfirmation(context, {
          pickup: validated.result.pickup,
          dropoff: validated.result.dropoff,
          option: selectedOption
        });
        setProposal(session, proposalResult.result);

        const surgeText =
          selectedOption.surgeMultiplier > 1
            ? ` Surge pricing is active at x${selectedOption.surgeMultiplier.toFixed(1)}.`
            : "";
        const text = `I found ${selectedOption.productName} for ${formatMoney(selectedOption.priceCents)} with an ETA of ${selectedOption.etaMinutes} minutes.${surgeText} Review the proposal and confirm to book.`;
        session.messages.push(createMessage("agent", text));
        return {
          kind: "confirmation_required",
          session,
          text,
          proposal: proposalResult.result
        };
      }

      if (
        session.rideOptions.length > 0 &&
        (normalized.includes("cheapest") ||
          normalized.includes("comfort") ||
          normalized.includes("uberx") ||
          normalized.includes("uberxl"))
      ) {
        const selectedOption = findSelectedOption(session.rideOptions, normalized);
        if (!session.lastValidatedPickup || !session.lastValidatedDropoff) {
          throw new Error("Ride locations are missing for the selected option.");
        }

        const proposalResult = await prepareBookingForConfirmation(context, {
          pickup: session.lastValidatedPickup,
          dropoff: session.lastValidatedDropoff,
          option: selectedOption
        });
        setProposal(session, proposalResult.result);
        const text = `I prepared ${selectedOption.productName} for ${formatMoney(selectedOption.priceCents)}. Use the confirmation gate to book it.`;
        session.messages.push(createMessage("agent", text));
        return {
          kind: "confirmation_required",
          session,
          text,
          proposal: proposalResult.result
        };
      }

      const text =
        "Tell me the ride request as 'from <pickup> to <dropoff>'. You can add 'compare prices' if you want options before I prepare a booking.";
      session.messages.push(createMessage("agent", text));
      return { kind: "message", session, text };
    } catch (error) {
      const text =
        error instanceof Error
          ? error.message
          : "I could not complete that ride action.";
      session.messages.push(createMessage("agent", text));
      return { kind: "error", session, text };
    }
  }
}

export const deterministicRideBrain = new DeterministicRideBrain();
