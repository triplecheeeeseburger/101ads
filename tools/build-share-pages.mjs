#!/usr/bin/env node
// ── build-share-pages - one static share page per billboard ──────────────
//
// Why: X, Slack, iMessage, LinkedIn etc. build link previews from the HTML the
// server returns. They don't run JavaScript, so the single-page app can only
// ever show them the site's generic tags. This writes, for every billboard:
//
//   b/<id>/index.html  Open Graph + Twitter Card tags, then a JS hop to
//                      /?b=<id> (the app with that billboard selected).
//   og/<id>.jpg        1200x630 preview image, cropped to the billboard
//                      using the row's crop_box - the same framing the cards use.
//
// <id> = first 8 hex chars of the UUID. Must match SHORT_ID_LEN in js/share.js.
//
// Run from the repo root:
//   npm i --no-save sharp          (once)
//   node tools/build-share-pages.mjs            # new billboards only
//   node tools/build-share-pages.mjs --force    # rebuild every preview image
//
// Pages are rewritten every run (cheap, deterministic - unchanged rows produce
// no git diff). Images are only built when missing, since a row's photo
// doesn't change; use --force after changing a crop_box. Pages and images
// for rows no longer in the table are removed, so a deleted billboard stops
// previewing.
//
// Reads with the publishable key - public SELECT only, same as the site.

import { mkdir, writeFile, readdir, rm, access } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const SUPABASE_URL = 'https://ewjnpoziinaprmkxjnhu.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_9TACfIEqKqnNETuV_P0YZw_uohUpV9c';
const SITE = 'https://101ads.org';
const SHORT_ID_LEN = 8;
const OG_W = 1200, OG_H = 630;
// Where the billboard tends to sit vertically in an uncropped driving photo.
// Same prior js/crop.js uses (Y_PRIOR_MU).
const Y_PRIOR = 0.42;

const ROOT = process.cwd();
const PAGES_DIR = path.join(ROOT, 'b');
const OG_DIR = path.join(ROOT, 'og');
const FORCE = process.argv.includes('--force');

const shortId = id => String(id).replace(/-/g, '').slice(0, SHORT_ID_LEN).toLowerCase();

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const clip = (s, n) => {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
};

const exists = p => access(p).then(() => true, () => false);

// Pacific-time "Oct 2026", matching how the site buckets dates.
const monthLabel = iso => iso
  ? new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'America/Los_Angeles' })
  : '';

// ── DATA ─────────────────────────────────────────────────
async function fetchBillboards() {
  const cols = 'id,company_name,ocr_text,image_url,crop_box,captured_at,address,category';
  const res = await fetch(`${SUPABASE_URL}/rest/v1/billboards?select=${cols}&order=captured_at.desc`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error('Unexpected payload');
  return rows;
}

// ── IMAGE ────────────────────────────────────────────────
function parseBox(cb) {
  let b = cb;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { return null; } }
  const { x, y, w, h } = b || {};
  if (![x, y, w, h].every(v => typeof v === 'number' && isFinite(v))) return null;
  if (w <= 0 || h <= 0 || x < 0 || y < 0 || x + w > 1.001 || y + h > 1.001) return null;
  return { x, y, w, h };
}

// Port of fitBoxToAspect in js/crop.js: grow the short side around the box
// centre (never crop tighter than the photographer chose), clamp to the image.
function fitBox(box, targetAspect, naturalAspect) {
  const want = targetAspect / naturalAspect;
  let { x, y, w, h } = box;
  const cx = x + w / 2, cy = y + h / 2;
  if (w / h > want) h = w / want; else w = h * want;
  if (h > 1) { w /= h; h = 1; }
  if (w > 1) { h /= w; w = 1; }
  x = Math.min(Math.max(cx - w / 2, 0), 1 - w);
  y = Math.min(Math.max(cy - h / 2, 0), 1 - h);
  return { x, y, w, h };
}

async function buildOgImage(row, outPath) {
  const res = await fetch(row.image_url);
  if (!res.ok) throw new Error(`image ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  // failOn 'truncated': a half-downloaded JPEG must fail, not become a
  // garbage preview that sticks (see learnings: sharp failOn).
  const oriented = await sharp(buf, { failOn: 'truncated' }).rotate().toBuffer({ resolveWithObject: true });
  const W = oriented.info.width, H = oriented.info.height;
  const target = OG_W / OG_H;

  // No stored box: take the widest target-shaped band, centred on the
  // vertical prior rather than the middle of the frame.
  const box = fitBox(parseBox(row.crop_box) || { x: 0, y: Y_PRIOR - 0.01, w: 1, h: 0.02 }, target, W / H);

  const left = Math.round(box.x * W), top = Math.round(box.y * H);
  const width = Math.min(Math.round(box.w * W), W - left);
  const height = Math.min(Math.round(box.h * H), H - top);

  await sharp(oriented.data)
    .extract({ left, top, width, height })
    .resize(OG_W, OG_H, { fit: 'cover' })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(outPath);
}

// ── PAGE ─────────────────────────────────────────────────
function pageHtml(row, sid, hasImage) {
  const who = row.company_name || 'Billboard';
  const where = row.address ? row.address.split(',')[0] : 'Highway 101';
  const when = monthLabel(row.captured_at);
  const title = `${who} billboard on ${where} · 101 Ads`;
  const ocr = clip(row.ocr_text, 180);
  const desc = clip([ocr && `“${ocr}”`, `Spotted on ${where}${when ? `, ${when}` : ''}.`].filter(Boolean).join(' '), 200);
  const pageUrl = `${SITE}/b/${sid}/`;
  const appPath = `/?b=${sid}`;
  const img = `${SITE}/og/${sid}.jpg`;

  const imageTags = hasImage ? `
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="${OG_W}">
<meta property="og:image:height" content="${OG_H}">
<meta property="og:image:alt" content="${esc(clip(row.ocr_text, 400) || who + ' billboard')}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${img}">` : `
<meta name="twitter:card" content="summary">`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<!-- Generated by tools/build-share-pages.mjs - do not edit by hand. -->
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${pageUrl}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="101 Ads">
<meta property="og:url" content="${pageUrl}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">${imageTags}
<script>location.replace(${JSON.stringify(appPath)});</script>
<style>body{font:15px/1.5 -apple-system,BlinkMacSystemFont,Inter,sans-serif;color:#1d1d1f;margin:0;display:grid;place-items:center;min-height:100vh}a{color:#0071e3}</style>
</head>
<body>
<p><a href="${appPath}">Open this billboard on the 101 Ads map →</a></p>
</body>
</html>
`;
}

// ── MAIN ─────────────────────────────────────────────────
async function main() {
  const rows = await fetchBillboards();

  const seen = new Map();
  for (const r of rows) {
    const sid = shortId(r.id);
    if (seen.has(sid)) {
      throw new Error(`Short id collision: ${sid} (${seen.get(sid)} / ${r.id}). Raise SHORT_ID_LEN here and in js/share.js.`);
    }
    seen.set(sid, r.id);
  }

  await mkdir(PAGES_DIR, { recursive: true });
  await mkdir(OG_DIR, { recursive: true });

  let imgsBuilt = 0, imgsFailed = 0;
  for (const r of rows) {
    const sid = shortId(r.id);
    const ogPath = path.join(OG_DIR, `${sid}.jpg`);
    let hasImage = await exists(ogPath);

    if (r.image_url && (FORCE || !hasImage)) {
      try {
        await buildOgImage(r, ogPath);
        hasImage = true; imgsBuilt++;
      } catch (e) {
        imgsFailed++;
        // ::warning:: surfaces in the GitHub Actions summary; harmless locally.
        console.warn(`::warning::${sid} preview image failed: ${e.message}`);
      }
    }

    const dir = path.join(PAGES_DIR, sid);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.html'), pageHtml(r, sid, hasImage));
  }

  // Prune rows that no longer exist.
  let pruned = 0;
  for (const d of await readdir(PAGES_DIR)) {
    if (/^[0-9a-f]{8,}$/.test(d) && !seen.has(d)) { await rm(path.join(PAGES_DIR, d), { recursive: true }); pruned++; }
  }
  for (const f of await readdir(OG_DIR)) {
    const m = f.match(/^([0-9a-f]{8,})\.jpg$/);
    if (m && !seen.has(m[1])) { await rm(path.join(OG_DIR, f)); pruned++; }
  }

  console.log(`${rows.length} billboards · ${imgsBuilt} preview images built · ${imgsFailed} failed · ${pruned} pruned`);
  // A failed image still gets a page (text-only card) and is retried next
  // run, so it is a warning, not a failed build.
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
