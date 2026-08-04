// ── GALLERY — desktop gallery + detail panel ─────────────
import { logoUrl, catStyle, catColor, formatDate } from './config.js';
import { filtered, selectedId, allBillboards } from './data.js';
import { openLightbox } from './ui.js';
import { observeFrame } from './crop.js';

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

// ── DETAIL PANEL ─────────────────────────────────────────
export function renderDetailPanel() {
  if (!selectedId) {
    document.getElementById('detailPanel').classList.remove('open');
    return;
  }
  const b = allBillboards.find(x => x.id === selectedId);
  if (!b) return;

  const content = document.getElementById('detailContent');
  let imgBlock = b.image_url
    ? `<div class="detail-img-wrap" id="detailImgWrap"><img class="detail-img" src="${b.image_url}" alt=""><div class="detail-img-zoom-hint">⤢</div></div>`
    : '';

  let companyBlock = '';
  if (b.company_name) {
    const lurl = logoUrl(b);
    const logoTag = lurl ? `<img class="detail-company-logo" src="${lurl}" alt="" onerror="this.style.display='none'">` : '';
    const nameTag = b.company_url
      ? `<a class="detail-company-name" href="${b.company_url}" target="_blank" rel="noopener">${b.company_name}</a>`
      : `<span class="detail-company-name">${b.company_name}</span>`;
    const urlLine = b.company_url
      ? `<span class="detail-company-url">${b.company_url.replace(/^https?:\/\//, '')}</span>`
      : '';
    companyBlock = `<div class="detail-company">${logoTag}<div class="detail-company-info">${nameTag}${urlLine}</div></div>`;
  }

  content.innerHTML = `${imgBlock}
    <span class="detail-category" style="${catStyle(b.category)}">${b.category || 'Uncategorized'}</span>
    ${companyBlock}
    <div class="detail-ocr">${b.ocr_text || '(no text detected)'}</div>
    <div class="detail-coords">📍 ${b.address || 'Unknown'}<br>${(b.latitude || 0).toFixed(6)}, ${(b.longitude || 0).toFixed(6)}<br>🕐 ${formatDate(b.captured_at, true)}</div>`;
  if (b.image_url) {
    const wrap = document.getElementById('detailImgWrap');
    wrap?.addEventListener('click', () => openLightbox(b.image_url));

    // The detail image has the same problem the cards had, just less obviously:
    // a fixed 220px-tall box (~2.09 aspect) with `object-fit: cover` centred.
    // A 1080x1920 phone photo gets reduced to a thin band across the middle of
    // the frame, which is not where the billboard is. Frame it the same way.
    const dImg = wrap?.querySelector('.detail-img');
    if (dImg && wrap.offsetWidth && wrap.offsetHeight) {
      observeFrame(dImg, b.image_url, wrap.offsetWidth / wrap.offsetHeight, b.crop_box);
    }
  }
  document.getElementById('detailPanel').classList.add('open');
}
