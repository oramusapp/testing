/*
 * DoomBlock: blokuje Rolki na Instagramie i stronę główną ("Dla Ciebie") na TikToku.
 * Działa jako content script rozszerzenia Safari i jako userscript (apka "Userscripts").
 *
 * Konfiguracja: zmień wartości poniżej.
 */
(function () {
  'use strict';

  const CONFIG = {
    // Instagram
    igBlockReelsFeed: true,     // /reels/... (przewijany feed Rolek)
    igAllowSingleReel: true,    // /reel/<id> (pojedyncza rolka np. z wiadomości) – true = pozwól
    igBlockExplore: false,      // /explore/ (Eksploruj) – też potrafi wciągać
    igHideReelsInFeed: false,   // ukrywaj posty-wideo w głównym feedzie (eksperymentalne)
    // TikTok
    ttBlockForYou: true,        // strona główna, /foryou, /en/ itp.
    ttBlockFollowing: false,    // /following
    ttBlockExplore: true,       // /explore
    ttAllowSingleVideo: true,   // /@user/video/<id> – true = pozwól (linki od znajomych)
  };

  if (window.__doomblockLoaded) return;
  window.__doomblockLoaded = true;

  const host = location.hostname.replace(/^www\.|^m\./, '');
  const isIG = /(^|\.)instagram\.com$/.test(host);
  const isTT = /(^|\.)tiktok\.com$/.test(host);
  if (!isIG && !isTT) return;

  const OVERLAY_ID = 'doomblock-overlay';
  const STYLE_ID = 'doomblock-style';

  // ---------- reguły ----------

  function stripLang(path) {
    // TikTok bywa pod /en/, /pl-PL/ itp.
    return path.replace(/^\/[a-z]{2}(-[A-Za-z]{2})?(?=\/|$)/, '') || '/';
  }

  function verdict(pathname) {
    const p = pathname.replace(/\/+$/, '') || '/';
    if (isIG) {
      if (CONFIG.igBlockReelsFeed && /^\/reels(\/|$)/.test(p)) return 'redirect';
      if (!CONFIG.igAllowSingleReel && /^\/reel\//.test(p)) return 'redirect';
      if (CONFIG.igBlockExplore && /^\/explore(\/|$)/.test(p) && !/^\/explore\/search/.test(p)) return 'redirect';
      return 'allow';
    }
    if (isTT) {
      const q = stripLang(p);
      if (/^\/@[^/]+\/(video|photo)\/\d+/.test(q)) return CONFIG.ttAllowSingleVideo ? 'allow' : 'block';
      if (CONFIG.ttBlockForYou && (q === '/' || /^\/foryou(\/|$)/.test(q))) return 'block';
      if (CONFIG.ttBlockFollowing && /^\/following(\/|$)/.test(q)) return 'block';
      if (CONFIG.ttBlockExplore && /^\/explore(\/|$)/.test(q)) return 'block';
      return 'allow';
    }
    return 'allow';
  }

  // ---------- CSS: chowanie przycisków do Rolek / Dla Ciebie ----------

  function css() {
    const rules = [];
    if (isIG && CONFIG.igBlockReelsFeed) {
      rules.push('a[href="/reels/"], a[href^="/reels/"], a[href="/reels"] { display: none !important; }');
    }
    if (isIG && CONFIG.igBlockExplore) {
      rules.push('a[href="/explore/"], a[href="/explore"] { display: none !important; }');
    }
    if (isTT && CONFIG.ttBlockForYou) {
      rules.push('a[href="/foryou"], a[href^="/foryou?"], a[data-e2e="nav-foryou"] { display: none !important; }');
    }
    if (isTT && CONFIG.ttBlockExplore) {
      rules.push('a[href="/explore"], a[data-e2e="nav-explore"] { display: none !important; }');
    }
    rules.push(
      '#' + OVERLAY_ID + ' { position: fixed; inset: 0; z-index: 2147483647; display: flex;' +
      ' flex-direction: column; align-items: center; justify-content: center; gap: 18px;' +
      ' padding: 24px; background: #0f1115; color: #f2f2f2; text-align: center;' +
      ' font: 17px/1.45 -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif; }',
      '#' + OVERLAY_ID + ' h1 { font-size: 26px; margin: 0; }',
      '#' + OVERLAY_ID + ' p { margin: 0; max-width: 340px; color: #b8bcc6; }',
      '#' + OVERLAY_ID + ' nav { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }',
      '#' + OVERLAY_ID + ' a { color: #0f1115; background: #f2f2f2; padding: 10px 16px;' +
      ' border-radius: 999px; text-decoration: none; font-weight: 600; }'
    );
    return rules.join('\n');
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const root = document.head || document.documentElement;
    if (!root) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css();
    root.appendChild(s);
  }

  // ---------- akcje ----------

  function pauseAllMedia() {
    document.querySelectorAll('video, audio').forEach(function (m) {
      try { m.muted = true; m.pause(); } catch (e) { /* ignore */ }
    });
  }

  function showOverlay() {
    if (document.getElementById(OVERLAY_ID)) return;
    const body = document.body;
    if (!body) return;
    const el = document.createElement('div');
    el.id = OVERLAY_ID;
    el.setAttribute('role', 'dialog');
    el.innerHTML =
      '<h1>Bez doomscrollingu 🙂</h1>' +
      '<p>Strona główna TikToka jest zablokowana. Linki do konkretnych filmów i profili dalej działają.</p>' +
      '<nav>' +
      '<a href="/search">Szukaj</a>' +
      '<a href="/messages">Wiadomości</a>' +
      '<a href="/profile">Profil</a>' +
      '</nav>';
    body.appendChild(el);
  }

  function hideOverlay() {
    const el = document.getElementById(OVERLAY_ID);
    if (el) el.remove();
  }

  function hideIgFeedVideos() {
    if (!isIG || !CONFIG.igHideReelsInFeed) return;
    if ((location.pathname.replace(/\/+$/, '') || '/') !== '/') return;
    document.querySelectorAll('article').forEach(function (a) {
      if (a.dataset.doomblock) return;
      if (a.querySelector('video')) {
        a.dataset.doomblock = '1';
        a.style.setProperty('display', 'none', 'important');
      }
    });
  }

  let lastPath = null;

  function check() {
    ensureStyle();
    const v = verdict(location.pathname);
    if (v === 'redirect') {
      pauseAllMedia();
      location.replace(location.origin + '/');
      return;
    }
    if (v === 'block') {
      showOverlay();
      pauseAllMedia();
    } else if (location.pathname !== lastPath) {
      hideOverlay();
    }
    lastPath = location.pathname;
    hideIgFeedVideos();
  }

  // Natychmiastowe przekierowanie jeszcze przed załadowaniem strony.
  if (verdict(location.pathname) === 'redirect') {
    location.replace(location.origin + '/');
    return;
  }

  check();
  document.addEventListener('DOMContentLoaded', check);

  // Obie strony to SPA – URL zmienia się bez przeładowania, więc sprawdzamy cyklicznie
  // i przy zmianach DOM (pushState z izolowanego świata content scriptu nie da się podpiąć).
  setInterval(check, 400);
  window.addEventListener('popstate', check);
  const startObserver = function () {
    if (!document.documentElement) return;
    let scheduled = false;
    new MutationObserver(function () {
      if (scheduled) return;
      scheduled = true;
      setTimeout(function () { scheduled = false; check(); }, 150);
    }).observe(document.documentElement, { childList: true, subtree: true });
  };
  startObserver();

  // Eksport do testów (tylko gdy test o to poprosi).
  if (window.__doomblockTest) window.__doomblockVerdict = verdict;
})();
