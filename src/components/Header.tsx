import React from 'react';

interface HeaderProps {
  address: string;
  now: number;
  onSettingsClick: () => void;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export default function Header({ address, now, onSettingsClick }: HeaderProps) {
  const d = new Date(now);
  const timeStr = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;

  return (
    <header>
      <div className="header-left">
        <div className="nysse-logo"><span>N</span></div>
        <div className="header-address">{address}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div className="header-clock">{timeStr}</div>
        <button className="settings-btn" onClick={onSettingsClick} title="Asetukset">⚙</button>
      </div>
    </header>
  );
}
