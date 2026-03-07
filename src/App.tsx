import { useState, useEffect, useRef } from 'react';
import { Config, Departure, VehicleData, Bus, OnwardStop } from './types';
import { getDepKey, getStatus, findCatchableDep, formatTime } from './utils';
import Header from './components/Header';
import NextBusCard from './components/NextBusCard';
import DepartureTable from './components/DepartureTable';
import UrgencyBar from './components/UrgencyBar';
import UrgencyOverlay from './components/UrgencyOverlay';
import SettingsPanel from './components/SettingsPanel';
import JourneyPanel from './components/JourneyPanel';

const CARTO_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [vehicleData, setVehicleData] = useState<VehicleData>({ home: null, stops: [], buses: [] });
  const [now, setNow] = useState(Date.now());
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [apiOk, setApiOk] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [alertBar, setAlertBar] = useState(true);
  const [alertOverlay, setAlertOverlay] = useState(true);
  const [dismissedDepKey, setDismissedDepKey] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewDep, setPreviewDep] = useState<Departure | null>(null);
  const [journeyDep, setJourneyDep] = useState<Departure | null>(null);
  const [arrivals1, setArrivals1] = useState<OnwardStop[]>([]);
  const [arrivals2, setArrivals2] = useState<OnwardStop[]>([]);

  const knownVersionRef = useRef<number | null>(null);
  const isFetchingRef = useRef(false);

  // Clock — 1 s
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  // Config — once on mount
  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then((data: Config) => {
        setConfig(data);
        document.title = `${data.homeAddress} — Bussit`;
        const getPref = (key: string, def: boolean): boolean => {
          const v = localStorage.getItem(key);
          return v !== null ? v === 'true' : def;
        };
        setAlertBar(getPref('alert_bar', data.alertBar));
        setAlertOverlay(getPref('alert_overlay', data.alertOverlay));
      })
      .catch(err => console.warn('Config load failed:', err));
  }, []);

  // Departures — 30 s
  useEffect(() => {
    const refresh = async () => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      setIsFetching(true);
      try {
        const res = await fetch('/api/departures');
        const data = await res.json();
        setDepartures(data.departures || []);
        setFetchedAt(data.fetchedAt || Date.now());
        setApiOk(data.ok !== false);
      } catch {
        setApiOk(false);
      } finally {
        isFetchingRef.current = false;
        setIsFetching(false);
      }
    };
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, []);

  // Vehicles — 15 s
  useEffect(() => {
    const refresh = async () => {
      try {
        const res = await fetch('/api/vehicles');
        setVehicleData(await res.json());
      } catch (err) {
        console.warn('Vehicle refresh failed:', err);
      }
    };
    refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, []);

  // Version check — 60 s, auto-reload on new deploy
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/version');
        const { version } = await res.json();
        if (knownVersionRef.current === null) {
          knownVersionRef.current = version;
        } else if (version !== knownVersionRef.current) {
          window.location.reload();
        }
      } catch {
        // network hiccup — ignore
      }
    };
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, []);

  // ── Derived state ──
  const primaryIdx = findCatchableDep(departures, now);
  const targetIdx = primaryIdx >= 0 ? primaryIdx : (departures.length > 0 ? 0 : -1);
  const secondaryIdx = targetIdx >= 0 && targetIdx + 1 < departures.length ? targetIdx + 1 : -1;
  const dep1 = targetIdx >= 0 ? departures[targetIdx] : null;
  const dep2 = secondaryIdx >= 0 ? departures[secondaryIdx] : null;

  // Match a bus to a departure by lineRef, picking the closest trip time when multiple buses active
  const findBus = (dep: Departure | null): Bus | null => {
    if (!dep) return null;
    const byLine = vehicleData.buses.filter(b => b.lineRef === dep.lineRef);
    if (!byLine.length) return null;
    if (byLine.length === 1) return byLine[0];
    return [...byLine].sort(
      (a, b) =>
        Math.abs((a.depTimeAtStop || 0) - dep.departureTimeMs) -
        Math.abs((b.depTimeAtStop || 0) - dep.departureTimeMs),
    )[0];
  };

  const bus1 = findBus(dep1);
  const bus2 = findBus(dep2);

  // City-centre arrival times for dep1 & dep2 — 15 s refresh
  const arrivalStopIds = config?.arrivalStopIds ?? [];
  useEffect(() => {
    if (arrivalStopIds.length === 0) return;
    const fetchArrivals = async (dep: Departure | null, setter: (v: OnwardStop[]) => void) => {
      if (!dep) { setter([]); return; }
      try {
        const params = new URLSearchParams({ lineRef: dep.lineRef, depTime: String(dep.departureTimeMs) });
        const res = await fetch(`/api/onward-calls?${params}`);
        const data = await res.json();
        if (data.found) {
          setter((data.stops || []).filter((s: OnwardStop) => arrivalStopIds.includes(s.id)));
        } else {
          setter([]);
        }
      } catch { setter([]); }
    };
    fetchArrivals(dep1, setArrivals1);
    fetchArrivals(dep2, setArrivals2);
    const id = setInterval(() => {
      fetchArrivals(dep1, setArrivals1);
      fetchArrivals(dep2, setArrivals2);
    }, 15_000);
    return () => clearInterval(id);
  }, [dep1?.lineRef, dep1?.departureTimeMs, dep2?.lineRef, dep2?.departureTimeMs, arrivalStopIds.join()]);

  // Auto-clear snooze when the featured departure changes to a different one
  useEffect(() => {
    if (dismissedDepKey !== null && getDepKey(dep1) !== dismissedDepKey) {
      setDismissedDepKey(null);
    }
  }, [dep1, dismissedDepKey]);

  // Body class: background pulse + overlay-visible flag
  const status1 = dep1 ? getStatus(dep1, now) : 'go';
  const isSnoozed = dep1 !== null && dismissedDepKey === getDepKey(dep1);
  const overlayVisible = alertOverlay && dep1 !== null && (dep1.leaveByMs - now) < 2 * 60 * 1000 && dep1.leaveByMs > now && !isSnoozed;

  useEffect(() => {
    document.body.className = overlayVisible ? 'overlay-visible' : '';
  });

  const mapStyleUrl = config?.mapStyleUrl ?? CARTO_STYLE;
  const homeAddress = config?.homeAddress ?? 'Marmorikatu 10';
  const lookaheadMinutes = config?.lookaheadMinutes ?? 90;

  // Stop info string for sub-header
  const stopInfoParts = config
    ? (config.stopIds || []).map(id =>
        `${config.stopLabels[id] || id} · ${config.stopWalkingMinutes[id] || config.walkingTimeMinutes} min kävelyä`,
      )
    : [];

  const handleAlertBarChange = (v: boolean) => {
    localStorage.setItem('alert_bar', String(v));
    setAlertBar(v);
  };
  const handleAlertOverlayChange = (v: boolean) => {
    localStorage.setItem('alert_overlay', String(v));
    setAlertOverlay(v);
  };

  return (
    <>
      <Header address={homeAddress} now={now} onSettingsClick={() => setSettingsOpen(true)} />

      <UrgencyBar dep1={dep1} now={now} visible={alertBar} />

      <main>
        {!apiOk && (
          <div className="error-banner">
            API-virhe — näytetään välimuistissa olevat tiedot
            {fetchedAt ? ` (${Math.round((now - fetchedAt) / 60000)} min sitten)` : ''}. Yritetään uudelleen…
          </div>
        )}

        <NextBusCard
          dep1={dep1}
          dep2={dep2}
          now={now}
          bus1={bus1}
          bus2={bus2}
          arrivals1={arrivals1}
          arrivals2={arrivals2}
          mapStyleUrl={mapStyleUrl}
          overlayVisible={overlayVisible || previewDep !== null}
          onMap1Click={dep1 ? () => setPreviewDep(dep1) : undefined}
          onMap2Click={dep2 ? () => setPreviewDep(dep2) : undefined}
          onDep1Click={dep1 ? () => setJourneyDep(dep1) : undefined}
          onDep2Click={dep2 ? () => setJourneyDep(dep2) : undefined}
        />

        <DepartureTable
          departures={departures}
          now={now}
          lookaheadMinutes={lookaheadMinutes}
          onRowClick={(dep) => setJourneyDep(dep)}
        />

        <div className="sub-header sub-header-footer">
          {stopInfoParts.length > 0 ? (
            <>
              <span>{stopInfoParts.join('  |  ')}</span>
              <span className="dot">·</span>
            </>
          ) : null}
          <span>Seuraavat {lookaheadMinutes} min</span>
        </div>
      </main>

      <footer>
        <div className="refresh-indicator">
          <div className={`refresh-dot${isFetching ? ' fetching' : ''}`} />
          <span>
            {fetchedAt ? `Päivitetty: ${formatTime(fetchedAt)}` : 'Haetaan…'}
          </span>
        </div>
        <span>Päivittyy 30 s välein</span>
      </footer>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        alertBar={alertBar}
        alertOverlay={alertOverlay}
        onAlertBarChange={handleAlertBarChange}
        onAlertOverlayChange={handleAlertOverlayChange}
      />

      {journeyDep && (
        <JourneyPanel dep={journeyDep} terminalStopIds={config?.terminalStopIds ?? []} onClose={() => setJourneyDep(null)} />
      )}

      {(overlayVisible || previewDep) && (
        <UrgencyOverlay
          dep={overlayVisible ? dep1! : previewDep!}
          now={now}
          status={status1}
          vehicleData={vehicleData}
          mapStyleUrl={mapStyleUrl}
          arrivals={overlayVisible ? arrivals1 : (previewDep === dep1 ? arrivals1 : arrivals2)}
          isPreview={!overlayVisible}
          onDismiss={() => {
            if (previewDep && !overlayVisible) { setPreviewDep(null); }
            else { setDismissedDepKey(getDepKey(dep1)); }
          }}
        />
      )}
    </>
  );
}
