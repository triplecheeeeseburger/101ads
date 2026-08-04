// ── DATA — state, fetch, sync, filter ────────────────────
import { SUPABASE_URL, SUPABASE_KEY, normalizeBillboard } from './config.js';

// ── STATE ────────────────────────────────────────────────
export let allBillboards = [];
export let filtered = [];
export let selectedId = null;
export let activeFilter = 'all';
export let searchQuery = '';
export let activeTimeSlice = 'latest'; // 'latest' or 'YYYY-MM'

let lastFetchedAt = null;
let initialLoadDone = false;

// Callbacks — set by app.js after all modules load
let onDataReady = null;
let onSyncUpdate = null;

export function setCallbacks({ onReady, onSync }) {
  onDataReady = onReady;
  onSyncUpdate = onSync;
}

export function setSelectedId(id) { selectedId = id; }
export function setActiveFilter(cat) { activeFilter = cat; }
export function setSearchQuery(q) { searchQuery = q; }
export function setActiveTimeSlice(ts) { activeTimeSlice = ts; }

// ── FETCH ────────────────────────────────────────────────
export async function initialFetch() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/billboards?order=captured_at.desc&limit=500`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error();
    allBillboards = data.map(normalizeBillboard);
    if (data.length > 0) {
      lastFetchedAt = data.reduce((max, b) =>
        b.captured_at > max ? b.captured_at : max, data[0].captured_at);
    }
    initialLoadDone = true;
    if (onDataReady) onDataReady();
  } catch (e) {
    document.getElementById('galleryList').innerHTML = `<div class="empty-state">Could not load data.</div>`;
    document.getElementById('sheetList').innerHTML = `<div class="empty-state">Could not load data.</div>`;
    document.getElementById('mapBadge').textContent = 'Error';
  }
}

/**
 * Manual refresh. Full re-fetch, not an incremental one.
 *
 * The previous 30s poll asked for rows with `captured_at > lastFetchedAt`.
 * That silently never worked for backfilled photos: `captured_at` is when the
 * picture was *taken*, not when it was published, so a billboard shot in March
 * and published today arrives with a timestamp far below the watermark and was
 * filtered straight out. There is no inserted-at column to key on, so a full
 * re-fetch is the only correct answer until one exists.
 *
 * Returns the number of newly seen billboards.
 */
export async function refreshBillboards() {
  if (!initialLoadDone) return 0;
  const before = new Set(allBillboards.map(b => b.id));
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/billboards?order=captured_at.desc&limit=500`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error('bad payload');

    allBillboards = rows.map(normalizeBillboard);
    if (rows.length > 0) {
      lastFetchedAt = rows.reduce((max, b) =>
        b.captured_at > max ? b.captured_at : max, rows[0].captured_at);
    }
    const added = allBillboards.filter(b => !before.has(b.id)).length;
    if (onSyncUpdate) onSyncUpdate();
    return added;
  } catch (e) {
    console.warn('Refresh failed:', e);
    throw e;
  }
}

// ── FILTER ───────────────────────────────────────────────
export function applyFilters() {
  filtered = allBillboards.filter(b => {
    const matchCat = activeFilter === 'all' || (b.category || '').trim() === activeFilter;
    const matchSearch = !searchQuery ||
      (b.ocr_text || '').toLowerCase().includes(searchQuery) ||
      (b.address || '').toLowerCase().includes(searchQuery) ||
      (b.company_name || '').toLowerCase().includes(searchQuery) ||
      (b.company_url || '').toLowerCase().includes(searchQuery);
    // Time-slice filter: cumulative — show everything captured up to end of selected month
    let matchTime = true;
    if (activeTimeSlice !== 'latest' && b.captured_at) {
      const [y, m] = activeTimeSlice.split('-').map(Number);
      const endOfMonth = new Date(y, m, 0, 23, 59, 59, 999); // last ms of that month
      matchTime = new Date(b.captured_at) <= endOfMonth;
    }
    return matchCat && matchSearch && matchTime;
  });
}

// ── TIME SLICES ──────────────────────────────────────────
// Returns sorted array of distinct 'YYYY-MM' strings from dataset
export function getAvailableMonths() {
  const months = new Set();
  allBillboards.forEach(b => {
    if (b.captured_at) {
      const d = new Date(b.captured_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.add(key);
    }
  });
  return Array.from(months).sort();
}

// Format 'YYYY-MM' to display label like "Mar '26"
export function formatMonthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1);
  const mon = d.toLocaleDateString('en-US', { month: 'short' });
  return `${mon} '${String(y).slice(2)}`;
}

// Count billboards visible at a given time slice (cumulative)
export function countAtSlice(ym) {
  const [y, m] = ym.split('-').map(Number);
  const endOfMonth = new Date(y, m, 0, 23, 59, 59, 999);
  return allBillboards.filter(b => b.captured_at && new Date(b.captured_at) <= endOfMonth).length;
}
