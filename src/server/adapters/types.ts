import {
  BookedRide,
  RideOption,
  ValidatedLocation
} from "@/server/domain/types";

export type RideOptionRequest = {
  pickup: ValidatedLocation;
  dropoff: ValidatedLocation;
};

export type BookRideRequest = {
  pickup: ValidatedLocation;
  dropoff: ValidatedLocation;
  option: RideOption;
};

export type CancelRideResult = {
  ride: BookedRide;
  feeChargedCents: number;
};

// The rest of the system talks to ride marketplaces only through this adapter contract.
export interface RideMarketplaceAdapter {
  readonly marketplaceName: string;
  validateLocation(input: string): Promise<ValidatedLocation>;
  getRideOptions(request: RideOptionRequest): Promise<RideOption[]>;
  bookRide(request: BookRideRequest): Promise<BookedRide>;
  getRideStatus(rideId: string): Promise<BookedRide>;
  cancelRide(rideId: string): Promise<CancelRideResult>;
}
