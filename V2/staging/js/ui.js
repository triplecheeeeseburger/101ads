// ── UI - lightbox, about, hamburger, pills, search, time chips ──
import { MAX_PILLS, catColor, catStyle } from './config.js';
import {
  allBillboards, filtered, activeFilter, activeTimeSlice,
  setActiveFilter, setSearchQuery, setActiveTimeSlice, setSelectedId,
  applyFilters, getAvailableMonths, formatMonthLabel, countAtSlice
} from './data.js';

// Injected by app.js
let onFilterChange = null;
export function setOnFilterChange(fn) { onFilterChange = fn; }

// ── PILLS ────────────────────────────────────────────────
export function buildPills() {
  const freq = {};
  allBillboards.forEach(b => {
    const c = (b.category || 'Uncategorized').trim();
    freq[c] = (freq[c] || 0) + 1;
  });
  const sorted = Object.entries(freq)
    .sort((a, b) => {
      if (a[0] === 'Uncategorized') return 1;
      if (b[0] === 'Uncategorized') return -1;
      return b[1] - a[1];
    })
    .map(([c]) => c);
  const top = sorted.slice(0, MAX_PILLS);
  const rest = sorted.slice(MAX_PILLS);
  const container = document.getElementById('filterPills');
  container.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.className = 'pill' + (activeFilter === 'all' ? ' active' : '');
  allBtn.dataset.cat = 'all';
  allBtn.textContent = 'All';
  allBtn.onclick = () => triggerFilter('all');
  container.appendChild(allBtn);

  top.forEach(cat => {
    const btn = document.createElement('button');
    const isActive = activeFilter === cat;
    btn.className = 'pill' + (isActive ? ' active' : '');
    btn.innerHTML = `${cat} <span style="opacity:0.6;font-weight:400;font-size:10px;">${freq[cat]}</span>`;
    if (isActive) btn.style.cssText = `background:${catColor(cat)};border-color:${catColor(cat)};color:#fff;`;
    btn.onclick = () => triggerFilter(cat);
    container.appendChild(btn);
  });

  if (rest.length > 0) {
    const wrap = document.createElement('div');
    wrap.className = 'pill-more';
    const inRest = rest.includes(activeFilter);
    const moreBtn = document.createElement('button');
    moreBtn.className = 'pill' + (inRest ? ' active' : '');
    moreBtn.textContent = inRest ? activeFilter : `More (${rest.length})`;
    const dd = document.createElement('div');
    dd.className = 'more-dropdown';
    rest.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = activeFilter === cat ? 'active' : '';
      btn.innerHTML = `<span>${cat}</span><span class="cat-count">${freq[cat]}</span>`;
      btn.onclick = e => { e.stopPropagation(); triggerFilter(cat); dd.classList.remove('open'); };
      dd.appendChild(btn);
    });
    moreBtn.onclick = e => { e.stopPropagation(); dd.classList.toggle('open'); };
    wrap.appendChild(moreBtn);
    wrap.appendChild(dd);
    container.appendChild(wrap);
  }
}

function triggerFilter(cat) {
  setActiveFilter(cat);
  setSelectedId(null);
  document.getElementById('detailPanel').classList.remove('open');
  if (onFilterChange) onFilterChange();
}

document.addEventListener('click', () => {
  document.querySelectorAll('.more-dropdown').forEach(d => d.classList.remove('open'));
});

// ── SEARCH ───────────────────────────────────────────────
export function initSearch() {
  const handler = e => {
    setSearchQuery(e.target.value.toLowerCase().trim());
    applyFilters();
    if (onFilterChange) onFilterChange({ skipPills: true });
  };
  document.getElementById('searchBox').addEventListener('input', handler);
  document.getElementById('mobileSearchBox').addEventListener('input', handler);
}

// ── TIME CHIPS ───────────────────────────────────────────
export function buildTimeChips() {
  const container = document.getElementById('timeChips');
  if (!container) return;
  const months = getAvailableMonths();

  // If only one month of data, hide the chip bar entirely
  if (months.length <= 1) {
    container.style.display = 'none';
    return;
  }
  container.style.display = '';
  container.innerHTML = '';

  // Individual month chips
  months.forEach(ym => {
    const chip = document.createElement('button');
    chip.className = 'time-chip' + (activeTimeSlice === ym ? ' active' : '');
    const count = countAtSlice(ym);
    chip.innerHTML = `${formatMonthLabel(ym)} <span class="time-chip-count">(${count})</span>`;
    chip.onclick = () => {
      setActiveTimeSlice(ym);
      applyFilters();
      buildTimeChips();
      if (onFilterChange) onFilterChange();
    };
    container.appendChild(chip);
  });

  // "Latest" chip (always last, always shows full count)
  const latest = document.createElement('button');
  latest.className = 'time-chip time-chip-latest' + (activeTimeSlice === 'latest' ? ' active' : '');
  latest.innerHTML = `Latest <span class="time-chip-count">(${allBillboards.length})</span>`;
  latest.onclick = () => {
    setActiveTimeSlice('latest');
    applyFilters();
    buildTimeChips();
    if (onFilterChange) onFilterChange();
  };
  container.appendChild(latest);
}

// ── LIGHTBOX ─────────────────────────────────────────────
export function openLightbox(url) {
  document.getElementById('lightboxImg').src = url;
  document.getElementById('lightbox').classList.add('open');
}

export function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
}

export function initLightbox() {
  document.getElementById('lightbox').addEventListener('click', e => {
    if (e.target === document.getElementById('lightbox')) closeLightbox();
  });
  document.getElementById('lightboxClose').onclick = closeLightbox;
}

// ── ABOUT PANEL ──────────────────────────────────────────
export function openAbout() {
  document.getElementById('aboutPanel').classList.add('open');
  document.getElementById('aboutOverlay').classList.add('open');
}

export function closeAbout() {
  document.getElementById('aboutPanel').classList.remove('open');
  document.getElementById('aboutOverlay').classList.remove('open');
}

// ── HAMBURGER ────────────────────────────────────────────
export function toggleHamburger(e) {
  e.stopPropagation();
  document.getElementById('hamburgerMenu').classList.toggle('open');
}

export function closeHamburger() {
  document.getElementById('hamburgerMenu').classList.remove('open');
}

export function initHamburger() {
  document.addEventListener('click', e => {
    if (!e.target.closest('.header-actions')) closeHamburger();
  });
}

// ── CONTACT FORM ─────────────────────────────────────────
export async function submitContact() {
  const name = document.getElementById('contactName').value.trim();
  const email = document.getElementById('contactEmail').value.trim();
  const msg = document.getElementById('contactMsg').value.trim();
  if (!name || !email || !msg) { alert('Please fill in all fields.'); return; }

  const btn = document.getElementById('contactSubmit');
  btn.disabled = true;
  btn.textContent = 'Sending…';

  try {
    const res = await fetch('https://formspree.io/f/xzdjbjob', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ name, email, message: msg })
    });
    if (res.ok) {
      document.getElementById('contactForm').style.display = 'none';
      document.getElementById('contactSuccess').style.display = 'block';
    } else {
      throw new Error();
    }
  } catch {
    btn.disabled = false;
    btn.textContent = 'Send →';
    alert('Could not send - please try again or reach out on X.');
  }
}

// ── KEYBOARD SHORTCUTS ───────────────────────────────────
export function initKeyboard() {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeAbout(); closeLightbox(); }
  });
}

// ── BADGE ────────────────────────────────────────────────
export function updateBadge() {
  const count = filtered.length;
  const txt = `${count} billboard${count !== 1 ? 's' : ''}`;
  document.getElementById('mapBadge').textContent = txt;
  if (document.getElementById('sheetCount')) {
    document.getElementById('sheetCount').textContent = txt;
  }
}

// ── STATS FAB + TIME CHIP POSITIONING ────────────────────
export function initStatsFab() {
  const fab = document.getElementById('statsFab');
  const sheet = document.getElementById('mobileSheet');
  const chipBar = document.getElementById('timeChips');
  if (!sheet) return;

  function updatePositions() {
    const sheetH = sheet.offsetHeight;
    // Time chips sit just above the sheet
    if (chipBar) chipBar.style.bottom = (sheetH + 6) + 'px';
    // FAB sits above the time chips (or above sheet if chips hidden)
    const chipH = (chipBar && chipBar.style.display !== 'none') ? chipBar.offsetHeight + 6 : 0;
    if (fab) fab.style.bottom = (sheetH + chipH + 12) + 'px';
  }

  const ro = new ResizeObserver(updatePositions);
  ro.observe(sheet);
  if (chipBar) {
    const mo = new MutationObserver(updatePositions);
    mo.observe(chipBar, { attributes: true, attributeFilter: ['style'] });
  }
  updatePositions();
}
