// ── APP - init, select logic, module wiring ──────────────
import { isMobile, formatDate } from './config.js';
import {
  selectedId, setSelectedId, allBillboards, filtered,
  initialFetch, refreshBillboards, applyFilters, setCallbacks
} from './data.js';
import { leafMap, renderMarkers, setSelectHandler as setMapSelect } from './map.js';
import {
  renderGallery, renderDetailPopup, closeDetailPopup, dismissDetailPopup,
  setOnPopupDismiss, setSelectHandler as setGallerySelect
} from './gallery.js';
import { renderMobileSheet, initSheetDrag, setSelectHandler as setMobileSelect } from './mobile.js';
import { updateStats, openStats, closeStats } from './stats.js';
import { linkedIdFromUrl, findByShortId, syncUrlToSelection } from './share.js';
import {
  buildPills, buildTimeChips, initSearch, initLightbox, initKeyboard,
  initHamburger, initStatsFab, updateBadge, openLightbox,
  openAbout, closeAbout, toggleHamburger, closeHamburger, submitContact,
  setOnFilterChange
} from './ui.js';

// ── SELECT LOGIC ─────────────────────────────────────────
// opts.open: select even if already selected (deep link), instead of toggling off.
function selectBillboard(id, opts = {}) {
  const prev = selectedId;
  setSelectedId(opts.open || prev !== id ? id : null);
  const b = allBillboards.find(x => x.id === selectedId);
  syncUrlToSelection(b);

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

    // Give the sheet room for one expanded card. At the default 36vh the
    // expanded block overruns the list and its Close button sits below the
    // fold. A sheet the reader has dragged fully open is left alone.
    const sheet = document.getElementById('mobileSheet');
    let sheetResizing = false;
    if (sheet && !sheet.classList.contains('expanded')) {
      const want = !!selectedId;
      if (want !== sheet.classList.contains('detail')) {
        sheet.classList.toggle('detail', want);
        sheet.style.height = '';   // let the class drive it again after a drag
        sheetResizing = true;
      }
    }

    // The height animates, so offsetHeight is stale until it settles - reading
    // it early would centre the marker behind the grown sheet.
    const panToBillboard = () => {
      if (!b?.latitude || !b?.longitude) return;
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
    };

    // Scroll the card into view only once the sheet has its final height -
    // measured mid-animation, 'nearest' lands it below the fold.
    const scrollCard = () => {
      if (!selectedId) return;
      const card = document.querySelector(`#sheetList [data-id="${selectedId}"]`);
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    if (sheetResizing) {
      let panned = false;
      const go = () => { if (panned) return; panned = true; leafMap.invalidateSize(); panToBillboard(); scrollCard(); };
      sheet.addEventListener('transitionend', e => { if (e.propertyName === 'height') go(); }, { once: true });
      setTimeout(go, 420);   // transition is 350ms; fallback if it never fires
    } else {
      panToBillboard();
      requestAnimationFrame(scrollCard);
    }
  } else {
    renderGallery();
    renderMarkers();
    // The bubble hangs off the marker, so there is no panel to dodge: keep the
    // user's zoom (context is the point) and only close in if they are far out.
    // Leaflet's autoPan then nudges the map just enough to fit the bubble.
    if (b?.latitude && b?.longitude && leafMap.getZoom() < 13) {
      leafMap.setView([b.latitude, b.longitude], 13, { animate: false });
    }
    requestAnimationFrame(() => {
      const card = document.querySelector(`#galleryList [data-id="${selectedId}"]`);
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    renderDetailPopup();
  }
}

// ── WIRE HANDLERS ────────────────────────────────────────
setMapSelect(selectBillboard);
setGallerySelect(selectBillboard);
setMobileSelect(selectBillboard);

// Dismissing the bubble (close button, map click, Escape) clears the selection
setOnPopupDismiss(() => {
  setSelectedId(null);
  syncUrlToSelection(null);
  renderGallery();
  renderMarkers();
});

// Filter change callback
setOnFilterChange((opts = {}) => {
  closeDetailPopup();
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
  // Resolve a deep link BEFORE the first render. With a selection already set,
  // renderMarkers skips its animated fit-to-all-billboards zoom - which would
  // otherwise finish after we jump to the billboard and yank the map back out.
  const linked = resolveLinkedBillboard();
  if (linked) setSelectedId(linked.id);

  buildPills();
  buildTimeChips();
  applyFilters();
  renderGallery();
  renderMobileSheet();
  renderMarkers();
  updateStats();
  updateBadge();

  if (linked) {
    if (!isMobile()) {
      // Arriving cold, the reader has no context yet - start closer than the
      // click-to-select path does, which deliberately keeps the user's zoom.
      leafMap.setView([linked.latitude, linked.longitude], 15, { animate: false });
    }
    selectBillboard(linked.id, { open: true });
  }
}

// ── DEEP LINK ────────────────────────────────────────────
// /?b=<id> opens with that billboard selected (see share.js). An unknown or
// stale id is dropped from the URL quietly rather than leaving a link that
// looks like it should have done something.
function resolveLinkedBillboard() {
  const raw = linkedIdFromUrl();
  if (!raw) return null;
  const b = findByShortId(allBillboards, raw);
  if (!b || !b.latitude || !b.longitude) { syncUrlToSelection(null); return null; }
  return b;
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

// Escape peels one layer at a time: any open overlay first, and only the map
// bubble once nothing is stacked on top of it. Capture phase so this runs
// before ui.js's handler clears the overlay classes we test here.
//
// Leaflet closes its own popup on Escape, but only while the map holds focus -
// after clicking a gallery card it does not, so the bubble needs this.
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const overlayOpen =
    document.getElementById('lightbox')?.classList.contains('open') ||
    document.getElementById('aboutPanel')?.classList.contains('open') ||
    document.getElementById('statsPanel')?.classList.contains('open');
  closeStats();
  if (!overlayOpen) dismissDetailPopup();
}, true);

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
window.addEventListener('resize', () => {
  leafMap.invalidateSize();
  // Below the breakpoint the bottom sheet takes over; a stray bubble would
  // sit on top of it.
  if (isMobile()) closeDetailPopup();
});
