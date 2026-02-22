import React from 'react';
import { Departure, Bus, Status } from '../types';
import { formatTime, formatCountdown, getStatus } from '../utils';
import ColumnMap from './ColumnMap';

interface NextBusCardProps {
  dep1: Departure | null;
  dep2: Departure | null;
  now: number;
  bus1: Bus | null;
  bus2: Bus | null;
  mapStyleUrl: string;
  overlayVisible: boolean;
  onMap1Click?: () => void;
  onMap2Click?: () => void;
}

export default function NextBusCard({ dep1, dep2, now, bus1, bus2, mapStyleUrl, overlayVisible, onMap1Click, onMap2Click }: NextBusCardProps) {
  if (!dep1) {
    return (
      <div className="next-bus-card empty">
        <div className="next-label">Seuraava lähtö</div>
        <div style={{ marginTop: '12px', fontSize: '1rem', color: 'var(--text-muted)' }}>
          Ladataan…
        </div>
      </div>
    );
  }

  const status = getStatus(dep1, now);

  return (
    <div className={`next-bus-card status-${status}`}>
      <div className="next-columns">
        <BusColumn
          dep={dep1}
          now={now}
          status={status}
          label="Seuraava"
          isPrimary
          bus={bus1}
          mapStyleUrl={mapStyleUrl}
          overlayVisible={overlayVisible}
          onMapClick={onMap1Click}
        />
        {dep2 && (
          <BusColumn
            dep={dep2}
            now={now}
            status={getStatus(dep2, now)}
            label="Sen jälkeen"
            isPrimary={false}
            bus={bus2}
            mapStyleUrl={mapStyleUrl}
            overlayVisible={overlayVisible}
            onMapClick={onMap2Click}
          />
        )}
      </div>
    </div>
  );
}

interface BusColumnProps {
  dep: Departure;
  now: number;
  status: Status;
  label: string;
  isPrimary: boolean;
  bus: Bus | null;
  mapStyleUrl: string;
  overlayVisible: boolean;
  onMapClick?: () => void;
}

function BusColumn({ dep, now, status, label, isPrimary, bus, mapStyleUrl, overlayVisible, onMapClick }: BusColumnProps) {
  const leaveInMs = dep.leaveByMs - now;
  const busInMs = dep.departureTimeMs - now;
  const leaveValueClass = status !== 'at-stop'
    ? `counter-value status-${status}`
    : 'counter-value';

  return (
    <div className={`next-col ${isPrimary ? 'primary' : 'secondary'}`}>
      <div className="next-label">{label}</div>
      <div className="next-route">
        <span className="next-line-badge">{dep.lineRef}</span>
        <span>{dep.stopName || dep.stopId} → {dep.destinationName}</span>
      </div>
      <div className="next-departs">
        Lähtee {formatTime(dep.departureTimeMs)} &nbsp;·&nbsp; Lähde kotoa {formatTime(dep.leaveByMs)}
      </div>
      <div className={`next-counters${status === 'at-stop' && isPrimary ? ' status-at-stop' : ''}`}>
        <div className="counter-block">
          <div className="counter-label">Bussi lähtee</div>
          <div className="counter-value">
            {formatCountdown(busInMs)}
          </div>
        </div>
        <div className="counter-block">
          <div className="counter-label">Lähde kotoa</div>
          <div className={leaveValueClass}>
            {formatCountdown(leaveInMs)}
          </div>
        </div>
      </div>
      <ColumnMap bus={bus} mapStyleUrl={mapStyleUrl} overlayVisible={overlayVisible} onMapClick={onMapClick} />
    </div>
  );
}
