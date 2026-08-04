// ── APP - init, select logic, module wiring ──────────────
import { isMobile, formatDate } from './config.js';
import {
  selectedId, setSelectedId, allBillboards, filtered,
  initialFetch, refreshBillboards, applyFilters, setCallbacks
} from './data.js';
import { leafMap, renderMarkers, setSelectHandler as setMapSelect } from './map.js';
import { renderGallery, renderDetailPanel, setSelectHandler as setGallerySelect } from './gallery.js';
import { renderMobileSheet, initSheetDrag, setSelectHandler as setMobileSelect } from './mobile.js';
import { updateStats, openStats, closeStats } from './stats.js';
import {
  buildPills, buildTimeChips, initSearch, initLightbox, initKeyboard,
  initHamburger, initStatsFab, updateBadge, openLightbox,
  openAbout, closeAbout, toggleHamburger, closeHamburger, submitContact,
  setOnFilterChange
} from './ui.js';

// ── SELECT LOGIC ─────────────────────────────────────────
function selectBillboard(id) {
  const prev = selectedId;
  setSelectedId(prev === id ? null : id);
  const b = allBillboards.find(x => x.id === selectedId);

  if (isMobile()) {
    // Toggle in-place without full re-render
    document.querySelectorAll('#sheetList .mobile-card').forEach(el => {
      const isThis = el.dataset.id === selectedId;
      el.classList.toggle('selected', isThis);
      el.classList.toggle('expanded', isThis);
      const chevron = el.querySelector('.mobile-card-chevron');
      if (chevron) chevron.style.transform = isThis ? 'rotate(90deg)' : '';
    });
    renderMarkers();
    if (b?.latitude && b?.longitude) {
      const sheet = document.getElementById('mobileSheet');
      const sheetH = sheet ? sheet.offsetHeight : 0;
      const mapH = leafMap.getSize().y;
      const visibleH = mapH - sheetH;
      const offsetPx = (sheetH / 2) + (visibleH * 0.1);
      const targetLatLng = L.latLng(b.latitude, b.longitude);
      const zoom = 15;
      leafMap.setView(targetLatLng, zoom, { animate: false });
      const pt = leafMap.latLngToContainerPoint(targetLatLng);
      const shifted = L.point(pt.x, pt.y + offsetPx);
      const newCenter = leafMap.containerPointToLatLng(shifted);
      leafMap.setView(newCenter, zoom, { animate: true });
    }
    if (selectedId) {
      requestAnimationFrame(() => {
        const card = document.querySelector(`#sheetList [data-id="${selectedId}"]`);
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
  } else {
    renderGallery();
    renderMarkers();
    if (b?.latitude && b?.longitude) {
      const zoom = 15;
      const mapH = leafMap.getSize().y;
      const panelH = mapH * 0.65;
      const visibleH = mapH - panelH;
      const offsetPx = (panelH / 2) + (visibleH * 0.1);
      leafMap.setView([b.latitude, b.longitude], zoom, { animate: false });
      const pt = leafMap.latLngToContainerPoint(L.latLng(b.latitude, b.longitude));
      const shifted = L.point(pt.x, pt.y + offsetPx);
      const newCenter = leafMap.containerPointToLatLng(shifted);
      leafMap.setView(newCenter, zoom, { animate: true });
    }
    requestAnimationFrame(() => {
      const card = document.querySelector(`#galleryList [data-id="${selectedId}"]`);
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    renderDetailPanel();
  }
}

// ── WIRE HANDLERS ────────────────────────────────────────
setMapSelect(selectBillboard);
setGallerySelect(selectBillboard);
setMobileSelect(selectBillboard);

// Detail close button
document.getElementById('detailClose').onclick = () => {
  document.getElementById('detailPanel').classList.remove('open');
  setSelectedId(null);
  renderGallery();
  renderMarkers();
};

// Filter change callback
setOnFilterChange((opts = {}) => {
  if (!opts.skipPills) buildPills();
  applyFilters();
  renderGallery();
  renderMobileSheet();
  renderMarkers();
  updateBadge();
});

// ── EXPOSE GLOBALS (for onclick handlers in HTML) ────────
window.openStats = openStats;
window.closeStats = closeStats;
window.openAbout = openAbout;
window.closeAbout = closeAbout;
window.toggleHamburger = toggleHamburger;
window.closeHamburger = closeHamburger;
window.submitContact = submitContact;

// ── DATA CALLBACKS ───────────────────────────────────────
function onDataReady() {
  buildPills();
  buildTimeChips();
  applyFilters();
  renderGallery();
  renderMobileSheet();
  renderMarkers();
  updateStats();
  updateBadge();
}

function onSyncUpdate() {
  buildPills();
  buildTimeChips();
  applyFilters();
  renderGallery();
  renderMobileSheet();
  renderMarkers();
  updateStats();
  updateBadge();
}

setCallbacks({ onReady: onDataReady, onSync: onSyncUpdate });

// ── INIT ─────────────────────────────────────────────────
initSearch();
initLightbox();
initKeyboard();
initHamburger();
initSheetDrag();
initStatsFab();

// Keyboard: close stats on Escape too
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeStats();
});

// ── REFRESH (manual only) ────────────────────────────────
// Content loads on page open and on an explicit refresh. There is no
// background polling: the dataset changes a few times a month, so a 30s poll
// was ~2,880 requests a day per open tab to learn nothing.
// No UI entry point any more - the header button and hamburger item were
// removed, and reloading the page is the refresh path. Kept on `window` so a
// control can be restored (or it can be called from the console) without
// rewiring anything. Guards on the button are null-safe by design.
async function doRefresh() {
  const btn = document.getElementById('refreshBtn');
  if (btn?.classList.contains('spinning')) return;
  btn?.classList.add('spinning');
  const badge = document.getElementById('mapBadge');
  const prevBadge = badge?.textContent;
  try {
    const added = await refreshBillboards();
    if (badge) {
      badge.textContent = added > 0
        ? `+${added} new billboard${added !== 1 ? 's' : ''}`
        : 'Up to date';
      setTimeout(() => updateBadge(), 2200);
    }
  } catch {
    if (badge) {
      badge.textContent = 'Refresh failed';
      setTimeout(() => { badge.textContent = prevBadge; }, 2200);
    }
  } finally {
    setTimeout(() => btn?.classList.remove('spinning'), 500);
  }
}
window.doRefresh = doRefresh;

// Fetch data on open
initialFetch();

// Resize
window.addEventListener('resize', () => leafMap.invalidateSize());
