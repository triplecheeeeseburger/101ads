// ── STATS — corpus overview, brand intelligence, capture deltas ─────────
//
// Ranking is deliberate, and it is an honesty problem rather than a layout one.
//
// This dataset is a convenience sample, not a census: it records what was
// photographed on the drives that happened, not what exists on the 101. The
// capture sessions vary enormously in how much road they cover — 2026-03-07
// spans 0.273° of latitude, 2026-03-28 spans 0.013°, a ~20x difference. So
// "8 billboards this session vs 30 last session" is overwhelmingly a statement
// about drive length, not about the advertising market.
//
// Therefore:
//   PRIMARY    — whole-corpus totals. Every capture contributes; most reliable.
//   SECONDARY  — patterns across the whole corpus. Ratios over a large base.
//   TERTIARY   — the latest session. Presented small, muted, always beside the
//                road distance it covered, and explicitly labelled partial.
//
// Never render a session-over-session delta as a bare number or a percentage
// change. Without the coverage figure next to it, it reads as a trend, and it
// isn't one.

import { catColor } from './config.js';
import { allBillboards } from './data.js';

const R_MILES = 3958.8;
const ROAD_FACTOR = 1.35;   // straight-line -> road distance, matches the map

function toRad(d) { return d * Math.PI / 180; }
function haversine(a, b) {
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R_MILES * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** Road miles spanned by a set of billboards (max pairwise distance). */
function spanMiles(rows) {
  const c = rows.filter(b => b.latitude && b.longitude)
                .map(b => ({ lat: b.latitude, lng: b.longitude }));
  if (c.length < 2) return 0;
  let max = 0;
  for (let i = 0; i < c.length; i++)
    for (let j = i + 1; j < c.length; j++)
      max = Math.max(max, haversine(c[i], c[j]));
  return max * ROAD_FACTOR;
}

/**
 * Human coverage string for a drive, or null when there isn't one.
 *
 * Returns null for a single-billboard session rather than rounding 0 miles up
 * to "~1 mile". This section exists to stop counts being read as trends, so
 * inventing coverage for a drive that has none would defeat the point.
 */
function coverage(rows) {
  if (rows.length < 2) return null;
  const m = spanMiles(rows);
  if (m < 0.5) return null;
  const n = Math.round(m) || 1;
  return `~${n} mile${n === 1 ? '' : 's'}`;
}

const dayKey = iso => (iso || '').slice(0, 10);

/** Capture sessions, oldest first. A session is one day of driving. */
function sessions() {
  const by = {};
  allBillboards.forEach(b => {
    const k = dayKey(b.captured_at);
    if (!k) return;
    (by[k] = by[k] || []).push(b);
  });
  return Object.keys(by).sort().map(k => ({ day: k, rows: by[k] }));
}

function fmtDay(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US',
    { month: 'short', day: 'numeric', year: 'numeric' });
}

const esc = s => String(s).replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ── header counters ──────────────────────────────────────
export function updateStats() {
  document.getElementById('totalCount').textContent = allBillboards.length;
  const cats = new Set(allBillboards.map(b => b.category).filter(Boolean));
  document.getElementById('categoryCount').textContent = cats.size;
}

export function openStats() {
  document.getElementById('statsPanel').classList.add('open');
  document.getElementById('statsOverlay').classList.add('open');
  renderStatsPanel();
}

export function closeStats() {
  document.getElementById('statsPanel').classList.remove('open');
  document.getElementById('statsOverlay').classList.remove('open');
}

export function renderStatsPanel() {
  const body = document.getElementById('statsPanelBody');
  const total = allBillboards.length;
  if (!total) { body.innerHTML = '<div class="fun-fact">No data yet.</div>'; return; }

  // ── aggregates ─────────────────────────────────────────
  const brandFreq = {}, brandUrls = {}, brandFirst = {};
  allBillboards.forEach(b => {
    if (!b.company_name) return;
    const n = b.company_name;
    brandFreq[n] = (brandFreq[n] || 0) + 1;
    if (b.company_url && !brandUrls[n]) brandUrls[n] = b.company_url;
    const k = dayKey(b.captured_at);
    if (k && (!brandFirst[n] || k < brandFirst[n])) brandFirst[n] = k;
  });
  const brands = Object.entries(brandFreq).sort((a, b) => b[1] - a[1]);
  const maxBrand = brands[0]?.[1] || 1;

  const catFreq = {};
  allBillboards.forEach(b => {
    const c = b.category || 'Uncategorized';
    catFreq[c] = (catFreq[c] || 0) + 1;
  });
  const cats = Object.entries(catFreq).sort((a, b) => b[1] - a[1]);

  const sess = sessions();
  const latest = sess[sess.length - 1];
  const corridorMiles = Math.round(spanMiles(allBillboards));
  const aiCount = allBillboards.filter(b => (b.category || '').includes('Tech')).length;
  const aiPct = Math.round(aiCount / total * 100);
  const once = brands.filter(([, n]) => n === 1).length;
  const repeat = brands.length - once;
  const oncePct = brands.length ? Math.round(once / brands.length * 100) : 0;

  let html = '';

  // ── PRIMARY — the whole corpus ─────────────────────────
  html += `<div class="stats-section">
    <div class="stats-section-title">The collection</div>
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-num">${total}</div><div class="kpi-lbl">billboards</div></div>
      <div class="kpi"><div class="kpi-num">${brands.length}</div><div class="kpi-lbl">brands</div></div>
      <div class="kpi"><div class="kpi-num">${cats.length}</div><div class="kpi-lbl">categories</div></div>
      <div class="kpi"><div class="kpi-num">~${corridorMiles}</div><div class="kpi-lbl">miles</div></div>
    </div>
    <div class="kpi-sub">Collected over ${sess.length} drive${sess.length !== 1 ? 's' : ''},
      ${fmtDay(sess[0].day)} &ndash; ${fmtDay(latest.day)}.</div>
  </div>`;

  // ── PRIMARY — brands ───────────────────────────────────
  if (brands.length) {
    html += `<div class="stats-section"><div class="stats-section-title">Top brands by ad count</div>`;
    brands.slice(0, 8).forEach(([name, count]) => {
      const pct = Math.round(count / maxBrand * 100);
      let lurl = null;
      if (brandUrls[name]) {
        try { lurl = 'https://www.google.com/s2/favicons?domain=' +
                     new URL(brandUrls[name].trim().startsWith('http')
                       ? brandUrls[name].trim() : 'https://' + brandUrls[name].trim()).hostname + '&sz=128'; }
        catch { lurl = null; }
      }
      const logo = lurl
        ? `<img class="brand-logo" src="${lurl}" alt="" onerror="this.style.display='none'">`
        : `<div class="brand-logo"></div>`;
      html += `<div class="brand-row">${logo}
        <span class="brand-name">${esc(name)}</span>
        <div class="brand-bar-wrap"><div class="brand-bar" style="width:${pct}%"></div></div>
        <span class="brand-count">${count}</span></div>`;
    });
    html += `</div>`;
  }

  // ── PRIMARY — categories ───────────────────────────────
  html += `<div class="stats-section"><div class="stats-section-title">By category</div>`;
  cats.forEach(([cat, count]) => {
    html += `<div class="cat-stat-row">
      <div class="cat-dot" style="background:${catColor(cat)}"></div>
      <span class="cat-stat-name">${esc(cat)}</span>
      <span class="cat-stat-pct">${Math.round(count / total * 100)}%&nbsp;<span
        style="color:var(--text3);font-weight:400">${count}</span></span></div>`;
  });
  html += `</div>`;

  // ── SECONDARY — patterns across the whole corpus ───────
  html += `<div class="stats-section"><div class="stats-section-title">Patterns</div>`;
  if (aiPct > 0) {
    html += `<div class="fun-fact">🤖 <strong>${aiPct}%</strong> of every billboard here is AI &amp; Tech
      &mdash; Highway 101 is basically a startup runway.</div>`;
  }
  if (brands[0]) {
    html += `<div class="fun-fact">🏆 <strong>${esc(brands[0][0])}</strong> has the largest presence,
      with <strong>${brands[0][1]}</strong> board${brands[0][1] > 1 ? 's' : ''} spotted.</div>`;
  }
  if (brands.length > 4) {
    html += `<div class="fun-fact">🎯 <strong>${oncePct}%</strong> of brands (${once} of ${brands.length})
      appear exactly once. Only <strong>${repeat}</strong> run more than one board at a time.</div>`;
  }
  if (corridorMiles > 0) {
    html += `<div class="fun-fact">📍 Spread across <strong>~${corridorMiles} miles</strong>
      of the 101 corridor, roughly ${(total / Math.max(corridorMiles, 1)).toFixed(1)} boards per mile driven.</div>`;
  }
  html += `</div>`;

  // ── TERTIARY — the latest drive ────────────────────────
  //
  // Deliberately last, deliberately smaller, and never a bare delta. The
  // coverage figure sits next to the count because without it the number
  // reads as a market trend rather than a description of one drive.
  const lRows = latest.rows;
  const lCov = coverage(lRows);
  const lNewBrands = [...new Set(lRows.map(b => b.company_name).filter(Boolean))]
    .filter(n => brandFirst[n] === latest.day);
  const prev = sess.length > 1 ? sess[sess.length - 2] : null;

  html += `<div class="stats-section tertiary">
    <div class="stats-section-title">Latest drive &mdash; ${fmtDay(latest.day)}</div>
    <div class="delta-row"><span class="delta-num">${lRows.length}</span>
      <span class="delta-lbl">board${lRows.length !== 1 ? 's' : ''} added${
        lCov ? `, across ${lCov} of road` : ' at a single spot'}</span></div>`;

  if (lNewBrands.length) {
    html += `<div class="delta-row"><span class="delta-num">${lNewBrands.length}</span>
      <span class="delta-lbl">brand${lNewBrands.length !== 1 ? 's' : ''} seen here for the first time:
      ${lNewBrands.slice(0, 5).map(esc).join(', ')}${lNewBrands.length > 5 ? '…' : ''}</span></div>`;
  }

  if (prev) {
    const pCov = coverage(prev.rows);
    html += `<div class="delta-row"><span class="delta-num">${prev.rows.length}</span>
      <span class="delta-lbl">on the previous drive (${fmtDay(prev.day)})${
        pCov ? `, across ${pCov}` : ' &mdash; a single stop'}</span></div>`;
  }

  html += `<div class="stats-caveat">Not a like-for-like comparison. Each drive covers a
    different stretch of the 101, so these counts mostly reflect how far I drove that day,
    not how the billboards changed. Treat the totals above as the real picture.</div>`;
  html += `</div>`;

  body.innerHTML = html;
}
