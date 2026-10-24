/**
 * ShopSavvy Popup Script
 * Queries background for detected product, renders appropriate state.
 * Compare button is wired but hits a stub — Phase 2 wires the real endpoint.
 */

(async function () {
  'use strict';

  // ── DOM refs ─────────────────────────────────────────────────────────────────
  const states = {
    idle:     document.getElementById('state-idle'),
    detected: document.getElementById('state-detected'),
    loading:  document.getElementById('state-loading'),
    results:  document.getElementById('state-results'),
  };

  const detectedStore = document.getElementById('detected-store');
  const detectedName  = document.getElementById('detected-name');
  const detectedPrice = document.getElementById('detected-price');
  const btnCompare    = document.getElementById('btn-compare');
  const btnBack       = document.getElementById('btn-back');
  const resultsList   = document.getElementById('results-list');

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function showState(key) {
    Object.entries(states).forEach(([k, el]) => {
      el.classList.toggle('hidden', k !== key);
    });
  }

  function formatStore(hostname) {
    const map = {
      'ishopping.pk': 'iShopping',
      'paklap.pk':    'Paklap',
      'telemart.pk':  'Telemart',
    };
    return map[hostname] ?? hostname;
  }

  function formatPrice(raw) {
    if (!raw) return 'N/A';
    const num = parseFloat(raw);
    if (isNaN(num)) return raw;
    return 'PKR ' + num.toLocaleString('en-PK');
  }

  // ── Init ─────────────────────────────────────────────────────────────────────
  async function init() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) { showState('idle'); return; }

    const response = await chrome.runtime.sendMessage({ type: 'GET_PRODUCT', tabId: tab.id });
    const product  = response?.product ?? null;

    if (!product) {
      showState('idle');
      return;
    }

    detectedStore.textContent = formatStore(product.store);
    detectedName.textContent  = product.name  ?? 'Unknown product';
    detectedPrice.textContent = formatPrice(product.price);
    showState('detected');
  }

  // ── Compare button ───────────────────────────────────────────────────────────
  btnCompare.addEventListener('click', async () => {
    showState('loading');

    // TODO (Phase 2): replace with real backend call
    // const res = await fetch(`https://api.shopsavvy.pk/compare?name=${encodeURIComponent(productName)}`);
    // const data = await res.json();
    // renderResults(data.results);

    // Stub: show placeholder for now
    await new Promise(r => setTimeout(r, 800)); // fake latency
    renderResults([
      { store: 'Phase 2', price: 'Coming Oct 30' },
    ]);
  });

  function renderResults(results) {
    resultsList.innerHTML = results.map(r => `
      <li>
        <span class="r-store">${r.store}</span>
        <span class="r-price">${r.price}</span>
      </li>
    `).join('');
    showState('results');
  }

  btnBack.addEventListener('click', () => showState('detected'));

  // ── Go ───────────────────────────────────────────────────────────────────────
  init();
})();
