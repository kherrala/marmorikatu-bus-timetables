# Marmorikatu Bus Timetables

Real-time bus departure dashboard for a home kiosk.
Monitors stops near Marmorikatu 10, Tampere and shows upcoming city-bound buses with live countdowns, minimaps, and an urgency alert when it's time to leave.

![Nysse bus dashboard](https://img.shields.io/badge/Nysse-ITS_Factory_API-0071C2)

---

## Features

- **Live departures** from two stops (Kaipanen and Pitkäniitynkatu) merged and deduplicated
- **Three-layer data strategy**: stop-monitoring (real-time) → vehicle-activity onward calls (fallback) → scheduled timetable cache (gap fill)
- **Countdown timers** — time until bus departs and time until you must leave home
- **Minimaps** per departure column (MapLibre GL), tap to open full-screen view
- **Urgency alert** — full-screen overlay when < 2 min until you need to leave; auto-closes at zero
- **Settings** — per-device toggles for the draining bar, background pulse and full-screen alert, persisted in `localStorage`
- **Auto-reload** on new deployment (version token from server start time)

---

## Architecture

```
┌─────────────────────────────────────────┐
│  Browser (React 18 + TypeScript + Vite) │
│                                         │
│  App.tsx                                │
│  ├── Header          (clock, settings)  │
│  ├── UrgencyBar      (draining bar)     │
│  ├── NextBusCard                        │
│  │   ├── BusColumn × 2                 │
│  │   │   └── ColumnMap  (MapLibre)      │
│  ├── DepartureTable                     │
│  ├── SettingsPanel                      │
│  └── UrgencyOverlay  (full-screen)      │
│      └── OverlayMap  (MapLibre)         │
└────────────────┬────────────────────────┘
                 │ /api/*
┌────────────────▼────────────────────────┐
│  server.js  (Express, Node 20)          │
│                                         │
│  /api/config      — env config + map    │
│  /api/departures  — 3-layer pipeline    │
│  /api/vehicles    — GPS positions       │
│  /api/version     — deploy token        │
│  /api/mml/style.json  — map style proxy │
│  /api/mml-proxy/* — tile proxy          │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│  ITS Factory Journeys API               │
│  data.itsfactory.fi/journeys/api/1      │
│  (public, no auth required)             │
└─────────────────────────────────────────┘
```

### Data pipeline

1. **stop-monitoring** — real-time arrivals from ITS Factory, cached server-side for 30 s
2. **vehicle-activity onward calls** — supplement for stops with no monitoring entries, cached 12 s
3. **scheduled timetable cache** — GTFS journey data fetched at startup and refreshed at 05:00; covers buses not yet in the real-time system (e.g. still at depot). Uses GTFS extended time format (`24:31:47` = 02:31 the next calendar day).

Duplicate trips (same line within 5 min) are deduplicated, keeping the stop that gives the most time at home.

---

## Getting started

### Prerequisites

- Node 20+
- Docker + Docker Compose (for production)

### Local development

```bash
# 1. Install dependencies
npm install

# 2. Copy and edit the environment file
cp .env.example .env

# 3. Start the backend (serves the Vite build from dist/ or falls back to public/)
npm start

# 4. (Optional) hot-reload frontend only
npm run dev:ui        # Vite dev server on :5173, proxies /api to :3000
```

### Production (Docker)

```bash
docker compose up --build -d
```

The container runs on **port 3002** (mapped from 3000 inside the container).
Dashboard: http://localhost:3002

---

## Configuration

All settings live in `.env` (copy from `.env.example`).

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `HOME_ADDRESS` | `Your Address, City` | Shown in header; geocoded for map home marker |
| `HOME_LAT` / `HOME_LON` | — | Skip geocoding and set home coords directly |
| `STOP_IDS` | `4431,4087` | Explicit stop IDs (city-direction). Preferred over `STOP_NAMES`. |
| `STOP_NAMES` | `Kaipanen,Pitkäniitynkatu` | Auto-discover stop IDs by name (used only if `STOP_IDS` is not set) |
| `WALKING_TIME_MINUTES` | `10` | Default walk time from home to stop |
| `STOP_WALKING_TIMES` | `4431:10,4087:13` | Per-stop walk overrides (`stopId:minutes`, comma-separated) |
| `LOOKAHEAD_MINUTES` | `90` | How far ahead to fetch departures |
| `CITY_CENTER_PATTERNS` | *(empty)* | Headsign filter — leave empty, all buses from these stops are city-bound |
| `ALERT_BAR` | `true` | Default state for the draining urgency bar |
| `ALERT_BG_PULSE` | `true` | Default state for the background pulse |
| `ALERT_OVERLAY` | `true` | Default state for the full-screen alert |
| `API_BASE_URL` | `http://data.itsfactory.fi/journeys/api/1` | ITS Factory API base |
| `MML_API_KEY` | — | Optional. Maanmittauslaitos open API key for vector map tiles. Without this, CartoDB dark tiles are used. |

### Stop IDs

ITS Factory uses numeric short IDs. The stops near Marmorikatu 10:

| Stop name | City-direction ID | Outbound ID |
|---|---|---|
| Kaipanen | **4431** | 4430 |
| Pitkäniitynkatu | **4087** | 4082 |

Always use city-direction IDs so the dashboard only shows inbound buses.

### Map tiles

Two options:

- **CartoDB dark** (default, no key needed) — fetched directly by the browser
- **MML Taustakartta / Backgroundmap** — Finnish topographic vector tiles, higher quality. Requires a free API key from [maanmittauslaitos.fi](https://www.maanmittauslaitos.fi/kartat-ja-paikkatieto/rajapinnat-ja-aineistot/karttakuvat-wmts). The key is kept server-side and proxied through `/api/mml-proxy/*` so it never reaches the browser.

---

## Project structure

```
marmorikatu-bus-timetables/
├── server.js              # Express backend — data pipeline + API routes
├── index.html             # Vite entry shell
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── Dockerfile             # Multi-stage: Vite build → production image
├── docker-compose.yml     # Port 3002 → 3000
├── .env.example
└── src/
    ├── main.tsx           # ReactDOM entry
    ├── App.tsx            # Root component: state, intervals, derived data
    ├── types.ts           # Shared TypeScript interfaces
    ├── utils.ts           # Pure helpers: formatTime, getStatus, getDepKey…
    ├── styles/
    │   └── global.css     # Nysse design system (CSS variables + all rules)
    └── components/
        ├── Header.tsx          # Logo, address, clock, settings button
        ├── NextBusCard.tsx     # Two-column next-departure card
        ├── ColumnMap.tsx       # MapLibre minimap — tap to open full-screen
        ├── DepartureTable.tsx  # Full departure list with live countdowns
        ├── UrgencyBar.tsx      # Draining time bar below the header
        ├── UrgencyOverlay.tsx  # Full-screen alert (or preview when tapped)
        ├── OverlayMap.tsx      # Full-screen MapLibre with home/stop/bus markers
        └── SettingsPanel.tsx   # Settings modal with three alert toggles
```

---

## Deployment

The repository is meant to be cloned directly on the server. Deploy a new version:

```bash
git pull && docker compose up --build -d
```

The server embeds a startup timestamp as a version token. Connected browsers poll `/api/version` every 60 s and automatically reload when the token changes after a redeploy.

---

## API

All endpoints are served by `server.js` under `/api/`.

### `GET /api/config`
Returns runtime configuration for the frontend.

```json
{
  "homeAddress": "Your Address, City",
  "walkingTimeMinutes": 10,
  "lookaheadMinutes": 90,
  "stopIds": ["4431", "4087"],
  "stopLabels": { "4431": "Kaipanen", "4087": "Pitkäniitynkatu" },
  "stopWalkingMinutes": { "4431": 10, "4087": 13 },
  "alertBar": true,
  "alertBgPulse": true,
  "alertOverlay": true,
  "mapStyleUrl": "https://..."
}
```

### `GET /api/departures`
Returns merged, deduplicated, sorted departure list.

```json
{
  "ok": true,
  "fetchedAt": 1708600000000,
  "departures": [
    {
      "lineRef": "8B",
      "destinationName": "Haukiluoma / Tesoma",
      "departureTimeMs": 1708600300000,
      "leaveByMs": 1708599700000,
      "delaySeconds": 60,
      "departureStatus": "onTime",
      "vehicleAtStop": false,
      "stopId": "4431",
      "stopName": "Kaipanen",
      "source": "realtime"
    }
  ]
}
```

### `GET /api/vehicles`
Returns GPS positions for buses currently approaching monitored stops.

```json
{
  "home": { "lat": 0.000, "lon": 0.000 },
  "stops": [{ "id": "4431", "name": "Kaipanen", "lat": 61.461, "lon": 23.914 }],
  "buses": [{ "lineRef": "8B", "lat": 61.455, "lon": 23.905, "bearing": 45, "destinationName": "Haukiluoma / Tesoma", "depTimeAtStop": 1708600300000 }]
}
```

### `GET /api/version`
```json
{ "version": 1708599000000 }
```
