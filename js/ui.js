/* DOM 인터페이스: 상단 표시줄, 작업 칩, 의장 메모, 카드 */
(function (G) {
  'use strict';
  const TS = G.TS || (G.TS = {});
  const UI = (TS.UI = {});
  const $ = (id) => document.getElementById(id);

  const ICONS = {
    hull: '<svg viewBox="0 0 24 24"><path d="M3 13h18l-2.5 5H5.5z"/><path d="M6 13V9h12v4"/></svg>',
    mast: '<svg viewBox="0 0 24 24"><path d="M8 3v18"/><path d="M9 4c6 3 8 8 8 13H9"/></svg>',
    deck: '<svg viewBox="0 0 24 24"><path d="M3 15h18"/><path d="M5 11h14"/><path d="M7 7h10"/></svg>',
    flag: '<svg viewBox="0 0 24 24"><path d="M5 21V4"/><path d="M5 5c4-2 6 2 10 0s4 0 4 0v8s-1-2-4 0-6-2-10 0"/></svg>',
    oars: '<svg viewBox="0 0 24 24"><path d="M4 20L15 9"/><ellipse cx="17.5" cy="6.5" rx="3" ry="1.8" transform="rotate(-45 17.5 6.5)"/></svg>',
    helm: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6"/><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/></svg>',
    rail: '<svg viewBox="0 0 24 24"><path d="M3 8h18M5 8v10M10 8v10M14 8v10M19 8v10"/></svg>',
    ring: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/></svg>',
    cabin: '<svg viewBox="0 0 24 24"><path d="M4 10h16v9H4z"/><path d="M3 10l2-4h14l2 4"/><path d="M8 13h3v3H8zM13 13h3v3h-3z"/></svg>',
    anchor: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><path d="M12 7v13M8 10h8M5 14c0 4 3 6 7 6s7-2 7-6"/></svg>',
    bunting: '<svg viewBox="0 0 24 24"><path d="M2 6c6 4 14 4 20 0"/><path d="M5 8l2 6 2-5M11 9l1 6 2-6M16 8l2 6 1-6"/></svg>',
    lamp: '<svg viewBox="0 0 24 24"><path d="M12 2v3"/><path d="M8 7h8l-1 11H9z"/><path d="M7 20h10"/></svg>',
  };
  UI.ICONS = ICONS;

  const STATUS_TEXT = { working: '진행 중', blocked: '방해받는 중', lost: '이어 갈 수 없음', done: '완료' };

  UI.setHud = function (level) {
    $('hud').classList.remove('hidden');
    $('hud-no').textContent = `제${level.no}차 회의`;
    $('hud-name').textContent = level.title;
  };
  UI.hideHud = function () {
    $('hud').classList.add('hidden');
    $('chips').classList.add('hidden');
    $('memo').classList.add('hidden');
  };

  UI.placeChips = function (y) {
    $('chips').style.top = y + 'px';
  };

  UI.setChips = function (items) {
    const el = $('chips');
    el.classList.remove('hidden');
    const key = items.map((i) => i.id + i.status).join('|');
    if (el.dataset.key === key) return;
    el.dataset.key = key;
    el.innerHTML = items
      .map(
        (i) =>
          `<div class="chip ${i.status}"><span class="dot">${ICONS[i.part] || ''}</span><span>${i.name}</span><span class="st">${STATUS_TEXT[i.status] || ''}</span></div>`
      )
      .join('');
  };

  UI.memo = function (html, opts) {
    const m = $('memo');
    m.classList.remove('hidden');
    const t = $('memo-text');
    if (t.dataset.html !== html) {
      t.dataset.html = html;
      t.innerHTML = html;
      t.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'ease-out' });
    }
    if (opts && opts.retryPulse !== undefined) $('btn-retry').classList.toggle('pulse', !!opts.retryPulse);
    if (opts && opts.retryPrimary !== undefined) $('btn-retry').classList.toggle('primary', !!opts.retryPrimary);
  };
  UI.showHint = function (show) {
    $('btn-hint').classList.toggle('hidden', !show);
  };

  UI.card = function (html, opts) {
    const ov = $('overlay');
    ov.classList.remove('hidden');
    ov.classList.toggle('center', !!(opts && opts.center));
    $('card').innerHTML = html;
    // 애니메이션 재시작
    const c = $('card');
    c.style.animation = 'none';
    void c.offsetWidth;
    c.style.animation = '';
    return c;
  };
  UI.closeCard = function () {
    $('overlay').classList.add('hidden');
    $('card').innerHTML = '';
  };
  UI.cardOpen = () => !$('overlay').classList.contains('hidden');

  UI.titleScreen = function (show) {
    $('title-screen').classList.toggle('gone', !show);
  };

  UI.setMuted = function (m) {
    $('btn-sound').classList.toggle('muted', m);
  };

  /* 진행 저장 */
  UI.loadProgress = function () {
    try {
      const p = JSON.parse(localStorage.getItem('ts_progress') || '{}');
      return { cleared: p.cleared || [], best: p.best || {} };
    } catch (e) {
      return { cleared: [], best: {} };
    }
  };
  UI.saveProgress = function (p) {
    try {
      localStorage.setItem('ts_progress', JSON.stringify(p));
    } catch (e) {
      /* 무시 */
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
