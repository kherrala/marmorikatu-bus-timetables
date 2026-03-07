import React, { useRef, useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import { Bus } from '../types';

interface ColumnMapProps {
  bus: Bus | null;
  mapStyleUrl: string;
  overlayVisible: boolean;
  onMapClick?: () => void;
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

export default function ColumnMap({ bus, mapStyleUrl, overlayVisible, onMapClick }: ColumnMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  // Create map once on mount, destroy on unmount.
  // mapStyleUrl is stable after config loads, so this runs only once.
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyleUrl,
      center: [23.91, 61.46],
      zoom: 14,
      attributionControl: false,
    });
    (
      ['dragPan', 'scrollZoom', 'boxZoom', 'dragRotate', 'keyboard', 'doubleClickZoom', 'touchZoomRotate'] as const
    ).forEach(c => (map as unknown as Record<string, { disable?: () => void }>)[c]?.disable?.());
    mapRef.current = map;
    return () => {
      try { map.remove(); } catch { /* style still loading */ }
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [mapStyleUrl]);

  // Sync bus prop → marker + camera.
  // React guarantees this effect runs with the current value of `bus` after each render.
  // No stale closures: `bus` is always the value from the current render cycle.
  useEffect(() => {
    const map = mapRef.current;
    if (!bus) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!map) return;

    const applyMarker = () => {
      if (markerRef.current) {
        markerRef.current.setLngLat([bus.lon, bus.lat]);
        const el = markerRef.current.getElement();
        const markerEl = el.querySelector('.bus-marker');
        const arrowEl = el.querySelector<HTMLElement>('.bus-arrow');
        if (markerEl) markerEl.textContent = bus.lineRef;
        if (arrowEl) arrowEl.style.transform = `rotate(${bus.bearing || 0}deg)`;
      } else {
        markerRef.current = new maplibregl.Marker({
          element: makeBusEl(bus.lineRef, bus.bearing),
          anchor: 'center',
        })
          .setLngLat([bus.lon, bus.lat])
          .addTo(map);
      }
      map.resize();
      map.easeTo({ center: [bus.lon, bus.lat], zoom: 15, duration: 1200, essential: true });
      // Re-center after container CSS transition completes (expands from maxHeight: 0)
      setTimeout(() => {
        map.resize();
        map.jumpTo({ center: [bus.lon, bus.lat], zoom: 15 });
      }, 600);
    };

    if (map.isStyleLoaded()) {
      applyMarker();
    } else {
      map.once('load', applyMarker);
    }
  }, [bus]);

  // Hide when overlay is visible (avoids rendering maps behind the full-screen alert)
  const isVisible = bus !== null && !overlayVisible;

  return (
    <div
      className="col-map-container"
      style={{
        maxHeight: isVisible ? '180px' : '0',
        paddingTop: isVisible ? undefined : '0',
        transition: overlayVisible ? 'none' : undefined,
      }}
    >
      <div ref={containerRef} style={{ position: 'relative' }}>
        {onMapClick && (
          <div
            style={{ position: 'absolute', inset: 0, zIndex: 10, cursor: 'pointer' }}
            onClick={e => { e.stopPropagation(); onMapClick(); }}
          />
        )}
      </div>
    </div>
  );
}
