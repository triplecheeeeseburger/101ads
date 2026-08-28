// ── GALLERY - desktop gallery + detail panel ─────────────
import { logoUrl, catStyle, catColor, formatDate } from './config.js';
import { filtered, selectedId, allBillboards } from './data.js';
import { openLightbox } from './ui.js';
import { observeFrame } from './crop.js';
import { leafMap } from './map.js';

// Must match .card-img in style.css (96 × 64)
const CARD_ASPECT = 96 / 64;

let selectHandler = null;
export function setSelectHandler(fn) { selectHandler = fn; }

// ── DESKTOP GALLERY ──────────────────────────────────────
export function renderGallery() {
  const list = document.getElementById('galleryList');
  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state">No billboards match.</div>`;
    return;
  }
  list.innerHTML = '';
  filtered.forEach(b => {
    const card = document.createElement('div');
    card.className = 'billboard-card' + (b.id === selectedId ? ' selected' : '');
    card.dataset.id = b.id;

    const imgDiv = document.createElement('div');
    imgDiv.className = 'card-img';
    if (b.image_url) {
      const img = document.createElement('img');
      img.src = b.image_url; img.alt = ''; img.loading = 'lazy';
      imgDiv.appendChild(img);
      observeFrame(img, b.image_url, CARD_ASPECT, b.crop_box);
      const hint = document.createElement('div');
      hint.className = 'zoom-hint'; hint.textContent = '⤢';
      imgDiv.appendChild(hint);
      imgDiv.addEventListener('click', e => { e.stopPropagation(); openLightbox(b.image_url); });
    } else {
      imgDiv.textContent = '🖼';
    }

    const body = document.createElement('div');
    body.className = 'card-body';

    let companyHtml = '';
    if (b.company_name) {
      const lurl = logoUrl(b);
      const logoTag = lurl ? `<img class="card-company-logo" src="${lurl}" alt="" onerror="this.style.display='none'">` : '';
      companyHtml = `<div class="card-company">${logoTag}<span class="card-company-name">${b.company_name}</span></div>`;
    }

    body.innerHTML = `
      <span class="card-category" style="${catStyle(b.category)}">${b.category || 'Uncategorized'}</span>
      ${companyHtml}
      <div class="card-ocr">${b.ocr_text || '(no text detected)'}</div>
      <div class="card-meta">${b.address ? b.address.split(',')[0] : `${(b.latitude || 0).toFixed(4)}, ${(b.longitude || 0).toFixed(4)}`} · ${formatDate(b.captured_at)}</div>`;

    card.appendChild(imgDiv);
    card.appendChild(body);
    card.addEventListener('click', () => { if (selectHandler) selectHandler(b.id); });
    list.appendChild(card);
  });
}

// ── DETAIL BUBBLE ────────────────────────────────────────
// Replaces the old bottom sheet. The card is a Leaflet popup anchored to the
// billboard's marker, so it points at the spot on the highway rather than
// sliding up over the map - which also means no pan-offset maths to keep the
// marker clear of a panel.

// Must match .bb-popup .leaflet-popup-content width and .bb-img-wrap height.
const POPUP_W = 320;
const POPUP_IMG_H = 180;
const POPUP_ASPECT = POPUP_W / POPUP_IMG_H;

let detailPopup = null;
// Set while we close the popup ourselves, so a programmatic close is not
// mistaken for the user dismissing it (which would clear the selection).
let suppressDismiss = false;

let onPopupDismiss = null;
export function setOnPopupDismiss(fn) { onPopupDismiss = fn; }

// One listener covers every way Leaflet can close the bubble: our close
// button, a click on the map, or Escape.
leafMap.on('popupclose', e => {
  if (e.popup !== detailPopup) return;
  detailPopup = null;
  if (!suppressDismiss && onPopupDismiss) onPopupDismiss();
});

// Dismiss as if the user did it: routes through popupclose, so the selection
// is cleared too. closeDetailPopup() is the silent version, for when the
// caller is already managing selection state.
export function dismissDetailPopup() {
  if (detailPopup) leafMap.closePopup(detailPopup);
}

export function closeDetailPopup() {
  if (!detailPopup) return;
  suppressDismiss = true;
  leafMap.closePopup(detailPopup);
  suppressDismiss = false;
  detailPopup = null;
}

export function renderDetailPopup() {
  closeDetailPopup();
  if (!selectedId) return;
  const b = allBillboards.find(x => x.id === selectedId);
  if (!b || !b.latitude || !b.longitude) return;

  const color = catColor(b.category);
  const lurl = b.company_name ? logoUrl(b) : null;
  const where = b.address
    ? b.address.split(',')[0]
    : `${(b.latitude || 0).toFixed(4)}, ${(b.longitude || 0).toFixed(4)}`;

  const nameTag = b.company_url
    ? `<a class="bb-company-name" href="${b.company_url}" target="_blank" rel="noopener">${b.company_name}</a>`
    : `<span class="bb-company-name">${b.company_name}</span>`;

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="bb-img-wrap">
      ${b.image_url ? `<img class="bb-img" src="${b.image_url}" alt=""><div class="bb-img-zoom-hint">⤢</div>` : ''}
      <button class="bb-close" type="button" aria-label="Close">✕</button>
      <span class="bb-cat" style="background:${color};">${b.category || 'Uncategorized'}</span>
    </div>
    <div class="bb-body">
      ${b.company_name ? `<div class="bb-company">
        ${lurl ? `<img class="bb-company-logo" src="${lurl}" alt="" onerror="this.style.display='none'">` : ''}
        ${nameTag}
      </div>` : ''}
      <div class="bb-ocr">${b.ocr_text || '(no text detected)'}</div>
      <div class="bb-meta"><span>📍 ${where}</span><span>${formatDate(b.captured_at)}</span></div>
    </div>`;

  detailPopup = L.popup({
    className: 'bb-popup',
    maxWidth: POPUP_W,
    minWidth: POPUP_W,
    closeButton: false,
    // Seats the tail on the edge of the 20px selected dot. Leaflet's default
    // leaves a visible gap between tail and marker.
    offset: [0, 1],
    autoPanPadding: [30, 30],
  })
    .setLatLng([b.latitude, b.longitude])
    .setContent(el)
    .openOn(leafMap);

  el.querySelector('.bb-close').addEventListener('click', () => {
    leafMap.closePopup(detailPopup);   // popupclose then clears the selection
  });

  if (b.image_url) {
    const wrap = el.querySelector('.bb-img-wrap');
    wrap.addEventListener('click', e => {
      if (e.target.closest('.bb-close')) return;
      openLightbox(b.image_url);
    });
    // Same content-aware framing the cards use - a raw driving photo centred in
    // a 320x180 box puts the billboard nowhere near the middle.
    const img = el.querySelector('.bb-img');
    if (img) observeFrame(img, b.image_url, POPUP_ASPECT, b.crop_box);
  }
}
