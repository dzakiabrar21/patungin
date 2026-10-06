/**
 * PatungIn Finance Dashboard JavaScript
 * Logic for overview, transactions, analytics, and modals
 */

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
  
  await loadCategories();
  await refreshDashboard();
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

  btnToday.addEventListener('click', () => {
    state.currentMonth = new Date().toISOString().slice(0, 7);
    updateMonthLabel();
    refreshDashboard();
  });

  updateMonthLabel();
}

// 2. Fetch and Render Finance Overview
async function loadOverview() {
  try {
    const res = await fetch(`/api/finance/overview?month=${state.currentMonth}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    state.overviewData = data;
    state.accounts = data.accounts || [];

    // Render Net Worth & Stats
    document.getElementById('hero-total-balance').textContent = `Rp ${formatRupiah(data.totalBalance)}`;
    document.getElementById('hero-total-income').textContent = `+Rp ${formatRupiah(data.totalIncome)}`;
    document.getElementById('hero-total-expense').textContent = `-Rp ${formatRupiah(data.totalExpense)}`;
    
    const savingEl = document.getElementById('hero-net-savings');
    const savingSign = data.netSavings >= 0 ? '+' : '-';
    savingEl.textContent = `${savingSign}Rp ${formatRupiah(Math.abs(data.netSavings))}`;
    savingEl.className = 'fin-stat-val ' + (data.netSavings >= 0 ? 'income' : 'expense');

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

// Render Wallets Horizontal Cards
function renderWallets(accounts) {
  const container = document.getElementById('wallets-container');
  if (!container) return;

  if (!accounts || accounts.length === 0) {
    container.innerHTML = '<div style="color:var(--fin-text-muted);font-size:0.85rem;">Belum ada dompet terdaftar.</div>';
    return;
  }

  // Predefined wallet brand colors
  const brandColors = {
    'bca': '#00509d',
    'mandiri': '#0b3b60',
    'gopay': '#0081a7',
    'ovo': '#4c1d95',
    'shopeepay': '#ea580c',
    'cash': '#10b981',
    'tunai': '#10b981',
    'dana': '#118eea',
    'seabank': '#ff5a00'
  };

  container.innerHTML = accounts.map(acc => {
    const nameLower = acc.name.toLowerCase();
    let bg = brandColors[nameLower] || '#0081a7';
    const isActive = state.currentAccount === acc.id;

    return `
      <div class="fin-wallet-card ${isActive ? 'active' : ''}" onclick="filterByWallet('${acc.id}')">
        <div class="fin-wallet-top">
          <div class="fin-wallet-badge" style="background:${bg}">${acc.name.slice(0, 2).toUpperCase()}</div>
          <span class="fin-wallet-type">${acc.type}</span>
        </div>
        <div class="fin-wallet-name" title="${acc.name}">${acc.name}</div>
        <div class="fin-wallet-balance">Rp ${formatRupiah(acc.balance)}</div>
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

// Render Category Breakdown
function renderCategoriesBreakdown(categories, totalExpense) {
  const listEl = document.getElementById('cat-breakdown-list');
  if (!listEl) return;

  if (!categories || categories.length === 0) {
    listEl.innerHTML = '<div style="color:var(--fin-text-muted);font-size:0.85rem;padding:12px 0;">Belum ada pengeluaran di bulan ini.</div>';
    return;
  }

  listEl.innerHTML = categories.slice(0, 6).map(c => {
    return `
      <div class="fin-cat-item">
        <div class="fin-cat-item-top">
          <div class="fin-cat-item-name">
            <span>${c.icon || '🏷️'}</span>
            <span>${c.name}</span>
          </div>
          <div class="fin-cat-item-amt">Rp ${formatRupiah(c.amount)} <small style="color:var(--fin-text-muted)">(${c.percentage}%)</small></div>
        </div>
        <div class="fin-cat-bar-bg">
          <div class="fin-cat-bar-fill" style="width: ${c.percentage}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

// Render Daily Bar Chart
function renderDailyTrend(dailyTrend, monthStr) {
  const chartEl = document.getElementById('daily-chart-container');
  if (!chartEl) return;

  if (!dailyTrend || dailyTrend.length === 0) {
    chartEl.innerHTML = '<div style="color:var(--fin-text-muted);font-size:0.85rem;margin:auto;">Belum ada aktivitas transaksi harian.</div>';
    return;
  }

  const maxExpense = Math.max(...dailyTrend.map(d => d.expense), 100000);

  chartEl.innerHTML = dailyTrend.map(d => {
    const dayNum = d.date.split('-')[2];
    const heightPct = Math.max(Math.round((d.expense / maxExpense) * 100), 5);
    const tooltip = `Tgl ${dayNum}: Rp ${formatRupiah(d.expense)}`;

    return `
      <div class="fin-daily-col" title="${tooltip}">
        <div class="fin-daily-bar" style="height: ${heightPct}%;"></div>
        <span class="fin-daily-lbl">${dayNum}</span>
      </div>
    `;
  }).join('');
}

// 3. Fetch and Render Transactions List
async function loadTransactions() {
  const listContainer = document.getElementById('transactions-list');
  if (!listContainer) return;

  listContainer.innerHTML = '<div style="text-align:center;padding:20px;color:var(--fin-text-muted);">Memuat transaksi...</div>';

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
        <div class="fin-empty-state">
          <div class="fin-empty-state-icon">💸</div>
          <p>Belum ada transaksi pada filter ini.</p>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = rows.map(tx => {
      const isExpense = tx.type === 'expense';
      const isIncome = tx.type === 'income';
      const isTransfer = tx.type === 'transfer';

      let sign = '-';
      let typeClass = 'expense';
      let icon = tx.category_icon || '🏷️';

      if (isIncome) {
        sign = '+';
        typeClass = 'income';
        icon = tx.category_icon || '💰';
      } else if (isTransfer) {
        sign = '';
        typeClass = 'transfer';
        icon = '🔁';
      }

      // Source label
      let srcBadge = 'Web';
      if (tx.source === 'wa_dm') srcBadge = 'WA Chat';
      else if (tx.source === 'wa_image') srcBadge = 'Struk/QRIS';
      else if (tx.source === 'wa_vn') srcBadge = 'Voice Note';

      const walletLabel = isTransfer
        ? `${tx.account_name || 'Cash'} ➔ ${tx.to_account_name || 'Dompet'}`
        : (tx.account_name || 'Cash');

      return `
        <div class="fin-tx-item">
          <div class="fin-tx-left">
            <div class="fin-tx-icon ${typeClass}">${icon}</div>
            <div class="fin-tx-info">
              <div class="fin-tx-desc">${tx.merchant || tx.description || 'Transaksi'}</div>
              <div class="fin-tx-meta">
                <span>${formatDateIndo(tx.transaction_date)}</span>
                <span>•</span>
                <span class="fin-tx-badge">${walletLabel}</span>
                <span class="fin-tx-badge">${srcBadge}</span>
              </div>
            </div>
          </div>
          <div class="fin-tx-right">
            <div class="fin-tx-amount ${typeClass}">${sign}Rp ${formatRupiah(tx.amount)}</div>
            <button type="button" class="fin-tx-del-btn" title="Hapus Transaksi" onclick="confirmDeleteTransaction('${tx.id}', '${tx.description || tx.merchant || 'transaksi'}')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
    listContainer.innerHTML = '<div style="color:var(--fin-expense);text-align:center;padding:20px;">Gagal memuat daftar transaksi.</div>';
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
  const pills = document.querySelectorAll('.fin-type-pill');
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
    document.getElementById('tx-modal-date').value = new Date().toISOString().slice(0, 16);
    modal.classList.add('active');
  }

  function closeModal() {
    modal.classList.remove('active');
    form.reset();
  }

  btnOpen.addEventListener('click', openModal);
  if (btnClose) btnClose.addEventListener('click', closeModal);
  if (btnCancel) btnCancel.addEventListener('click', closeModal);

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

