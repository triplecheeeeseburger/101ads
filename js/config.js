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
// San Francisco (37.7855, -122.3918) — 26.7 miles straight line, ~36 by road.
//
// UPDATE THIS when the corridor is extended further along the highway. It is
// the sector length, so it only changes when the sector does.
// Two distinct quantities, deliberately kept apart:
//   oneWayMiles — the length of the corridor itself.
//   directions  — driven northbound and southbound, so distance covered is 2x.
// Billboard density must divide by oneWayMiles, not by distance driven:
// boards facing each direction are different boards along the SAME stretch, so
// dividing by 72 would halve the real density.
export const CORRIDOR = {
  oneWayMiles: 36,
  directions: 2,
  from: 'Palo Alto',
  to: 'San Francisco',
};

/** Total road distance covered — both directions of the corridor. */
export const drivenMiles = () => CORRIDOR.oneWayMiles * CORRIDOR.directions;

// Derive logo from company_url — DB column is null for existing rows.
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
