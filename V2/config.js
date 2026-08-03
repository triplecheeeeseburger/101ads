// ── CONFIG ───────────────────────────────────────────────
export const SUPABASE_URL = 'https://ewjnpoziinaprmkxjnhu.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_9TACfIEqKqnNETuV_P0YZw_uohUpV9c';
export const MAX_PILLS = 5;

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
