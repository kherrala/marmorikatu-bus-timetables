import { useEffect, useState } from 'react';
import { Departure, OnwardStop } from '../types';
import { formatTime } from '../utils';

interface JourneyPanelProps {
  dep: Departure;
  onClose: () => void;
}

const TERMINAL_IDS = ['0001', '0002'];

export default function JourneyPanel({ dep, onClose }: JourneyPanelProps) {
  const [stops, setStops] = useState<OnwardStop[]>([]);
  const [loading, setLoading] = useState(true);
  const [found, setFound] = useState(false);

  useEffect(() => {
    setLoading(true);
    setFound(false);
    setStops([]);
    const params = new URLSearchParams({
      lineRef: dep.lineRef,
      depTime: String(dep.departureTimeMs),
    });
    fetch(`/api/onward-calls?${params}`)
      .then(r => r.json())
      .then(data => {
        setFound(data.found);
        setStops(data.stops || []);
      })
      .catch(() => setFound(false))
      .finally(() => setLoading(false));
  }, [dep.lineRef, dep.departureTimeMs]);

  return (
    <div className="journey-backdrop" onClick={onClose}>
      <div className="journey-panel" onClick={e => e.stopPropagation()}>
        <div className="journey-header">
          <span className="journey-badge">{dep.lineRef}</span>
          <span className="journey-title">
            {dep.stopName || dep.stopId} → {dep.destinationName}
          </span>
          <button className="journey-close" onClick={onClose} aria-label="Sulje">✕</button>
        </div>

        <div className="journey-subtitle">Saapumisaika keskustan pysäkeille</div>

        <div className="journey-stops">
          {loading && (
            <div className="journey-loading">Haetaan reaaliaikatietoja…</div>
          )}

          {!loading && !found && (
            <div className="journey-no-data">
              {dep.source === 'schedule'
                ? 'Bussilla ei ole vielä reaaliaikatietoja (aikataulupohjainen lähtö).'
                : 'Reaaliaikatietoja ei saatavilla juuri nyt.'}
            </div>
          )}

          {!loading && found && stops.length === 0 && (
            <div className="journey-no-data">
              Pysäkkitietoja ei löydy tältä reitiltä.
            </div>
          )}

          {!loading && found && stops.map(stop => {
            const delayMs = stop.expectedTimeMs && stop.aimedTimeMs
              ? stop.expectedTimeMs - stop.aimedTimeMs
              : 0;
            const delayMin = Math.round(delayMs / 60000);
            const isTerminal = TERMINAL_IDS.includes(stop.id);

            return (
              <div key={stop.id} className={`journey-stop${isTerminal ? ' journey-stop-terminal' : ''}`}>
                <div className="journey-stop-name">{stop.name}</div>
                <div className="journey-stop-time">
                  <span>{stop.expectedTimeMs ? formatTime(stop.expectedTimeMs) : '—'}</span>
                  {delayMin > 1 && (
                    <span className="journey-delay">+{delayMin} min</span>
                  )}
                  {delayMin < -1 && (
                    <span className="journey-early">{delayMin} min</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
