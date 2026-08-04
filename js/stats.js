// ── STATS — corpus overview, brand intelligence, capture deltas ─────────
//
// Ranking here is an honesty problem, not a layout one.
//
// This dataset is a convenience sample, not a census: it records what was
// photographed on the drives that happened, not what stands on the 101. So:
//
//   PRIMARY    — whole-corpus totals. Every capture contributes.
//   SECONDARY  — patterns across the whole corpus. Ratios over a large base.
//   TERTIARY   — the latest drive: small, muted, explicitly not comparable.
//
// On distance: the corridor length is a stated constant (config.CORRIDOR), not
// something computed from billboard coordinates. Billboard positions measure
// where signs stand, not how far anyone drove — a drive yielding one billboard
// would compute as 0 miles even if it ran the whole corridor. This module
// therefore makes NO per-drive distance claim at all, because the data simply
// doesn't contain it. Counts are presented as descriptions of a drive, never as
// a trend.

import { catColor, CORRIDOR, drivenMiles } from './config.js';
import { allBillboards } from './data.js';

/**
 * Bucket a capture into a drive-day, in PACIFIC time.
 *
 * `captured_at` comes back as UTC, and slicing the ISO string buckets by UTC
 * date. That silently splits a single evening drive in two: rush hour here is
 * ~16:00–19:00 PT, which is 23:00–02:00 UTC, so anything captured after 17:00 PT
 * rolls over into the next UTC day.
 *
 * Today's data doesn't trip it — the latest capture is 16:14 PT, 46 minutes
 * short of the boundary, and all 91 rows agree under both zones. But one drive
 * that runs slightly later would inflate the drive count and mis-date "Latest
 * drive". Bucketing in the timezone the driving actually happens in is the
 * correct rule regardless.
 *
 * 'en-CA' is used purely because it formats as YYYY-MM-DD, which sorts.
 */
const dayKey = iso => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
};

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
  const corridorMi = CORRIDOR.oneWayMiles;   // for density
  const drivenMi = drivenMiles();            // for "how much road was covered"
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
      <div class="kpi"><div class="kpi-num">${drivenMi}</div><div class="kpi-lbl">miles driven</div></div>
    </div>
    <div class="kpi-sub">A ${corridorMi}-mile stretch of 101 HWY between ${esc(CORRIDOR.from)}
      and ${esc(CORRIDOR.to)}, driven in both directions. Mapped over ${sess.length}
      drive${sess.length !== 1 ? 's' : ''}, ${fmtDay(sess[0].day)} to ${fmtDay(latest.day)}.</div>
  </div>`;

  // ── PRIMARY — brands ───────────────────────────────────
  if (brands.length) {
    html += `<div class="stats-section"><div class="stats-section-title">Top brands by ad count</div>`;
    brands.slice(0, 8).forEach(([name, count]) => {
      const pct = Math.round(count / maxBrand * 100);
      let lurl = null;
      if (brandUrls[name]) {
        try {
          const raw = brandUrls[name].trim();
          lurl = 'https://www.google.com/s2/favicons?domain=' +
                 new URL(raw.startsWith('http') ? raw : 'https://' + raw).hostname + '&sz=128';
        } catch { lurl = null; }
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
  // Density divides by the corridor length, not by distance driven — boards
  // facing north and south are different boards along the same stretch.
  html += `<div class="fun-fact">📍 That's about <strong>${(total / corridorMi).toFixed(1)} billboards
    per mile</strong> of corridor, counting both sides of the road.</div>`;
  html += `</div>`;

  // ── TERTIARY — the latest drive ────────────────────────
  //
  // No distance figure, deliberately. How far a given drive went isn't
  // recorded anywhere in this data, and inferring it from billboard spread
  // would be inventing a number. Counts stay, framed as descriptions.
  const lRows = latest.rows;
  const lNewBrands = [...new Set(lRows.map(b => b.company_name).filter(Boolean))]
    .filter(n => brandFirst[n] === latest.day);
  const prev = sess.length > 1 ? sess[sess.length - 2] : null;

  html += `<div class="stats-section tertiary">
    <div class="stats-section-title">Latest drive &mdash; ${fmtDay(latest.day)}</div>
    <div class="delta-row"><span class="delta-num">${lRows.length}</span>
      <span class="delta-lbl">board${lRows.length !== 1 ? 's' : ''} added</span></div>`;

  if (lNewBrands.length) {
    html += `<div class="delta-row"><span class="delta-num">${lNewBrands.length}</span>
      <span class="delta-lbl">brand${lNewBrands.length !== 1 ? 's' : ''} seen here for the first time:
      ${lNewBrands.slice(0, 5).map(esc).join(', ')}${lNewBrands.length > 5 ? '…' : ''}</span></div>`;
  }

  if (prev) {
    html += `<div class="delta-row"><span class="delta-num">${prev.rows.length}</span>
      <span class="delta-lbl">on the previous drive, ${fmtDay(prev.day)}</span></div>`;
  }

  html += `<div class="stats-caveat">Not a like-for-like comparison. Each drive covers a different
    part of the corridor, and how many boards it yields depends on how far it went &mdash; which
    isn't recorded here. These counts describe the drives, not changes in the billboards.
    The totals above are the real picture.</div>`;
  html += `</div>`;

  body.innerHTML = html;
}
