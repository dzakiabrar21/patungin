/**
 * PatungIn Finance — web client styled after the Stash Android app.
 * Views: Beranda, Dompet (+ detail), Analitik, Pengaturan. Same API as before.
 */

// Skip the ngrok browser warning on every API call
if (typeof window !== 'undefined' && window.fetch) {
  const originalFetch = window.fetch;
  window.fetch = function (url, options = {}) {
    options = options || {};
    options.headers = options.headers || {};
    if (options.headers instanceof Headers) options.headers.set('ngrok-skip-browser-warning', '1');
    else options.headers['ngrok-skip-browser-warning'] = '1';
    return originalFetch(url, options);
  };
}

// ---------------------------------------------------------------- state
const PAGE_SIZE = 30;

const state = {
  currentMonth: monthKey(new Date()),
  currentType: 'all',
  currentAccount: 'all',
  currentSearch: '',
  accounts: [],
  categories: [],
  overview: null,
  txRows: [],
  txTotal: 0,
  view: 'beranda',
  walletDetailId: null,
  walletRows: [],
  walletTotal: 0,
  touchedSlice: -1
};

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- formatters
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}
function isCurrentMonth(key) {
  return key >= monthKey(new Date());
}

const numberFmt = new Intl.NumberFormat('id-ID');
const compactFmt = new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 });

/** "Rp 25.000" / "-Rp 25.000" */
function rp(n) {
  const v = Math.round(Number(n) || 0);
  return (v < 0 ? '-' : '') + 'Rp ' + numberFmt.format(Math.abs(v));
}
/** "+Rp 25.000" / "-Rp 25.000" (zero unsigned) */
function rpSigned(n) {
  const v = Math.round(Number(n) || 0);
  return v > 0 ? '+' + rp(v) : rp(v);
}
function formatNumber(n) {
  return numberFmt.format(n);
}

function toDate(str) {
  if (!str) return null;
  const d = new Date(String(str).includes('T') || String(str).length <= 10 ? str : String(str).replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
}
function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dayLabel(d) {
  const today = new Date();
  const yest = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (dayKey(d) === dayKey(today)) return 'Hari ini';
  if (dayKey(d) === dayKey(yest)) return 'Kemarin';
  if (d.getFullYear() === today.getFullYear()) {
    return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' });
  }
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Like Flutter's FittedBox(scaleDown): shrink the font until the text fits its box. */
function fitText(el, minPx = 10) {
  if (!el) return;
  el.style.fontSize = '';
  let size = parseFloat(getComputedStyle(el).fontSize);
  while (el.scrollWidth > el.clientWidth + 0.5 && size > minPx) {
    size -= 0.5;
    el.style.fontSize = `${size}px`;
  }
}
const FIT_IDS = ['hero-total-balance', 'hero-total-income', 'hero-total-expense', 'an-income', 'an-expense', 'an-net', 'wallets-total', 'wallet-detail-balance'];
function fitAll() {
  FIT_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el && el.offsetParent !== null) fitText(el);
  });
}
window.addEventListener('resize', () => setTimeout(fitAll, 0));

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------------------------------------------------------- visuals (Stash categories & wallets)
const CATEGORY_VISUALS = {
  cat_food: ['restaurant', '#EF6C00'],
  cat_snack_drink: ['local_cafe', '#FFA000'],
  cat_hangout: ['coffee', '#8D6E63'],
  cat_air_minum: ['water_drop', '#039BE5'],
  cat_buah: ['nutrition', '#7CB342'],
  cat_belanja: ['local_grocery_store', '#43A047'],
  cat_groceries: ['local_grocery_store', '#43A047'],
  cat_pasar: ['storefront', '#558B2F'],
  cat_shopping: ['shopping_bag', '#D81B60'],
  cat_apparel: ['checkroom', '#AD1457'],
  cat_beauty: ['spa', '#EC407A'],
  cat_transport: ['directions_car', '#1E88E5'],
  cat_bensin: ['local_gas_station', '#1565C0'],
  cat_kereta: ['train', '#0288D1'],
  cat_parkir: ['local_parking', '#5C6BC0'],
  cat_motor_services: ['two_wheeler', '#283593'],
  cat_bills: ['receipt_long', '#6D4C41'],
  cat_listrik: ['bolt', '#F9A825'],
  cat_internet: ['wifi', '#00ACC1'],
  cat_hiburan: ['sports_esports', '#8E24AA'],
  cat_social_life: ['groups', '#AB47BC'],
  cat_health: ['self_improvement', '#E53935'],
  cat_obat_herbal: ['medication', '#C62828'],
  cat_education: ['school', '#3949AB'],
  cat_it_project: ['computer', '#00897B'],
  cat_tabungan: ['savings', '#2E7D32'],
  cat_laundry: ['local_laundry_service', '#546E7A'],
  cat_barber: ['content_cut', '#795548'],
  cat_household: ['chair', '#A1887F'],
  cat_darurat: ['emergency', '#D32F2F'],
  cat_other_expense: ['more_horiz', '#757575'],
  cat_salary: ['work', '#2E7D32'],
  cat_transfer: ['swap_horiz', '#546E7A']
};
const CATEGORY_KEYWORDS = [
  [/makan|food|resto|kuliner/, 'restaurant', '#EF6C00'],
  [/minum|kopi|coffee|snack|jajan/, 'local_cafe', '#FFA000'],
  [/transport|ojek|grab|gojek|bensin|bbm|tol/, 'directions_car', '#1E88E5'],
  [/belanja|shop|market|groceries/, 'shopping_bag', '#D81B60'],
  [/tagihan|bill|listrik|pln|langganan/, 'receipt_long', '#6D4C41'],
  [/hiburan|game|film|movie/, 'movie', '#8E24AA'],
  [/sehat|health|obat|dokter/, 'medical_services', '#E53935'],
  [/didik|sekolah|kuliah|buku|course/, 'school', '#3949AB'],
  [/gaji|salary|bonus|pemasukan|income/, 'work', '#2E7D32'],
  [/invest|saham|tabung/, 'trending_up', '#00897B'],
  [/hadiah|gift/, 'redeem', '#D81B60']
];
const FALLBACK_COLORS = ['#EF6C00', '#43A047', '#1E88E5', '#D81B60', '#6D4C41', '#8E24AA', '#E53935', '#3949AB', '#00897B', '#F9A825'];

function hashIndex(str, mod) {
  let h = 0;
  for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % mod;
}

function catVisual(id, name, type) {
  if (type === 'transfer' || id === 'cat_transfer') return { icon: 'swap_horiz', color: '#546E7A' };
  if (id && CATEGORY_VISUALS[id]) {
    const [icon, color] = CATEGORY_VISUALS[id];
    return { icon, color };
  }
  const key = String(name || '').toLowerCase();
  for (const [re, icon, color] of CATEGORY_KEYWORDS) {
    if (re.test(key)) return { icon, color };
  }
  if (type === 'income') return { icon: 'payments', color: '#2E7D32' };
  return { icon: 'sell', color: FALLBACK_COLORS[hashIndex(id || name, FALLBACK_COLORS.length)] };
}

const WALLET_BRANDS = [
  [/bca/, '#0060AF'],
  [/mandiri/, '#003D79'],
  [/jago/, '#F2A900'],
  [/bsi|syariah/, '#00A39E'],
  [/seabank/, '#FF5A00'],
  [/gopay/, '#00AED6'],
  [/ovo/, '#4C2A86'],
  [/dana/, '#118EEA'],
  [/shopee/, '#EE4D2D'],
  [/stockbit|rdn|bibit|ajaib/, '#1E9E5A'],
  [/tunai|cash/, '#2E7D32'],
  [/bank ?accounts?/, '#0284C7']
];
const WALLET_COLORS = ['#0060AF', '#003D79', '#F2A900', '#00AED6', '#4C2A86', '#2E7D32', '#D81B60', '#EF6C00', '#546E7A'];
const WALLET_KINDS = {
  bank: { icon: 'account_balance', label: 'Rekening bank' },
  ewallet: { icon: 'phone_android', label: 'E-Wallet' },
  cash: { icon: 'payments', label: 'Tunai' },
  investment: { icon: 'trending_up', label: 'Investasi' }
};

function walletVisual(acc) {
  const name = String(acc?.name || '').toLowerCase();
  let color = null;
  for (const [re, c] of WALLET_BRANDS) {
    if (re.test(name)) { color = c; break; }
  }
  if (!color) color = WALLET_COLORS[hashIndex(name, WALLET_COLORS.length)];
  const kind = WALLET_KINDS[acc?.type] || WALLET_KINDS.bank;
  return { color, icon: kind.icon, kindLabel: kind.label };
}

function walletAvatar(acc, size = 40) {
  const v = walletVisual(acc);
  return `<span class="wallet-avatar" style="width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.34)}px;background:${v.color}24;color:${v.color}"><span class="ms" style="font-size:${Math.round(size * 0.52)}px">${v.icon}</span></span>`;
}

function accountById(id) {
  return state.accounts.find((a) => a.id === id) || null;
}

// ---------------------------------------------------------------- feedback UI
let toastTimer;
function showToast(message, isError = false) {
  const el = $('fin-toast');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('error', !!isError);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

const openStack = [];
function openSheet(id) {
  const el = $(id);
  if (!el) return;
  el.classList.add('active');
  if (!openStack.includes(id)) openStack.push(id);
  document.body.style.overflow = 'hidden';
}
function closeSheet(id) {
  const el = $(id);
  if (!el) return;
  el.classList.remove('active');
  const i = openStack.indexOf(id);
  if (i >= 0) openStack.splice(i, 1);
  if (openStack.length === 0) document.body.style.overflow = '';
  el.dispatchEvent(new CustomEvent('sheet-closed'));
}

function setupSheets() {
  document.querySelectorAll('.sheet-backdrop').forEach((bd) => {
    bd.addEventListener('click', (e) => {
      if (e.target === bd) closeSheet(bd.id);
    });
    bd.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closeSheet(bd.id)));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openStack.length) {
      const top = openStack[openStack.length - 1];
      if (top === 'modal-confirm') $('confirm-cancel').click();
      else if (top === 'modal-prompt') $('prompt-cancel').click();
      else closeSheet(top);
    }
  });
}

function confirmDialog({ title, text, okLabel = 'Hapus' }) {
  return new Promise((resolve) => {
    $('confirm-title').textContent = title;
    $('confirm-text').textContent = text;
    $('confirm-ok').textContent = okLabel;
    const done = (v) => {
      closeSheet('modal-confirm');
      $('confirm-ok').onclick = null;
      $('confirm-cancel').onclick = null;
      resolve(v);
    };
    $('confirm-ok').onclick = () => done(true);
    $('confirm-cancel').onclick = () => done(false);
    openSheet('modal-confirm');
  });
}

function promptDialog({ title, value = '' }) {
  return new Promise((resolve) => {
    $('prompt-title').textContent = title;
    const input = $('prompt-input');
    input.value = value;
    const form = $('prompt-form');
    const done = (v) => {
      closeSheet('modal-prompt');
      form.onsubmit = null;
      $('prompt-cancel').onclick = null;
      resolve(v);
    };
    form.onsubmit = (e) => { e.preventDefault(); done(input.value.trim()); };
    $('prompt-cancel').onclick = () => done(null);
    openSheet('modal-prompt');
    setTimeout(() => input.focus(), 50);
  });
}

function emptyState(icon, title, message = '') {
  return `<div class="empty-state"><div class="empty-icon"><span class="ms">${icon}</span></div><div class="empty-title">${esc(title)}</div>${message ? `<div class="empty-msg">${esc(message)}</div>` : ''}</div>`;
}
const LOADING = '<div class="loading-row"><div class="spinner"></div></div>';

async function api(url, options) {
  const res = await fetch(url, options);
  let data;
  try { data = await res.json(); } catch (_) { throw new Error(`Server mengembalikan respons tidak valid (${res.status})`); }
  if (!data.success) throw new Error(data.error || data.message || 'Permintaan gagal');
  return data;
}

// ---------------------------------------------------------------- init
document.addEventListener('DOMContentLoaded', async () => {
  setupSheets();
  setupRouting();
  setupActions();
  setupMonthControls();
  setupQuickInput();
  setupTxFilters();
  setupAddTransaction();
  setupWalletForm();
  setupWalletDetail();
  setupScan();
  setupSettings();
  setupImportModal();
  setupGoogleSheetModal();
  setupShortcutsModal();

  updateMonthLabels();
  await loadCategories();
  await refreshDashboard();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.log('[PWA] SW registration failed:', err));
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get('action') === 'add' || window.location.hash === '#catat') {
    setTimeout(() => openAddSheet(), 300);
  }
});

async function refreshDashboard() {
  await Promise.all([loadOverview(), loadTransactions(true)]);
  if (state.walletDetailId) loadWalletDetail(true);
}

// ---------------------------------------------------------------- routing
const VIEWS = ['beranda', 'dompet', 'analitik', 'pengaturan'];

function setupRouting() {
  window.addEventListener('hashchange', applyRoute);
  applyRoute();
}

function applyRoute() {
  let view = (window.location.hash || '#beranda').slice(1);
  if (view === 'catat') view = 'beranda';
  if (!VIEWS.includes(view)) view = 'beranda';
  const changed = view !== state.view;
  state.view = view;
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.dataset.view !== view; });
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === view));
  document.body.classList.toggle('fab-visible', view === 'beranda' || view === 'dompet');
  if (view !== 'dompet') showWalletList();
  if (changed) window.scrollTo({ top: 0 });
  setTimeout(fitAll, 0);
}

function go(view) {
  if (window.location.hash !== `#${view}`) window.location.hash = view;
  else applyRoute();
}

function setupActions() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if (action === 'add') {
      openAddSheet({ walletId: state.view === 'dompet' ? state.walletDetailId : null });
    } else if (action === 'transfer') {
      if (state.accounts.length < 2) return showToast('Butuh minimal dua dompet untuk transfer.');
      openAddSheet({ type: 'transfer' });
    } else if (action === 'scan') {
      if ($('modal-add-tx').classList.contains('active')) closeSheet('modal-add-tx');
      $('scan-file-input').click();
    } else if (action === 'export') {
      doExport();
    } else if (action === 'add-wallet') {
      openWalletForm();
    } else if (action === 'wallets-manage') {
      go('dompet');
    }
  });
}

// ---------------------------------------------------------------- month
function setupMonthControls() {
  const shift = (d) => {
    const next = shiftMonth(state.currentMonth, d);
    if (d > 0 && next > monthKey(new Date())) return;
    state.currentMonth = next;
    state.touchedSlice = -1;
    updateMonthLabels();
    refreshDashboard();
  };
  $('btn-month-prev').addEventListener('click', () => shift(-1));
  $('btn-month-next').addEventListener('click', () => shift(1));
  $('btn-an-prev').addEventListener('click', () => shift(-1));
  $('btn-an-next').addEventListener('click', () => shift(1));
}

function updateMonthLabels() {
  const label = monthLabel(state.currentMonth);
  $('month-display').textContent = label;
  $('an-month-display').textContent = label;
  const atNow = isCurrentMonth(state.currentMonth);
  $('btn-month-next').disabled = atNow;
  $('btn-an-next').disabled = atNow;
}

// ---------------------------------------------------------------- overview
async function loadOverview() {
  try {
    const data = await api(`/api/finance/overview?month=${state.currentMonth}`);
    state.overview = data;
    state.accounts = data.accounts || [];

    $('hero-total-balance').textContent = rp(data.totalBalance);
    $('hero-total-income').textContent = rp(data.totalIncome);
    $('hero-total-expense').textContent = rp(data.totalExpense);

    renderWalletStrip();
    renderWalletList();
    renderAnalytics();
    setTimeout(fitAll, 0);
  } catch (err) {
    console.error('Failed to load finance overview:', err);
    showToast('Gagal memuat ringkasan: ' + err.message, true);
  }
}

function renderWalletStrip() {
  const el = $('wallets-container');
  if (!state.accounts.length) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = state.accounts.map((a) => `
    <button type="button" class="stash-card wallet-chip ${state.currentAccount === a.id ? 'active' : ''}" data-wallet="${esc(a.id)}" title="Tampilkan transaksi ${esc(a.name)}">
      ${walletAvatar(a, 38)}
      <span>
        <div class="wallet-chip-name">${esc(a.name)}</div>
        <div class="wallet-chip-bal ${a.balance < 0 ? 'neg' : ''}">${rp(a.balance)}</div>
      </span>
    </button>`).join('');
  el.querySelectorAll('[data-wallet]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.wallet;
    state.currentAccount = state.currentAccount === id ? 'all' : id;
    renderWalletStrip();
    renderActiveWalletFilter();
    loadTransactions(true);
  }));
}

function renderActiveWalletFilter() {
  const box = $('active-wallet-filter');
  const acc = state.currentAccount !== 'all' ? accountById(state.currentAccount) : null;
  if (!acc) {
    box.innerHTML = '';
    return;
  }
  box.innerHTML = `<button type="button" class="chip active removable" id="btn-clear-wallet-filter"><span class="ms">account_balance_wallet</span>${esc(acc.name)}<span class="ms">close</span></button>`;
  $('btn-clear-wallet-filter').addEventListener('click', () => {
    state.currentAccount = 'all';
    renderWalletStrip();
    renderActiveWalletFilter();
    loadTransactions(true);
  });
}

function renderWalletList() {
  $('wallets-total').textContent = rp(state.overview?.totalBalance || 0);
  const el = $('wallets-full-list');
  if (!state.accounts.length) {
    el.innerHTML = emptyState('account_balance_wallet', 'Belum ada dompet', 'Tambahkan rekening, e-wallet, atau uang tunai.');
    return;
  }
  el.innerHTML = state.accounts.map((a) => {
    const v = walletVisual(a);
    return `
      <button type="button" class="stash-card wallet-row" data-wallet="${esc(a.id)}">
        ${walletAvatar(a, 40)}
        <span class="wallet-row-text">
          <div class="wallet-row-name">${esc(a.name)}</div>
          <div class="wallet-row-kind">${v.kindLabel}</div>
        </span>
        <span class="wallet-row-bal ${a.balance < 0 ? 'neg' : ''}">${rp(a.balance)}</span>
      </button>`;
  }).join('');
  el.querySelectorAll('[data-wallet]').forEach((b) => b.addEventListener('click', () => openWalletDetail(b.dataset.wallet)));
}

// ---------------------------------------------------------------- transactions
function setupTxFilters() {
  document.querySelectorAll('#tx-type-filter .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#tx-type-filter .chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      state.currentType = chip.dataset.type;
      loadTransactions(true);
    });
  });

  let t;
  $('tx-search-input').addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(() => {
      state.currentSearch = e.target.value.trim();
      loadTransactions(true);
    }, 300);
  });

  $('btn-load-more').addEventListener('click', () => loadTransactions(false));
}

let txRequestId = 0;
async function loadTransactions(reset) {
  const list = $('transactions-list');
  const more = $('btn-load-more');
  const reqId = ++txRequestId;
  if (reset) {
    state.txRows = [];
    list.innerHTML = LOADING;
    more.hidden = true;
  } else {
    more.disabled = true;
  }

  const params = new URLSearchParams({ month: state.currentMonth, limit: String(PAGE_SIZE), offset: String(state.txRows.length) });
  if (state.currentType !== 'all') params.append('type', state.currentType);
  if (state.currentAccount !== 'all') params.append('accountId', state.currentAccount);
  if (state.currentSearch) params.append('search', state.currentSearch);

  try {
    const data = await api(`/api/finance/transactions?${params}`);
    if (reqId !== txRequestId) return;
    state.txRows = state.txRows.concat(data.transactions || []);
    state.txTotal = Number(data.total) || state.txRows.length;

    if (!state.txRows.length) {
      const filtered = state.currentType !== 'all' || state.currentAccount !== 'all' || state.currentSearch;
      list.innerHTML = filtered
        ? emptyState('filter_alt_off', 'Tidak ada transaksi', 'Coba ubah filter atau kata pencarian.')
        : emptyState('receipt_long', 'Belum ada transaksi', 'Tekan tombol + untuk mencatat, atau pindai struk belanja.');
    } else {
      list.innerHTML = buildTransactionList(state.txRows);
      bindTxTiles(list, state.txRows);
    }
    more.hidden = state.txRows.length >= state.txTotal;
  } catch (err) {
    if (reqId !== txRequestId) return;
    console.error('Failed to load transactions:', err);
    list.innerHTML = emptyState('error', 'Gagal memuat transaksi', err.message);
  } finally {
    more.disabled = false;
  }
}

/** Signed effect of a transaction; with walletId, transfers are signed from that wallet's side. */
function txEffect(tx, walletId = null) {
  const amt = Number(tx.amount) || 0;
  if (walletId) {
    if (tx.type === 'transfer') {
      if (tx.to_account_id === walletId) return amt;
      if (tx.account_id === walletId) return -amt;
      return 0;
    }
  }
  if (tx.type === 'income') return amt;
  if (tx.type === 'expense') return -amt;
  return 0;
}

function buildTransactionList(rows, walletId = null) {
  let html = '';
  let currentDay = null;
  rows.forEach((tx, i) => {
    const d = toDate(tx.transaction_date) || new Date(0);
    const key = dayKey(d);
    if (key !== currentDay) {
      currentDay = key;
      let net = 0;
      for (let j = i; j < rows.length; j++) {
        const dj = toDate(rows[j].transaction_date) || new Date(0);
        if (dayKey(dj) !== key) break;
        net += txEffect(rows[j], walletId);
      }
      html += `<div class="day-header"><span>${esc(dayLabel(d))}</span>${net !== 0 ? `<span>${rpSigned(net)}</span>` : ''}</div>`;
    }
    html += txTile(tx, i, walletId);
  });
  return html;
}

function txPresentation(tx, walletId = null) {
  const isTransfer = tx.type === 'transfer';
  const vis = catVisual(tx.category_id, tx.category_name, tx.type);
  const catLabel = isTransfer ? 'Transfer' : (tx.category_name || 'Lainnya');
  const title = isTransfer ? 'Transfer' : (tx.merchant && tx.merchant.trim() ? tx.merchant : catLabel);
  const walletText = isTransfer
    ? `${tx.account_name || '?'} → ${tx.to_account_name || '?'}`
    : (tx.account_name || '?');
  const sub = [];
  if (!isTransfer && title !== catLabel) sub.push(catLabel);
  sub.push(walletText);
  const note = (tx.description || '').trim();
  if (note && note !== title && note !== tx.merchant && note !== 'Transaksi Manual') sub.push(note);

  const signed = txEffect(tx, walletId);
  let cls; let text;
  if (isTransfer && !walletId) { cls = 'transfer'; text = rp(tx.amount); }
  else if (signed > 0) { cls = 'income'; text = rpSigned(signed); }
  else if (signed < 0) { cls = 'expense'; text = rp(signed); }
  else { cls = ''; text = rp(tx.amount); }

  return { vis, title, catLabel, walletText, sub: sub.join(' · '), cls, text };
}

function txTile(tx, index, walletId) {
  const p = txPresentation(tx, walletId);
  return `
    <button type="button" class="tx-tile" data-index="${index}">
      <span class="tx-icon" style="background:${p.vis.color}21;color:${p.vis.color}"><span class="ms">${p.vis.icon}</span></span>
      <span class="tx-text">
        <div class="tx-title">${esc(p.title)}</div>
        <div class="tx-sub">${esc(p.sub)}</div>
      </span>
      <span class="tx-amount ${p.cls}">${p.text}</span>
    </button>`;
}

function bindTxTiles(container, rows, walletId = null) {
  container.querySelectorAll('.tx-tile').forEach((tile) => {
    tile.addEventListener('click', () => openTxDetail(rows[Number(tile.dataset.index)], walletId));
  });
}

const SOURCE_LABELS = {
  manual_web: 'Web', web_manual: 'Web', web: 'Web', wa_dm: 'WhatsApp', wa_image: 'WhatsApp (struk)', wa_vn: 'WhatsApp (suara)',
  shortcut: 'Pintasan', shortcut_image: 'Scan struk', import: 'Import mutasi', web_quick: 'Catat cepat'
};

function openTxDetail(tx, walletId = null) {
  if (!tx) return;
  const p = txPresentation(tx, walletId);
  const d = toDate(tx.transaction_date);
  const typeLabel = { expense: 'Pengeluaran', income: 'Pemasukan', transfer: 'Transfer' }[tx.type] || tx.type;
  const rows = [
    ['Jenis', typeLabel],
    tx.type === 'transfer' ? ['Dompet', p.walletText] : ['Dompet', tx.account_name || '-'],
    tx.type !== 'transfer' ? ['Kategori', p.catLabel] : null,
    tx.merchant && tx.type !== 'transfer' ? ['Merchant', tx.merchant] : null,
    tx.description && tx.description !== tx.merchant && tx.description !== 'Transaksi Manual' ? ['Catatan', tx.description] : null,
    d ? ['Tanggal', d.toLocaleString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })] : null,
    tx.source ? ['Sumber', SOURCE_LABELS[tx.source] || tx.source] : null
  ].filter(Boolean);

  $('tx-detail-body').innerHTML = `
    <div class="detail-head">
      <span class="tx-icon" style="background:${p.vis.color}21;color:${p.vis.color}"><span class="ms">${p.vis.icon}</span></span>
      <div class="detail-title">${esc(p.title)}</div>
      <div class="detail-amount tx-amount ${p.cls}">${p.text}</div>
    </div>
    <div class="stash-card detail-list">
      ${rows.map(([k, v]) => `<div class="detail-row"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}
    </div>
    <button type="button" class="btn-outlined btn-block" id="btn-delete-tx" style="color:var(--expense)"><span class="ms">delete</span>Hapus transaksi</button>`;

  $('btn-delete-tx').addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Hapus transaksi?', text: 'Transaksi ini akan dihapus permanen dan saldo dompet dikembalikan.' });
    if (!ok) return;
    try {
      await api(`/api/finance/transactions/${encodeURIComponent(tx.id)}`, { method: 'DELETE' });
      closeSheet('modal-tx-detail');
      showToast('Transaksi dihapus');
      await refreshDashboard();
    } catch (err) {
      showToast('Gagal menghapus: ' + err.message, true);
    }
  });
  openSheet('modal-tx-detail');
}

// ---------------------------------------------------------------- quick text input
function setupQuickInput() {
  const form = $('fin-quick-form');
  const input = $('fin-quick-input');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return input.focus();
    input.disabled = true;
    form.classList.add('busy');
    $('btn-quick-submit').innerHTML = '<span class="ms">progress_activity</span>';
    try {
      const data = await api('/api/finance/quick-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      input.value = '';
      showToast(`Tercatat ${rp(data.transaction.amount)} · ${data.transaction.category}`);
      await refreshDashboard();
    } catch (err) {
      showToast(err.message || 'Gagal mengenali transaksi.', true);
    } finally {
      input.disabled = false;
      form.classList.remove('busy');
      $('btn-quick-submit').innerHTML = '<span class="ms">arrow_upward</span>';
      input.focus();
    }
  });
}

// ---------------------------------------------------------------- categories
async function loadCategories() {
  try {
    const data = await api('/api/finance/categories');
    state.categories = data.categories || [];
  } catch (err) {
    console.warn('Error loading categories:', err);
  }
}

// Everyday categories first, in the Stash order; the rest stay alphabetical.
const CATEGORY_ORDER = ['cat_food', 'cat_snack_drink', 'cat_belanja', 'cat_groceries', 'cat_transport', 'cat_shopping', 'cat_bills', 'cat_hiburan', 'cat_health', 'cat_education'];

function categoriesFor(type) {
  if (type === 'transfer') return [];
  let list = state.categories.filter((c) => c.type === type);
  if (!list.length) list = state.categories.filter((c) => c.type !== 'transfer');
  const rank = (c) => {
    const i = CATEGORY_ORDER.indexOf(c.id);
    if (i >= 0) return i;
    return /lain|other/i.test(c.id + c.name) ? 999 : 100;
  };
  return list.slice().sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'id'));
}

// ---------------------------------------------------------------- amount expression (Stash numpad)
const OPS = ['+', '−', '×', '÷'];
const MAX_DIGITS = 12;

const amount = {
  raw: '',
  current() {
    let i = this.raw.length;
    while (i > 0 && !OPS.includes(this.raw[i - 1])) i--;
    return this.raw.slice(i);
  },
  appendDigits(digits) {
    const cur = this.current();
    const allZeros = /^0+$/.test(digits);
    if (allZeros && digits.length > 1 && (cur === '' || cur === '0')) return;
    if (cur === '0') {
      this.raw = this.raw.slice(0, -1);
      if (digits === '0') { this.raw += '0'; return; }
    }
    if (cur.length + digits.length > MAX_DIGITS) return;
    this.raw += digits;
  },
  appendOperator(op) {
    if (!this.raw) return;
    if (OPS.includes(this.raw[this.raw.length - 1])) this.raw = this.raw.slice(0, -1) + op;
    else this.raw += op;
  },
  backspace() { this.raw = this.raw.slice(0, -1); },
  clear() { this.raw = ''; },
  hasOperator() { return OPS.some((o) => this.raw.includes(o)); },
  value() { return evaluateExpression(this.raw); },
  resolve() {
    const v = this.value();
    this.raw = v == null || v <= 0 ? '' : String(v);
  },
  display() {
    if (!this.raw) return '0';
    return this.raw.replace(/\d+/g, (n) => formatNumber(Number(n))).replace(/([+−×÷])/g, ' $1 ');
  }
};

/** Evaluates "25000+3500×2" with normal precedence; rounds to whole Rupiah. */
function evaluateExpression(raw) {
  if (!raw) return null;
  let s = raw;
  while (s && OPS.includes(s[s.length - 1])) s = s.slice(0, -1);
  if (!s) return null;
  const tokens = s.match(/\d+|[+−×÷]/g);
  if (!tokens) return null;
  // first pass: × ÷
  const terms = [Number(tokens[0])];
  const addOps = [];
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const n = Number(tokens[i + 1]);
    if (op === '×') terms[terms.length - 1] *= n;
    else if (op === '÷') {
      if (n === 0) return null;
      terms[terms.length - 1] /= n;
    } else {
      addOps.push(op);
      terms.push(n);
    }
  }
  let total = terms[0];
  addOps.forEach((op, i) => { total = op === '+' ? total + terms[i + 1] : total - terms[i + 1]; });
  if (!isFinite(total)) return null;
  return Math.round(total);
}

// ---------------------------------------------------------------- add transaction sheet
const addState = {
  type: 'expense',
  walletId: null,
  toWalletId: null,
  categoryByType: { expense: null, income: null },
  saving: false
};

function defaultWalletId() {
  const last = localStorage.getItem('patungin_last_wallet');
  if (last && accountById(last)) return last;
  return state.accounts[0]?.id || null;
}
function firstOtherWallet(id) {
  return state.accounts.find((a) => a.id !== id)?.id || null;
}

function openAddSheet({ type = 'expense', walletId = null } = {}) {
  if (!state.accounts.length) {
    showToast('Tambahkan dompet dulu sebelum mencatat.');
    go('dompet');
    return;
  }
  amount.clear();
  addState.type = type;
  addState.walletId = walletId && accountById(walletId) ? walletId : defaultWalletId();
  addState.toWalletId = firstOtherWallet(addState.walletId);
  addState.saving = false;
  $('tx-modal-merchant').value = '';
  $('tx-modal-desc').value = '';
  $('tx-modal-date').value = dayKey(new Date());
  renderAddSheet();
  openSheet('modal-add-tx');
}

function renderAddSheet() {
  const t = addState.type;
  document.querySelectorAll('#tx-type-tabs .type-tab').forEach((b) => b.classList.toggle('active', b.dataset.val === t));

  // amount
  const color = { expense: 'var(--expense)', income: 'var(--income)', transfer: 'var(--transfer)' }[t];
  const disp = $('amount-display');
  disp.style.color = color;
  const shown = amount.display();
  $('amount-text').textContent = shown;
  disp.classList.toggle('long', shown.length > 14);
  const v = amount.value();
  $('amount-preview').textContent = amount.hasOperator() && v != null ? `= ${rp(v)}` : '';

  // wallet chips
  const w = accountById(addState.walletId);
  const tw = accountById(addState.toWalletId);
  $('chip-wallet').querySelector('.ms').textContent = walletVisual(w).icon;
  $('chip-wallet-label').textContent = t === 'transfer' ? `Dari: ${w?.name || 'Pilih'}` : (w?.name || 'Pilih dompet');
  $('chip-to-wallet').hidden = t !== 'transfer';
  $('chip-to-wallet-label').textContent = `Ke: ${tw?.name || 'Pilih'}`;

  // date
  const dv = $('tx-modal-date').value;
  const dd = dv ? new Date(`${dv}T00:00:00`) : new Date();
  const today = new Date();
  const yest = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  $('chip-date-label').textContent = dayKey(dd) === dayKey(today) || dayKey(dd) === dayKey(yest)
    ? dayLabel(dd)
    : dd.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

  // categories
  const chipsEl = $('category-chips');
  $('btn-add-scan').hidden = t === 'transfer';
  $('merchant-field').hidden = t !== 'expense';
  if (t === 'transfer') {
    chipsEl.innerHTML = '';
    chipsEl.hidden = true;
  } else {
    chipsEl.hidden = false;
    const cats = categoriesFor(t);
    let sel = addState.categoryByType[t];
    if (!cats.some((c) => c.id === sel)) sel = addState.categoryByType[t] = cats[0]?.id || null;
    chipsEl.innerHTML = cats.map((c) => {
      const vis = catVisual(c.id, c.name, c.type);
      return `<button type="button" class="chip ${c.id === sel ? 'active' : ''}" data-cat="${esc(c.id)}"><span class="ms" style="color:${vis.color}">${vis.icon}</span>${esc(c.name)}</button>`;
    }).join('');
  }
}

function setupAddTransaction() {
  document.querySelectorAll('#tx-type-tabs .type-tab').forEach((b) => b.addEventListener('click', () => {
    addState.type = b.dataset.val;
    if (addState.type === 'transfer' && (!addState.toWalletId || addState.toWalletId === addState.walletId)) {
      addState.toWalletId = firstOtherWallet(addState.walletId);
    }
    renderAddSheet();
  }));

  $('category-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-cat]');
    if (!chip) return;
    addState.categoryByType[addState.type] = chip.dataset.cat;
    renderAddSheet();
  });

  $('chip-wallet').addEventListener('click', async () => {
    const id = await pickWallet({ title: addState.type === 'transfer' ? 'Dari dompet' : 'Dompet', selected: addState.walletId });
    if (!id) return;
    addState.walletId = id;
    if (addState.toWalletId === id) addState.toWalletId = firstOtherWallet(id);
    renderAddSheet();
  });
  $('chip-to-wallet').addEventListener('click', async () => {
    const id = await pickWallet({ title: 'Ke dompet', selected: addState.toWalletId, exclude: addState.walletId });
    if (!id) return;
    addState.toWalletId = id;
    renderAddSheet();
  });
  $('tx-modal-date').addEventListener('change', renderAddSheet);
  $('tx-modal-date').max = dayKey(new Date(Date.now() + 365 * 864e5));

  $('numpad').addEventListener('click', (e) => {
    const key = e.target.closest('[data-key]');
    if (!key) return;
    pressKey(key.dataset.key);
  });

  // Physical keyboard for the numpad when the sheet is open and no text field is focused
  document.addEventListener('keydown', (e) => {
    if (!$('modal-add-tx').classList.contains('active') || openStack[openStack.length - 1] !== 'modal-add-tx') return;
    const tag = document.activeElement?.tagName;
    if ((tag === 'INPUT' && document.activeElement.type !== 'date') || tag === 'TEXTAREA') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const map = { '+': '+', '-': '−', '*': '×', 'x': '×', '/': '÷', 'Backspace': 'back', 'Delete': 'C', '=': '=' };
    if (/^[0-9]$/.test(e.key)) { pressKey(e.key); e.preventDefault(); }
    else if (map[e.key]) { pressKey(map[e.key]); e.preventDefault(); }
    else if (e.key === 'Enter') { e.preventDefault(); saveTransaction(); }
  });

  $('form-add-tx').addEventListener('submit', (e) => {
    e.preventDefault();
    saveTransaction();
  });
}

function pressKey(k) {
  if (k === 'C') amount.clear();
  else if (k === 'back') amount.backspace();
  else if (k === '=') amount.resolve();
  else if (OPS.includes(k)) amount.appendOperator(k);
  else amount.appendDigits(k);
  if (navigator.vibrate) navigator.vibrate(4);
  renderAddSheet();
}

/** "2026-11-19" + the current local time, as ISO (matches how the bot stores dates). */
function withCurrentTime(dateStr) {
  const now = new Date();
  if (!dateStr) return now.toISOString();
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString();
}

async function saveTransaction() {
  if (addState.saving) return;
  const value = amount.value();
  if (!value || value <= 0) return showToast('Masukkan nominal terlebih dahulu');
  if (!addState.walletId) return showToast('Pilih dompet');
  if (addState.type === 'transfer' && (!addState.toWalletId || addState.toWalletId === addState.walletId)) {
    return showToast('Pilih dompet tujuan yang berbeda');
  }
  addState.saving = true;
  const submit = $('form-add-tx').querySelector('.key.submit');
  submit.disabled = true;
  const t = addState.type;
  const payload = {
    type: t,
    amount: value,
    accountId: addState.walletId,
    toAccountId: t === 'transfer' ? addState.toWalletId : '',
    categoryId: t === 'transfer' ? 'cat_transfer' : addState.categoryByType[t],
    merchant: t === 'expense' ? $('tx-modal-merchant').value.trim() : '',
    description: $('tx-modal-desc').value.trim(),
    transactionDate: withCurrentTime($('tx-modal-date').value)
  };
  try {
    await api('/api/finance/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    localStorage.setItem('patungin_last_wallet', addState.walletId);
    closeSheet('modal-add-tx');
    showToast(`Tersimpan ${rp(value)}`);
    await refreshDashboard();
  } catch (err) {
    showToast('Gagal menyimpan: ' + err.message, true);
  } finally {
    addState.saving = false;
    submit.disabled = false;
  }
}

// ---------------------------------------------------------------- wallet picker
function pickWallet({ title, selected = null, exclude = null }) {
  return new Promise((resolve) => {
    $('wallet-picker-title').textContent = title;
    const list = $('wallet-picker-list');
    const options = state.accounts.filter((a) => a.id !== exclude);
    list.innerHTML = options.map((a) => `
      <button type="button" class="picker-row ${a.id === selected ? 'sel' : ''}" data-id="${esc(a.id)}">
        ${walletAvatar(a, 40)}
        <span class="wallet-row-text">
          <div class="wallet-row-name">${esc(a.name)}</div>
          <div class="wallet-row-kind">${rp(a.balance)}</div>
        </span>
        ${a.id === selected ? '<span class="ms check">check_circle</span>' : ''}
      </button>`).join('');
    const sheet = $('modal-wallet-picker');
    let picked = null;
    const onClose = () => {
      sheet.removeEventListener('sheet-closed', onClose);
      resolve(picked);
    };
    sheet.addEventListener('sheet-closed', onClose);
    list.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => {
      picked = b.dataset.id;
      closeSheet('modal-wallet-picker');
    }));
    openSheet('modal-wallet-picker');
  });
}

// ---------------------------------------------------------------- wallet form
const WALLET_PRESETS = [
  ['BCA', 'bank'], ['Mandiri', 'bank'], ['Bank Jago', 'bank'], ['GoPay', 'ewallet'], ['OVO', 'ewallet'], ['Tunai', 'cash']
];
let walletFormKind = 'bank';

function setWalletKind(kind) {
  walletFormKind = WALLET_KINDS[kind] ? kind : 'bank';
  document.querySelectorAll('#wallet-kind-tabs .type-tab').forEach((b) => b.classList.toggle('active', b.dataset.val === walletFormKind));
}

function openWalletForm(existing = null) {
  $('wallet-form-title').textContent = existing ? `Ubah ${existing.name}` : 'Tambah dompet';
  $('wallet-form-id').value = existing?.id || '';
  $('new-wallet-name').value = existing?.name || '';
  $('new-wallet-balance').value = existing ? String(existing.balance) : '';
  setWalletKind(existing?.type || 'bank');
  const presets = $('wallet-presets');
  presets.hidden = !!existing;
  if (!existing) {
    const have = new Set(state.accounts.map((a) => a.name.toLowerCase()));
    presets.innerHTML = WALLET_PRESETS.filter(([n]) => !have.has(n.toLowerCase())).map(([n, k]) => {
      const fake = { name: n, type: k };
      return `<button type="button" class="chip" data-preset="${esc(n)}" data-kind="${k}"><span class="ms" style="color:${walletVisual(fake).color}">${walletVisual(fake).icon}</span>${esc(n)}</button>`;
    }).join('');
  }
  openSheet('modal-wallet-form');
  if (!existing) setTimeout(() => $('new-wallet-name').focus(), 80);
}

function setupWalletForm() {
  document.querySelectorAll('#wallet-kind-tabs .type-tab').forEach((b) => b.addEventListener('click', () => setWalletKind(b.dataset.val)));
  $('wallet-presets').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-preset]');
    if (!chip) return;
    $('new-wallet-name').value = chip.dataset.preset;
    setWalletKind(chip.dataset.kind);
    $('new-wallet-balance').focus();
  });
  $('form-wallet').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('new-wallet-name').value.trim();
    if (!name) return showToast('Nama dompet harus diisi.');
    const id = $('wallet-form-id').value || undefined;
    const balance = parseFloat($('new-wallet-balance').value) || 0;
    const btn = $('btn-add-wallet-submit');
    btn.disabled = true;
    try {
      await api('/api/finance/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, type: walletFormKind, balance })
      });
      closeSheet('modal-wallet-form');
      showToast(id ? `${name} diperbarui` : `Dompet ${name} ditambahkan`);
      await refreshDashboard();
    } catch (err) {
      showToast('Gagal menyimpan dompet: ' + err.message, true);
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------------------------------------------------------------- wallet detail
function showWalletList() {
  state.walletDetailId = null;
  $('wallets-list-view').hidden = false;
  $('wallet-detail-view').hidden = true;
}

function openWalletDetail(id) {
  state.walletDetailId = id;
  $('wallets-list-view').hidden = true;
  $('wallet-detail-view').hidden = false;
  window.scrollTo({ top: 0 });
  renderWalletDetailHeader();
  loadWalletDetail(true);
}

function renderWalletDetailHeader() {
  const acc = accountById(state.walletDetailId);
  if (!acc) return showWalletList();
  $('wallet-detail-name').textContent = acc.name;
  $('wallet-detail-avatar').innerHTML = walletAvatar(acc, 52);
  const bal = $('wallet-detail-balance');
  bal.textContent = rp(acc.balance);
  bal.classList.toggle('neg', acc.balance < 0);
  $('wallet-detail-kind').textContent = walletVisual(acc).kindLabel;
  setTimeout(() => fitText(bal, 14), 0);
}

async function loadWalletDetail(reset) {
  const id = state.walletDetailId;
  if (!id) return;
  renderWalletDetailHeader();
  const list = $('wallet-detail-list');
  const more = $('btn-wallet-load-more');
  if (reset) {
    state.walletRows = [];
    list.innerHTML = LOADING;
    more.hidden = true;
  }
  try {
    const params = new URLSearchParams({ accountId: id, limit: String(PAGE_SIZE), offset: String(state.walletRows.length) });
    const data = await api(`/api/finance/transactions?${params}`);
    if (state.walletDetailId !== id) return;
    state.walletRows = state.walletRows.concat(data.transactions || []);
    state.walletTotal = Number(data.total) || state.walletRows.length;
    if (!state.walletRows.length) {
      list.innerHTML = emptyState('history', 'Belum ada riwayat');
    } else {
      list.innerHTML = buildTransactionList(state.walletRows, id);
      bindTxTiles(list, state.walletRows, id);
    }
    more.hidden = state.walletRows.length >= state.walletTotal;
  } catch (err) {
    list.innerHTML = emptyState('error', 'Gagal memuat riwayat', err.message);
  }
}

function setupWalletDetail() {
  $('btn-wallet-back').addEventListener('click', showWalletList);
  $('btn-wallet-edit').addEventListener('click', () => {
    const acc = accountById(state.walletDetailId);
    if (acc) openWalletForm(acc);
  });
  $('btn-wallet-load-more').addEventListener('click', () => loadWalletDetail(false));
}

// ---------------------------------------------------------------- analytics
function renderAnalytics() {
  const o = state.overview;
  if (!o) return;
  $('an-income').textContent = rp(o.totalIncome);
  $('an-expense').textContent = rp(o.totalExpense);
  const net = (o.totalIncome || 0) - (o.totalExpense || 0);
  const netEl = $('an-net');
  netEl.textContent = rp(net);
  netEl.className = 'summary-val ' + (net >= 0 ? 'income' : 'expense');
  renderDonut();
  renderTrend();
}

function renderDonut() {
  const cats = state.overview?.categoryBreakdown || [];
  const wrap = $('donut-wrap');
  const listEl = $('cat-breakdown-list');
  if (!cats.length) {
    wrap.innerHTML = emptyState('pie_chart', 'Belum ada pengeluaran bulan ini');
    listEl.innerHTML = '';
    return;
  }
  const total = cats.reduce((s, c) => s + c.amount, 0);
  const touched = state.touchedSlice >= 0 && state.touchedSlice < cats.length ? state.touchedSlice : -1;
  const inner = 62;
  const size = 220;
  const c = size / 2;
  const gapRad = cats.length > 1 ? 0.035 : 0;

  let angle = -Math.PI / 2;
  let paths = '';
  let labels = '';
  cats.forEach((cat, i) => {
    const vis = catVisual(cat.id, cat.name, 'expense');
    const sweep = (cat.amount / total) * Math.PI * 2;
    const outer = inner + (i === touched ? 46 : 36);
    const a0 = angle + gapRad / 2;
    const a1 = angle + sweep - gapRad / 2;
    if (a1 > a0) {
      paths += `<path d="${arcPath(c, c, inner, outer, a0, a1)}" fill="${vis.color}" data-slice="${i}"></path>`;
      const pct = (cat.amount / total) * 100;
      if (pct >= 6) {
        const mid = (a0 + a1) / 2;
        const r = (inner + outer) / 2;
        labels += `<text class="donut-pct" x="${c + r * Math.cos(mid)}" y="${c + r * Math.sin(mid)}" text-anchor="middle" dominant-baseline="central">${Math.round(pct)}%</text>`;
      }
    }
    angle += sweep;
  });

  const sel = touched >= 0 ? cats[touched] : null;
  wrap.innerHTML = `
    <div class="donut">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Donut pengeluaran per kategori">${paths}${labels}</svg>
      <div class="donut-center">
        <div class="donut-center-label">${esc(sel ? sel.name : 'Total')}</div>
        <div class="donut-center-val">${rp(sel ? sel.amount : total)}</div>
      </div>
    </div>`;
  wrap.querySelectorAll('[data-slice]').forEach((p) => p.addEventListener('click', () => toggleSlice(Number(p.dataset.slice))));

  listEl.innerHTML = cats.map((cat, i) => {
    const vis = catVisual(cat.id, cat.name, 'expense');
    const pct = total ? cat.amount / total : 0;
    return `
      <button type="button" class="cat-row" data-slice="${i}" style="${i === touched ? `background:${vis.color}1A` : ''}">
        <span class="ms" style="color:${vis.color}">${vis.icon}</span>
        <span class="cat-row-mid">
          <div class="cat-row-name">${esc(cat.name)}</div>
          <div class="cat-bar" style="background:${vis.color}26"><div style="width:${(pct * 100).toFixed(1)}%;background:${vis.color}"></div></div>
        </span>
        <span class="cat-row-right">
          <div class="cat-row-amt">${rp(cat.amount)}</div>
          <div class="cat-row-pct">${(pct * 100).toFixed(1).replace('.', ',')}%</div>
        </span>
      </button>`;
  }).join('');
  listEl.querySelectorAll('[data-slice]').forEach((b) => b.addEventListener('click', () => toggleSlice(Number(b.dataset.slice))));
}

function toggleSlice(i) {
  state.touchedSlice = state.touchedSlice === i ? -1 : i;
  renderDonut();
}

function arcPath(cx, cy, r0, r1, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  // Full circle needs two arcs
  if (a1 - a0 >= Math.PI * 2 - 0.001) {
    const m = a0 + Math.PI;
    return arcPath(cx, cy, r0, r1, a0, m) + ' ' + arcPath(cx, cy, r0, r1, m, a1 - 0.0001);
  }
  const p = (r, a) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  return `M ${p(r1, a0)} A ${r1} ${r1} 0 ${large} 1 ${p(r1, a1)} L ${p(r0, a1)} A ${r0} ${r0} 0 ${large} 0 ${p(r0, a0)} Z`;
}

function renderTrend() {
  const data = state.overview?.monthlyTrend || [];
  const el = $('trend-chart');
  if (!data.length) {
    el.innerHTML = '';
    $('trend-avg').textContent = '';
    return;
  }
  const max = Math.max(0, ...data.map((d) => d.expense));
  const maxY = max === 0 ? 100000 : max * 1.25;
  const avg = Math.round(data.reduce((s, d) => s + d.expense, 0) / data.length);
  $('trend-avg').textContent = `Rata-rata ${rp(avg)} / bulan`;

  const grid = [0, 1, 2, 3].map((i) => {
    const v = (maxY / 4) * i;
    const pct = (v / maxY) * 100;
    return { pct, label: i === 0 ? '0' : compactFmt.format(v) };
  });
  const short = (key) => MONTHS[Number(key.split('-')[1]) - 1].slice(0, 3);

  el.innerHTML = `
    <div class="trend-y">${grid.map((g) => `<span style="bottom:${g.pct}%">${g.label}</span>`).join('')}</div>
    <div class="trend-plot">
      <div class="trend-area">
        ${grid.map((g) => `<div class="trend-grid" style="bottom:${g.pct}%"></div>`).join('')}
        <div class="trend-bars">
          ${data.map((d) => `
            <div class="trend-bar-col ${d.month === state.currentMonth ? 'sel' : ''}" data-month="${d.month}">
              <div class="trend-bar" style="height:${Math.max(d.expense > 0 ? 1.5 : 0, (d.expense / maxY) * 100)}%"></div>
              <span class="trend-tip" style="bottom:calc(${(d.expense / maxY) * 100}% + 6px)">${rp(d.expense)}</span>
            </div>`).join('')}
        </div>
      </div>
      <div class="trend-x">${data.map((d) => `<span class="${d.month === state.currentMonth ? 'sel' : ''}">${short(d.month)}</span>`).join('')}</div>
    </div>`;
  el.querySelectorAll('[data-month]').forEach((col) => col.addEventListener('click', () => {
    if (col.dataset.month === state.currentMonth) return;
    state.currentMonth = col.dataset.month;
    state.touchedSlice = -1;
    updateMonthLabels();
    refreshDashboard();
  }));
}

// ---------------------------------------------------------------- scan struk
function setupScan() {
  const input = $('scan-file-input');
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    const overlay = $('scan-overlay');
    overlay.classList.add('active');
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await fetch('/api/finance/shortcut/scan', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.message || data.error || 'Struk tidak terbaca');
      showToast(data.message || 'Struk berhasil dicatat');
      await refreshDashboard();
    } catch (err) {
      showToast(err.message, true);
    } finally {
      overlay.classList.remove('active');
    }
  });
}

// ---------------------------------------------------------------- settings
function userName() {
  return localStorage.getItem('patungin_user_name') || 'Dzaki';
}

function setupSettings() {
  $('settings-name').textContent = userName();
  $('btn-rename').addEventListener('click', async () => {
    const v = await promptDialog({ title: 'Nama panggilan', value: userName() });
    if (v) {
      localStorage.setItem('patungin_user_name', v);
      $('settings-name').textContent = v;
      showToast(`Nama diubah menjadi ${v}`);
    }
  });
  $('btn-export-csv').addEventListener('click', doExport);
}

function doExport() {
  window.location.href = `/api/finance/export?month=${state.currentMonth}`;
  showToast(`Mengunduh CSV ${monthLabel(state.currentMonth)}…`);
}

// ---------------------------------------------------------------- import mutasi
function setupImportModal() {
  const tabText = $('tab-import-text');
  const tabFile = $('tab-import-file');
  const btnParse = $('btn-parse-statement');
  const previewBox = $('import-preview-box');
  const previewList = $('import-preview-list');
  const btnCommit = $('btn-commit-import');
  const accSelect = $('import-target-account');
  let activeTab = 'text';
  let parsed = [];

  $('btn-open-import').addEventListener('click', () => {
    accSelect.innerHTML = state.accounts.map((a) => `<option value="${esc(a.id)}">${esc(a.name)} (${rp(a.balance)})</option>`).join('');
    previewBox.hidden = true;
    parsed = [];
    openSheet('modal-import-statement');
  });

  const setTab = (tab) => {
    activeTab = tab;
    tabText.classList.toggle('active', tab === 'text');
    tabFile.classList.toggle('active', tab === 'file');
    $('import-text-container').hidden = tab !== 'text';
    $('import-file-container').hidden = tab !== 'file';
  };
  tabText.addEventListener('click', () => setTab('text'));
  tabFile.addEventListener('click', () => setTab('file'));

  btnParse.addEventListener('click', async () => {
    const targetAccountId = accSelect.value;
    btnParse.disabled = true;
    const old = btnParse.innerHTML;
    btnParse.innerHTML = '<span class="ms">hourglass_top</span>Menganalisis…';
    try {
      let data;
      if (activeTab === 'text') {
        const rawText = $('import-raw-text').value.trim();
        if (!rawText) throw new Error('Tempel teks mutasi terlebih dahulu.');
        data = await api('/api/finance/import/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rawText, targetAccountId })
        });
      } else {
        const f = $('import-file-input').files?.[0];
        if (!f) throw new Error('Pilih file CSV mutasi terlebih dahulu.');
        const fd = new FormData();
        fd.append('statementFile', f);
        fd.append('targetAccountId', targetAccountId);
        data = await api('/api/finance/import/preview', { method: 'POST', body: fd });
      }
      parsed = data.transactions || [];
      $('import-preview-count').textContent = parsed.length;
      $('import-preview-in').textContent = '+' + rp(data.totalIncome);
      $('import-preview-out').textContent = '-' + rp(data.totalExpense).replace('-', '');
      previewList.innerHTML = parsed.map((t, i) => {
        const isExp = t.type === 'expense';
        return `
          <label class="preview-item">
            <input type="checkbox" id="chk-import-${i}" checked>
            <span class="tx-text">
              <div class="tx-title">${esc(t.description || t.merchant)}</div>
              <div class="tx-sub">${esc(t.date)} · ${esc(t.category)}</div>
            </span>
            <b class="${isExp ? 'expense' : 'income'}">${isExp ? '-' : '+'}${rp(t.amount)}</b>
          </label>`;
      }).join('');
      previewBox.hidden = false;
    } catch (err) {
      showToast(err.message, true);
    } finally {
      btnParse.disabled = false;
      btnParse.innerHTML = old;
    }
  });

  btnCommit.addEventListener('click', async () => {
    const selected = parsed.filter((_, i) => $(`chk-import-${i}`)?.checked);
    if (!selected.length) return showToast('Pilih setidaknya 1 transaksi untuk disimpan.');
    btnCommit.disabled = true;
    try {
      const data = await api('/api/finance/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: selected, targetAccountId: accSelect.value })
      });
      closeSheet('modal-import-statement');
      showToast(`${data.totalInserted} transaksi disimpan ke ${data.account}`);
      await refreshDashboard();
    } catch (err) {
      showToast('Gagal menyimpan: ' + err.message, true);
    } finally {
      btnCommit.disabled = false;
    }
  });
}

// ---------------------------------------------------------------- google sheet
function setupGoogleSheetModal() {
  const urlInput = $('gsheet-url-input');
  const openWrap = $('gsheet-open-link-wrap');
  const openLink = $('btn-open-gsheet-direct');
  const showLink = (url) => {
    if (!url) return;
    openLink.href = url;
    openWrap.hidden = false;
  };

  $('btn-open-gsheet').addEventListener('click', async () => {
    openSheet('modal-gsheet-config');
    try {
      const data = await api('/api/finance/google-sheet');
      if (data.url) urlInput.value = data.url;
      showLink(data.viewUrl);
    } catch (_) { /* not configured yet */ }
  });

  $('btn-copy-apps-script').addEventListener('click', () => {
    navigator.clipboard.writeText($('gsheet-script-template').value)
      .then(() => showToast('Kode Apps Script disalin'))
      .catch(() => showToast('Blok dan salin kode secara manual.', true));
  });

  $('btn-save-gsheet-url').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await api('/api/finance/google-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.value.trim() })
      });
      showToast('URL Google Sheet disimpan');
    } catch (err) {
      showToast('Gagal menyimpan: ' + err.message, true);
    } finally {
      btn.disabled = false;
    }
  });

  $('btn-sync-all-gsheet').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (!urlInput.value.trim()) return showToast('Simpan URL Google Sheet terlebih dahulu.');
    btn.disabled = true;
    const old = btn.textContent;
    btn.textContent = 'Menyinkronkan…';
    try {
      const data = await api('/api/finance/google-sheet/sync-all', { method: 'POST' });
      showToast(`${data.count} transaksi disinkronkan ke Google Sheet`);
      showLink(data.spreadsheetUrl);
    } catch (err) {
      showToast('Gagal sinkronisasi: ' + err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  });
}

// ---------------------------------------------------------------- shortcuts
function setupShortcutsModal() {
  const urlInput = $('shortcut-endpoint-url');
  const testInput = $('shortcut-test-input');
  const btnTest = $('btn-test-shortcut');
  const resultBox = $('shortcut-test-result');

  $('btn-open-shortcuts').addEventListener('click', async () => {
    let ep = `${window.location.origin}/api/finance/shortcut`;
    try {
      const data = await api('/api/finance/shortcut/info');
      if (data.endpoint && !(data.endpoint.includes('localhost') && window.location.hostname !== 'localhost')) ep = data.endpoint;
    } catch (_) { /* fall back to this origin */ }
    urlInput.value = ep;
    resultBox.hidden = true;
    openSheet('modal-shortcuts-info');
  });

  $('btn-copy-shortcut-url').addEventListener('click', () => {
    navigator.clipboard.writeText(urlInput.value)
      .then(() => showToast('URL pintasan disalin'))
      .catch(() => showToast('Salin URL secara manual: ' + urlInput.value, true));
  });

  const runTest = async () => {
    const text = testInput.value.trim();
    if (!text) return showToast('Masukkan contoh teks transaksi dulu.');
    btnTest.disabled = true;
    resultBox.hidden = true;
    try {
      const res = await fetch('/api/finance/shortcut', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      const data = await res.json();
      resultBox.hidden = false;
      resultBox.innerHTML = `<div class="test-result-title ${data.success ? 'income' : 'expense'}">${esc(data.title || (data.success ? 'Berhasil' : 'Gagal'))}</div><div>${esc(data.message || data.error || '')}</div>`;
      if (data.success) {
        testInput.value = '';
        await refreshDashboard();
      }
    } catch (err) {
      resultBox.hidden = false;
      resultBox.innerHTML = `<div class="test-result-title expense">Error server</div><div>${esc(err.message)}</div>`;
    } finally {
      btnTest.disabled = false;
    }
  };
  btnTest.addEventListener('click', runTest);
  testInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') runTest(); });
}
