/**
 * PatungIn - Smart Receipt Split Bill Engine
 * Open-source receipt scanner and proportional bill splitting utility.
 * Architecture: 4-Step Stepper (Upload -> Review -> Assign -> Settlement)
 */

const DEFAULT_MEMBERS = [
  { id: 'm1', name: 'Anggota 1', initial: 'A', paymentInfo: 'BCA 1234567890 a.n Anggota 1' },
  { id: 'm2', name: 'Anggota 2', initial: 'B', paymentInfo: 'Mandiri 0987654321 a.n Anggota 2' },
  { id: 'm3', name: 'Anggota 3', initial: 'C', paymentInfo: 'GoPay 08123456789' },
  { id: 'm4', name: 'Anggota 4', initial: 'D', paymentInfo: 'DANA 08571234567' },
  { id: 'm5', name: 'Anggota 5', initial: 'E', paymentInfo: 'BCA 5432167890 a.n Anggota 5' },
  { id: 'm6', name: 'Anggota 6', initial: 'F', paymentInfo: 'Bank Jago 100200300 a.n Anggota 6' }
];

const state = {
  currentStep: 1,
  members: [],
  payerId: 'm1',
  receipt: {
    merchant: '',
    date: '',
    items: [],
    subtotal: 0,
    tax: 0,
    service: 0,
    discount: 0,
    total: 0
  },
  presets: [],
  taxSplitMode: 'proportional', // 'proportional' | 'equal'
  roundingMode: 'none', // 'none' | '500' | '1000'
  apiKey: localStorage.getItem('gemini_api_key') || ''
};

// DOM Elements
const elements = {
  // Stepper & Header
  pageTitle: document.getElementById('page-title'),
  pageSubtitle: document.getElementById('page-subtitle'),
  btnHeaderBack: document.getElementById('btn-header-back'),
  stepperSteps: document.querySelectorAll('.stepper-step'),

  // Views
  step1View: document.getElementById('step-1-view'),
  step2View: document.getElementById('step-2-view'),
  step3View: document.getElementById('step-3-view'),
  step4View: document.getElementById('step-4-view'),

  // Step 1
  dropzone: document.getElementById('dropzone'),
  fileInput: document.getElementById('file-input'),
  btnBrowse: document.getElementById('btn-browse-file'),
  spinnerOverlay: document.getElementById('upload-loading-spinner'),
  spinnerStatus: document.getElementById('spinner-status-text'),
  circleChipsSummary: document.getElementById('circle-chips-summary'),
  payerSelect: document.getElementById('payer-select'),
  btnEditCircleInline: document.getElementById('btn-edit-circle-inline'),
  presetButtonsContainer: document.getElementById('preset-buttons-container'),

  // Step 2
  receiptMerchantName: document.getElementById('receipt-merchant-name'),
  receiptDateText: document.getElementById('receipt-date-text'),
  receiptItemsReviewList: document.getElementById('receipt-items-review-list'),
  displaySubtotal: document.getElementById('display-subtotal'),
  displayTax: document.getElementById('display-tax'),
  displayService: document.getElementById('display-service'),
  displayDiscount: document.getElementById('display-discount'),
  displayTotal: document.getElementById('display-total'),
  btnEditTax: document.getElementById('btn-edit-tax'),
  btnEditService: document.getElementById('btn-edit-service'),
  btnEditDiscount: document.getElementById('btn-edit-discount'),
  btnAddItemStep2: document.getElementById('btn-add-item-step2'),
  btnBackTo1: document.getElementById('btn-back-to-1'),
  btnProceedTo3: document.getElementById('btn-proceed-to-3'),

  // Step 3
  taxSplitMode: document.getElementById('tax-split-mode'),
  roundingMode: document.getElementById('rounding-mode'),
  unclaimedWarningPill: document.getElementById('unclaimed-warning-pill'),
  itemsContainer: document.getElementById('items-container'),
  previewSharesGrid: document.getElementById('preview-shares-grid'),
  btnBackTo2: document.getElementById('btn-back-to-2'),
  btnProceedTo4: document.getElementById('btn-proceed-to-4'),

  // Step 4
  finalMerchantName: document.getElementById('final-merchant-name'),
  finalTotalAmount: document.getElementById('final-total-amount'),
  finalPayerInfo: document.getElementById('final-payer-info'),
  finalMembersContainer: document.getElementById('final-members-container'),
  waPreview: document.getElementById('wa-message-preview'),
  btnCopyWa: document.getElementById('btn-copy-wa'),
  btnOpenWa: document.getElementById('btn-open-wa'),
  btnResetNewBill: document.getElementById('btn-reset-new-bill'),

  // Modals
  btnCircleSettings: document.getElementById('btn-circle-settings'),
  modalCircle: document.getElementById('modal-circle-settings'),
  btnCloseCircleModal: document.getElementById('btn-close-circle-modal'),
  circleSettingsForm: document.getElementById('circle-settings-form-container'),
  btnSaveCircle: document.getElementById('btn-save-circle'),
  btnResetDefaultCircle: document.getElementById('btn-reset-default-circle'),

  btnApiKey: document.getElementById('btn-api-key'),
  modalApiKey: document.getElementById('modal-api-key'),
  btnCloseApiModal: document.getElementById('btn-close-api-modal'),
  inputGeminiKey: document.getElementById('input-gemini-key'),
  btnSaveApiKey: document.getElementById('btn-save-api-key'),
  btnClearApiKey: document.getElementById('btn-clear-api-key'),

  modalCustomItem: document.getElementById('modal-custom-item'),
  btnCloseItemModal: document.getElementById('btn-close-item-modal'),
  btnCancelItemModal: document.getElementById('btn-cancel-item-modal'),
  btnSaveItemModal: document.getElementById('btn-save-item-modal'),
  inputItemName: document.getElementById('input-item-name'),
  inputItemQty: document.getElementById('input-item-qty'),
  inputItemPrice: document.getElementById('input-item-price'),

  toastContainer: document.getElementById('toast-container')
};

// Initialize Application
function init() {
  // Auto-dismiss splash screen smoothly after intro animation
  const splash = document.getElementById('splash-screen');
  if (splash) {
    const dismissSplash = () => {
      splash.classList.add('fade-out');
      setTimeout(() => splash.remove(), 450);
    };
    setTimeout(dismissSplash, 1100);
    splash.addEventListener('click', dismissSplash);
  }

  loadMembers();
  setupEventListeners();
  fetchPresets();
  goToStep(1);
}

function loadMembers() {
  const saved = localStorage.getItem('circle_members');
  if (saved) {
    try {
      state.members = JSON.parse(saved);
    } catch (e) {
      state.members = [...DEFAULT_MEMBERS];
    }
  } else {
    state.members = [...DEFAULT_MEMBERS];
  }

  if (state.members.length < 6) {
    state.members = [...DEFAULT_MEMBERS];
  }

  // Ensure initial letter exists
  state.members.forEach((m, idx) => {
    if (!m.initial) {
      m.initial = (m.name && m.name.charAt(0)) || String(idx + 1);
    }
  });

  renderStep1CircleChips();
  renderPayerSelect();
}

function saveMembers() {
  localStorage.setItem('circle_members', JSON.stringify(state.members));
  renderStep1CircleChips();
  renderPayerSelect();
  if (state.currentStep === 3) renderAssignmentItems();
  if (state.currentStep === 4) calculateAndRenderFinal();
  showToast('Pengaturan anggota berhasil disimpan', 'success');
}

// Stepper Navigation
function goToStep(step) {
  state.currentStep = step;

  elements.step1View.classList.toggle('hidden', step !== 1);
  elements.step2View.classList.toggle('hidden', step !== 2);
  elements.step3View.classList.toggle('hidden', step !== 3);
  elements.step4View.classList.toggle('hidden', step !== 4);

  elements.btnHeaderBack.classList.toggle('hidden', step === 1);

  elements.stepperSteps.forEach(st => {
    const sNum = Number(st.dataset.step);
    st.classList.remove('active', 'completed');
    if (sNum === step) {
      st.classList.add('active');
    } else if (sNum < step) {
      st.classList.add('completed');
    }
  });

  if (step === 1) {
    elements.pageTitle.textContent = 'PatungIn';
    elements.pageSubtitle.textContent = 'Smart Split Bill & Receipt Scanner';
  } else if (step === 2) {
    elements.pageTitle.textContent = 'Cek Tagihan';
    elements.pageSubtitle.textContent = state.receipt.merchant || 'Konfirmasi rincian menu';
    renderStep2Review();
  } else if (step === 3) {
    elements.pageTitle.textContent = 'Bagi Tagihan';
    elements.pageSubtitle.textContent = 'Pilih penikmat menu';
    renderAssignmentItems();
  } else if (step === 4) {
    elements.pageTitle.textContent = 'Selesai';
    elements.pageSubtitle.textContent = 'Rekap tagihan siap dikirim';
    calculateAndRenderFinal();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Event Listeners
function setupEventListeners() {
  elements.btnHeaderBack.addEventListener('click', () => {
    if (state.currentStep > 1) goToStep(state.currentStep - 1);
  });
  elements.btnBackTo1.addEventListener('click', () => goToStep(1));
  elements.btnProceedTo3.addEventListener('click', () => {
    if (state.receipt.items.length === 0) {
      showToast('Belum ada item dalam daftar tagihan', 'error');
      return;
    }
    goToStep(3);
  });
  elements.btnBackTo2.addEventListener('click', () => goToStep(2));
  elements.btnProceedTo4.addEventListener('click', () => goToStep(4));
  elements.btnResetNewBill.addEventListener('click', resetAllToStart);

  elements.payerSelect.addEventListener('change', (e) => {
    state.payerId = e.target.value;
    renderStep1CircleChips();
    if (state.currentStep === 3) renderAssignmentItems();
    if (state.currentStep === 4) calculateAndRenderFinal();
  });

  elements.taxSplitMode.addEventListener('change', (e) => {
    state.taxSplitMode = e.target.value;
    renderSharesPreview();
  });
  elements.roundingMode.addEventListener('change', (e) => {
    state.roundingMode = e.target.value;
    renderSharesPreview();
  });

  elements.btnBrowse.addEventListener('click', () => elements.fileInput.click());
  elements.dropzone.addEventListener('click', (e) => {
    if (e.target !== elements.btnBrowse && !e.target.closest('button')) {
      elements.fileInput.click();
    }
  });
  elements.fileInput.addEventListener('change', handleFileUpload);

  ['dragenter', 'dragover'].forEach(evt => {
    elements.dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      elements.dropzone.style.borderColor = 'var(--color-primary)';
    });
  });
  ['dragleave', 'drop'].forEach(evt => {
    elements.dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      elements.dropzone.style.borderColor = 'var(--color-border)';
    });
  });
  elements.dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      uploadFile(e.dataTransfer.files[0]);
    }
  });

  elements.btnCopyWa.addEventListener('click', copyWhatsAppRecap);
  elements.btnOpenWa.addEventListener('click', openWhatsAppDirect);

  elements.btnCircleSettings.addEventListener('click', openCircleModal);
  elements.btnEditCircleInline.addEventListener('click', openCircleModal);
  elements.btnCloseCircleModal.addEventListener('click', () => elements.modalCircle.classList.add('hidden'));
  elements.btnSaveCircle.addEventListener('click', handleSaveCircleFromModal);
  elements.btnResetDefaultCircle.addEventListener('click', () => {
    state.members = JSON.parse(JSON.stringify(DEFAULT_MEMBERS));
    renderCircleModalInputs();
  });

  elements.btnApiKey.addEventListener('click', openApiKeyModal);
  elements.btnCloseApiModal.addEventListener('click', () => elements.modalApiKey.classList.add('hidden'));
  elements.btnSaveApiKey.addEventListener('click', handleSaveApiKey);
  elements.btnClearApiKey.addEventListener('click', handleClearApiKey);

  elements.btnAddItemStep2.addEventListener('click', openAddItemModal);
  elements.btnCloseItemModal.addEventListener('click', () => elements.modalCustomItem.classList.add('hidden'));
  elements.btnCancelItemModal.addEventListener('click', () => elements.modalCustomItem.classList.add('hidden'));
  elements.btnSaveItemModal.addEventListener('click', handleSaveCustomItem);

  elements.btnEditTax.addEventListener('click', () => editCharge('tax', 'Pajak'));
  elements.btnEditService.addEventListener('click', () => editCharge('service', 'Service Charge'));
  elements.btnEditDiscount.addEventListener('click', () => editCharge('discount', 'Potongan Harga / Diskon'));
}

// Step 1: Member Chips & Presets
function renderStep1CircleChips() {
  elements.circleChipsSummary.innerHTML = '';
  state.members.forEach(m => {
    const isPayer = m.id === state.payerId;
    const chip = document.createElement('div');
    chip.className = `member-chip-pill ${isPayer ? 'is-payer' : ''}`;
    chip.innerHTML = `
      <span class="avatar-initial">${m.initial || m.name.charAt(0)}</span>
      <span class="member-chip-name">${m.name}</span>
      ${isPayer ? '<span class="payer-badge-mini">Payer</span>' : ''}
    `;
    elements.circleChipsSummary.appendChild(chip);
  });
}

function renderPayerSelect() {
  elements.payerSelect.innerHTML = '';
  state.members.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = `${m.name} (${m.paymentInfo || 'Belum diatur'})`;
    if (m.id === state.payerId) opt.selected = true;
    elements.payerSelect.appendChild(opt);
  });
}

async function fetchPresets() {
  try {
    const res = await fetch('/api/presets');
    const data = await res.json();
    if (data.success && data.presets) {
      state.presets = data.presets;
      renderPresetButtons();
    }
  } catch (err) {
    console.error('Failed to load presets:', err);
  }
}

function renderPresetButtons() {
  elements.presetButtonsContainer.innerHTML = '';
  state.presets.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'btn-preset-pill';
    btn.textContent = p.name.replace(/[^\w\s&]/gi, '').trim(); // Remove any emojis
    btn.addEventListener('click', () => loadPresetAndProceed(p.id));
    elements.presetButtonsContainer.appendChild(btn);
  });
}

function loadPresetAndProceed(presetId) {
  const found = state.presets.find(p => p.id === presetId);
  if (!found) return;

  const data = JSON.parse(JSON.stringify(found));

  data.items.forEach((item, idx) => {
    const n = item.name.toLowerCase();
    if (n.includes('shared') || n.includes('platter') || n.includes('nasi') || n.includes('pitcher')) {
      item.assignedTo = state.members.map(m => m.id);
    } else {
      item.assignedTo = [state.members[idx % state.members.length].id];
    }
  });

  state.receipt = data;
  showToast(`Memuat contoh struk: ${found.merchant}`, 'success');
  goToStep(2);
}

// File Upload
function handleFileUpload(e) {
  if (e.target.files && e.target.files[0]) {
    uploadFile(e.target.files[0]);
  }
}

async function uploadFile(file) {
  if (!file.type.startsWith('image/')) {
    showToast('Format file harus berupa gambar (JPG, PNG, WEBP)', 'error');
    return;
  }

  elements.spinnerOverlay.classList.remove('hidden');
  elements.spinnerStatus.textContent = state.apiKey
    ? 'Memindai struk dengan Gemini Vision API...'
    : 'Memproses struk (Mode Simulasi)...';

  const formData = new FormData();
  formData.append('receiptImage', file);
  if (state.apiKey) {
    formData.append('apiKey', state.apiKey);
  }

  try {
    const response = await fetch('/api/scan-receipt', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();
    elements.spinnerOverlay.classList.add('hidden');

    if (result.success && result.receipt) {
      const r = result.receipt;
      if (Array.isArray(r.items)) {
        r.items.forEach((item, idx) => {
          item.assignedTo = [state.members[idx % state.members.length].id];
        });
      }

      state.receipt = r;
      if (result.mode === 'gemini_vision') {
        showToast('Struk berhasil dipindai oleh AI', 'success');
      } else {
        showToast('Struk dimuat (Mode Simulasi)', 'info');
      }

      goToStep(2);
    } else {
      showToast(result.error || 'Gagal memproses struk', 'error');
    }
  } catch (err) {
    elements.spinnerOverlay.classList.add('hidden');
    console.error(err);
    showToast('Terjadi kesalahan koneksi server', 'error');
  }
}

// Step 2: Cek Tagihan
function renderStep2Review() {
  const r = state.receipt;
  elements.receiptMerchantName.textContent = r.merchant || 'Struk Belanja';
  elements.receiptDateText.textContent = `${r.date || 'Hari ini'} • ${r.items.length} Item`;

  elements.receiptItemsReviewList.innerHTML = '';

  r.items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'receipt-row-item';
    row.innerHTML = `
      <div class="row-item-left">
        <span class="qty-badge">${item.qty}x</span>
        <span class="item-name-text">${escapeHtml(item.name)}</span>
      </div>
      <div class="row-item-right">
        <span>Rp ${formatRupiah(item.total)}</span>
        <button type="button" class="btn-delete-item" data-id="${item.id}" title="Hapus Item" aria-label="Hapus">✕</button>
      </div>
    `;

    row.querySelector('.btn-delete-item').addEventListener('click', () => {
      state.receipt.items = state.receipt.items.filter(i => i.id !== item.id);
      recalculateTotals();
      renderStep2Review();
    });

    elements.receiptItemsReviewList.appendChild(row);
  });

  recalculateTotals();
}

function recalculateTotals() {
  const subtotal = state.receipt.items.reduce((s, it) => s + (Number(it.total) || 0), 0);
  const tax = Number(state.receipt.tax) || 0;
  const service = Number(state.receipt.service) || 0;
  const discount = Number(state.receipt.discount) || 0;
  const total = subtotal + tax + service - discount;

  state.receipt.subtotal = subtotal;
  state.receipt.total = total;

  elements.displaySubtotal.textContent = `Rp ${formatRupiah(subtotal)}`;
  elements.displayTax.textContent = `Rp ${formatRupiah(tax)}`;
  elements.displayService.textContent = `Rp ${formatRupiah(service)}`;
  elements.displayDiscount.textContent = `- Rp ${formatRupiah(discount)}`;
  elements.displayTotal.textContent = `Rp ${formatRupiah(total)}`;
}

// Step 3: Bagi Anggota
function renderAssignmentItems() {
  elements.itemsContainer.innerHTML = '';

  state.receipt.items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'assignment-card';

    const isAllClaimed = item.assignedTo && item.assignedTo.length === state.members.length;
    let splitNote = '';
    if (item.assignedTo && item.assignedTo.length > 1) {
      const perPerson = Math.round(item.total / item.assignedTo.length);
      splitNote = `<span class="split-portion-note">(@ Rp ${formatRupiah(perPerson)})</span>`;
    }

    card.innerHTML = `
      <div class="assignment-card-header">
        <span class="assignment-item-name">${item.qty}x ${escapeHtml(item.name)}</span>
        <div class="assignment-price-group">
          ${splitNote}
          <span class="assignment-item-price">Rp ${formatRupiah(item.total)}</span>
        </div>
      </div>
      <div class="assignment-card-actions">
        <div class="member-selector-chips">
          ${state.members.map(m => {
            const isClaimed = item.assignedTo && item.assignedTo.includes(m.id);
            return `
              <button type="button" 
                class="btn-member-chip ${isClaimed ? 'active' : ''}" 
                data-item-id="${item.id}" 
                data-member-id="${m.id}">
                <span class="chip-avatar-mini">${m.initial || m.name.charAt(0)}</span>
                <span>${m.name}</span>
                ${isClaimed ? '<span class="check-icon">✓</span>' : ''}
              </button>
            `;
          }).join('')}
        </div>
        <button type="button" class="btn-toggle-all" data-item-id="${item.id}">
          ${isAllClaimed ? 'Batalkan' : 'Bagi ke Semua'}
        </button>
      </div>
    `;

    card.querySelectorAll('.btn-member-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        toggleClaim(btn.dataset.itemId, btn.dataset.memberId);
      });
    });

    const btnToggleAll = card.querySelector('.btn-toggle-all');
    btnToggleAll.addEventListener('click', () => {
      toggleAllMembers(btnToggleAll.dataset.itemId);
    });

    elements.itemsContainer.appendChild(card);
  });

  renderSharesPreview();
}

function toggleClaim(itemId, memberId) {
  const item = state.receipt.items.find(i => i.id === itemId);
  if (!item) return;

  if (!item.assignedTo) item.assignedTo = [];
  const idx = item.assignedTo.indexOf(memberId);
  if (idx > -1) {
    item.assignedTo.splice(idx, 1);
  } else {
    item.assignedTo.push(memberId);
  }

  renderAssignmentItems();
}

function toggleAllMembers(itemId) {
  const item = state.receipt.items.find(i => i.id === itemId);
  if (!item) return;

  if (item.assignedTo && item.assignedTo.length === state.members.length) {
    item.assignedTo = [];
  } else {
    item.assignedTo = state.members.map(m => m.id);
  }

  renderAssignmentItems();
}

function renderSharesPreview() {
  const breakdowns = calculateBreakdowns();
  elements.previewSharesGrid.innerHTML = '';

  state.members.forEach(m => {
    const bd = breakdowns[m.id];
    const isPayer = m.id === state.payerId;

    const pill = document.createElement('div');
    pill.className = `share-preview-item ${isPayer ? 'is-payer' : ''}`;
    pill.innerHTML = `
      <div class="share-preview-header">
        <span class="avatar-initial-sm">${m.initial || m.name.charAt(0)}</span>
        <span class="share-preview-name">${m.name} ${isPayer ? '(Payer)' : ''}</span>
      </div>
      <strong class="share-preview-amount">Rp ${formatRupiah(bd.grandTotal)}</strong>
    `;
    elements.previewSharesGrid.appendChild(pill);
  });
}

// Calculation Logic (Proportional Fair Split)
function calculateBreakdowns() {
  const { items, tax = 0, service = 0, discount = 0 } = state.receipt;

  const breakdowns = {};
  state.members.forEach(m => {
    breakdowns[m.id] = {
      member: m,
      items: [],
      rawSubtotal: 0,
      taxShare: 0,
      serviceShare: 0,
      discountShare: 0,
      grandTotal: 0
    };
  });

  let totalClaimed = 0;
  let hasUnclaimed = false;

  items.forEach(item => {
    const claimants = item.assignedTo || [];
    if (claimants.length === 0) {
      hasUnclaimed = true;
      return;
    }

    const share = item.total / claimants.length;
    claimants.forEach(mId => {
      if (breakdowns[mId]) {
        breakdowns[mId].rawSubtotal += share;
        breakdowns[mId].items.push({
          name: item.name,
          portion: claimants.length === 1 ? '1x' : `1/${claimants.length}`,
          amount: share
        });
      }
    });
    totalClaimed += item.total;
  });

  elements.unclaimedWarningPill.classList.toggle('hidden', !hasUnclaimed);

  const isProportional = state.taxSplitMode === 'proportional';

  state.members.forEach(m => {
    const bd = breakdowns[m.id];
    if (isProportional) {
      const ratio = totalClaimed > 0 ? (bd.rawSubtotal / totalClaimed) : 0;
      bd.taxShare = ratio * tax;
      bd.serviceShare = ratio * service;
      bd.discountShare = ratio * discount;
    } else {
      bd.taxShare = tax / state.members.length;
      bd.serviceShare = service / state.members.length;
      bd.discountShare = discount / state.members.length;
    }

    let rawTotal = bd.rawSubtotal + bd.taxShare + bd.serviceShare - bd.discountShare;
    if (rawTotal < 0) rawTotal = 0;

    if (state.roundingMode === '500') {
      bd.grandTotal = Math.round(rawTotal / 500) * 500;
    } else if (state.roundingMode === '1000') {
      bd.grandTotal = Math.round(rawTotal / 1000) * 1000;
    } else {
      bd.grandTotal = Math.round(rawTotal);
    }
  });

  return breakdowns;
}

// Step 4: Selesai & Format WhatsApp
function calculateAndRenderFinal() {
  const breakdowns = calculateBreakdowns();
  const payer = state.members.find(m => m.id === state.payerId) || state.members[0];

  elements.finalMerchantName.textContent = state.receipt.merchant || 'Struk Belanja';
  elements.finalTotalAmount.textContent = `Total: Rp ${formatRupiah(state.receipt.total)}`;
  elements.finalPayerInfo.textContent = `Penanggung: ${payer.name}`;

  elements.finalMembersContainer.innerHTML = '';

  state.members.forEach(m => {
    const bd = breakdowns[m.id];
    const isPayer = m.id === state.payerId;

    const row = document.createElement('div');
    row.className = `final-member-row ${isPayer ? 'is-payer' : ''}`;

    const statusText = isPayer
      ? 'Penanggung Tagihan (Payer)'
      : `Transfer ke ${payer.name}`;

    row.innerHTML = `
      <div class="final-row-left">
        <span class="avatar-initial">${m.initial || m.name.charAt(0)}</span>
        <div>
          <div class="final-row-name">${m.name}</div>
          <div class="final-row-sub">${statusText}</div>
        </div>
      </div>
      <div class="final-row-amount">
        Rp ${formatRupiah(bd.grandTotal)}
      </div>
    `;

    elements.finalMembersContainer.appendChild(row);
  });

  generateWhatsAppRecap(breakdowns, state.receipt.total);
}

function generateWhatsAppRecap(breakdowns, totalBill) {
  const payer = state.members.find(m => m.id === state.payerId) || state.members[0];
  const merchant = state.receipt.merchant || 'Merchant';
  const dateStr = state.receipt.date || new Date().toLocaleDateString('id-ID');

  let msg = `*RINCIAN SPLIT BILL: ${merchant.toUpperCase()}*\n`;
  msg += `Tanggal: ${dateStr}\n`;
  msg += `Total Tagihan: *Rp ${formatRupiah(totalBill)}*\n`;
  msg += `Penanggung Pembayaran: *${payer.name}*\n`;
  msg += `----------------------------------------\n`;
  msg += `*PEMBAGIAN PER ANGGOTA:*\n\n`;

  let counter = 1;
  state.members.forEach(m => {
    const bd = breakdowns[m.id];
    const isPayer = m.id === state.payerId;

    msg += `${counter}. *${m.name}*`;
    if (isPayer) {
      msg += ` *(Penanggung Pembayaran)*\n`;
      msg += `   • Porsi Sendiri: Rp ${formatRupiah(bd.grandTotal)}\n`;
    } else {
      msg += `\n`;
      msg += `   • *Nominal Transfer: Rp ${formatRupiah(bd.grandTotal)}*\n`;
    }

    if (bd.items.length > 0) {
      const itemsList = bd.items.map(i => `${i.name} (${i.portion})`).join(', ');
      msg += `   • Menu: ${itemsList}\n`;
    } else {
      msg += `   • Menu: -\n`;
    }
    msg += `\n`;
    counter++;
  });

  msg += `----------------------------------------\n`;
  msg += `*REKENING PEMBAYARAN (${payer.name.toUpperCase()}):*\n`;
  msg += `${payer.paymentInfo || 'Hubungi penanggung pembayaran untuk nomor rekening'}\n\n`;
  msg += `_Catatan: Mohon konfirmasi atau kirim bukti transfer jika pembayaran telah dilakukan. Terima kasih._`;

  elements.waPreview.textContent = msg;
  return msg;
}

function copyWhatsAppRecap() {
  const text = elements.waPreview.textContent;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Format rincian berhasil disalin ke clipboard', 'success');
  }).catch(() => {
    showToast('Gagal menyalin otomatis', 'error');
  });
}

function openWhatsAppDirect() {
  const text = encodeURIComponent(elements.waPreview.textContent);
  window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
}

function resetAllToStart() {
  state.receipt = {
    merchant: '',
    date: '',
    items: [],
    subtotal: 0,
    tax: 0,
    service: 0,
    discount: 0,
    total: 0
  };
  goToStep(1);
  showToast('Sesi split bill telah direset', 'info');
}

// Modals
function openCircleModal() {
  renderCircleModalInputs();
  elements.modalCircle.classList.remove('hidden');
}

function renderCircleModalInputs() {
  elements.circleSettingsForm.innerHTML = '';
  state.members.forEach((m, idx) => {
    const row = document.createElement('div');
    row.className = 'form-member-row';
    row.innerHTML = `
      <div class="avatar-initial-badge">${m.initial || m.name.charAt(0)}</div>
      <input type="text" class="input-text" value="${escapeHtml(m.name)}" data-idx="${idx}" data-field="name" placeholder="Nama Anggota">
      <input type="text" class="input-text" value="${escapeHtml(m.paymentInfo || '')}" data-idx="${idx}" data-field="paymentInfo" placeholder="Rekening / E-Wallet">
    `;
    elements.circleSettingsForm.appendChild(row);
  });
}

function handleSaveCircleFromModal() {
  const rows = elements.circleSettingsForm.querySelectorAll('.form-member-row');
  rows.forEach((row, idx) => {
    const nameInput = row.querySelector('[data-field="name"]');
    const paymentInput = row.querySelector('[data-field="paymentInfo"]');

    if (state.members[idx]) {
      const name = nameInput.value.trim() || `Anggota ${idx + 1}`;
      state.members[idx].name = name;
      state.members[idx].initial = name.charAt(0).toUpperCase();
      state.members[idx].paymentInfo = paymentInput.value.trim();
    }
  });

  saveMembers();
  elements.modalCircle.classList.add('hidden');
}

function openApiKeyModal() {
  elements.inputGeminiKey.value = state.apiKey;
  elements.modalApiKey.classList.remove('hidden');
}

function handleSaveApiKey() {
  const key = elements.inputGeminiKey.value.trim();
  state.apiKey = key;
  localStorage.setItem('gemini_api_key', key);
  elements.modalApiKey.classList.add('hidden');
  showToast('Gemini API Key tersimpan', 'success');
}

function handleClearApiKey() {
  state.apiKey = '';
  localStorage.removeItem('gemini_api_key');
  elements.inputGeminiKey.value = '';
  elements.modalApiKey.classList.add('hidden');
  showToast('API Key telah dihapus', 'info');
}

function openAddItemModal() {
  elements.inputItemName.value = '';
  elements.inputItemQty.value = '1';
  elements.inputItemPrice.value = '';
  elements.modalCustomItem.classList.remove('hidden');
}

function handleSaveCustomItem() {
  const name = elements.inputItemName.value.trim();
  const qty = Number(elements.inputItemQty.value) || 1;
  const price = Number(elements.inputItemPrice.value) || 0;

  if (!name || price <= 0) {
    showToast('Masukkan nama dan harga yang valid', 'error');
    return;
  }

  const newItem = {
    id: `custom-${Date.now()}`,
    name,
    qty,
    price: Math.round(price / qty),
    total: price,
    assignedTo: [state.members[0].id]
  };

  state.receipt.items.push(newItem);
  recalculateTotals();
  renderStep2Review();
  elements.modalCustomItem.classList.add('hidden');
  showToast(`Item "${name}" berhasil ditambahkan`, 'success');
}

function editCharge(field, label) {
  const currentVal = state.receipt[field] || 0;
  const newVal = prompt(`Ubah nilai ${label} (Rp):`, currentVal);
  if (newVal !== null) {
    const num = Number(newVal);
    if (!isNaN(num) && num >= 0) {
      state.receipt[field] = num;
      recalculateTotals();
      showToast(`${label} diperbarui menjadi Rp ${formatRupiah(num)}`, 'success');
    }
  }
}

// Utility Functions
function formatRupiah(num) {
  if (isNaN(num)) return '0';
  return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 250);
  }, 2800);
}

document.addEventListener('DOMContentLoaded', init);
