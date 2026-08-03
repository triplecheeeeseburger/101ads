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

export async function syncNewBillboards() {
  if (!initialLoadDone) return;
  try {
    const since = lastFetchedAt
      ? `&captured_at=gt.${encodeURIComponent(lastFetchedAt)}`
      : '';
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/billboards?order=captured_at.desc&limit=50${since}`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const newRows = await res.json();
    if (!Array.isArray(newRows) || newRows.length === 0) return;

    const existingIds = new Set(allBillboards.map(b => b.id));
    const truly_new = newRows.filter(b => !existingIds.has(b.id)).map(normalizeBillboard);
    if (truly_new.length === 0) return;

    allBillboards = [...truly_new, ...allBillboards];

    lastFetchedAt = newRows.reduce((max, b) =>
      b.captured_at > max ? b.captured_at : max, lastFetchedAt || newRows[0].captured_at);

    if (onSyncUpdate) onSyncUpdate();
    console.log(`Synced ${truly_new.length} new billboard(s)`);
  } catch (e) {
    console.warn('Incremental sync failed:', e);
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
