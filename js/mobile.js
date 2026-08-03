// ── MOBILE — bottom sheet, cards, drag ───────────────────
import { logoUrl, catStyle, formatDate } from './config.js';
import { filtered, selectedId } from './data.js';
import { openLightbox } from './ui.js';

let selectHandler = null;
export function setSelectHandler(fn) { selectHandler = fn; }

// ── MOBILE SHEET ─────────────────────────────────────────
export function renderMobileSheet() {
  const list = document.getElementById('sheetList');
  const count = document.getElementById('sheetCount');
  count.textContent = `${filtered.length} billboard${filtered.length !== 1 ? 's' : ''}`;

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state">No billboards match.</div>`;
    return;
  }
  list.innerHTML = '';
  filtered.forEach(b => {
    const card = document.createElement('div');
    card.className = 'mobile-card' + (b.id === selectedId ? ' selected' : '') + (b.id === selectedId ? ' expanded' : '');
    card.dataset.id = b.id;

    const header = document.createElement('div');
    header.className = 'mobile-card-header';

    const imgDiv = document.createElement('div');
    imgDiv.className = 'mobile-card-img';
    if (b.image_url) {
      const img = document.createElement('img');
      img.src = b.image_url; img.alt = ''; img.loading = 'lazy';
      imgDiv.appendChild(img);
      imgDiv.style.cursor = 'zoom-in';
      imgDiv.addEventListener('click', e => { e.stopPropagation(); openLightbox(b.image_url); });
    } else {
      imgDiv.textContent = '🖼';
    }

    const cardBody = document.createElement('div');
    cardBody.className = 'mobile-card-body';

    let mobileCompanyHtml = '';
    if (b.company_name) {
      const lurl = logoUrl(b);
      const logoTag = lurl ? `<img class="mobile-company-logo" src="${lurl}" alt="" onerror="this.style.display='none'">` : '';
      mobileCompanyHtml = `<div class="mobile-company">${logoTag}<span class="mobile-company-name">${b.company_name}</span></div>`;
    }

    cardBody.innerHTML = `
      <div class="mobile-card-ocr">${b.ocr_text || '(no text detected)'}</div>
      ${mobileCompanyHtml}
      <div class="mobile-card-meta"><span style="${catStyle(b.category)};padding:1px 5px;border-radius:3px;font-size:10px;font-weight:600;">${b.category || '?'}</span> · ${formatDate(b.captured_at)}</div>`;

    header.appendChild(imgDiv);
    header.appendChild(cardBody);

    // Expanded content
    const expanded = document.createElement('div');
    expanded.className = 'mobile-card-expanded';
    if (b.image_url) {
      const img = document.createElement('img');
      img.className = 'mobile-expanded-img';
      img.src = b.image_url; img.alt = '';
      img.style.cursor = 'zoom-in';
      img.addEventListener('click', e => { e.stopPropagation(); openLightbox(b.image_url); });
      expanded.appendChild(img);
    }
    const ocrDiv = document.createElement('div');
    ocrDiv.className = 'mobile-expanded-ocr';
    ocrDiv.textContent = b.ocr_text || '(no text detected)';
    expanded.appendChild(ocrDiv);

    const metaDiv = document.createElement('div');
    metaDiv.className = 'mobile-expanded-meta';
    metaDiv.innerHTML = `📍 ${b.address || 'Unknown location'}<br>${(b.latitude || 0).toFixed(6)}, ${(b.longitude || 0).toFixed(6)}<br>🕐 ${formatDate(b.captured_at, true)}`;
    expanded.appendChild(metaDiv);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close ↑';
    closeBtn.style.cssText = 'margin-top:10px;width:100%;padding:8px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;font-family:inherit;font-size:12px;color:var(--text2);cursor:pointer;font-weight:500;';
    closeBtn.addEventListener('click', e => { e.stopPropagation(); if (selectHandler) selectHandler(b.id); });
    expanded.appendChild(closeBtn);

    card.appendChild(header);
    card.appendChild(expanded);

    const chevron = document.createElement('div');
    chevron.className = 'mobile-card-chevron';
    chevron.textContent = '›';
    if (b.id === selectedId) chevron.style.transform = 'rotate(90deg)';
    header.appendChild(chevron);

    header.addEventListener('click', e => {
      if (e.target.closest('.mobile-card-img')) return;
      if (e.target.closest('.mobile-card-expanded')) return;
      if (selectHandler) selectHandler(b.id);
    });
    list.appendChild(card);
  });
}

// ── MOBILE SHEET DRAG ────────────────────────────────────
export function initSheetDrag() {
  const sheet = document.getElementById('mobileSheet');
  const handle = document.getElementById('sheetHandle');
  let startY = 0, startH = 0, dragging = false;
  const vh = () => window.innerHeight;

  function getH() { return sheet.offsetHeight; }

  handle.addEventListener('touchstart', e => {
    dragging = true;
    startY = e.touches[0].clientY;
    startH = getH();
    sheet.style.transition = 'none';
  }, { passive: true });

  window.addEventListener('touchmove', e => {
    if (!dragging) return;
    const dy = startY - e.touches[0].clientY;
    const newH = Math.max(72, Math.min(vh() * 0.92, startH + dy));
    sheet.style.height = newH + 'px';
    sheet.classList.remove('expanded', 'collapsed');
  }, { passive: true });

  window.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    sheet.style.transition = '';
    const h = getH();
    if (h > vh() * 0.6) {
      sheet.style.height = '';
      sheet.classList.add('expanded');
      sheet.classList.remove('collapsed');
    } else if (h < vh() * 0.15) {
      sheet.style.height = '';
      sheet.classList.add('collapsed');
      sheet.classList.remove('expanded');
    } else {
      sheet.style.height = '36vh';
      sheet.classList.remove('expanded', 'collapsed');
    }
  });

  handle.addEventListener('click', () => {
    if (sheet.classList.contains('expanded')) {
      sheet.classList.remove('expanded');
      sheet.style.height = '36vh';
    } else {
      sheet.classList.add('expanded');
      sheet.classList.remove('collapsed');
      sheet.style.height = '';
    }
  });
}
