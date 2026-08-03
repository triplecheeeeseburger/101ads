// ── MAP — Leaflet init, markers, fitBounds ───────────────
import { catColor, isMobile } from './config.js';
import { filtered, selectedId } from './data.js';

// ── INIT ─────────────────────────────────────────────────
export const leafMap = L.map('map', { center: [37.55, -122.05], zoom: 11, zoomControl: false });
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '© OpenStreetMap, © CARTO', maxZoom: 19
}).addTo(leafMap);
L.control.zoom({ position: 'bottomright' }).addTo(leafMap);

export let markerLayer = {};

// selectHandler is injected by app.js to avoid circular imports
let selectHandler = null;
export function setSelectHandler(fn) { selectHandler = fn; }

// ── MARKERS ──────────────────────────────────────────────
export function renderMarkers() {
  Object.values(markerLayer).forEach(m => leafMap.removeLayer(m));
  markerLayer = {};
  filtered.forEach(b => {
    if (!b.latitude || !b.longitude) return;
    const color = catColor(b.category);
    const sel = b.id === selectedId;
    const size = sel ? 20 : 10;
    const dotStyle = sel
      ? `width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 0 0 3px ${color},0 2px 8px rgba(0,0,0,0.35);position:relative;`
      : `width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.25);`;
    const pulseRing = sel
      ? `<div class="marker-pulse-ring" style="background:${color};"></div>`
      : '';
    const icon = L.divIcon({
      html: `<div style="${dotStyle}">${pulseRing}</div>`,
      className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2]
    });
    markerLayer[b.id] = L.marker([b.latitude, b.longitude], { icon })
      .addTo(leafMap)
      .on('click', () => { if (selectHandler) selectHandler(b.id); });
  });
  if (filtered.length > 0 && !selectedId) {
    const coords = filtered.filter(b => b.latitude && b.longitude).map(b => [b.latitude, b.longitude]);
    if (coords.length) {
      const sheetH = isMobile() ? (document.getElementById('mobileSheet')?.offsetHeight || 0) : 0;
      leafMap.fitBounds(coords, { paddingTopLeft: [40, 40], paddingBottomRight: [40, 40 + sheetH] });
    }
  }
}
