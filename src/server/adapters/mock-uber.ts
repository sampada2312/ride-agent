import {
  BookedRide,
  DriverDetails,
  RideOption,
  ValidatedLocation
} from "@/server/domain/types";
import {
  BookRideRequest,
  CancelRideResult,
  RideMarketplaceAdapter,
  RideOptionRequest
} from "@/server/adapters/types";
import { createId, nowIso } from "@/server/domain/session";

type MockRideRecord = {
  ride: BookedRide;
  statusChecks: number;
};

const LOCATIONS: Array<
  ValidatedLocation & {
    aliases: string[];
  }
> = [
  {
    raw: "1 Market St, San Francisco",
    canonical: "1 Market St, San Francisco, CA",
    coordinates: { lat: 37.7946, lng: -122.3941 },
    aliases: ["1 market st", "market street", "market st sf"]
  },
  {
    raw: "SFO Airport",
    canonical: "San Francisco International Airport",
    coordinates: { lat: 37.6213, lng: -122.379 },
    aliases: ["sfo", "airport", "sfo airport"]
  },
  {
    raw: "Pier 39",
    canonical: "Pier 39, San Francisco, CA",
    coordinates: { lat: 37.8087, lng: -122.4098 },
    aliases: ["pier 39", "fisherman's wharf"]
  },
  {
    raw: "Mission Dolores Park",
    canonical: "Mission Dolores Park, San Francisco, CA",
    coordinates: { lat: 37.7596, lng: -122.4269 },
    aliases: ["dolores park", "mission dolores park"]
  },
  {
    raw: "Salesforce Tower",
    canonical: "Salesforce Tower, San Francisco, CA",
    coordinates: { lat: 37.7897, lng: -122.3966 },
    aliases: ["salesforce tower", "415 mission st"]
  }
];

const DRIVERS: DriverDetails[] = [
  {
    name: "Alicia",
    vehicle: "Blue Toyota Camry",
    licensePlate: "8RIDE21"
  },
  {
    name: "Marcus",
    vehicle: "Black Tesla Model 3",
    licensePlate: "AGNT007"
  },
  {
    name: "Elena",
    vehicle: "Silver Honda Accord",
    licensePlate: "GO4RIDE"
  }
];

function toMoney(cents: number) {
  return Math.round(cents);
}

function distanceMiles(a: ValidatedLocation, b: ValidatedLocation) {
  const latMiles = (a.coordinates.lat - b.coordinates.lat) * 69;
  const lngMiles =
    (a.coordinates.lng - b.coordinates.lng) *
    54.6 *
    Math.cos(((a.coordinates.lat + b.coordinates.lat) / 2) * (Math.PI / 180));

  return Math.sqrt(latMiles * latMiles + lngMiles * lngMiles);
}

function option(
  request: RideOptionRequest,
  productName: string,
  etaMinutes: number,
  baseFare: number,
  perMile: number,
  surgeMultiplier: number
): RideOption {
  const distance = distanceMiles(request.pickup, request.dropoff);
  const priceCents = toMoney((baseFare + distance * perMile) * surgeMultiplier);
  const optionId = [
    "quote",
    productName.toLowerCase(),
    request.pickup.canonical.replaceAll(/[^a-z0-9]+/gi, "-").toLowerCase(),
    request.dropoff.canonical.replaceAll(/[^a-z0-9]+/gi, "-").toLowerCase()
  ].join("_");

  return {
    optionId,
    marketplace: "Uber",
    productName,
    etaMinutes,
    priceCents,
    currency: "USD",
    surgeMultiplier,
    rideSummary: `${productName} in ${etaMinutes} min`
  };
}

function getSurgeMultiplier(request: RideOptionRequest) {
  const airport =
    request.pickup.canonical.includes("Airport") ||
    request.dropoff.canonical.includes("Airport");

  return airport ? 1.8 : 1;
}

function getRidePhase(statusChecks: number) {
  if (statusChecks <= 0) {
    return "driver_assigned" as const;
  }
  if (statusChecks === 1) {
    return "driver_arriving" as const;
  }
  if (statusChecks === 2) {
    return "in_progress" as const;
  }

  return "completed" as const;
}

function hashValue(input: string) {
  return [...input].reduce((total, character) => total + character.charCodeAt(0), 0);
}

export class MockUberAdapter implements RideMarketplaceAdapter {
  readonly marketplaceName = "Uber";

  private rides = new Map<string, MockRideRecord>();

  async validateLocation(input: string): Promise<ValidatedLocation> {
    const normalized = input.trim().toLowerCase();
    const match = LOCATIONS.find((location) => {
      return (
        location.canonical.toLowerCase() === normalized ||
        location.raw.toLowerCase() === normalized ||
        location.aliases.some((alias) => alias === normalized)
      );
    });

    if (!match) {
      throw new Error(
        `Unable to verify address "${input}". Try one of: 1 Market St, Pier 39, Mission Dolores Park, Salesforce Tower, or SFO Airport.`
      );
    }

    return {
      raw: input,
      canonical: match.canonical,
      coordinates: match.coordinates
    };
  }

  async getRideOptions(request: RideOptionRequest): Promise<RideOption[]> {
    const surgeMultiplier = getSurgeMultiplier(request);
    const distance = distanceMiles(request.pickup, request.dropoff);
    const etaBase = Math.max(3, Math.round(distance * 1.7));

    return [
      option(request, "UberX", etaBase + 2, 750, 185, surgeMultiplier),
      option(request, "Comfort", etaBase + 4, 1150, 245, surgeMultiplier),
      option(request, "UberXL", etaBase + 6, 1450, 295, surgeMultiplier)
    ];
  }

  async bookRide(request: BookRideRequest): Promise<BookedRide> {
    const rideId = createId("ride");
    const timestamp = nowIso();
    const driver = DRIVERS[hashValue(request.option.optionId) % DRIVERS.length] ?? DRIVERS[0];

    const ride: BookedRide = {
      rideId,
      marketplace: this.marketplaceName,
      pickup: request.pickup,
      dropoff: request.dropoff,
      option: request.option,
      phase: "driver_assigned",
      driver,
      cancellationFeeCents:
        request.option.surgeMultiplier > 1 ? 899 : 499,
      lastUpdatedAt: timestamp
    };

    this.rides.set(rideId, { ride, statusChecks: 0 });

    return ride;
  }

  async getRideStatus(rideId: string): Promise<BookedRide> {
    const record = this.rides.get(rideId);

    if (!record) {
      throw new Error(`Ride ${rideId} was not found in the Uber mock backend.`);
    }

    if (
      record.ride.phase !== "cancelled" &&
      record.ride.phase !== "completed"
    ) {
      record.statusChecks += 1;
      record.ride = {
        ...record.ride,
        phase: getRidePhase(record.statusChecks),
        lastUpdatedAt: nowIso()
      };
      this.rides.set(rideId, record);
    }

    return record.ride;
  }

  async cancelRide(rideId: string): Promise<CancelRideResult> {
    const record = this.rides.get(rideId);

    if (!record) {
      throw new Error(`Ride ${rideId} was not found in the Uber mock backend.`);
    }

    if (record.ride.phase === "completed") {
      throw new Error("Completed rides cannot be cancelled.");
    }

    if (record.ride.phase === "cancelled") {
      return {
        ride: record.ride,
        feeChargedCents: record.ride.cancellationFeeCents
      };
    }

    const cancelledRide: BookedRide = {
      ...record.ride,
      phase: "cancelled",
      lastUpdatedAt: nowIso()
    };

    this.rides.set(rideId, {
      ride: cancelledRide,
      statusChecks: record.statusChecks
    });

    return {
      ride: cancelledRide,
      feeChargedCents:
        record.statusChecks >= 1 ? cancelledRide.cancellationFeeCents : 0
    };
  }
}

let sharedAdapter: MockUberAdapter | undefined;

export function getMockUberAdapter() {
  if (!sharedAdapter) {
    sharedAdapter = new MockUberAdapter();
  }

  return sharedAdapter;
}
