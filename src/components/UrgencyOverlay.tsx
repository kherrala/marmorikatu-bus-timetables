import React from 'react';
import { Departure, VehicleData, Status } from '../types';
import { formatTime, formatCountdown } from '../utils';
import OverlayMap from './OverlayMap';

interface UrgencyOverlayProps {
  dep: Departure;
  now: number;
  status: Status;
  vehicleData: VehicleData;
  mapStyleUrl: string;
  onDismiss: () => void;
}

export default function UrgencyOverlay({ dep, now, status, vehicleData, mapStyleUrl, onDismiss }: UrgencyOverlayProps) {
  const leaveIn = dep.leaveByMs - now;

  return (
    <div
      className={`urgency-overlay${status === 'late' ? ' state-late' : ''}`}
      onClick={onDismiss}
    >
      <OverlayMap dep={dep} vehicleData={vehicleData} mapStyleUrl={mapStyleUrl} />
      <div className="overlay-inner">
        <div className="overlay-route">
          <span className="overlay-badge">{dep.lineRef}</span>
          {dep.stopName || dep.stopId} → {dep.destinationName}
        </div>
        <div className="overlay-title">LÄHDE KOTOA</div>
        <div className="overlay-countdown">{formatCountdown(leaveIn)}</div>
        <div className="overlay-details">
          Bussi lähtee klo {formatTime(dep.departureTimeMs)}
        </div>
      </div>
    </div>
  );
}
