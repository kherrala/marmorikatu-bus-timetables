import React from 'react';
import { Departure } from '../types';

interface UrgencyBarProps {
  dep1: Departure | null;
  now: number;
  visible: boolean;
}

export default function UrgencyBar({ dep1, now, visible }: UrgencyBarProps) {
  if (!visible) {
    return <div id="urgencyBarWrap" style={{ display: 'none' }} />;
  }

  let pct = 0;
  let colorClass = '';

  if (dep1) {
    const walkMs = dep1.departureTimeMs - dep1.leaveByMs;
    const remaining = dep1.leaveByMs - now;
    pct = walkMs > 0 ? Math.max(0, Math.min(100, (remaining / walkMs) * 100)) : 0;
    if (pct < 5) colorClass = 'bar-red';
    else if (pct < 20) colorClass = 'bar-orange';
    else if (pct < 50) colorClass = 'bar-yellow';
  }

  return (
    <div id="urgencyBarWrap" className={colorClass}>
      <div id="urgencyBarFill" style={{ width: `${pct}%` }} />
    </div>
  );
}
