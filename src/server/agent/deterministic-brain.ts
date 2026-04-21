import {
  clearProposal,
  createMessage,
  setProposal
} from "@/server/domain/session";
import { AgentBrain, AgentContext } from "@/server/agent/types";
import {
  ChatResponse,
  ChatSuggestion,
  RideOption
} from "@/server/domain/types";
import {
  cancelRide,
  discoverRideOptions,
  prepareBookingForConfirmation,
  trackRide,
  validateLocations
} from "@/server/tools";

const VALID_LOCATIONS = [
  "Mission Dolores Park",
  "Salesforce Tower",
  "1 Market St, San Francisco",
  "Pier 39",
  "SFO Airport"
];

function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function findSelectedOption(options: RideOption[], message: string) {
  const lower = message.toLowerCase();
  const bySpecificity = [...options].sort(
    (left, right) => right.productName.length - left.productName.length
  );

  return (
    bySpecificity.find((option) =>
      lower.includes(option.productName.toLowerCase())
    ) ?? options[0]
  );
}

function parseRideRequest(text: string) {
  const cleaned = text
    .trim()
    .replace(/^(please\s+)?(book\s+(me\s+)?(a\s+)?)?ride\s+/i, "")
    .replace(/^(please\s+)?book\s+(me\s+)?(a\s+)?ride\s+/i, "")
    .replace(/^(please\s+)?compare\s+prices\s+/i, "")
    .replace(/^(please\s+)?compare\s+/i, "")
    .replace(/^(please\s+)?book\s+/i, "")
    .trim();

  const match =
    cleaned.match(/^from\s+(.+?)\s+to\s+(.+)$/i) ??
    cleaned.match(/^(.+?)\s+to\s+(.+)$/i);

  if (!match) {
    return null;
  }

  const pickup = match[1].trim().replace(/[,.!?]+$/, "");
  const dropoff = match[2].trim().replace(/[,.!?]+$/, "");

  if (!pickup || !dropoff) {
    return null;
  }

  return { pickup, dropoff };
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

function buildLocationRetrySuggestions(input: {
  pickup?: string;
  dropoff?: string;
}): ChatSuggestion[] {
  const prompts = VALID_LOCATIONS.map((location) => {
    if (input.pickup && !input.dropoff) {
      return {
        label: `Replace dropoff with ${location}`,
        prompt: `from ${input.pickup} to ${location}`
      };
    }

    if (!input.pickup && input.dropoff) {
      return {
        label: `Replace pickup with ${location}`,
        prompt: `from ${location} to ${input.dropoff}`
      };
    }

    return {
      label: location,
      prompt: `from ${location} to Salesforce Tower`
    };
  });

  return prompts.slice(0, 5);
}

function extractInvalidAddress(
  error: Error,
  rideRequest: { pickup: string; dropoff: string }
) {
  const match = error.message.match(/Unable to verify address "(.+?)"/);
  const invalid = match?.[1]?.trim().toLowerCase();

  if (!invalid) {
    return {};
  }

  if (invalid === rideRequest.pickup.trim().toLowerCase()) {
    return { dropoff: rideRequest.dropoff };
  }

  if (invalid === rideRequest.dropoff.trim().toLowerCase()) {
    return { pickup: rideRequest.pickup };
  }

  return {};
}

function buildStarterSuggestions(): ChatSuggestion[] {
  return [
    {
      label: "Book Dolores Park -> Salesforce Tower",
      prompt: "Book a ride from Mission Dolores Park to Salesforce Tower"
    },
    {
      label: "Compare Market St -> SFO",
      prompt: "Compare prices from 1 Market St, San Francisco to SFO Airport"
    },
    {
      label: "Pier 39 -> SFO",
      prompt: "Pier 39 to SFO Airport"
    }
  ];
}

function buildAmbiguousRequestSuggestions(text: string): ChatSuggestion[] {
  const parts = text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return [
      {
        label: `Use ${parts[0]} -> ${parts[1]}`,
        prompt: `from ${parts[0]} to ${parts[1]}`
      },
      ...buildStarterSuggestions().slice(0, 2)
    ];
  }

  return buildStarterSuggestions();
}

function responseWithSuggestions(
  response: ChatResponse,
  suggestions?: ChatSuggestion[]
): ChatResponse {
  if (!suggestions || suggestions.length === 0) {
    return response;
  }

  return {
    ...response,
    suggestions
  };
}

export class DeterministicRideBrain implements AgentBrain {
  async reply(input: string, context: AgentContext): Promise<ChatResponse> {
    const session = context.session;
    const normalized = input.trim().toLowerCase();
    session.messages.push(createMessage("user", input));

    try {
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
        const text = `I prepared ${selectedOption.productName} for ${formatMoney(selectedOption.priceCents)}. Review it in the confirmation gate and confirm to book.`;
        session.messages.push(createMessage("agent", text));
        return {
          kind: "confirmation_required",
          session,
          text,
          proposal: proposalResult.result
        };
      }

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
        return responseWithSuggestions(
          { kind: "message", session, text },
          surge > 1
            ? [
                {
                  label: "Show options again",
                  prompt: "Show the options again"
                }
              ]
            : undefined
        );
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
        return responseWithSuggestions(
          { kind: "message", session, text },
          buildStarterSuggestions()
        );
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

        try {
          const validated = await validateLocations(context, rideRequest);
          session.lastValidatedPickup = validated.result.pickup;
          session.lastValidatedDropoff = validated.result.dropoff;

          const quotes = await discoverRideOptions(context, validated.result);
          session.rideOptions = quotes.result;

          const compare =
            normalized.includes("compare") || normalized.includes("cheapest");
          if (compare) {
            const text = `Here are the current ${context.adapter.marketplaceName} options: ${optionSummary(quotes.result)}. Tell me which one you want, or say "book the cheapest ride".`;
            session.messages.push(createMessage("agent", text));
            return responseWithSuggestions(
              {
                kind: "quote_options",
                session,
                text,
                options: quotes.result
              },
              [
                {
                  label: "Book the cheapest ride",
                  prompt: "Book the cheapest ride"
                },
                {
                  label: "Pick Comfort",
                  prompt: "Book Comfort"
                }
              ]
            );
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
        } catch (error) {
          const text =
            error instanceof Error
              ? `${error.message} Pick one of the suggested addresses below to retry quickly.`
              : "I could not verify that route. Pick one of the suggested addresses below to retry.";
          session.messages.push(createMessage("agent", text));
          return {
            kind: "error",
            session,
            text,
            suggestions: buildLocationRetrySuggestions(
              error instanceof Error
                ? extractInvalidAddress(error, rideRequest)
                : {}
            )
          };
        }
      }

      if (input.includes(",") && !normalized.includes(" to ")) {
        const text =
          "I see multiple locations, but I am not sure which one is pickup versus dropoff. Pick one of these retry suggestions or enter the route as '<pickup> to <dropoff>'.";
        session.messages.push(createMessage("agent", text));
        return {
          kind: "message",
          session,
          text,
          suggestions: buildAmbiguousRequestSuggestions(input)
        };
      }

      const text =
        "Tell me the route in a form like 'Mission Dolores Park to Salesforce Tower' or 'compare prices from 1 Market St, San Francisco to SFO Airport'.";
      session.messages.push(createMessage("agent", text));
      return {
        kind: "message",
        session,
        text,
        suggestions: buildStarterSuggestions()
      };
    } catch (error) {
      const text =
        error instanceof Error
          ? error.message
          : "I could not complete that ride action.";
      session.messages.push(createMessage("agent", text));
      return {
        kind: "error",
        session,
        text,
        suggestions: buildStarterSuggestions()
      };
    }
  }
}

export const deterministicRideBrain = new DeterministicRideBrain();
