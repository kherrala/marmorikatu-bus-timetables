import React, { useRef, useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import { Departure, VehicleData } from '../types';

interface OverlayMapProps {
  dep: Departure | null;
  vehicleData: VehicleData;
  mapStyleUrl: string;
}

function makeEl(className: string): HTMLElement {
  const el = document.createElement('div');
  el.className = className;
  return el;
}

function makeBusEl(lineRef: string, bearing: number): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'bus-marker-wrap';
  const arrow = document.createElement('div');
  arrow.className = 'bus-arrow';
  arrow.style.transform = `rotate(${bearing || 0}deg)`;
  const dot = document.createElement('div');
  dot.className = 'bus-marker';
  dot.textContent = lineRef;
  wrap.appendChild(arrow);
  wrap.appendChild(dot);
  return wrap;
}

export default function OverlayMap({ dep, vehicleData, mapStyleUrl }: OverlayMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const storeRef = useRef<Record<string, maplibregl.Marker>>({});

  // Create map on mount, destroy on unmount
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyleUrl,
      center: [23.91, 61.46],
      zoom: 13,
      attributionControl: false,
    });
    (
      ['dragPan', 'scrollZoom', 'boxZoom', 'dragRotate', 'keyboard', 'doubleClickZoom', 'touchZoomRotate'] as const
    ).forEach(c => (map as unknown as Record<string, { disable?: () => void }>)[c]?.disable?.());
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      storeRef.current = {};
    };
  }, [mapStyleUrl]);

  // Sync markers when vehicleData or dep changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const bus = dep
      ? (vehicleData.buses || []).find(b => b.lineRef === dep.lineRef) ?? null
      : null;

    const doUpdate = () => {
      const store = storeRef.current;

      // Home marker
      if (vehicleData.home && !store.home) {
        store.home = new maplibregl.Marker({ element: makeEl('home-marker'), anchor: 'center' })
          .setLngLat([vehicleData.home.lon, vehicleData.home.lat])
          .addTo(map);
      }

      // Stop markers
      for (const stop of vehicleData.stops || []) {
        const k = `stop_${stop.id}`;
        if (!store[k]) {
          store[k] = new maplibregl.Marker({ element: makeEl('stop-marker'), anchor: 'center' })
            .setLngLat([stop.lon, stop.lat])
            .addTo(map);
        }
      }

      // Bus marker
      if (bus) {
        if (store.bus) {
          store.bus.setLngLat([bus.lon, bus.lat]);
          const markerEl = store.bus.getElement().querySelector('.bus-marker');
          const arrowEl = store.bus.getElement().querySelector<HTMLElement>('.bus-arrow');
          if (markerEl) markerEl.textContent = bus.lineRef;
          if (arrowEl) arrowEl.style.transform = `rotate(${bus.bearing || 0}deg)`;
        } else {
          store.bus = new maplibregl.Marker({ element: makeBusEl(bus.lineRef, bus.bearing), anchor: 'center' })
            .setLngLat([bus.lon, bus.lat])
            .addTo(map);
        }
      } else if (store.bus) {
        store.bus.remove();
        delete store.bus;
      }

      // Fit bounds to show home, relevant stop, and bus
      const pts: [number, number][] = [];
      if (vehicleData.home) pts.push([vehicleData.home.lon, vehicleData.home.lat]);
      const stop = (vehicleData.stops || []).find(s => s.id === dep?.stopId);
      if (stop) {
        pts.push([stop.lon, stop.lat]);
      } else {
        for (const s of vehicleData.stops || []) pts.push([s.lon, s.lat]);
      }
      if (bus) pts.push([bus.lon, bus.lat]);

      if (pts.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        for (const pt of pts) bounds.extend(pt);
        map.fitBounds(bounds, {
          padding: { top: 60, right: 60, bottom: 320, left: 60 },
          maxZoom: 15,
          animate: false,
        });
      }
    };

    if (map.isStyleLoaded()) {
      doUpdate();
    } else {
      map.once('load', doUpdate);
    }
  }, [dep, vehicleData]);

  return (
    <div className="overlay-map-wrap">
      <div ref={containerRef} />
    </div>
  );
}
