// ── CROP — content-aware billboard framing for thumbnails ──
//
// Why this exists: thumbnails used `object-fit: contain`, which letterboxes a
// whole driving photo into a 96×64 box — the billboard ends up a few pixels
// tall while the A-pillar and dashboard dominate.
//
// Why not generic saliency: off-the-shelf saliency crops chase raw edge energy,
// which in these photos means the windscreen pillar, the mirror, and the
// dashboard seam. It also dives *inside* the billboard onto a wordmark. Both
// failure modes were measured before this was written.
//
// The scoring here is billboard-specific on three axes:
//   1. sky and dark pixels are excluded from "interest" — sky is the background
//      a billboard sits against, and dark is car interior / asphalt.
//   2. a containment term compares interest inside the window against a band
//      just outside it. A window slicing through a board leaves the remainder
//      in that band and scores badly, so whole panels beat partial ones.
//   3. a guard: unless the best window beats the full frame by GUARD, nothing
//      is cropped at all. Already-composed shots are left alone.
//
// Constants were swept against the 78 existing photos plus synthetic raw
// driving frames with known board positions. See crop_proto.py / crop_test.py.

const PROC_W       = 160;
const SKY_BLUE_D   = 8;
const SKY_LUM      = 130;
const SKY_SMOOTH   = 12;
const BLOWN_LUM    = 205;
const BLOWN_SMOOTH = 8;
const DARK_LUM     = 50;
const Y_PRIOR_MU   = 0.42;
const Y_PRIOR_SIG  = 0.28;
const SCALE_MIN    = 0.35;
const SCALE_MAX    = 1.00;
const N_SCALES     = 11;
const PAD          = 0.06;
const GUARD        = 1.75;
const RING         = 0.14;
const RING_W       = 1.0;

// Bump this whenever the scoring changes, so stale crops from an older
// algorithm don't survive in a returning visitor's localStorage.
const CACHE_KEY = 'bbcrop:v2';

// ── cache ────────────────────────────────────────────────
let _cache = null;
function cache() {
  if (_cache) return _cache;
  try { _cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); }
  catch { _cache = {}; }
  return _cache;
}
let _flushTimer = null;
function persist() {
  clearTimeout(_flushTimer);
  _flushTimer = setTimeout(() => {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(_cache)); }
    catch { /* quota or private mode — crops just recompute next visit */ }
  }, 400);
}
export function clearCropCache() {
  _cache = {};
  try { localStorage.removeItem(CACHE_KEY); } catch {}
}

// ── core ─────────────────────────────────────────────────
function integral(src, W, H) {
  const ii = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) {
    let rowSum = 0;
    for (let x = 0; x < W; x++) {
      rowSum += src[y * W + x];
      ii[(y + 1) * (W + 1) + (x + 1)] = ii[y * (W + 1) + (x + 1)] + rowSum;
    }
  }
  return ii;
}
const boxSum = (ii, W1, y0, x0, y1, x1) =>
  ii[y1 * W1 + x1] - ii[y0 * W1 + x1] - ii[y1 * W1 + x0] + ii[y0 * W1 + x0];

function analyze(imgEl) {
  const w0 = imgEl.naturalWidth, h0 = imgEl.naturalHeight;
  if (!w0 || !h0) return null;
  const W = PROC_W, H = Math.max(1, Math.round(PROC_W * h0 / w0));

  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(imgEl, 0, 0, W, H);

  let px;
  try { px = ctx.getImageData(0, 0, W, H).data; }
  catch { return null; }   // canvas tainted — caller falls back

  const n = W * H;
  const lum = new Float32Array(n);
  const isSky = new Float32Array(n);
  const isDark = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    isSky[i] = (b - r);           // stash for second pass
  }
  const grad = new Float32Array(n);
  for (let y = 0; y < H; y++) {
    for (let x = 1; x < W - 1; x++) {
      grad[y * W + x] = Math.abs(lum[y * W + x + 1] - lum[y * W + x - 1]);
    }
  }
  for (let y = 1; y < H - 1; y++) {
    for (let x = 0; x < W; x++) {
      grad[y * W + x] += Math.abs(lum[(y + 1) * W + x] - lum[(y - 1) * W + x]);
    }
  }
  const interest = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const sky = ((isSky[i] > SKY_BLUE_D) && lum[i] > SKY_LUM && grad[i] < SKY_SMOOTH) ||
                (lum[i] > BLOWN_LUM && grad[i] < BLOWN_SMOOTH);
    const dark = lum[i] < DARK_LUM;
    isSky[i] = sky ? 1 : 0;
    isDark[i] = dark ? 1 : 0;
    interest[i] = (sky || dark) ? 0 : grad[i];
  }
  return { W, H, interest, isSky, isDark };
}

export function computeCrop(imgEl, targetAspect) {
  const f = analyze(imgEl);
  if (!f) return null;
  const { W, H, interest, isSky, isDark } = f;
  const W1 = W + 1;

  const iiInt = integral(interest, W, H);
  const iiSky = integral(isSky, W, H);
  const iiDark = integral(isDark, W, H);

  let total = 0;
  for (let i = 0; i < interest.length; i++) total += interest[i];
  const gMean = Math.max(total / (W * H), 1e-6);

  function score(x0, y0, ww, hh) {
    const x1 = x0 + ww, y1 = y0 + hh, area = ww * hh;
    const inSum = boxSum(iiInt, W1, y0, x0, y1, x1);
    const inDens = inSum / area / gMean;
    const skyF = boxSum(iiSky, W1, y0, x0, y1, x1) / area;
    const darkF = boxSum(iiDark, W1, y0, x0, y1, x1) / area;

    const rx = Math.max(1, Math.round(ww * RING));
    const ry = Math.max(1, Math.round(hh * RING));
    const ox0 = Math.max(0, x0 - rx), oy0 = Math.max(0, y0 - ry);
    const ox1 = Math.min(W, x1 + rx), oy1 = Math.min(H, y1 + ry);
    const outSum = boxSum(iiInt, W1, oy0, ox0, oy1, ox1) - inSum;
    const outArea = Math.max((ox1 - ox0) * (oy1 - oy0) - area, 1);
    const outDens = outSum / outArea / gMean;
    const containment = inDens / (inDens + RING_W * outDens + 1e-6);

    const cy = (y0 + hh / 2) / H;
    const pos = Math.exp(-((cy - Y_PRIOR_MU) ** 2) / (2 * Y_PRIOR_SIG ** 2));
    const scale = ww / W;
    return inDens * containment *
           Math.pow(1 - skyF, 0.6) * (1 - darkF) *
           pos * Math.pow(scale, 0.5);
  }

  // BASELINE — widest window at the target aspect, best placement.
  //
  // This is both the "reposition, don't zoom" answer and the reference the zoom
  // guard is measured against. Using a *centred* window here was a bug, caught
  // on the real phone photos: they are 1080×1920, so the centred 1.5-aspect
  // window is already a narrow band across the middle 38% of the frame. That
  // flattered the baseline (nothing cleared the guard) and parked the fallback
  // in the middle of the picture, which is where billboards are not.
  let bw = W, bh = Math.round(W / targetAspect);
  if (bh > H) { bh = H; bw = Math.round(H * targetAspect); }
  let base = { s: -1, x: 0, y: 0, w: bw, h: bh };
  const ystep = Math.max(1, Math.round(bh * 0.05));
  const xstep = Math.max(1, Math.round(bw * 0.05));
  for (let y0 = 0; y0 + bh <= H; y0 += ystep) {
    for (let x0 = 0; x0 + bw <= W; x0 += xstep) {
      const s = score(x0, y0, bw, bh);
      if (s > base.s) base = { s, x: x0, y: y0, w: bw, h: bh };
    }
  }
  const fullScore = base.s;

  let best = { ...base };
  for (let k = 0; k < N_SCALES; k++) {
    const sc = SCALE_MIN + (SCALE_MAX - SCALE_MIN) * k / (N_SCALES - 1);
    let ww = Math.round(sc * W), hh = Math.round(ww / targetAspect);
    if (hh > H) { hh = H; ww = Math.round(hh * targetAspect); }
    if (ww < 8 || hh < 6 || ww > W || hh > H) continue;
    const step = Math.max(2, Math.round(ww * 0.08));
    for (let y0 = 0; y0 + hh <= H; y0 += step) {
      for (let x0 = 0; x0 + ww <= W; x0 += step) {
        const s = score(x0, y0, ww, hh);
        if (s > best.s) best = { s, x: x0, y: y0, w: ww, h: hh };
      }
    }
  }

  const zoomed = best.s > fullScore * GUARD;
  const r = zoomed ? best : base;
  let { x, y, w, h } = r;
  if (zoomed) {
    const px = w * PAD, py = h * PAD;
    x = Math.max(0, x - px); y = Math.max(0, y - py);
    w = Math.min(W - x, w + 2 * px); h = Math.min(H - y, h + 2 * py);
  }
  return { x: x / W, y: y / H, w: w / W, h: h / H, cropped: true, zoomed };
}

// ── application ──────────────────────────────────────────
// Maps the crop rect onto the <img> by oversizing and offsetting it. Because
// the rect is built at the container's aspect ratio, width and height scale by
// the same factor, so nothing is distorted.
function applyCrop(imgEl, c) {
  if (!c) {   // analysis unavailable — plain cover, positioned by the stylesheet
    imgEl.style.cssText += ';position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';
    return;
  }
  imgEl.style.position = 'absolute';
  imgEl.style.width  = (100 / c.w) + '%';
  imgEl.style.height = (100 / c.h) + '%';
  imgEl.style.left   = (-100 * c.x / c.w) + '%';
  imgEl.style.top    = (-100 * c.y / c.h) + '%';
  imgEl.style.objectFit = 'fill';
  imgEl.style.maxWidth = 'none';
}

/**
 * Convert a stored `crop_box` into the shape applyCrop wants.
 * Returns null if absent or malformed, so callers fall through to the
 * heuristic rather than rendering something wrong.
 */
export function boxFromRecord(cropBox) {
  if (!cropBox) return null;
  let b = cropBox;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { return null; } }
  const { x, y, w, h } = b || {};
  if (![x, y, w, h].every(v => typeof v === 'number' && isFinite(v))) return null;
  if (w <= 0 || h <= 0 || x < 0 || y < 0 || x + w > 1.001 || y + h > 1.001) return null;
  return { x, y, w, h, cropped: true, zoomed: true, exact: true };
}

/**
 * Frame a thumbnail image inside its container.
 *
 * If the record carries a `crop_box` the app chose, that wins outright — it is
 * ground truth from the person who took the photo, not an inference. The pixel
 * heuristic exists for the rows published before that column existed.
 *
 * Safe by construction: any failure (CORS taint, decode error, no canvas)
 * leaves a plain `object-fit: cover`, which is still better than `contain`.
 */
export function smartFrame(imgEl, url, targetAspect, cropBox) {
  const exact = boxFromRecord(cropBox);
  if (exact) { applyCrop(imgEl, exact); return; }

  const key = `${url}|${targetAspect.toFixed(3)}`;
  const c = cache();

  if (c[key]) { applyCrop(imgEl, c[key]); return; }

  // Neutral default until the real crop is known — avoids a visible jump.
  imgEl.style.cssText += ';position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';

  const run = () => {
    // Analyse a separate CORS-enabled copy. The displayed <img> is never given
    // crossOrigin, so if CORS is missing the picture still renders normally.
    const probe = new Image();
    probe.crossOrigin = 'anonymous';
    probe.onload = () => {
      const idle = window.requestIdleCallback || (fn => setTimeout(fn, 1));
      idle(() => {
        const res = computeCrop(probe, targetAspect);
        if (!res) return;                 // tainted canvas — keep cover
        c[key] = res; persist();
        applyCrop(imgEl, res);
      });
    };
    probe.onerror = () => { /* keep cover */ };
    probe.src = url;
  };

  if (imgEl.complete && imgEl.naturalWidth) run();
  else imgEl.addEventListener('load', run, { once: true });
}

/** Only frame thumbnails once they're near the viewport. */
export function observeFrame(imgEl, url, targetAspect, cropBox) {
  // An exact box needs no pixel work, so apply it immediately rather than
  // waiting for the element to scroll into range.
  if (boxFromRecord(cropBox)) { smartFrame(imgEl, url, targetAspect, cropBox); return; }
  if (!('IntersectionObserver' in window)) { smartFrame(imgEl, url, targetAspect); return; }
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (e.isIntersecting) { io.disconnect(); smartFrame(imgEl, url, targetAspect); }
    }
  }, { rootMargin: '200px' });
  io.observe(imgEl);
}
