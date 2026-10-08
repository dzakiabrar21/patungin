/**
 * PatungIn Finance Dashboard JavaScript
 * Logic for overview, transactions, analytics, and modals
 */

// Automatically skip Ngrok browser warning for all API fetch calls
if (typeof window !== 'undefined' && window.fetch) {
  const originalFetch = window.fetch;
  window.fetch = function(url, options = {}) {
    options = options || {};
    options.headers = options.headers || {};
    if (options.headers instanceof Headers) {
      options.headers.set('ngrok-skip-browser-warning', '1');
    } else {
      options.headers['ngrok-skip-browser-warning'] = '1';
    }
    return originalFetch(url, options);
  };
}

// Application State
const state = {
  currentMonth: new Date().toISOString().slice(0, 7), // 'YYYY-MM'
  currentType: 'all',
  currentAccount: 'all',
  currentSearch: '',
  accounts: [],
  categories: [],
  overviewData: null
};

// Indonesian Month Names
const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

// Helper: Format Rupiah
function formatRupiah(num) {
  return (Number(num) || 0).toLocaleString('id-ID');
}

// Helper: Format Date String to Indo readable
function formatDateIndo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  
  const day = d.getDate();
  const month = MONTH_NAMES[d.getMonth()].slice(0, 3);
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  
  return `${day} ${month} ${year}, ${hours}:${minutes}`;
}

// Helper: Show Toast Notification
function showToast(message, icon = '✅') {
  const toast = document.getElementById('fin-toast');
  if (!toast) return;
  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', async () => {
  setupMonthSelector();
  setupQuickChatInput();
  setupFilterTabs();
  setupSearchInput();
  setupTransactionModal();
  setupWalletModal();
  setupExportButtons();
  setupImportModal();
  setupGoogleSheetModal();
  setupShortcutsModal();
  
  await loadCategories();
  await refreshDashboard();

  // Register PWA Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      console.log('[PWA] Service Worker registered with scope:', reg.scope);
    }).catch((err) => {
      console.log('[PWA] Service Worker registration failed:', err);
    });
  }

  // Handle PWA Quick Action (e.g. from Home Screen app icon shortcut)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('action') === 'add' || window.location.hash === '#catat') {
    setTimeout(() => {
      document.getElementById('btn-open-add-tx')?.click();
    }, 400);
  }
});

// Refresh all data
async function refreshDashboard() {
  await Promise.all([
    loadOverview(),
    loadTransactions()
  ]);
}

// 1. Month Selector Logic
function setupMonthSelector() {
  const display = document.getElementById('month-display');
  const btnPrev = document.getElementById('btn-month-prev');
  const btnNext = document.getElementById('btn-month-next');
  const btnToday = document.getElementById('btn-month-today');

  function updateMonthLabel() {
    const [year, month] = state.currentMonth.split('-');
    const monthIndex = parseInt(month, 10) - 1;
    display.textContent = `${MONTH_NAMES[monthIndex]} ${year}`;
  }

  btnPrev.addEventListener('click', () => {
    const [year, month] = state.currentMonth.split('-').map(Number);
    let newYear = year;
    let newMonth = month - 1;
    if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    }
    state.currentMonth = `${newYear}-${String(newMonth).padStart(2, '0')}`;
    updateMonthLabel();
    refreshDashboard();
  });

  btnNext.addEventListener('click', () => {
    const [year, month] = state.currentMonth.split('-').map(Number);
    let newYear = year;
    let newMonth = month + 1;
    if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    }
    state.currentMonth = `${newYear}-${String(newMonth).padStart(2, '0')}`;
    updateMonthLabel();
    refreshDashboard();
  });

  if (btnToday) {
    btnToday.addEventListener('click', () => {
      state.currentMonth = new Date().toISOString().slice(0, 7);
      updateMonthLabel();
      refreshDashboard();
    });
  }

  updateMonthLabel();
}

// Helper: Update Dynamic Greeting
function updateGreeting() {
  const heading = document.getElementById('greeting-heading');
  if (!heading) return;
  const hour = new Date().getHours();
  let timeStr = 'pagi';
  if (hour >= 11 && hour < 15) timeStr = 'siang';
  else if (hour >= 15 && hour < 18) timeStr = 'sore';
  else if (hour >= 18 || hour < 4) timeStr = 'malam';
  
  const userName = localStorage.getItem('patungin_user_name') || 'Dzaki';
  heading.textContent = `Selamat ${timeStr}, ${userName}`;

  // Allow clicking on name to personalize it
  if (!heading.dataset.hasRenameListener) {
    heading.dataset.hasRenameListener = 'true';
    heading.style.cursor = 'pointer';
    heading.addEventListener('click', () => {
      const current = localStorage.getItem('patungin_user_name') || 'Dzaki';
      const input = prompt('Ubah nama panggilan kamu di dashboard:', current);
      if (input !== null && input.trim()) {
        localStorage.setItem('patungin_user_name', input.trim());
        updateGreeting();
        showToast(`Nama diubah menjadi ${input.trim()}`);
      }
    });
  }
}

// 2. Fetch and Render Finance Overview
async function loadOverview() {
  try {
    updateGreeting();
    const res = await fetch(`/api/finance/overview?month=${state.currentMonth}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    state.overviewData = data;
    state.accounts = data.accounts || [];

    // Render Net Worth & Stats
    document.getElementById('hero-total-balance').textContent = `Rp ${formatRupiah(data.totalBalance)}`;
    document.getElementById('hero-total-income').textContent = `+Rp ${formatRupiah(data.totalIncome)}`;
    document.getElementById('hero-total-expense').textContent = `−Rp ${formatRupiah(data.totalExpense)}`;
    
    const savingEl = document.getElementById('hero-net-savings');
    const savingSign = data.netSavings >= 0 ? '+' : '−';
    savingEl.textContent = `${savingSign}Rp ${formatRupiah(Math.abs(data.netSavings))}`;
    savingEl.className = 'fin-stat-val ' + (data.netSavings >= 0 ? 'income' : 'expense');

    // Sub-ratios
    const walletCountEl = document.getElementById('hero-wallets-count');
    if (walletCountEl) {
      walletCountEl.textContent = `Tersebar di ${state.accounts.length} dompet aktif`;
    }

    const expRatioEl = document.getElementById('hero-expense-ratio');
    if (expRatioEl) {
      const expPct = data.totalIncome > 0 ? Math.round((data.totalExpense / data.totalIncome) * 100) : 0;
      expRatioEl.textContent = `${expPct}% dari pemasukan`;
    }

    const savRatioEl = document.getElementById('hero-savings-ratio');
    if (savRatioEl) {
      const savPct = data.totalIncome > 0 ? Math.max(0, Math.round((data.netSavings / data.totalIncome) * 100)) : 0;
      savRatioEl.textContent = `${savPct}% berhasil disimpan`;
    }

    // Render Wallets
    renderWallets(data.accounts);

    // Render Category Breakdown
    renderCategoriesBreakdown(data.categoryBreakdown, data.totalExpense);

    // Render Daily Trend
    renderDailyTrend(data.dailyTrend, state.currentMonth);

  } catch (err) {
    console.error('Failed to load finance overview:', err);
  }
}

// Render Wallets Horizontal Cards (Figma Specification)
function renderWallets(accounts) {
  const container = document.getElementById('wallets-container');
  if (!container) return;

  if (!accounts || accounts.length === 0) {
    container.innerHTML = '<div style="color:var(--fin-text-muted);font-size:11px;padding:12px 0;">Belum ada dompet terdaftar.</div>';
    return;
  }

  // Predefined brand styling from Figma
  const brandStyles = {
    'bca': { grad: 'linear-gradient(135deg, #086DB4 0%, #20A8DE 100%)', tag: 'Rekening bank', abbr: 'BCA' },
    'mandiri': { grad: 'linear-gradient(135deg, #0B54A0 0%, #F7B824 100%)', tag: 'Rekening bank', abbr: 'M' },
    'gopay': { grad: 'linear-gradient(135deg, #12A5DC 0%, #0877BD 100%)', tag: 'E-Wallet', abbr: 'GP' },
    'tunai': { grad: 'linear-gradient(135deg, #11966F 0%, #45C68F 100%)', tag: 'Uang fisik', abbr: 'Rp' },
    'cash': { grad: 'linear-gradient(135deg, #11966F 0%, #45C68F 100%)', tag: 'Uang fisik', abbr: 'Rp' },
    'ovo': { grad: 'linear-gradient(135deg, #4C1D95 0%, #7C3AED 100%)', tag: 'E-Wallet', abbr: 'OVO' },
    'dana': { grad: 'linear-gradient(135deg, #118EEA 0%, #0D6EFD 100%)', tag: 'E-Wallet', abbr: 'DANA' },
    'shopeepay': { grad: 'linear-gradient(135deg, #EA580C 0%, #FB923C 100%)', tag: 'E-Wallet', abbr: 'SP' },
    'seabank': { grad: 'linear-gradient(135deg, #FF5A00 0%, #FFA100 100%)', tag: 'Bank Digital', abbr: 'SEA' }
  };

  container.innerHTML = accounts.map(acc => {
    const key = acc.name.toLowerCase().replace(/[^a-z]/g, '');
    let matched = brandStyles[key];
    if (!matched) {
      if (key.includes('bca')) matched = brandStyles.bca;
      else if (key.includes('mandiri')) matched = brandStyles.mandiri;
      else if (key.includes('gopay')) matched = brandStyles.gopay;
      else if (key.includes('cash') || key.includes('tunai')) matched = brandStyles.cash;
      else if (key.includes('ovo')) matched = brandStyles.ovo;
      else if (key.includes('dana')) matched = brandStyles.dana;
      else {
        matched = {
          grad: 'linear-gradient(135deg, #007F88 0%, #24B9B4 100%)',
          tag: acc.type === 'bank' ? 'Rekening bank' : (acc.type === 'ewallet' ? 'E-Wallet' : 'Dompet'),
          abbr: acc.name.slice(0, 3).toUpperCase()
        };
      }
    }

    const isActive = state.currentAccount === acc.id;

    return `
      <div class="fin-wallet-card ${isActive ? 'active' : ''}" onclick="filterByWallet('${acc.id}')">
        <div class="fin-wallet-card-head">
          <div class="fin-wallet-badge" style="background:${matched.grad}">${matched.abbr}</div>
          <span class="fin-wallet-type-pill">${matched.tag}</span>
        </div>
        <div class="fin-wallet-name" title="${acc.name}">${acc.name}</div>
        <div class="fin-wallet-balance">Rp ${formatRupiah(acc.balance)}</div>
        <div class="fin-wallet-footer">
          <span>Tersedia</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </div>
      </div>
    `;
  }).join('');
}

// Filter transactions when clicking on a wallet
window.filterByWallet = function(accId) {
  if (state.currentAccount === accId) {
    state.currentAccount = 'all';
  } else {
    state.currentAccount = accId;
  }
  renderWallets(state.accounts);
  loadTransactions();
};

// Render Category Breakdown (Figma Pastel Palette)
function renderCategoriesBreakdown(categories, totalExpense) {
  const listEl = document.getElementById('cat-breakdown-list');
  if (!listEl) return;

  if (!categories || categories.length === 0) {
    listEl.innerHTML = '<div style="color:var(--fin-text-muted);font-size:10px;padding:12px 0;">Belum ada pengeluaran di bulan ini.</div>';
    return;
  }

  const pastelPalettes = [
    { bg: '#FEEEEE', text: '#D94E4E', bar: '#ED6865' },
    { bg: '#EAF2FE', text: '#3478E5', bar: '#4F8DE9' },
    { bg: '#F1EDFB', text: '#805ACB', bar: '#8C6BD2' },
    { bg: '#FFF5DF', text: '#C27B19', bar: '#E5A13D' },
    { bg: '#E5F7EF', text: '#0B9D70', bar: '#10B981' },
    { bg: '#EEFAFA', text: '#007F88', bar: '#24B9B4' }
  ];

  listEl.innerHTML = categories.slice(0, 5).map((c, idx) => {
    const theme = pastelPalettes[idx % pastelPalettes.length];
    return `
      <div class="fin-cat-item">
        <div class="fin-cat-icon-box" style="background:${theme.bg};color:${theme.text}">
          ${c.icon || '🏷️'}
        </div>
        <div class="fin-cat-item-content">
          <div class="fin-cat-item-top">
            <span class="fin-cat-item-name" title="${c.name}">${c.name}</span>
            <span class="fin-cat-item-amt">Rp ${formatRupiah(c.amount)}</span>
          </div>
          <div class="fin-cat-bar-bg">
            <div class="fin-cat-bar-fill" style="width: ${c.percentage}%; background: ${theme.bar};"></div>
          </div>
        </div>
        <div class="fin-cat-pct">${c.percentage}%</div>
      </div>
    `;
  }).join('');
}

// Render Daily Bar Chart (Figma Specification)
function renderDailyTrend(dailyTrend, monthStr) {
  const chartEl = document.getElementById('daily-chart-container');
  if (!chartEl) return;

  if (!dailyTrend || dailyTrend.length === 0) {
    chartEl.innerHTML = '<div style="color:var(--fin-text-muted);font-size:10px;margin:auto;">Belum ada aktivitas transaksi harian.</div>';
    return;
  }

  const maxExpense = Math.max(...dailyTrend.map(d => d.expense), 200000);
  const totalExp = dailyTrend.reduce((sum, d) => sum + (d.expense || 0), 0);
  const daysWithExp = dailyTrend.filter(d => d.expense > 0).length || 1;
  const avgExp = Math.round(totalExp / daysWithExp);

  // Set Header Stats
  const avgEl = document.getElementById('daily-avg-val');
  if (avgEl) {
    avgEl.textContent = avgExp >= 1000 ? `Rp ${Math.round(avgExp / 1000)}rb` : `Rp ${formatRupiah(avgExp)}`;
  }

  // Find Peak Day
  const peakDay = dailyTrend.reduce((max, d) => (d.expense > max.expense ? d : max), { expense: 0, date: '' });
  const peakEl = document.getElementById('daily-peak-val');
  if (peakEl && peakDay.expense > 0) {
    const pDate = new Date(peakDay.date);
    const dayN = pDate.getDate();
    const moN = MONTH_NAMES[pDate.getMonth()].slice(0, 3);
    peakEl.textContent = `Hari tertinggi: ${dayN} ${moN}`;
  } else if (peakEl) {
    peakEl.textContent = 'Hari tertinggi: -';
  }

  // Set Y-Axis Markers
  const yMaxEl = document.getElementById('chart-y-max');
  const yMidEl = document.getElementById('chart-y-mid');
  if (yMaxEl) yMaxEl.textContent = maxExpense >= 1000000 ? `${(maxExpense / 1000000).toFixed(1)}jt` : `${Math.round(maxExpense / 1000)}rb`;
  if (yMidEl) yMidEl.textContent = (maxExpense / 2) >= 1000000 ? `${((maxExpense / 2) / 1000000).toFixed(1)}jt` : `${Math.round(maxExpense / 2000)}rb`;

  // Render Day Bars
  chartEl.innerHTML = dailyTrend.map(d => {
    const dayNum = parseInt(d.date.split('-')[2], 10);
    const heightPct = Math.max(Math.round((d.expense / maxExpense) * 100), 4);
    const isPeak = peakDay.expense > 0 && d.date === peakDay.date;
    const isLabeled = [1, 6, 12, 18, 24, 30].includes(dayNum) || dayNum === dailyTrend.length;
    const tooltip = `Tgl ${dayNum}: Rp ${formatRupiah(d.expense)}`;

    return `
      <div class="fin-daily-col" title="${tooltip}">
        <div class="fin-daily-bar ${isPeak ? 'peak' : ''}" style="height: ${heightPct}%;"></div>
        ${isLabeled ? `<span class="fin-daily-lbl">${dayNum}</span>` : ''}
      </div>
    `;
  }).join('');
}

// 3. Fetch and Render Transactions List (Figma Table Spec)
async function loadTransactions() {
  const listContainer = document.getElementById('transactions-list');
  if (!listContainer) return;

  listContainer.innerHTML = '<div style="text-align:center;padding:24px;color:var(--fin-text-muted);font-size:11px;">Memuat riwayat transaksi...</div>';

  const params = new URLSearchParams({
    month: state.currentMonth,
    limit: '60',
    offset: '0'
  });

  if (state.currentType !== 'all') params.append('type', state.currentType);
  if (state.currentAccount !== 'all') params.append('accountId', state.currentAccount);
  if (state.currentSearch) params.append('search', state.currentSearch);

  try {
    const res = await fetch(`/api/finance/transactions?${params.toString()}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    const rows = data.transactions || [];
    if (rows.length === 0) {
      listContainer.innerHTML = `
        <div style="text-align:center;padding:32px 16px;color:var(--fin-text-muted);">
          <div style="font-size:24px;margin-bottom:6px;">💸</div>
          <div style="font-size:11px;font-weight:600;">Belum ada transaksi pada filter ini.</div>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = rows.map(tx => {
      const isExpense = tx.type === 'expense';
      const isIncome = tx.type === 'income';
      const isTransfer = tx.type === 'transfer';

      let sign = '−';
      let typeClass = 'expense';
      let typeLabel = 'Pengeluaran';
      let icon = tx.category_icon || '🏷️';

      if (isIncome) {
        sign = '+';
        typeClass = 'income';
        typeLabel = 'Pemasukan';
        icon = tx.category_icon || '💰';
      } else if (isTransfer) {
        sign = '−';
        typeClass = 'transfer';
        typeLabel = 'Transfer';
        icon = '🔁';
      }

      const walletLabel = isTransfer
        ? `${tx.account_name || 'BCA'} → ${tx.to_account_name || 'Dompet'}`
        : (tx.account_name || 'BCA');

      // Date formatting for subtitle: e.g. "12 Okt · 12.34"
      const d = new Date(tx.transaction_date);
      let dateMeta = tx.transaction_date;
      if (!isNaN(d.getTime())) {
        const day = d.getDate();
        const mo = MONTH_NAMES[d.getMonth()].slice(0, 3);
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        dateMeta = `${day} ${mo} · ${hh}.${mm}`;
      }

      return `
        <div class="fin-tx-item">
          <div class="fin-tx-left">
            <div class="fin-tx-icon ${typeClass}">${icon}</div>
            <div class="fin-tx-info">
              <div class="fin-tx-desc" title="${tx.merchant || tx.description || 'Transaksi'}">
                ${tx.merchant || tx.description || 'Transaksi'}
              </div>
              <div class="fin-tx-meta">
                <span>${dateMeta}</span>
                <span>•</span>
                <span class="fin-tx-badge">${walletLabel}</span>
              </div>
            </div>
          </div>
          
          <div class="fin-tx-center">
            ${tx.category_name || (isTransfer ? 'Transfer Antar Dompet' : (tx.description || '-'))}
          </div>

          <div class="fin-tx-right">
            <div class="fin-tx-amount-group">
              <div class="fin-tx-amount ${typeClass}">${sign}Rp ${formatRupiah(tx.amount)}</div>
              <div class="fin-tx-type-lbl">${typeLabel}</div>
            </div>
            <button type="button" class="fin-tx-del-btn" title="Hapus Transaksi" onclick="confirmDeleteTransaction('${tx.id}', '${tx.description || tx.merchant || 'transaksi'}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error('Failed to load transactions:', err);
    listContainer.innerHTML = '<div style="color:var(--fin-expense);text-align:center;padding:20px;font-size:11px;">Gagal memuat riwayat transaksi.</div>';
  }
}

// 4. Quick AI NLP Text Input (Bar Atas)
function setupQuickChatInput() {
  const form = document.getElementById('fin-quick-form');
  const input = document.getElementById('fin-quick-input');
  if (!form || !input) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    input.disabled = true;
    const btn = form.querySelector('.fin-quick-submit');
    const oldText = btn.textContent;
    btn.textContent = 'Mencatat...';

    try {
      const res = await fetch('/api/finance/quick-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      const data = await res.json();

      if (data.success) {
        input.value = '';
        showToast(`Tercatat: Rp ${formatRupiah(data.transaction.amount)} (${data.transaction.category})`);
        await refreshDashboard();
      } else {
        alert(data.error || 'Gagal mengenali transaksi.');
      }
    } catch (err) {
      alert('Terjadi kesalahan saat mengirim: ' + err.message);
    } finally {
      input.disabled = false;
      btn.textContent = oldText;
      input.focus();
    }
  });
}

// 5. Filter Tabs (Semua, Pengeluaran, Pemasukan, Transfer)
function setupFilterTabs() {
  const pills = document.querySelectorAll('.fin-filter-pill, .fin-type-pill');
  pills.forEach(pill => {
    pill.addEventListener('click', () => {
      pills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.currentType = pill.getAttribute('data-type');
      loadTransactions();
    });
  });
}

// 6. Search Realtime Input
function setupSearchInput() {
  const searchInput = document.getElementById('tx-search-input');
  if (!searchInput) return;

  let debounceTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      state.currentSearch = searchInput.value.trim();
      loadTransactions();
    }, 300);
  });
}

// 7. Delete Transaction Logic
window.confirmDeleteTransaction = async function(id, name) {
  if (!confirm(`Hapus transaksi "${name}"? Saldo dompet akan dikembalikan.`)) return;

  try {
    const res = await fetch(`/api/finance/transactions/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Transaksi berhasil dihapus');
      await refreshDashboard();
    } else {
      alert(data.error || 'Gagal menghapus transaksi.');
    }
  } catch (err) {
    alert('Terjadi kesalahan: ' + err.message);
  }
};

// 8. Categories Loader
async function loadCategories() {
  try {
    const res = await fetch('/api/finance/categories');
    const data = await res.json();
    if (data.success) {
      state.categories = data.categories || [];
    }
  } catch (err) {
    console.warn('Error loading categories:', err);
  }
}

// 9. Manual Transaction Modal Logic
function setupTransactionModal() {
  const modal = document.getElementById('modal-add-tx');
  const btnOpen = document.getElementById('btn-open-add-tx');
  const btnClose = document.getElementById('btn-close-add-tx');
  const btnCancel = document.getElementById('btn-cancel-add-tx');
  const form = document.getElementById('form-add-tx');
  const typeSelect = document.getElementById('tx-modal-type');
  const toAccountGroup = document.getElementById('tx-modal-to-account-group');
  const categoryGroup = document.getElementById('tx-modal-category-group');

  if (!modal || !btnOpen) return;

  function openModal() {
    populateModalDropdowns();
    document.getElementById('tx-modal-date').value = new Date().toISOString().slice(0, 10);
    modal.classList.add('active');
  }

  function closeModal() {
    modal.classList.remove('active');
    form.reset();
    // Reset modal tabs to expense
    const modalTabs = document.querySelectorAll('.fin-modal-tab');
    modalTabs.forEach(t => t.className = 'fin-modal-tab');
    const firstTab = document.querySelector('.fin-modal-tab[data-val="expense"]');
    if (firstTab) firstTab.className = 'fin-modal-tab active expense';
    if (typeSelect) {
      typeSelect.value = 'expense';
      typeSelect.dispatchEvent(new Event('change'));
    }
  }

  btnOpen.addEventListener('click', openModal);
  
  // Mobile Top CTA & FAB bindings
  const btnOpenMobile = document.getElementById('btn-open-add-tx-mobile');
  if (btnOpenMobile) btnOpenMobile.addEventListener('click', openModal);

  const btnFabAdd = document.getElementById('fin-fab-add');
  if (btnFabAdd) btnFabAdd.addEventListener('click', openModal);

  // Mobile Sub-navigation bindings to existing modals
  const btnSubImport = document.getElementById('btn-subnav-import');
  if (btnSubImport) btnSubImport.addEventListener('click', () => document.getElementById('btn-open-import')?.click());

  const btnSubExport = document.getElementById('btn-subnav-export');
  if (btnSubExport) btnSubExport.addEventListener('click', () => document.getElementById('btn-export-csv')?.click());

  const btnSubSheet = document.getElementById('btn-subnav-gsheet');
  if (btnSubSheet) btnSubSheet.addEventListener('click', () => document.getElementById('btn-open-gsheet')?.click());

  const btnSubShortcuts = document.getElementById('btn-subnav-shortcuts');
  if (btnSubShortcuts) btnSubShortcuts.addEventListener('click', () => document.getElementById('btn-open-shortcuts')?.click());

  const btnSubWallets = document.getElementById('btn-subnav-wallets');
  if (btnSubWallets) btnSubWallets.addEventListener('click', () => document.getElementById('btn-open-wallets')?.click());

  if (btnClose) btnClose.addEventListener('click', closeModal);
  if (btnCancel) btnCancel.addEventListener('click', closeModal);

  // Segmented Type Tabs in Modal (Figma Spec)
  const modalTabs = document.querySelectorAll('.fin-modal-tab');
  modalTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const val = tab.getAttribute('data-val');
      modalTabs.forEach(t => t.className = 'fin-modal-tab');
      tab.className = `fin-modal-tab active ${val}`;
      if (typeSelect) {
        typeSelect.value = val;
        typeSelect.dispatchEvent(new Event('change'));
      }
    });
  });

  typeSelect.addEventListener('change', () => {
    const val = typeSelect.value;
    if (val === 'transfer') {
      toAccountGroup.style.display = 'block';
      categoryGroup.style.display = 'none';
    } else {
      toAccountGroup.style.display = 'none';
      categoryGroup.style.display = 'block';
      populateCategoriesByType(val);
    }
  });

  // Quick Nominal Buttons
  document.querySelectorAll('.fin-nom-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const amtInput = document.getElementById('tx-modal-amount');
      const val = parseInt(pill.getAttribute('data-val'), 10);
      const current = parseInt(amtInput.value, 10) || 0;
      amtInput.value = current + val;
    });
  });

  // Connect Figma Extra Buttons
  const btnManageWallets = document.getElementById('btn-manage-wallets-link');
  const btnHeroOptions = document.getElementById('btn-hero-options');
  if (btnManageWallets) btnManageWallets.addEventListener('click', () => document.getElementById('btn-open-wallets')?.click());
  if (btnHeroOptions) btnHeroOptions.addEventListener('click', () => document.getElementById('btn-open-wallets')?.click());
  
  const btnExportTx = document.getElementById('btn-export-tx-table');
  if (btnExportTx) btnExportTx.addEventListener('click', () => document.getElementById('btn-export-csv')?.click());

  const btnSeeCats = document.getElementById('btn-see-all-cats');
  if (btnSeeCats) btnSeeCats.addEventListener('click', () => {
    document.querySelector('.fin-tx-card')?.scrollIntoView({ behavior: 'smooth' });
  });

  const btnLoadMore = document.getElementById('btn-load-more');
  if (btnLoadMore) btnLoadMore.addEventListener('click', () => showToast('Semua transaksi telah dimuat.'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      type: typeSelect.value,
      amount: parseFloat(document.getElementById('tx-modal-amount').value),
      accountId: document.getElementById('tx-modal-account').value,
      toAccountId: document.getElementById('tx-modal-to-account').value,
      categoryId: document.getElementById('tx-modal-category').value,
      merchant: document.getElementById('tx-modal-merchant').value,
      description: document.getElementById('tx-modal-desc').value,
      transactionDate: document.getElementById('tx-modal-date').value
    };

    try {
      const res = await fetch('/api/finance/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        closeModal();
        showToast('Transaksi berhasil dicatat!');
        await refreshDashboard();
      } else {
        alert(data.error || 'Gagal menyimpan transaksi.');
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });
}

function populateModalDropdowns() {
  const accSelect = document.getElementById('tx-modal-account');
  const toAccSelect = document.getElementById('tx-modal-to-account');

  if (accSelect && state.accounts.length > 0) {
    accSelect.innerHTML = state.accounts.map(a => `<option value="${a.id}">${a.name} (Rp ${formatRupiah(a.balance)})</option>`).join('');
  }
  if (toAccSelect && state.accounts.length > 0) {
    toAccSelect.innerHTML = state.accounts.map(a => `<option value="${a.id}">${a.name} (Rp ${formatRupiah(a.balance)})</option>`).join('');
  }
  populateCategoriesByType(document.getElementById('tx-modal-type').value);
}

function populateCategoriesByType(type) {
  const catSelect = document.getElementById('tx-modal-category');
  if (!catSelect) return;
  const filtered = state.categories.filter(c => c.type === type || c.type === 'expense');
  catSelect.innerHTML = filtered.map(c => `<option value="${c.id}">${c.icon || '🏷️'} ${c.name}</option>`).join('');
}

// 10. Wallet Management Modal Logic
function setupWalletModal() {
  const modal = document.getElementById('modal-wallet-mgmt');
  const btnOpen = document.getElementById('btn-open-wallets');
  const btnClose = document.getElementById('btn-close-wallets');
  const btnAdd = document.getElementById('btn-add-wallet-submit');
  const listEl = document.getElementById('wallet-mgmt-list');

  if (!modal || !btnOpen) return;

  function openModal() {
    renderWalletMgmtList();
    modal.classList.add('active');
  }

  function closeModal() {
    modal.classList.remove('active');
  }

  btnOpen.addEventListener('click', openModal);
  if (btnClose) btnClose.addEventListener('click', closeModal);

  function renderWalletMgmtList() {
    if (!listEl) return;
    listEl.innerHTML = state.accounts.map(acc => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px;border-bottom:1px solid var(--fin-border);">
        <div>
          <div style="font-weight:700;font-size:0.92rem;">${acc.name}</div>
          <div style="font-size:0.75rem;color:var(--fin-text-muted);">${acc.type.toUpperCase()}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <input type="number" id="wallet-balance-${acc.id}" value="${acc.balance}" style="width:110px;padding:6px 8px;border:1px solid var(--fin-border);border-radius:8px;font-size:0.86rem;font-weight:700;text-align:right;">
          <button type="button" class="fin-nom-pill" onclick="saveWalletBalance('${acc.id}', '${acc.name}', '${acc.type}')">Simpan</button>
        </div>
      </div>
    `).join('');
  }

  window.saveWalletBalance = async function(id, name, type) {
    const input = document.getElementById(`wallet-balance-${id}`);
    const newBal = parseFloat(input.value) || 0;

    try {
      const res = await fetch('/api/finance/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, type, balance: newBal })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Saldo ${name} berhasil diperbarui!`);
        await refreshDashboard();
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert('Gagal update dompet: ' + err.message);
    }
  };

  if (btnAdd) {
    btnAdd.addEventListener('click', async () => {
      const nameInput = document.getElementById('new-wallet-name');
      const typeInput = document.getElementById('new-wallet-type');
      const balInput = document.getElementById('new-wallet-balance');

      const name = nameInput.value.trim();
      const type = typeInput.value;
      const balance = parseFloat(balInput.value) || 0;

      if (!name) return alert('Nama dompet harus diisi.');

      try {
        const res = await fetch('/api/finance/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, type, balance })
        });
        const data = await res.json();
        if (data.success) {
          nameInput.value = '';
          balInput.value = '0';
          showToast(`Dompet ${name} berhasil ditambahkan!`);
          await refreshDashboard();
          renderWalletMgmtList();
        } else {
          alert(data.error);
        }
      } catch (err) {
        alert('Gagal: ' + err.message);
      }
    });
  }
}

// 11. Export CSV Logic
function setupExportButtons() {
  const btnExport = document.getElementById('btn-export-csv');
  const btnExportFilter = document.getElementById('btn-export-filter-csv');

  function doExport() {
    window.location.href = `/api/finance/export?month=${state.currentMonth}`;
    showToast('Mengunduh laporan CSV...');
  }

  if (btnExport) btnExport.addEventListener('click', doExport);
  if (btnExportFilter) btnExportFilter.addEventListener('click', doExport);
}

// 12. Import Statement & Mutasi Rekening Logic
function setupImportModal() {
  const modal = document.getElementById('modal-import-statement');
  const btnOpen = document.getElementById('btn-open-import');
  const btnClose = document.getElementById('btn-close-import');
  const tabText = document.getElementById('tab-import-text');
  const tabFile = document.getElementById('tab-import-file');
  const containerText = document.getElementById('import-text-container');
  const containerFile = document.getElementById('import-file-container');
  const btnParse = document.getElementById('btn-parse-statement');
  const previewBox = document.getElementById('import-preview-box');
  const previewList = document.getElementById('import-preview-list');
  const previewCount = document.getElementById('import-preview-count');
  const previewIn = document.getElementById('import-preview-in');
  const previewOut = document.getElementById('import-preview-out');
  const btnCommit = document.getElementById('btn-commit-import');
  const accSelect = document.getElementById('import-target-account');

  if (!modal || !btnOpen) return;

  let activeTab = 'text';
  let parsedTransactions = [];

  function openModal() {
    if (accSelect && state.accounts.length > 0) {
      accSelect.innerHTML = state.accounts.map(a => `<option value="${a.id}">${a.name} (Rp ${formatRupiah(a.balance)})</option>`).join('');
    }
    previewBox.style.display = 'none';
    parsedTransactions = [];
    modal.classList.add('active');
  }

  function closeModal() {
    modal.classList.remove('active');
  }

  btnOpen.addEventListener('click', openModal);
  if (btnClose) btnClose.addEventListener('click', closeModal);

  // Tab switching
  tabText.addEventListener('click', () => {
    activeTab = 'text';
    tabText.style.background = 'var(--fin-primary-light)';
    tabText.style.color = 'var(--fin-primary)';
    tabText.style.borderColor = 'var(--fin-primary)';
    tabFile.style.background = 'var(--fin-bg-subtle)';
    tabFile.style.color = 'var(--fin-text-main)';
    tabFile.style.borderColor = 'var(--fin-border)';
    containerText.style.display = 'block';
    containerFile.style.display = 'none';
  });

  tabFile.addEventListener('click', () => {
    activeTab = 'file';
    tabFile.style.background = 'var(--fin-primary-light)';
    tabFile.style.color = 'var(--fin-primary)';
    tabFile.style.borderColor = 'var(--fin-primary)';
    tabText.style.background = 'var(--fin-bg-subtle)';
    tabText.style.color = 'var(--fin-text-main)';
    tabText.style.borderColor = 'var(--fin-border)';
    containerFile.style.display = 'block';
    containerText.style.display = 'none';
  });

  // Parse mutasi statement
  btnParse.addEventListener('click', async () => {
    const targetAccountId = accSelect.value;
    btnParse.disabled = true;
    const oldText = btnParse.textContent;
    btnParse.textContent = '⏳ Menganalisis Mutasi...';

    try {
      let res;
      if (activeTab === 'text') {
        const rawText = document.getElementById('import-raw-text').value.trim();
        if (!rawText) throw new Error('Silakan tempel teks mutasi terlebih dahulu.');
        res = await fetch('/api/finance/import/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rawText, targetAccountId })
        });
      } else {
        const fileInput = document.getElementById('import-file-input');
        if (!fileInput.files || fileInput.files.length === 0) {
          throw new Error('Pilih file CSV mutasi terlebih dahulu.');
        }
        const fd = new FormData();
        fd.append('statementFile', fileInput.files[0]);
        fd.append('targetAccountId', targetAccountId);
        res = await fetch('/api/finance/import/preview', {
          method: 'POST',
          body: fd
        });
      }

      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      parsedTransactions = data.transactions || [];
      previewCount.textContent = parsedTransactions.length;
      previewIn.textContent = `+Rp ${formatRupiah(data.totalIncome)}`;
      previewOut.textContent = `-Rp ${formatRupiah(data.totalExpense)}`;

      previewList.innerHTML = parsedTransactions.map((t, idx) => {
        const isExp = t.type === 'expense';
        const sign = isExp ? '-' : '+';
        const clr = isExp ? 'var(--fin-expense)' : 'var(--fin-income)';

        return `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:#ffffff;border-radius:6px;border:1px solid var(--fin-border);font-size:0.82rem;">
            <div style="display:flex;align-items:center;gap:8px;min-width:0;">
              <input type="checkbox" id="chk-import-${idx}" checked style="cursor:pointer;">
              <div style="min-width:0;">
                <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${t.description || t.merchant}</div>
                <div style="font-size:0.72rem;color:var(--fin-text-muted);">${t.date} • ${t.category}</div>
              </div>
            </div>
            <div style="font-weight:800;color:${clr};flex-shrink:0;">
              ${sign}Rp ${formatRupiah(t.amount)}
            </div>
          </div>
        `;
      }).join('');

      previewBox.style.display = 'block';
    } catch (err) {
      alert(err.message);
    } finally {
      btnParse.disabled = false;
      btnParse.textContent = oldText;
    }
  });

  // Commit selected transactions
  btnCommit.addEventListener('click', async () => {
    const selected = [];
    parsedTransactions.forEach((t, idx) => {
      const chk = document.getElementById(`chk-import-${idx}`);
      if (chk && chk.checked) {
        selected.push(t);
      }
    });

    if (selected.length === 0) {
      return alert('Pilih setidaknya 1 transaksi untuk disimpan.');
    }

    btnCommit.disabled = true;
    btnCommit.textContent = 'Menyimpan...';

    try {
      const res = await fetch('/api/finance/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactions: selected,
          targetAccountId: accSelect.value
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      closeModal();
      showToast(`Berhasil menyimpan ${data.totalInserted} transaksi ke dompet ${data.account}!`);
      await refreshDashboard();
    } catch (err) {
      alert('Gagal menyimpan: ' + err.message);
    } finally {
      btnCommit.disabled = false;
      btnCommit.textContent = '💾 Simpan Transaksi Terpilih ke Dompet';
    }
  });
}

// 13. Google Spreadsheet Integration Logic
function setupGoogleSheetModal() {
  const modal = document.getElementById('modal-gsheet-config');
  const btnOpen = document.getElementById('btn-open-gsheet');
  const btnClose = document.getElementById('btn-close-gsheet');
  const urlInput = document.getElementById('gsheet-webhook-url');
  const btnSave = document.getElementById('btn-save-gsheet-url');
  const btnSyncAll = document.getElementById('btn-sync-all-gsheet');
  const btnCopyScript = document.getElementById('btn-copy-apps-script');
  const scriptTemplate = document.getElementById('gsheet-script-template');

  if (!modal || !btnOpen) return;

  async function openModal() {
    try {
      const res = await fetch('/api/finance/google-sheet');
      const data = await res.json();
      if (data.success && data.url) {
        urlInput.value = data.url;
      }
    } catch (_) {}
    modal.classList.add('active');
  }

  function closeModal() {
    modal.classList.remove('active');
  }

  btnOpen.addEventListener('click', openModal);
  if (btnClose) btnClose.addEventListener('click', closeModal);

  // Copy apps script
  if (btnCopyScript && scriptTemplate) {
    btnCopyScript.addEventListener('click', () => {
      scriptTemplate.select();
      navigator.clipboard.writeText(scriptTemplate.value)
        .then(() => showToast('Kode Apps Script berhasil disalin!'))
        .catch(() => alert('Silakan blok dan salin teks script secara manual.'));
    });
  }

  // Save webhook URL
  if (btnSave) {
    btnSave.addEventListener('click', async () => {
      const url = urlInput.value.trim();
      btnSave.disabled = true;
      try {
        const res = await fetch('/api/finance/google-sheet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
        const data = await res.json();
        if (data.success) {
          showToast('URL Google Sheet berhasil disimpan!');
        } else {
          alert(data.error);
        }
      } catch (err) {
        alert('Gagal menyimpan: ' + err.message);
      } finally {
        btnSave.disabled = false;
      }
    });
  }

  // Sync all transactions to Google Sheet
  if (btnSyncAll) {
    btnSyncAll.addEventListener('click', async () => {
      if (!urlInput.value.trim()) {
        return alert('Simpan URL Google Sheet terlebih dahulu.');
      }
      btnSyncAll.disabled = true;
      const oldText = btnSyncAll.textContent;
      btnSyncAll.textContent = '⏳ Menyinkronkan ke Sheet...';

      try {
        const res = await fetch('/api/finance/google-sheet/sync-all', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          showToast(`Berhasil menyinkronkan ${data.count} transaksi ke Google Sheet!`);
        } else {
          alert(data.error || 'Gagal sinkronisasi.');
        }
      } catch (err) {
        alert('Gagal menghubungi server: ' + err.message);
      } finally {
        btnSyncAll.disabled = false;
        btnSyncAll.textContent = oldText;
      }
    });
  }
}

// 14. iOS Shortcuts / Android Widget Logic
function setupShortcutsModal() {
  const modal = document.getElementById('modal-shortcuts-config');
  const btnOpen = document.getElementById('btn-open-shortcuts');
  const btnClose = document.getElementById('btn-close-shortcuts');
  const urlInput = document.getElementById('shortcut-webhook-url');
  const btnCopy = document.getElementById('btn-copy-shortcut-url');
  const testInput = document.getElementById('shortcut-test-input');
  const btnTest = document.getElementById('btn-test-shortcut');
  const resultBox = document.getElementById('shortcut-test-result');

  if (!modal || !btnOpen) return;

  async function openModal() {
    try {
      const res = await fetch('/api/finance/shortcut/info');
      const data = await res.json();
      if (data.success && data.endpoint) {
        let ep = data.endpoint;
        if (ep.includes('localhost') && window.location.hostname !== 'localhost') {
          ep = `${window.location.origin}/api/finance/shortcut`;
        }
        urlInput.value = ep;
      } else {
        urlInput.value = `${window.location.origin}/api/finance/shortcut`;
      }
    } catch (_) {
      urlInput.value = `${window.location.origin}/api/finance/shortcut`;
    }
    if (resultBox) resultBox.style.display = 'none';
    modal.classList.add('active');
  }

  function closeModal() {
    modal.classList.remove('active');
  }

  btnOpen.addEventListener('click', openModal);
  if (btnClose) btnClose.addEventListener('click', closeModal);

  // Copy Webhook URL
  if (btnCopy && urlInput) {
    btnCopy.addEventListener('click', () => {
      urlInput.select();
      navigator.clipboard.writeText(urlInput.value)
        .then(() => showToast('Webhook URL Pintasan berhasil disalin!'))
        .catch(() => alert('Silakan salin URL secara manual: ' + urlInput.value));
    });
  }

  // Live Tester
  if (btnTest && testInput && resultBox) {
    btnTest.addEventListener('click', async () => {
      const query = testInput.value.trim();
      if (!query) return alert('Masukkan contoh teks transaksi terlebih dahulu.');

      btnTest.disabled = true;
      const oldText = btnTest.textContent;
      btnTest.textContent = '⏳ Menguji...';
      resultBox.style.display = 'none';

      try {
        const res = await fetch('/api/finance/shortcut', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: query })
        });
        const data = await res.json();

        resultBox.style.display = 'block';
        if (data.success) {
          resultBox.innerHTML = `
            <div style="font-weight:700;color:var(--fin-income);margin-bottom:4px;">${data.title}</div>
            <div style="color:var(--fin-text-main);">${data.message}</div>
          `;
          showToast('Pintasan sukses dieksekusi!');
          await refreshDashboard();
        } else {
          resultBox.innerHTML = `
            <div style="font-weight:700;color:var(--fin-expense);margin-bottom:4px;">${data.title || 'Gagal'}</div>
            <div style="color:var(--fin-text-muted);">${data.message || data.error}</div>
          `;
        }
      } catch (err) {
        resultBox.style.display = 'block';
        resultBox.innerHTML = `
          <div style="font-weight:700;color:var(--fin-expense);margin-bottom:4px;">⚠️ Error Server</div>
          <div style="color:var(--fin-text-muted);">${err.message}</div>
        `;
      } finally {
        btnTest.disabled = false;
        btnTest.textContent = oldText;
      }
    });

    testInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        btnTest.click();
      }
    });
  }
}


