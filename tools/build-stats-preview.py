#!/usr/bin/env python3
"""
Generates preview-stats.html from js/stats.js + js/config.js.

Same reasoning as build-preview.py: the preview must run by double-clicking
(file://), where ES modules are blocked, so the real modules are inlined rather
than imported. js/stats.js stays the single source of truth.

    python3 tools/build-stats-preview.py
"""
import re, pathlib

root = pathlib.Path(__file__).resolve().parent.parent

cfg = (root / 'js' / 'config.js').read_text()
stats = (root / 'js' / 'stats.js').read_text()

# strip module syntax; keep everything else byte-identical to what ships
cfg = re.sub(r'^export\s+', '', cfg, flags=re.M)
stats = re.sub(r"^import\s+.*?;\s*$", '', stats, flags=re.M | re.S)
stats = re.sub(r'^export\s+', '', stats, flags=re.M)

css = (root / 'css' / 'style.css').read_text()

TEMPLATE = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Stats preview — 101ads</title>
<style>
__SITECSS__
</style>
<style>
body{margin:0;padding:24px;background:var(--bg,#f5f5f7);
font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:var(--text,#1d1d1f)}
.wrap{display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap}
.panelbox{width:380px;background:var(--surface,#fff);border:1px solid var(--border,#e3e3e6);
border-radius:14px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.08)}
.panelhd{padding:14px 18px;border-bottom:1px solid var(--border-light,#eee);font-weight:650;font-size:15px}
#statsPanelBody{padding:16px 18px 22px;display:flex;flex-direction:column;gap:20px}
.notes{flex:1;min-width:300px;max-width:520px}
.notes h2{font-size:15px;margin:0 0 8px}
.notes li{margin-bottom:9px;font-size:13px;line-height:1.55;color:var(--text2,#515154)}
.tagline{color:var(--text3,#86868b);font-size:12px;margin:0 0 16px}
#err{background:#fff4e5;border:1px solid #ff9500;color:#7a4a00;border-radius:8px;
padding:10px 12px;margin-bottom:14px;font-size:12px;display:none;white-space:pre-wrap}
#err.on{display:block}
</style>
</head>
<body>
<h1 style="font-size:20px;margin:0 0 4px">Stats panel — preview</h1>
<p class="tagline">Live data from Supabase, rendered with the exact <code>js/stats.js</code> that ships.</p>
<div id="err"></div>
<div class="wrap">
  <div class="panelbox">
    <div class="panelhd">📊 Brand Intelligence</div>
    <div id="statsPanelBody">loading…</div>
  </div>
  <div class="notes">
    <h2>What changed</h2>
    <ul>
      <li><strong>Leads with the whole collection.</strong> Totals first, because every
        capture contributes to them — they're the trustworthy numbers.</li>
      <li><strong>Distance is now a stated constant, not inferred.</strong> It used to be
        computed as the largest gap between any two billboards. That measures where signs
        stand, not how far anyone drove: a drive yielding one billboard computed as 0 miles.
        The corridor is now declared in <code>config.js</code> and edited by hand when the
        sector is extended.</li>
      <li><strong>Corridor vs driven are kept separate.</strong> 36 miles one way,
        driven both directions, so 72 miles of road. Density still divides by 36 — boards
        facing north and south are different boards along the same stretch, so dividing by
        72 would halve the real figure.</li>
      <li><strong>Per-drive numbers are demoted and carry no distance claim.</strong>
        How far a given drive went isn't recorded anywhere, so the panel doesn't pretend
        otherwise. The block is smaller, muted, and ends with an explicit caveat.</li>
      <li><strong>New pattern worth seeing:</strong> 85% of brands appear exactly once.
        Only a handful run multiple boards at a time.</li>
    </ul>
  </div>
</div>

<script>
__CONFIG__

const allBillboards = [];

__STATS__

(async function(){
  try {
    const r = await fetch(SUPABASE_URL + "/rest/v1/billboards?order=captured_at.desc&limit=500",
      { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const rows = await r.json();
    rows.forEach(function(b){ allBillboards.push(normalizeBillboard(b)); });
    renderStatsPanel();
  } catch (e) {
    var d = document.getElementById('err');
    d.className = 'on';
    d.textContent = 'Could not load billboards from Supabase.\n\n' + e +
      '\n\nIf you opened this file directly and it says "Failed to fetch", serve the folder:\n\n' +
      '    cd ~/101ads && python3 -m http.server 8000\n' +
      '    open http://localhost:8000/preview-stats.html';
    document.getElementById('statsPanelBody').textContent = '';
  }
})();
</script>
</body>
</html>
"""

out = (TEMPLATE
       .replace('__SITECSS__', css)
       .replace('__CONFIG__', cfg)
       .replace('__STATS__', stats))
(root / 'preview-stats.html').write_text(out)
print('wrote preview-stats.html ({} bytes)'.format(len(out)))
