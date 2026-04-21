export type Actor = "user" | "agent" | "system";

export type ConversationMessage = {
  id: string;
  actor: Actor;
  text: string;
  createdAt: string;
};

export type ChatSuggestion = {
  label: string;
  prompt: string;
};

export type Coordinates = {
  lat: number;
  lng: number;
};

export type ValidatedLocation = {
  raw: string;
  canonical: string;
  coordinates: Coordinates;
};

export type RideRequest = {
  pickup: string;
  dropoff: string;
};

export type RideOption = {
  optionId: string;
  marketplace: string;
  productName: string;
  etaMinutes: number;
  priceCents: number;
  currency: "USD";
  surgeMultiplier: number;
  rideSummary: string;
};

export type RidePhase =
  | "searching"
  | "driver_assigned"
  | "driver_arriving"
  | "in_progress"
  | "completed"
  | "cancelled";

export type DriverDetails = {
  name: string;
  vehicle: string;
  licensePlate: string;
};

export type BookedRide = {
  rideId: string;
  marketplace: string;
  pickup: ValidatedLocation;
  dropoff: ValidatedLocation;
  option: RideOption;
  phase: RidePhase;
  driver: DriverDetails;
  cancellationFeeCents: number;
  lastUpdatedAt: string;
};

export type ConfirmationProposal = {
  proposalId: string;
  createdAt: string;
  pickup: ValidatedLocation;
  dropoff: ValidatedLocation;
  option: RideOption;
  marketplace: string;
  summary: string;
};

export type ActionLogEntry = {
  id: string;
  sessionId: string;
  timestamp: string;
  action: string;
  userRequest: string;
  verified: Record<string, unknown>;
  executed: Record<string, unknown>;
  outcome: Record<string, unknown>;
  success: boolean;
};

export type SessionState = {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  messages: ConversationMessage[];
  lastRideRequest?: RideRequest;
  lastValidatedPickup?: ValidatedLocation;
  lastValidatedDropoff?: ValidatedLocation;
  rideOptions: RideOption[];
  pendingProposal?: ConfirmationProposal;
  activeRide?: BookedRide;
  actionLog: ActionLogEntry[];
};

export type ChatResponse =
  | {
      kind: "message";
      session: SessionState;
      text: string;
      suggestions?: ChatSuggestion[];
    }
  | {
      kind: "quote_options";
      session: SessionState;
      text: string;
      options: RideOption[];
      suggestions?: ChatSuggestion[];
    }
  | {
      kind: "confirmation_required";
      session: SessionState;
      text: string;
      proposal: ConfirmationProposal;
      suggestions?: ChatSuggestion[];
    }
  | {
      kind: "tracking_update";
      session: SessionState;
      text: string;
      ride: BookedRide;
      suggestions?: ChatSuggestion[];
    }
  | {
      kind: "error";
      session: SessionState;
      text: string;
      suggestions?: ChatSuggestion[];
    };

export type ToolResult<T> = {
  result: T;
  logEntry: ActionLogEntry;
};
