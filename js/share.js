// ── SHARE - direct links to one billboard ────────────────
//
// Two URLs per billboard, on purpose:
//
//   /b/<id>/   The share link. A tiny static page (built by
//              tools/build-share-pages.mjs) whose only job is to carry
//              Open Graph / Twitter Card tags, then hand the visitor to the
//              app. Crawlers for X, Slack, iMessage, LinkedIn don't run JS, so
//              the app's own index.html can never give them per-billboard
//              titles or images - a static page per billboard can.
//
//   /?b=<id>   The app with that billboard selected. What the address bar
//              shows while a billboard is open, and where /b/<id>/ lands.
//
// <id> is the first 8 hex chars of the row's UUID - short enough to paste,
// and at a few hundred rows a collision is ~1 in 10^5. The build script
// refuses to run if one ever happens; lookups match by prefix either way.

import { isMobile } from './config.js';

export const SHORT_ID_LEN = 8;
const SITE = 'https://101ads.org';

export function shortId(b) {
  return String(b.id || '').replace(/-/g, '').slice(0, SHORT_ID_LEN).toLowerCase();
}

/** Find a billboard by short id (or full UUID). Null if none or ambiguous. */
export function findByShortId(list, raw) {
  const key = String(raw || '').replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{6,32}$/.test(key)) return null;
  const hits = list.filter(b => String(b.id).replace(/-/g, '').toLowerCase().startsWith(key));
  return hits.length === 1 ? hits[0] : null;
}

/** Read ?b= (or a legacy #b=) from the current URL. */
export function linkedIdFromUrl() {
  const q = new URLSearchParams(location.search).get('b');
  if (q) return q;
  const m = location.hash.match(/^#b=([0-9a-f-]+)/i);
  return m ? m[1] : null;
}

/**
 * Keep the address bar in step with the selection, without adding history
 * entries - clicking through twenty billboards should not take twenty Back
 * presses to leave the site. Other query params are preserved.
 */
export function syncUrlToSelection(b) {
  const url = new URL(location.href);
  if (b) url.searchParams.set('b', shortId(b));
  else url.searchParams.delete('b');
  if (/^#b=/i.test(url.hash)) url.hash = '';
  if (url.href !== location.href) history.replaceState(history.state, '', url);
}

/** Public share URL. Always the production origin: a localhost link is useless to anyone else. */
export function shareUrl(b) {
  return `${SITE}/b/${shortId(b)}/`;
}

function shareText(b) {
  const who = b.company_name || 'A billboard';
  const where = b.address ? b.address.split(',')[0] : 'Highway 101';
  return `${who} billboard spotted on ${where}`;
}

// ── UI ───────────────────────────────────────────────────
export const SHARE_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7.5 7.5 12 3l4.5 4.5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>`;

const X_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"><path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.78L17.75 3Zm-1.08 16.17h1.7L7.4 4.74H5.58l11.09 14.43Z"/></svg>`;
const LINK_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4L12 5.6"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"/></svg>`;

let openMenu = null;

function closeMenu() {
  if (!openMenu) return;
  openMenu.remove();
  openMenu = null;
  document.removeEventListener('pointerdown', onOutside, true);
  window.removeEventListener('keydown', onKey, true);
}
function onOutside(e) {
  if (openMenu && !openMenu.contains(e.target) && !e.target.closest('.share-btn')) closeMenu();
}
function onKey(e) {
  // Swallow this Escape so it closes the menu, not the bubble underneath.
  if (e.key === 'Escape' && openMenu) { e.stopPropagation(); closeMenu(); }
}

async function copyLink(url, label) {
  try {
    await navigator.clipboard.writeText(url);
    label.textContent = 'Link copied';
  } catch {
    // Clipboard API is blocked in some embedded contexts - show the URL so it
    // can still be copied by hand.
    label.textContent = url;
  }
}

/**
 * Share a billboard. On phones, the OS share sheet - it already knows the
 * apps the reader uses. Elsewhere, a small menu: post to X, or copy the link.
 */
export async function shareBillboard(b, anchorEl) {
  const url = shareUrl(b);
  const text = shareText(b);

  if (isMobile() && navigator.share) {
    try { await navigator.share({ title: text, text, url }); } catch { /* dismissed */ }
    return;
  }

  if (openMenu) { closeMenu(); return; }

  const menu = document.createElement('div');
  menu.className = 'share-menu';
  menu.setAttribute('role', 'menu');
  const xHref = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  menu.innerHTML = `
    <a class="share-item" role="menuitem" href="${xHref}" target="_blank" rel="noopener">${X_ICON}<span>Post on X</span></a>
    <button class="share-item" role="menuitem" type="button" data-act="copy">${LINK_ICON}<span>Copy link</span></button>`;

  menu.querySelector('a').addEventListener('click', () => setTimeout(closeMenu, 0));
  menu.querySelector('[data-act="copy"]').addEventListener('click', e => {
    copyLink(url, e.currentTarget.querySelector('span'));
    setTimeout(closeMenu, 1200);
  });

  document.body.appendChild(menu);
  const r = anchorEl.getBoundingClientRect();
  const mw = menu.offsetWidth;
  const left = Math.min(Math.max(8, r.right - mw), window.innerWidth - mw - 8);
  menu.style.left = `${left}px`;
  menu.style.top = `${r.bottom + 6}px`;

  openMenu = menu;
  document.addEventListener('pointerdown', onOutside, true);
  window.addEventListener('keydown', onKey, true);
}

export { closeMenu as closeShareMenu };
