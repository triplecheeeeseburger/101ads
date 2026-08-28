// ── CONFIG ───────────────────────────────────────────────
export const SUPABASE_URL = 'https://ewjnpoziinaprmkxjnhu.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_9TACfIEqKqnNETuV_P0YZw_uohUpV9c';
export const MAX_PILLS = 5;

// ── CORRIDOR ─────────────────────────────────────────────
// The contiguous stretch of Hwy 101 this project covers, end to end.
//
// This is a stated constant, NOT something derived from the billboard
// coordinates, and that distinction matters. Billboard positions measure where
// signs happen to stand, not how far anyone drove: a drive that yields one
// billboard would compute as 0 miles even if it ran the whole corridor. Any
// figure derived that way understates short-yield drives and silently changes
// every time a board is added.
//
// Current value: endpoint to endpoint, Palo Alto (37.4567, -122.1346) to
// San Francisco (37.7855, -122.3918) - 26.7 miles straight line, ~36 by road.
//
// UPDATE THIS when the corridor is extended further along the highway. It is
// the sector length, so it only changes when the sector does.
// Two distinct quantities, deliberately kept apart:
//   oneWayMiles - the length of the corridor itself.
//   directions  - driven northbound and southbound, so distance covered is 2x.
// Billboard density must divide by oneWayMiles, not by distance driven:
// boards facing each direction are different boards along the SAME stretch, so
// dividing by 72 would halve the real density.
export const CORRIDOR = {
  oneWayMiles: 36,
  directions: 2,
  from: 'Palo Alto',
  to: 'San Francisco',
};

// ── DISTANCE DRIVEN ──────────────────────────────────────
// Total road distance driven while capturing, as a deliberately rounded floor.
//
// This used to be oneWayMiles x directions (72), which is not distance driven
// at all - it is the corridor measured twice. It ignored that the same stretch
// gets driven again on every outing, and it could only ever change when the
// sector did.
//
// Not derived, for the same reason the corridor is not: the photos record where
// signs stand, not the route taken to reach them. Most of the driving leaves no
// trace in the data - the runs south to San Jose, and any pass that happened to
// yield no new boards.
//
// How the floor is reached: 11 distinct capture days, each at minimum one
// corridor pass (36 mi) and usually a return trip (72), plus four or five Bay
// Bridge to San Jose runs at roughly 96 miles return. Either component alone
// approaches 500, so 500 is a conservative floor and not an estimate.
//
// Shown with a "+" because the true figure is unknown and only ever grows.
// UPDATE this when it is clearly passed. Never round it up to flatter.
export const MILES_DRIVEN_FLOOR = 500;

/** Distance driven, as a display label - a floor, hence the "+". */
export const drivenMilesLabel = () => `${MILES_DRIVEN_FLOOR}+`;

// Derive logo from company_url - DB column is null for existing rows.
// Uses Google's favicon service (reliable, no auth, no CORS issues).
export function logoUrl(b) {
  const url = b.company_url || (b.company_logo_url && !b.company_logo_url.includes('clearbit') ? b.company_logo_url : null);
  if (!url) return null;
  try {
    const raw = url.trim();
    const hostname = new URL(raw.startsWith('http') ? raw : 'https://' + raw).hostname;
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=128`;
  } catch { return null; }
}

// ── TIME BUCKETING ───────────────────────────────────────
// Every "which day / which month was this captured" question resolves in
// Pacific time, because that is where the driving happens.
//
// Two bugs this avoids. First, captured_at is stored UTC, so slicing the ISO
// string buckets by UTC date: rush hour here is roughly 16:00-19:00 PT, which
// is 23:00-02:00 UTC, so a drive running past 17:00 PT would land on the next
// day. Second, using the visitor's local timezone instead means a reader in
// Tokyo and a reader in San Francisco can see the same billboard filed under
// different months. Pinning to one zone makes the site agree with itself
// everywhere.
export const PROJECT_TZ = 'America/Los_Angeles';

// 'en-CA' purely because it formats as YYYY-MM-DD, which sorts lexically.
export function dayKeyOf(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('en-CA', { timeZone: PROJECT_TZ });
}

export function monthKeyOf(iso) {
  const k = dayKeyOf(iso);
  return k ? k.slice(0, 7) : '';
}

// ── COLORS ───────────────────────────────────────────────
export const CAT_COLORS = {
  'AI & Tech':            '#0071e3',
  'Pharma & Health':      '#34c759',
  'Finance':              '#ff9500',
  'Real Estate':          '#ff3b30',
  'Entertainment':        '#af52de',
  'Food & Beverage':      '#ff2d55',
  'Automotive':           '#5ac8fa',
  'Education':            '#ffcc00',
  'Government & Public':  '#30b0c7',
  'Retail':               '#32ade6',
  'Other':                '#8e8e93',
  'Uncategorized':        '#aeaeb2',
};

export function catColor(cat) { return CAT_COLORS[cat] || '#8e8e93'; }
export function catStyle(cat) {
  const c = catColor(cat);
  return `background:${c}18;color:${c};`;
}

// ── NORMALIZE ────────────────────────────────────────────
const CAT_MAP = {
  'healthcare': 'Pharma & Health', 'health': 'Pharma & Health',
  'pharma': 'Pharma & Health', 'pharma & health': 'Pharma & Health',
  'ai & tech': 'AI & Tech', 'ai': 'AI & Tech', 'tech': 'AI & Tech',
  'food & beverage': 'Food & Beverage', 'food': 'Food & Beverage',
  'real estate': 'Real Estate', 'finance': 'Finance',
  'entertainment': 'Entertainment', 'automotive': 'Automotive',
  'education': 'Education', 'government & public': 'Government & Public',
  'government': 'Government & Public', 'retail': 'Retail',
  'other': 'Other', 'uncategorized': 'Uncategorized',
};

export function normalizeBillboard(b) {
  const raw = (b.category || 'Uncategorized').trim();
  return { ...b, category: CAT_MAP[raw.toLowerCase()] || raw };
}

// ── HELPERS ──────────────────────────────────────────────
export const isMobile = () => window.innerWidth <= 768;

export function formatDate(iso, full = false) {
  if (!iso) return '';
  const d = new Date(iso);
  return full ? d.toLocaleString() : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
