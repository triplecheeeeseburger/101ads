// ── STATS — stats panel, brand intelligence ─────────────
import { catColor } from './config.js';
import { allBillboards } from './data.js';

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

  const brandFreq = {}, brandUrls = {};
  allBillboards.forEach(b => {
    if (!b.company_name) return;
    brandFreq[b.company_name] = (brandFreq[b.company_name] || 0) + 1;
    if (b.company_url && !brandUrls[b.company_name]) brandUrls[b.company_name] = b.company_url;
  });
  const brands = Object.entries(brandFreq).sort((a, b) => b[1] - a[1]);
  const maxBrand = brands[0]?.[1] || 1;

  const catFreq = {};
  allBillboards.forEach(b => { const c = b.category || 'Uncategorized'; catFreq[c] = (catFreq[c] || 0) + 1; });
  const cats = Object.entries(catFreq).sort((a, b) => b[1] - a[1]);

  const withLogo = allBillboards.filter(b => b.company_url).length;
  const aiCount = allBillboards.filter(b => (b.category || '').includes('Tech')).length;
  const aiPct = Math.round(aiCount / total * 100);
  const topBrand = brands[0];
  const topCat = cats[0];
  const uniqueBrands = brands.length;

  // Road distance estimate
  const coords = allBillboards.filter(b => b.latitude && b.longitude)
    .map(b => ({ lat: b.latitude, lng: b.longitude }));
  let miles = null;
  if (coords.length > 1) {
    const toRad = d => d * Math.PI / 180;
    const haversine = (a, b) => {
      const R = 3958.8;
      const dLat = toRad(b.lat - a.lat);
      const dLng = toRad(b.lng - a.lng);
      const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    };
    let maxDist = 0;
    for (let i = 0; i < coords.length; i++) {
      for (let j = i + 1; j < coords.length; j++) {
        maxDist = Math.max(maxDist, haversine(coords[i], coords[j]));
      }
    }
    miles = Math.round(maxDist * 1.35);
  }

  let html = '';

  if (brands.length) {
    html += `<div class="stats-section">
      <div class="stats-section-title">Top Brands by Ad Count</div>`;
    brands.slice(0, 8).forEach(([name, count]) => {
      const pct = Math.round(count / maxBrand * 100);
      const lurl = brandUrls[name] ? (() => { try { return 'https://www.google.com/s2/favicons?domain=' + new URL(brandUrls[name].trim()).hostname + '&sz=128'; } catch { return null; } })() : null;
      const logoHtml = lurl ? `<img class="brand-logo" src="${lurl}" alt="" onerror="this.style.display='none'">` : `<div class="brand-logo"></div>`;
      html += `<div class="brand-row">
        ${logoHtml}
        <span class="brand-name">${name}</span>
        <div class="brand-bar-wrap"><div class="brand-bar" style="width:${pct}%"></div></div>
        <span class="brand-count">${count}</span>
      </div>`;
    });
    html += `</div>`;
  }

  html += `<div class="stats-section">
    <div class="stats-section-title">By Category</div>`;
  cats.forEach(([cat, count]) => {
    const pct = Math.round(count / total * 100);
    const color = catColor(cat);
    html += `<div class="cat-stat-row">
      <div class="cat-dot" style="background:${color}"></div>
      <span class="cat-stat-name">${cat}</span>
      <span class="cat-stat-pct">${pct}%&nbsp;<span style="color:var(--text3);font-weight:400">${count}</span></span>
    </div>`;
  });
  html += `</div>`;

  html += `<div class="stats-section"><div class="stats-section-title">Insights</div>`;
  if (topBrand) {
    html += `<div class="fun-fact">🏆 <strong>${topBrand[0]}</strong> has the most billboard presence with <strong>${topBrand[1]}</strong> ad${topBrand[1] > 1 ? 's' : ''} spotted on the 101.</div>`;
  }
  if (aiPct > 0) {
    html += `<div class="fun-fact">🤖 <strong>${aiPct}% of all billboards</strong> are AI & Tech — Highway 101 is basically a startup runway.</div>`;
  }
  if (miles !== null) {
    html += `<div class="fun-fact">📍 Billboards captured across <strong>~${miles} miles</strong> of the 101 corridor.</div>`;
  }
  html += `<div class="fun-fact">🏢 <strong>${uniqueBrands} unique brands</strong> spotted out of ${total} total captures.</div>`;
  html += `</div>`;

  body.innerHTML = html;
}
