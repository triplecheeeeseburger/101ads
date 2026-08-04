#!/usr/bin/env python3
"""
Generates preview-crop.html from js/crop.js.

The preview has to run straight off the filesystem (double-click, file://),
where ES modules are blocked — a module <script> silently never executes, which
looks exactly like "the page loads but no images appear". So the algorithm is
inlined here rather than imported.

crop.js stays the single source of truth. Re-run this after touching it:

    python3 tools/build-preview.py
"""
import re, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
crop = (root / 'js' / 'crop.js').read_text()
crop = re.sub(r'^export\s+', '', crop, flags=re.M)

cfg = (root / 'js' / 'config.js').read_text()
url = re.search(r"SUPABASE_URL\s*=\s*'([^']+)'", cfg).group(1)
key = re.search(r"SUPABASE_KEY\s*=\s*'([^']+)'", cfg).group(1)

TEMPLATE = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Crop preview — 101ads</title>
<style>
:root{--bg:#f5f5f7;--s:#fff;--b:#e3e3e6;--t:#1d1d1f;--t2:#515154;--t3:#86868b;--a:#0071e3;--bad:#ff2d55;--warn:#ff9500}
*{box-sizing:border-box}
body{margin:0;padding:20px;background:var(--bg);color:var(--t);
font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
h1{font-size:19px;margin:0 0 4px}
.sub{color:var(--t3);font-size:12px;margin-bottom:14px}
.bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;background:var(--s);
border:1px solid var(--b);border-radius:10px;padding:10px 12px;margin-bottom:10px;
position:sticky;top:10px;z-index:5}
button{font:inherit;font-size:12px;font-weight:500;padding:6px 12px;border-radius:15px;
border:1px solid var(--b);background:var(--s);color:var(--t2);cursor:pointer}
button:hover{border-color:var(--t);color:var(--t)}
button.on{background:var(--a);border-color:var(--a);color:#fff}
#stat{margin-left:auto;font-size:12px;color:var(--t3)}
#stat b{color:var(--t);font-variant-numeric:tabular-nums}
#diag{background:#fff4e5;border:1px solid var(--warn);color:#7a4a00;border-radius:8px;
padding:10px 12px;margin-bottom:12px;font-size:12px;display:none;white-space:pre-wrap}
#diag.on{display:block}
.hd{display:grid;grid-template-columns:96px 96px 1fr 190px;gap:14px;padding:0 12px 5px;
font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--t3)}
.row{display:grid;grid-template-columns:96px 96px 1fr 190px;gap:14px;align-items:center;
background:var(--s);border:1px solid var(--b);border-radius:10px;padding:10px 12px;margin-bottom:6px}
.row.zoom{border-left:4px solid var(--a)}
.row.band{border-left:4px solid var(--b)}
.row.exact{border-left:4px solid #34c759}
.row.fail{border-left:4px solid var(--bad)}
.th{width:96px;height:64px;border-radius:5px;overflow:hidden;position:relative;background:#e8e8ea}
.th.b img{width:100%;height:100%;object-fit:contain}
.co{font-weight:600;font-size:13px}
.ocr{color:var(--t2);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tag{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--t3)}
.map{position:relative;width:190px;border-radius:5px;overflow:hidden;background:#e8e8ea}
.map img{width:100%;display:block}
.box{position:absolute;border:2px solid var(--bad)}
</style>
</head>
<body>
<h1>Content-aware crop preview</h1>
<div class="sub">Left column is the old <code>object-fit:contain</code>. Second is what ships.
Red box shows the region chosen. Green edge = exact <code>crop_box</code> from the app;
blue = zoomed; grey = repositioned band only.</div>

<div id="diag"></div>

<div class="bar">
  <button id="fAll" class="on">All</button>
  <button id="fZoom">Zoomed</button>
  <button id="fBand">Band only</button>
  <button id="fExact">Exact crop_box</button>
  <button id="fFail">Problems</button>
  <button id="recompute">Clear cache &amp; recompute</button>
  <div id="stat">loading…</div>
</div>

<div class="hd"><div>Before</div><div>After</div><div>Billboard</div><div>Region</div></div>
<div id="list"></div>

<script>
/* ---- inlined from js/crop.js — do not edit here, edit crop.js and re-run
       tools/build-preview.py ---- */
__CROP__

/* ---- preview harness ---- */
var URL_ = "__URL__";
var KEY_ = "__KEY__";
var ASPECT = 96 / 64;
var rows = [];

function diag(msg){
  var d = document.getElementById('diag');
  d.className = 'on';
  d.textContent = msg;
}

// Display images deliberately do NOT get crossOrigin: if CORS were missing,
// setting it would stop the picture rendering at all. Only the analysis probe
// needs it, and its failure is recoverable.
function loadProbe(u){
  return new Promise(function(res){
    var i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = function(){ res(i); };
    i.onerror = function(){ res(null); };
    i.src = u;
  });
}

function applyBox(img, c){
  if(!c){
    img.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 42%";
    return;
  }
  img.style.position = "absolute";
  img.style.width  = (100 / c.w) + "%";
  img.style.height = (100 / c.h) + "%";
  img.style.left   = (-100 * c.x / c.w) + "%";
  img.style.top    = (-100 * c.y / c.h) + "%";
  img.style.maxWidth = "none";
  img.style.objectFit = "fill";
}

function run(){
  var L = document.getElementById('list');
  L.innerHTML = '';
  rows = [];
  document.getElementById('stat').textContent = 'fetching…';

  if (location.protocol === 'file:') {
    diag('Opened from file:// — this page is built to work that way. '
       + 'If nothing loads below, your browser is blocking the request to Supabase '
       + 'from a local file. Serve the folder instead:\n\n'
       + '    cd ~/101ads && python3 -m http.server 8000\n'
       + '    open http://localhost:8000/preview-crop.html');
  }

  fetch(URL_ + "/rest/v1/billboards?order=captured_at.desc&limit=500",
        { headers: { apikey: KEY_, Authorization: "Bearer " + KEY_ } })
  .then(function(r){
    if(!r.ok) throw new Error('HTTP ' + r.status + ' ' + r.statusText);
    return r.json();
  })
  .then(function(d){ return render(d); })
  .catch(function(e){
    document.getElementById('stat').textContent = 'failed';
    diag('Could not load billboards from Supabase.\n\n' + e
       + '\n\nIf this says "Failed to fetch" and you opened the file directly, '
       + 'serve the folder over http instead:\n\n'
       + '    cd ~/101ads && python3 -m http.server 8000\n'
       + '    open http://localhost:8000/preview-crop.html');
  });
}

async function render(d){
  d = d.filter(function(b){ return b.image_url; });
  var L = document.getElementById('list');
  var nZoom=0, nBand=0, nExact=0, nFail=0, times=[], imgFail=0;

  for (var k = 0; k < d.length; k++){
    var b = d[k];
    var r = document.createElement('div');
    r.className = 'row';
    r.innerHTML =
      '<div class="th b"><img src="' + b.image_url + '" loading="lazy"></div>' +
      '<div class="th a"></div>' +
      '<div><div class="co"></div><div class="ocr"></div><div class="tag">…</div></div>' +
      '<div class="map"></div>';
    r.querySelector('.co').textContent = b.company_name || '—';
    r.querySelector('.ocr').textContent = (b.ocr_text || '').slice(0,90) || '(no text)';
    L.appendChild(r);
    var tag = r.querySelector('.tag');

    // An exact box from the app needs no pixel analysis at all.
    var exact = boxFromRecord(b.crop_box);
    var after = r.querySelector('.th.a');
    var ai = document.createElement('img');
    ai.src = b.image_url;
    after.appendChild(ai);

    var used = null, kind;
    if (exact){
      used = exact; kind = 'exact'; nExact++;
      tag.textContent = 'EXACT crop_box from app';
    } else {
      var im = await loadProbe(b.image_url);
      if (!im){
        kind = 'fail'; nFail++; imgFail++;
        tag.textContent = 'IMAGE BLOCKED (CORS) — site falls back to cover';
        applyBox(ai, null);
        r.className = 'row fail';
        rows.push({row:r, kind:kind});
        continue;
      }
      var t0 = performance.now();
      var c = null;
      try { c = computeCrop(im, ASPECT); } catch(e){ c = null; }
      var ms = performance.now() - t0;
      if (!c){
        kind = 'fail'; nFail++;
        tag.textContent = 'CANVAS TAINTED — site falls back to cover';
        applyBox(ai, null);
        r.className = 'row fail';
        rows.push({row:r, kind:kind});
        continue;
      }
      times.push(ms);
      used = c;
      kind = c.zoomed ? 'zoom' : 'band';
      if (c.zoomed) nZoom++; else nBand++;
      tag.textContent = (c.zoomed
        ? 'ZOOMED to ' + (c.w*100).toFixed(0) + '% width'
        : 'BAND repositioned to y=' + c.y.toFixed(2)) + ' · ' + ms.toFixed(0) + 'ms';
    }

    applyBox(ai, used);
    r.className = 'row ' + kind;

    var mp = r.querySelector('.map');
    var mi = document.createElement('img');
    mi.src = b.image_url;
    mp.appendChild(mi);
    var bx = document.createElement('div');
    bx.className = 'box';
    bx.style.left   = (used.x*100) + '%';
    bx.style.top    = (used.y*100) + '%';
    bx.style.width  = (used.w*100) + '%';
    bx.style.height = (used.h*100) + '%';
    mp.appendChild(bx);

    rows.push({row:r, kind:kind});
  }

  var avg = times.length ? times.reduce(function(a,b){return a+b;},0)/times.length : 0;
  document.getElementById('stat').innerHTML =
    '<b>' + d.length + '</b> shown · <b>' + nExact + '</b> exact · <b>' + nZoom +
    '</b> zoomed · <b>' + nBand + '</b> band · <b>' + nFail + '</b> problems · avg <b>' +
    avg.toFixed(1) + 'ms</b>';

  if (imgFail > 0){
    diag(imgFail + ' image(s) could not be read for analysis (CORS). Those thumbnails '
       + 'still display, they just fall back to plain object-fit:cover on the site.');
  }
}

function filt(kind){
  rows.forEach(function(r){ r.row.style.display = (kind==='all' || r.kind===kind) ? '' : 'none'; });
  [['fAll','all'],['fZoom','zoom'],['fBand','band'],['fExact','exact'],['fFail','fail']]
    .forEach(function(p){ document.getElementById(p[0]).classList.toggle('on', p[1]===kind); });
}
document.getElementById('fAll').onclick   = function(){ filt('all'); };
document.getElementById('fZoom').onclick  = function(){ filt('zoom'); };
document.getElementById('fBand').onclick  = function(){ filt('band'); };
document.getElementById('fExact').onclick = function(){ filt('exact'); };
document.getElementById('fFail').onclick  = function(){ filt('fail'); };
document.getElementById('recompute').onclick = function(){ clearCropCache(); run(); };

run();
</script>
</body>
</html>
"""

out = (TEMPLATE
       .replace('__CROP__', crop)
       .replace('__URL__', url)
       .replace('__KEY__', key))
(root / 'preview-crop.html').write_text(out)
print('wrote preview-crop.html  ({} bytes, classic script, no modules)'.format(len(out)))
