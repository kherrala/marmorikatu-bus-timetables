export interface Config {
  homeAddress: string;
  walkingTimeMinutes: number;
  lookaheadMinutes: number;
  stopIds: string[];
  stopLabels: Record<string, string>;
  stopWalkingMinutes: Record<string, number>;
  alertBar: boolean;
  alertBgPulse: boolean;
  alertOverlay: boolean;
  mapStyleUrl: string;
}

export interface Departure {
  lineRef: string;
  destinationName: string;
  departureTimeMs: number;
  leaveByMs: number;
  delaySeconds: number;
  departureStatus: string;
  vehicleAtStop: boolean;
  stopId: string;
  stopName: string;
  source: 'realtime' | 'schedule';
}

export interface Bus {
  lineRef: string;
  lat: number;
  lon: number;
  bearing: number;
  destinationName: string;
  depTimeAtStop: number;
}

export interface VehicleData {
  home: { lat: number; lon: number } | null;
  stops: { id: string; name: string; lat: number; lon: number }[];
  buses: Bus[];
}

export type Status = 'go' | 'soon' | 'urgent' | 'late' | 'at-stop';
