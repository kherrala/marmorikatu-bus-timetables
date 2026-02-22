import React from 'react';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  alertBar: boolean;
  alertBgPulse: boolean;
  alertOverlay: boolean;
  onAlertBarChange: (v: boolean) => void;
  onAlertBgPulseChange: (v: boolean) => void;
  onAlertOverlayChange: (v: boolean) => void;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <div className="toggle-track" />
      <div className="toggle-thumb" />
    </label>
  );
}

export default function SettingsPanel({
  open, onClose,
  alertBar, alertBgPulse, alertOverlay,
  onAlertBarChange, onAlertBgPulseChange, onAlertOverlayChange,
}: SettingsPanelProps) {
  if (!open) return null;

  return (
    <div
      className="settings-panel"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="settings-card">
        <div className="settings-header">
          <span className="settings-title">Asetukset</span>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>
        <div className="settings-section-label">Hälytystyypit</div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Lähtöpalkki</div>
            <div className="settings-row-desc">Vähenevä palkki osoittaa jäljellä olevan ajan</div>
          </div>
          <Toggle checked={alertBar} onChange={onAlertBarChange} />
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Taustan välähdys</div>
            <div className="settings-row-desc">Koko näyttö välähtää oranssina kun on kiire lähteä</div>
          </div>
          <Toggle checked={alertBgPulse} onChange={onAlertBgPulseChange} />
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Koko näytön varoitus</div>
            <div className="settings-row-desc">Koko näytölle ilmestyvä lähtöilmoitus</div>
          </div>
          <Toggle checked={alertOverlay} onChange={onAlertOverlayChange} />
        </div>
      </div>
    </div>
  );
}
