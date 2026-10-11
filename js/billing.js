/*
 * billing.js — Полная бесплатная версия для личного пользования.
 * Все классы (1–4), предметы, редакции и страницы полностью разблокированы.
 * Подписка и пейволлы отключены.
 */
(function () {
  'use strict';

  var FREE_GRADES = [1, 2, 3, 4];

  function ensureStyles() {
    if (document.getElementById('billing-css')) return;
    var css = document.createElement('style');
    css.id = 'billing-css';
    css.textContent =
      '.premium-chip{display:inline-flex;align-items:center;gap:6px;margin-left:10px;padding:6px 14px;border-radius:999px;' +
      'border:1px solid rgba(46,125,50,.35);background:rgba(46,125,50,.08);' +
      'color:#2E7D32;font-weight:600;font-size:13px;cursor:default;white-space:nowrap;font-family:var(--font-ui,inherit)}' +
      '.premium-chip::before{content:"";width:7px;height:7px;border-radius:50%;background:#2E7D32;opacity:.9}' +
      '.grade-tab.locked::after{display:none !important}' +
      '.billing-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:10001;background:var(--ink-fill,#1C2433);color:var(--bg,#F5F0E6);' +
      'padding:11px 18px;border-radius:10px;font-size:13.5px;font-weight:500;box-shadow:0 12px 32px rgba(28,36,51,.2);animation:bfade .18s ease;max-width:88vw;text-align:center}' +
      '@keyframes bfade{from{opacity:0}to{opacity:1}}';
    document.head.appendChild(css);
  }

  function showToast(msg) {
    ensureStyles();
    var t = document.createElement('div');
    t.className = 'billing-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2500);
  }

  function updateChip() {
    var chip = document.getElementById('premiumChip');
    if (chip) {
      chip.innerHTML = 'Полный доступ (1–4 классы)';
      chip.title = 'Все материалы начальной школы открыты';
    }
    // Снимаем любые замки
    document.querySelectorAll('.grade-tab').forEach(function (btn) {
      btn.classList.remove('locked');
    });
  }

  function installChip() {
    var slot = document.getElementById('premiumChipSlot') || document.getElementById('gradeNav');
    if (!slot || document.getElementById('premiumChip')) return;
    var chip = document.createElement('button');
    chip.className = 'premium-chip';
    chip.id = 'premiumChip';
    chip.type = 'button';
    chip.title = 'Все материалы начальной школы открыты';
    chip.innerHTML = 'Полный доступ (1–4 классы)';
    chip.addEventListener('click', function () {
      showToast('Все учебники 1–4 классов полностью доступны!');
    });
    slot.appendChild(chip);
  }

  function init() {
    ensureStyles();
    installChip();
    updateChip();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Публичный API совместимости с app.js
  window.ReshebnikBilling = {
    openPaywall: function () {
      showToast('Все учебники 1–4 классов полностью доступны!');
    },
    isPremium: function () { return true; },
    canAccessGrade: function (grade) { return true; },
    sync: function () { return Promise.resolve(true); }
  };
})();
