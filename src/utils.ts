import { Departure, Status } from './types';

export function pad2(n: number): string {
  return String(Math.floor(Math.abs(n))).padStart(2, '0');
}

export function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatCountdown(ms: number): string {
  const neg = ms < 0;
  const abs = Math.abs(ms);
  const totalSec = Math.floor(abs / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${neg ? '-' : ''}${pad2(m)}:${pad2(s)}`;
}

export function getStatus(dep: Departure, now: number): Status {
  if (dep.vehicleAtStop) return 'at-stop';
  const leaveIn = dep.leaveByMs - now;
  if (leaveIn > 5 * 60 * 1000) return 'go';
  if (leaveIn > 2 * 60 * 1000) return 'soon';
  if (leaveIn >= 0) return 'urgent';
  return 'late';
}

export function getDepKey(dep: Departure | null): string | null {
  if (!dep) return null;
  return `${dep.lineRef}|${Math.floor(dep.departureTimeMs / 60000)}`;
}

export function findCatchableDep(departures: Departure[], now: number): number {
  const GRACE_MS = 5 * 60 * 1000;
  return departures.findIndex(d => d.leaveByMs >= now - GRACE_MS);
}
