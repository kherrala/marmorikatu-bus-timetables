require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();

// --- Config ---
const PORT = parseInt(process.env.PORT || '3000', 10);
const API_BASE = process.env.API_BASE_URL || 'http://data.itsfactory.fi/journeys/api/1';
const HOME_ADDRESS = process.env.HOME_ADDRESS || 'Your Address, City';
const WALKING_TIME_MINUTES = parseInt(process.env.WALKING_TIME_MINUTES || '10', 10);

// Per-stop walking times: "4431:10,4087:13" → { '4431': 600000, '4087': 780000 }
const STOP_WALKING_TIMES_RAW = process.env.STOP_WALKING_TIMES || '';
const stopWalkMs = {};
if (STOP_WALKING_TIMES_RAW) {
  STOP_WALKING_TIMES_RAW.split(',').forEach(pair => {
    const [id, mins] = pair.trim().split(':');
    if (id && mins) stopWalkMs[id.trim()] = parseInt(mins, 10) * 60 * 1000;
  });
}

function walkMsForStop(stopId) {
  return stopWalkMs[stopId] !== undefined ? stopWalkMs[stopId] : WALKING_TIME_MINUTES * 60 * 1000;
}
const LOOKAHEAD_MINUTES = parseInt(process.env.LOOKAHEAD_MINUTES || '90', 10);

// Alert feature default flags (can be overridden per-device in browser localStorage)
const ALERT_BAR      = process.env.ALERT_BAR      !== 'false';
const ALERT_BG_PULSE = process.env.ALERT_BG_PULSE !== 'false';
const ALERT_OVERLAY  = process.env.ALERT_OVERLAY  !== 'false';

// STOP_IDS: explicit comma-separated list of stop IDs (city-direction).
// Kaipanen city-direction: 4431, Pitkäniitynkatu city-direction: 4087
const STOP_IDS_ENV = process.env.STOP_IDS || '';

// --- Stop state ---
let monitoredStopIds = ['4431', '4087'];

// Pre-seeded stop name cache
const stopNameCache = {
  '0001': 'Keskustori M',
  '0002': 'Keskustori',
  '0003': 'Koskipuisto',
  '0004': 'Pyynikintori',
  '0005': 'Hämeenpuisto',
  '1668': 'Haukiluoma / Tesoma',
  '4045': 'Nokianvirta',
  '4431': 'Kaipanen',
  '4430': 'Kaipanen',
  '4087': 'Pitkäniitynkatu',
  '4082': 'Pitkäniitynkatu',
};

let stopLabels = {};
let homeCoords = null;       // { lat, lon } — geocoded from HOME_ADDRESS
const stopCoords = {};       // { stopId: { lat, lon } }

// --- Cached data ---
let cachedDepartures = [];
let cacheTimestamp = null;

// Schedule cache: { stopId: [{lineRef, headSign, departureTimeMs}] }
// Built from the journeys API for the current service day.
let scheduleCache = {};
let scheduleCacheServiceDate = null; // Date string when cache was built

// --- Stop discovery ---
async function discoverStopIds() {
  if (STOP_IDS_ENV) {
    monitoredStopIds = STOP_IDS_ENV.split(',').map(s => s.trim()).filter(Boolean);
    console.log('Using configured stop IDs:', monitoredStopIds.join(', '));
    await Promise.all(monitoredStopIds.map(async id => {
      const name = await resolveStopName(id);
      stopLabels[id] = name;
    }));
    return;
  }

  const stopNamesRaw = process.env.STOP_NAMES || process.env.STOP_NAME || 'Kaipanen,Pitkäniitynkatu';
  const stopNames = stopNamesRaw.split(',').map(s => s.trim()).filter(Boolean);
  const allIds = [];
  for (const name of stopNames) {
    try {
      const url = `${API_BASE}/stop-points?name=${encodeURIComponent(name)}`;
      const res = await fetch(url, { timeout: 10000 });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const bodies = data.body;
      if (!bodies || !Array.isArray(bodies) || bodies.length === 0) throw new Error('No stops found');
      bodies.forEach(s => {
        const id = String(s.shortName);
        stopNameCache[id] = s.name || name;
        stopLabels[id] = s.name || name;
        allIds.push(id);
      });
      console.log(`Discovered stops for "${name}":`, bodies.map(s => `${s.name} (${s.shortName})`).join(', '));
    } catch (err) {
      console.warn(`Stop discovery failed for "${name}": ${err.message}`);
    }
  }
  if (allIds.length > 0) monitoredStopIds = allIds;
  else console.warn('All stop discovery failed. Using fallback IDs:', monitoredStopIds.join(', '));
}

// --- Resolve destination stop name by short ID ---
async function resolveStopName(shortName) {
  if (stopNameCache[shortName]) return stopNameCache[shortName];
  try {
    const url = `${API_BASE}/stop-points/${encodeURIComponent(shortName)}`;
    const res = await fetch(url, { timeout: 8000 });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const body = Array.isArray(data.body) ? data.body[0] : data.body;
    const name = (body && body.name) ? body.name : shortName;
    stopNameCache[shortName] = name;
    return name;
  } catch {
    stopNameCache[shortName] = shortName;
    return shortName;
  }
}

// --- Parse SIRI ISO 8601 duration string → milliseconds ---
function parseDelayISO(durationStr) {
  if (!durationStr) return 0;
  try {
    const negative = durationStr.startsWith('-');
    const s = durationStr.replace(/^-/, '');
    const match = s.match(/P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/);
    if (!match) return 0;
    const hours = parseFloat(match[4] || 0);
    const minutes = parseFloat(match[5] || 0);
    const seconds = parseFloat(match[6] || 0);
    const ms = (hours * 3600 + minutes * 60 + seconds) * 1000;
    return negative ? -ms : ms;
  } catch { return 0; }
}

// --- Geocode home address via Nominatim (runs once at startup) ---
async function geocodeHomeAddress() {
  if (process.env.HOME_LAT && process.env.HOME_LON) {
    return { lat: parseFloat(process.env.HOME_LAT), lon: parseFloat(process.env.HOME_LON) };
  }
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(HOME_ADDRESS)}`;
    const res = await fetch(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'marmorikatu-bus-timetables/1.0 (home-kiosk)' },
    });
    const data = await res.json();
    if (data && data[0]) {
      console.log(`Geocoded home: ${data[0].lat}, ${data[0].lon}`);
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    }
  } catch (err) {
    console.warn('Home geocoding failed:', err.message);
  }
  return null;
}

// --- Fetch stop coordinates from ITS Factory stop-points API ---
async function fetchStopCoords(stopId) {
  if (stopCoords[stopId]) return stopCoords[stopId];
  try {
    const url = `${API_BASE}/stop-points/${encodeURIComponent(stopId)}`;
    const res = await fetch(url, { timeout: 8000 });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const body = Array.isArray(data.body) ? data.body[0] : data.body;
    if (body && body.location) {
      const loc = body.location;
      const lat = parseFloat(loc.latitude ?? loc.lat ?? loc.y);
      const lon = parseFloat(loc.longitude ?? loc.lon ?? loc.x);
      if (!isNaN(lat) && !isNaN(lon) && lat !== 0) {
        stopCoords[stopId] = { lat, lon };
        console.log(`Stop ${stopId} coords: ${lat}, ${lon}`);
        return stopCoords[stopId];
      }
      console.warn(`Stop ${stopId} unrecognised location format:`, JSON.stringify(loc));
    }
  } catch (err) {
    console.warn(`Stop coords failed for ${stopId}: ${err.message}`);
  }
  return null;
}

// --- Schedule helper functions ---

// The GTFS service day for right now.
// Buses running past midnight still belong to the previous calendar day's service.
// Cutoff: before 05:00 local time → use previous calendar day.
function getCurrentServiceDate() {
  const now = new Date();
  const local = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Helsinki' }));
  if (local.getHours() < 5) local.setDate(local.getDate() - 1);
  return local;
}

// GTFS day type string for a Date object
function dateToDayType(d) {
  return ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][d.getDay()];
}

// Convert GTFS extended time (e.g. "24:31:47") relative to a service date → Unix ms
function extendedTimeToMs(timeStr, serviceDate) {
  if (!timeStr) return NaN;
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const s = parseInt(parts[2] || '0', 10);
  // Midnight of the service date in Helsinki time
  const base = new Date(serviceDate.getFullYear(), serviceDate.getMonth(), serviceDate.getDate(), 0, 0, 0, 0);
  // Adjust for Helsinki offset (UTC+2 in winter, UTC+3 in summer)
  const helOffset = -new Date(serviceDate).getTimezoneOffset() * 60000;
  const utcBase = base.getTime() - helOffset;
  return utcBase + (h * 3600 + m * 60 + s) * 1000;
}

// --- Build schedule cache from journeys API ---
async function buildScheduleCache() {
  const serviceDate = getCurrentServiceDate();
  const dayType = dateToDayType(serviceDate);
  const dateStr = serviceDate.toDateString();

  if (scheduleCacheServiceDate === dateStr) {
    console.log('Schedule cache already up to date for', dateStr);
    return;
  }

  console.log(`Building schedule cache for ${dayType} (${dateStr})...`);
  const newCache = {};

  for (const stopId of monitoredStopIds) {
    try {
      const stopUrl = encodeURIComponent(`${API_BASE}/stop-points/${stopId}`);
      const res = await fetch(`${API_BASE}/journeys?stopPoint=${stopUrl}`, { timeout: 30000 });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const journeys = data.body || [];

      const entries = [];
      for (const j of journeys) {
        if (!j.dayTypes || !j.dayTypes.includes(dayType)) continue;
        const call = (j.calls || []).find(function(c) {
          return c.stopPoint && c.stopPoint.shortName === stopId;
        });
        if (!call) continue;
        const departureTimeMs = extendedTimeToMs(call.departureTime || call.arrivalTime, serviceDate);
        if (isNaN(departureTimeMs)) continue;
        const lineRef = j.lineUrl ? j.lineUrl.split('/').pop() : '?';
        entries.push({
          lineRef,
          headSign: j.headSign || '',
          departureTimeMs,
          source: 'schedule',
        });
      }

      entries.sort(function(a, b) { return a.departureTimeMs - b.departureTimeMs; });
      newCache[stopId] = entries;
      console.log(`  Stop ${stopId} (${dayType}): ${entries.length} scheduled trips`);
    } catch (err) {
      console.warn(`Schedule fetch failed for stop ${stopId}: ${err.message}`);
      newCache[stopId] = [];
    }
  }

  scheduleCache = newCache;
  scheduleCacheServiceDate = dateStr;
}

// --- Fetch departures from vehicle-activity onward calls for stops without real-time data ---
async function fetchFromVehicleActivity(stopIds) {
  if (stopIds.length === 0) return [];
  const res = await fetch(`${API_BASE}/vehicle-activity`, { timeout: 15000 });
  if (!res.ok) return [];
  const data = await res.json();
  const vehicles = data.body || [];

  const entries = [];
  for (const v of vehicles) {
    const mvj = v.monitoredVehicleJourney || {};
    for (const call of (mvj.onwardCalls || [])) {
      const stopRef = (call.stopPointRef || '').split('/').pop();
      if (!stopIds.includes(stopRef)) continue;
      entries.push({
        stopId: stopRef,
        entry: {
          lineRef: mvj.lineRef,
          directionRef: mvj.directionRef,
          destinationShortName: mvj.destinationShortName,
          delay: mvj.delay,
          call: {
            vehicleAtStop: false,
            expectedArrivalTime: call.expectedArrivalTime,
            expectedDepartureTime: call.expectedDepartureTime || call.expectedArrivalTime,
            aimedArrivalTime: call.aimedArrivalTime,
            aimedDepartureTime: call.aimedDepartureTime || call.aimedArrivalTime,
            departureStatus: 'unknown',
          },
        },
      });
    }
  }
  return entries;
}

// --- Main data pipeline ---
async function fetchDepartures() {
  const now = Date.now();
  const lookaheadMs = LOOKAHEAD_MINUTES * 60 * 1000;

  // 1. Real-time: stop-monitoring
  const stopIds = monitoredStopIds.join(',');
  const smRes = await fetch(`${API_BASE}/stop-monitoring?stops=${stopIds}`, { timeout: 15000 });
  if (!smRes.ok) throw new Error(`stop-monitoring API returned HTTP ${smRes.status}`);
  const smData = await smRes.json();
  const smBody = smData.body || {};

  const allEntries = [];
  const monitoredInResponse = new Set(Object.keys(smBody));

  for (const [stopId, entries] of Object.entries(smBody)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) allEntries.push({ stopId, entry });
  }

  // 2. Vehicle-activity fallback for stops absent or empty in monitoring
  const sparseStopIds = monitoredStopIds.filter(id => {
    const entries = smBody[id];
    return !entries || entries.length === 0;
  });
  if (sparseStopIds.length > 0) {
    const fallback = await fetchFromVehicleActivity(sparseStopIds);
    allEntries.push(...fallback);
    if (fallback.length > 0) {
      console.log(`vehicle-activity supplement for [${sparseStopIds.join(',')}]: ${fallback.length} entries`);
    }
  }

  // Resolve destination names
  const uniqueDests = [...new Set(allEntries.map(({ entry }) => entry.destinationShortName).filter(Boolean))];
  await Promise.all(uniqueDests.map(id => resolveStopName(id)));

  // Map real-time entries to departure objects
  const realtimeDepartures = [];
  for (const { stopId, entry } of allEntries) {
    const call = entry.call || {};
    const lineRef = entry.lineRef || '?';
    const destShortName = entry.destinationShortName || '?';
    const destinationName = stopNameCache[destShortName] || destShortName;

    const timeStr = call.expectedDepartureTime || call.expectedArrivalTime
                  || call.aimedDepartureTime || call.aimedArrivalTime;
    if (!timeStr) continue;

    const departureTimeMs = new Date(timeStr).getTime();
    if (isNaN(departureTimeMs)) continue;

    const delayMs = parseDelayISO(entry.delay);
    const delaySeconds = Math.round(delayMs / 1000);
    const departureStatus = call.departureStatus || '';
    const vehicleAtStop = call.vehicleAtStop === true || call.vehicleAtStop === 'true';

    if (departureTimeMs < now - 2 * 60 * 1000) continue;
    if (departureTimeMs > now + lookaheadMs) continue;

    realtimeDepartures.push({
      lineRef,
      destinationName,
      departureTimeMs,
      leaveByMs: departureTimeMs - walkMsForStop(stopId),
      delaySeconds,
      departureStatus,
      vehicleAtStop,
      stopId,
      stopName: stopLabels[stopId] || stopNameCache[stopId] || stopId,
      source: 'realtime',
    });
  }

  // 3. Scheduled departures from cache (for buses not yet in real-time system)
  const scheduledDepartures = [];
  for (const [stopId, entries] of Object.entries(scheduleCache)) {
    for (const e of entries) {
      if (e.departureTimeMs < now - 2 * 60 * 1000) continue;
      if (e.departureTimeMs > now + lookaheadMs) continue;

      // Skip if real-time already has this departure (same line, within 3 minutes)
      const hasRealtime = realtimeDepartures.some(r =>
        r.lineRef === e.lineRef &&
        Math.abs(r.departureTimeMs - e.departureTimeMs) < 3 * 60 * 1000
      );
      if (hasRealtime) continue;

      scheduledDepartures.push({
        lineRef: e.lineRef,
        destinationName: e.headSign || stopLabels[stopId] || stopId,
        departureTimeMs: e.departureTimeMs,
        leaveByMs: e.departureTimeMs - walkMsForStop(stopId),
        delaySeconds: 0,
        departureStatus: 'scheduled',
        vehicleAtStop: false,
        stopId,
        stopName: stopLabels[stopId] || stopNameCache[stopId] || stopId,
        source: 'schedule',
      });
    }
  }

  // 4. Merge and sort by leaveByMs (when user must leave home), then stop preference
  //    Stop preference follows STOP_IDS order — first listed stop is most preferred.
  const stopPref = {};
  monitoredStopIds.forEach((id, i) => { stopPref[id] = i; });

  const all = [...realtimeDepartures, ...scheduledDepartures];
  all.sort((a, b) => {
    const byLeave = a.leaveByMs - b.leaveByMs;
    if (byLeave !== 0) return byLeave;
    return (stopPref[a.stopId] ?? 99) - (stopPref[b.stopId] ?? 99);
  });

  // 5. Deduplicate: same line within 5-minute window (same bus passing multiple monitored stops)
  //    Keep the entry with the latest leaveByMs — i.e. the stop that gives the most time at home.
  //    Example: 8B at Kaipanen 10:15 (walk 10min → leave 10:05) vs Pitkäniitynkatu 10:17 (walk 13min → leave 10:04)
  //    → keep Kaipanen because leaveByMs 10:05 > 10:04.
  const lastSeen = new Map(); // lineRef → { resultIdx, departureTimeMs, leaveByMs }
  const result = [];
  for (const d of all) {
    const prev = lastSeen.get(d.lineRef);
    if (prev && Math.abs(prev.departureTimeMs - d.departureTimeMs) < 5 * 60 * 1000) {
      // Same bus at a different stop — keep whichever gives more time at home
      if (d.leaveByMs > result[prev.resultIdx].leaveByMs) {
        result[prev.resultIdx] = d;
        lastSeen.set(d.lineRef, { resultIdx: prev.resultIdx, departureTimeMs: d.departureTimeMs, leaveByMs: d.leaveByMs });
      }
    } else {
      const resultIdx = result.length;
      result.push(d);
      lastSeen.set(d.lineRef, { resultIdx, departureTimeMs: d.departureTimeMs, leaveByMs: d.leaveByMs });
    }
  }
  return result;
}

// Startup timestamp used as version token — changes on every container restart/redeploy
const SERVER_START_TIME = Date.now();

// --- Routes ---
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/config', (req, res) => {
  // Build per-stop walking minutes map for the frontend
  const stopWalkingMinutes = {};
  monitoredStopIds.forEach(id => {
    stopWalkingMinutes[id] = Math.round(walkMsForStop(id) / 60000);
  });
  res.json({
    homeAddress: HOME_ADDRESS,
    walkingTimeMinutes: WALKING_TIME_MINUTES,
    lookaheadMinutes: LOOKAHEAD_MINUTES,
    stopIds: monitoredStopIds,
    stopLabels,
    stopWalkingMinutes,
    alertBar: ALERT_BAR,
    alertBgPulse: ALERT_BG_PULSE,
    alertOverlay: ALERT_OVERLAY,
  });
});

app.get('/api/version', (req, res) => {
  res.json({ version: SERVER_START_TIME });
});

app.get('/api/vehicles', async (req, res) => {
  try {
    const vaRes = await fetch(`${API_BASE}/vehicle-activity`, { timeout: 10000 });
    if (!vaRes.ok) throw new Error(`HTTP ${vaRes.status}`);
    const vaData = await vaRes.json();
    const vehicles = vaData.body || [];

    const buses = [];
    for (const v of vehicles) {
      const mvj = v.monitoredVehicleJourney || {};
      const loc = mvj.vehicleLocation;
      if (!loc) continue;
      const lat = parseFloat(loc.latitude ?? loc.lat ?? loc.y);
      const lon = parseFloat(loc.longitude ?? loc.lon ?? loc.x);
      if (isNaN(lat) || isNaN(lon) || lat === 0) continue;

      const passesOurStop = (mvj.onwardCalls || []).some(call => {
        const stopRef = (call.stopPointRef || '').split('/').pop();
        return monitoredStopIds.includes(stopRef);
      });
      if (!passesOurStop) continue;

      buses.push({
        lineRef: mvj.lineRef || '?',
        lat,
        lon,
        bearing: parseFloat(mvj.bearing || 0),
        destinationName: stopNameCache[mvj.destinationShortName] || mvj.destinationShortName || '',
      });
    }

    const stops = monitoredStopIds
      .filter(id => stopCoords[id])
      .map(id => ({ id, name: stopLabels[id] || stopNameCache[id] || id, ...stopCoords[id] }));

    res.json({ home: homeCoords, stops, buses });
  } catch (err) {
    console.error('vehicles error:', err.message);
    res.status(503).json({ error: err.message, home: homeCoords, stops: [], buses: [] });
  }
});

app.get('/api/departures', async (req, res) => {
  try {
    const departures = await fetchDepartures();
    cachedDepartures = departures;
    cacheTimestamp = Date.now();
    res.json({ ok: true, departures, fetchedAt: cacheTimestamp });
  } catch (err) {
    console.error('fetchDepartures error:', err.message);
    res.status(503).json({
      ok: false,
      error: err.message,
      departures: cachedDepartures,
      fetchedAt: cacheTimestamp,
    });
  }
});

// --- Start ---
(async () => {
  await discoverStopIds();

  // Start serving immediately — schedule cache builds in the background.
  // Real-time data from stop-monitoring and vehicle-activity is available right away.
  app.listen(PORT, () => {
    console.log(`Marmorikatu bus dashboard running at http://localhost:${PORT}`);
    console.log(`Monitoring stops: ${monitoredStopIds.join(', ')}`);
  });

  // Build schedule cache after server is up (provides scheduled departures not yet in real-time system)
  buildScheduleCache().catch(err => console.warn('Initial schedule cache build failed:', err.message));

  // Geocode home address and fetch stop coordinates in the background
  geocodeHomeAddress().then(coords => { homeCoords = coords; }).catch(() => {});
  Promise.all(monitoredStopIds.map(id => fetchStopCoords(id))).catch(() => {});

  // Refresh schedule cache at 05:00 local time daily
  setInterval(async function() {
    const local = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Helsinki' }));
    if (local.getHours() === 5 && local.getMinutes() === 0) {
      await buildScheduleCache();
    }
  }, 60 * 1000);
})();
