import React from 'react';
import { Departure } from '../types';
import { formatTime, formatCountdown, getStatus } from '../utils';

interface DepartureTableProps {
  departures: Departure[];
  now: number;
  lookaheadMinutes: number;
  onRowClick?: (dep: Departure) => void;
}

export default function DepartureTable({ departures, now, lookaheadMinutes, onRowClick }: DepartureTableProps) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Linja</th>
            <th>Määränpää</th>
            <th className="right">Lähtö</th>
            <th className="right">Perillä</th>
            <th className="right">Lähde kotoa</th>
          </tr>
        </thead>
        <tbody>
          {departures.length === 0 ? (
            <tr className="empty-row">
              <td colSpan={5}>Ei busseja seuraavaan {lookaheadMinutes} minuuttiin</td>
            </tr>
          ) : (
            departures.map((dep, i) => <DepartureRow key={i} dep={dep} now={now} onClick={onRowClick ? () => onRowClick(dep) : undefined} />)
          )}
        </tbody>
      </table>
    </div>
  );
}

function DepartureRow({ dep, now, onClick }: { dep: Departure; now: number; onClick?: () => void }) {
  const status = getStatus(dep, now);
  const leaveInMs = dep.leaveByMs - now;

  let delayEl: React.ReactNode = null;
  if (dep.delaySeconds > 60) {
    delayEl = <span className="delay-badge delay-late">+{Math.round(dep.delaySeconds / 60)}min</span>;
  } else if (dep.delaySeconds < -30) {
    delayEl = <span className="delay-badge delay-early">{Math.round(dep.delaySeconds / 60)}min</span>;
  }

  const atStopEl = dep.vehicleAtStop ? (
    <span className="at-stop-tag">
      <span className="at-stop-dot" />
      PYSÄKILLÄ
    </span>
  ) : null;

  const schedEl = dep.source === 'schedule'
    ? <span className="delay-badge sched-badge">aikataulu</span>
    : null;

  return (
    <tr className={`row-status-${status}${onClick ? ' row-clickable' : ''}`} onClick={onClick}>
      <td><span className="line-badge">{dep.lineRef}</span></td>
      <td>
        <span className="dest-name">{dep.stopName || dep.stopId} → {dep.destinationName}</span>
        {delayEl}{atStopEl}{schedEl}
      </td>
      <td className="right time-cell">{formatTime(dep.departureTimeMs)}</td>
      <td className="right time-cell">
        {dep.arrivalTimeMs ? formatTime(dep.arrivalTimeMs) : '—'}
      </td>
      <td className="right countdown-cell">{formatCountdown(leaveInMs)}</td>
    </tr>
  );
}
