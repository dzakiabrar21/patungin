/**
 * PatungIn - Smart Receipt Split Bill Engine
 * Open-source receipt scanner and proportional bill splitting utility.
 * Architecture: 4-Step Stepper (Upload -> Review -> Assign -> Settlement)
 */

const DEFAULT_MEMBERS = [
  { 
    id: 'm1', 
    name: 'Saya', 
    initial: 'S', 
    paymentInfo: 'BCA: 1234567890 a.n Saya\nBSI: 7123456789 a.n Saya\nGoPay: 08123456789' 
  },
  { 
    id: 'm2', 
    name: 'Andi', 
    initial: 'A', 
    paymentInfo: 'Mandiri: 0987654321 a.n Andi\nShopeePay: 08129876543' 
  },
  { 
    id: 'm3', 
    name: 'Budi', 
    initial: 'B', 
    paymentInfo: 'BCA: 5432167890 a.n Budi\nGoPay: 08123456789' 
  },
  { 
    id: 'm4', 
    name: 'Citra', 
    initial: 'C', 
    paymentInfo: 'BSI: 8901234567 a.n Citra\nDANA: 08571234567' 
  }
];

const state = {
  currentStep: 1,
  allMembers: [], // Master friends pool
  participatingMemberIds: [], // IDs of members active in this specific bill
  payerMode: 'single', // 'single' | 'multi'
  payerId: 'm1',
  payerAmounts: {}, // { [memberId]: number } for multi-payer mode
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
  presetButtonsContainer: document.getElementById('preset-buttons-container'),

  // Step 2 (Review)
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

  // Step 3 (Select Participants & Assign Items)
  participantsToggleList: document.getElementById('participants-toggle-list'),
  inputQuickName: document.getElementById('input-quick-name'),
  btnQuickAdd: document.getElementById('btn-quick-add'),
  step3PayerSelect: document.getElementById('step3-payer-select'),
  btnPayerModeSingle: document.getElementById('btn-payer-mode-single'),
  btnPayerModeMulti: document.getElementById('btn-payer-mode-multi'),
  singlePayerContainer: document.getElementById('single-payer-container'),
  multiPayerContainer: document.getElementById('multi-payer-container'),
  multiPayerInputsList: document.getElementById('multi-payer-inputs-list'),
  multiPaidTotal: document.getElementById('multi-paid-total'),
  multiReceiptTotal: document.getElementById('multi-receipt-total'),
  multiPaidDiff: document.getElementById('multi-paid-diff'),
  btnSplitPayersEqual: document.getElementById('btn-split-payers-equal'),
  transferDirectionsCard: document.getElementById('transfer-directions-card'),
  transferDirectionsList: document.getElementById('transfer-directions-list'),
  taxSplitMode: document.getElementById('tax-split-mode'),
  roundingMode: document.getElementById('rounding-mode'),
  unclaimedWarningPill: document.getElementById('unclaimed-warning-pill'),
  itemsContainer: document.getElementById('items-container'),
  previewSharesGrid: document.getElementById('preview-shares-grid'),
  btnBackTo2: document.getElementById('btn-back-to-2'),
  btnProceedTo4: document.getElementById('btn-proceed-to-4'),

  // Step 4 (Final Settlement)
  finalMerchantName: document.getElementById('final-merchant-name'),
  finalTotalAmount: document.getElementById('final-total-amount'),
  finalPayerInfo: document.getElementById('final-payer-info'),
  finalMembersContainer: document.getElementById('final-members-container'),
  waPreview: document.getElementById('wa-message-preview'),
  btnCopyWa: document.getElementById('btn-copy-wa'),
  btnOpenWa: document.getElementById('btn-open-wa'),
  btnResetNewBill: document.getElementById('btn-reset-new-bill'),

  // Modals
  // Modal 1: Anggota
  btnCircleSettings: document.getElementById('btn-circle-settings'),
  modalCircle: document.getElementById('modal-circle-settings'),
  btnCloseCircleModal: document.getElementById('btn-close-circle-modal'),
  circlePickListContainer: document.getElementById('circle-pick-list-container'),
  inputModalQuickName: document.getElementById('input-modal-quick-name'),
  btnModalQuickAdd: document.getElementById('btn-modal-quick-add'),
  btnSwitchToPayment: document.getElementById('btn-switch-to-payment'),
  btnSaveCircle: document.getElementById('btn-save-circle'),
  btnResetDefaultCircle: document.getElementById('btn-reset-default-circle'),

  // Modal 2: Rekening
  btnPaymentSettings: document.getElementById('btn-payment-settings'),
  btnOpenRekInline: document.getElementById('btn-open-rek-inline'),
  modalPayment: document.getElementById('modal-payment-settings'),
  btnClosePaymentModal: document.getElementById('btn-close-payment-modal'),
  btnCancelPayment: document.getElementById('btn-cancel-payment'),
  paymentSettingsForm: document.getElementById('payment-settings-form-container'),
  btnSavePayment: document.getElementById('btn-save-payment'),

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
  goToStep(1);
}

// Members Management
function loadMembers() {
  const saved = localStorage.getItem('patungin_members');
  if (saved) {
    try {
      state.allMembers = JSON.parse(saved);
    } catch {
      state.allMembers = [...DEFAULT_MEMBERS];
    }
  } else {
    state.allMembers = [...DEFAULT_MEMBERS];
  }

  // By default, everyone is participating
  state.participatingMemberIds = state.allMembers.map(m => m.id);
  state.payerId = state.participatingMemberIds[0] || 'm1';
}

function saveMembers() {
  localStorage.setItem('patungin_members', JSON.stringify(state.allMembers));
}

function getActiveParticipants() {
  return state.allMembers.filter(m => state.participatingMemberIds.includes(m.id));
}

// Stepper Navigation with guaranteed visibility toggling
function goToStep(step) {
  state.currentStep = step;

  const views = [elements.step1View, elements.step2View, elements.step3View, elements.step4View];
  views.forEach((view, idx) => {
    if (!view) return;
    const isCurrent = (idx + 1) === step;
    view.classList.toggle('active', isCurrent);
    view.classList.toggle('hidden', !isCurrent);
  });

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
    elements.pageTitle.textContent = 'Pilih & Bagi';
    elements.pageSubtitle.textContent = 'Pilih yang ikut & penikmat menu';
    renderStep3();
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
      showToast('Belum ada menu dalam daftar tagihan', 'error');
      return;
    }
    goToStep(3);
  });

  elements.btnBackTo2.addEventListener('click', () => goToStep(2));

  elements.btnProceedTo4.addEventListener('click', () => {
    const active = getActiveParticipants();
    if (active.length === 0) {
      showToast('Pilih minimal 1 orang yang ikut patungan!', 'error');
      return;
    }
    goToStep(4);
  });

  elements.btnResetNewBill.addEventListener('click', resetAllToStart);

  // Quick Add Member in Step 3
  elements.btnQuickAdd.addEventListener('click', handleQuickAddMember);
  elements.inputQuickName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleQuickAddMember();
    }
  });

  // Step 3 Payer Mode Switching
  elements.btnPayerModeSingle.addEventListener('click', () => setPayerMode('single'));
  elements.btnPayerModeMulti.addEventListener('click', () => setPayerMode('multi'));
  elements.btnSplitPayersEqual.addEventListener('click', splitPayerAmountsEqually);

  // Step 3 Payer change
  elements.step3PayerSelect.addEventListener('change', (e) => {
    state.payerId = e.target.value;
    renderStep3LiveShares();
  });

  elements.taxSplitMode.addEventListener('change', (e) => {
    state.taxSplitMode = e.target.value;
    renderStep3LiveShares();
  });

  elements.roundingMode.addEventListener('change', (e) => {
    state.roundingMode = e.target.value;
    renderStep3LiveShares();
  });

  // File Upload Handlers
  elements.btnBrowse.addEventListener('click', () => elements.fileInput.click());
  elements.fileInput.addEventListener('change', handleFileUpload);
  elements.dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.dropzone.classList.add('dragover');
  });
  elements.dropzone.addEventListener('dragleave', () => elements.dropzone.classList.remove('dragover'));
  elements.dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.dropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      uploadFile(e.dataTransfer.files[0]);
    }
  });

  // WhatsApp Actions
  elements.btnCopyWa.addEventListener('click', copyWaMessage);
  elements.btnOpenWa.addEventListener('click', openWaDirect);

  // Custom Item Modal
  elements.btnAddItemStep2.addEventListener('click', () => openItemModal());
  elements.btnCloseItemModal.addEventListener('click', closeItemModal);
  elements.btnCancelItemModal.addEventListener('click', closeItemModal);
  elements.btnSaveItemModal.addEventListener('click', saveCustomItem);

  // Editable Tax/Service/Discount
  elements.btnEditTax.addEventListener('click', () => promptEditCharge('tax', 'Pajak Resto (PB1)'));
  elements.btnEditService.addEventListener('click', () => promptEditCharge('service', 'Service Charge'));
  elements.btnEditDiscount.addEventListener('click', () => promptEditCharge('discount', 'Diskon Promo'));

  // Modal 1: Anggota
  elements.btnCircleSettings.addEventListener('click', openCircleModal);
  elements.btnCloseCircleModal.addEventListener('click', closeCircleModal);
  elements.btnSaveCircle.addEventListener('click', saveCircleModalChanges);
  elements.btnResetDefaultCircle.addEventListener('click', resetDefaultCircle);
  elements.btnModalQuickAdd.addEventListener('click', handleModalQuickAdd);
  elements.inputModalQuickName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleModalQuickAdd();
    }
  });
  elements.btnSwitchToPayment.addEventListener('click', () => {
    closeCircleModal();
    openPaymentModal();
  });

  // Modal 2: Rekening
  elements.btnPaymentSettings.addEventListener('click', openPaymentModal);
  if (elements.btnOpenRekInline) elements.btnOpenRekInline.addEventListener('click', openPaymentModal);
  elements.btnClosePaymentModal.addEventListener('click', closePaymentModal);
  elements.btnCancelPayment.addEventListener('click', closePaymentModal);
  elements.btnSavePayment.addEventListener('click', savePaymentModalChanges);

  elements.btnApiKey.addEventListener('click', openApiKeyModal);
  elements.btnCloseApiModal.addEventListener('click', closeApiKeyModal);
  elements.btnSaveApiKey.addEventListener('click', saveApiKey);
  elements.btnClearApiKey.addEventListener('click', clearApiKey);
}

// Quick Add Member in Step 3
function handleQuickAddMember() {
  const name = elements.inputQuickName.value.trim();
  if (!name) {
    showToast('Masukkan nama teman terlebih dahulu', 'error');
    return;
  }

  const newId = 'm_' + Date.now();
  const initial = name.charAt(0).toUpperCase();
  const newMember = {
    id: newId,
    name: name,
    initial: initial,
    paymentInfo: 'Transfer ke ' + name
  };

  state.allMembers.push(newMember);
  state.participatingMemberIds.push(newId);
  saveMembers();

  elements.inputQuickName.value = '';
  showToast(`${name} ditambahkan ke daftar patungan`, 'success');
  renderStep3();
}

// Load Presets
async function loadPresets() {
  try {
    const res = await fetch('/api/presets');
    const data = await res.json();
    if (data.success && Array.isArray(data.presets)) {
      state.presets = data.presets;
      renderPresetButtons();
    }
  } catch (err) {
    console.error('Failed loading presets', err);
  }
}

function renderPresetButtons() {
  if (!elements.presetButtonsContainer) return;
  elements.presetButtonsContainer.innerHTML = '';
  state.presets.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'btn-preset-pill';
    btn.textContent = p.name.replace(/[^\w\s&]/gi, '').trim();
    btn.addEventListener('click', () => loadPresetAndProceed(p.id));
    elements.presetButtonsContainer.appendChild(btn);
  });
}

function loadPresetAndProceed(presetId) {
  const found = state.presets.find(p => p.id === presetId);
  if (!found) return;

  const data = JSON.parse(JSON.stringify(found));
  const active = getActiveParticipants();
  const activeIds = active.length > 0 ? active.map(m => m.id) : state.allMembers.map(m => m.id);

  data.items.forEach((item, idx) => {
    const n = item.name.toLowerCase();
    if (n.includes('shared') || n.includes('platter') || n.includes('nasi') || n.includes('pitcher')) {
      item.assignedTo = [...activeIds];
    } else {
      item.assignedTo = [activeIds[idx % activeIds.length]];
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
      const active = getActiveParticipants();
      const activeIds = active.length > 0 ? active.map(m => m.id) : state.allMembers.map(m => m.id);

      if (Array.isArray(r.items)) {
        r.items.forEach((item, idx) => {
          item.assignedTo = [activeIds[idx % activeIds.length]];
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
      showToast(result.error || 'Gagal memindai struk', 'error');
    }
  } catch (err) {
    elements.spinnerOverlay.classList.add('hidden');
    showToast('Terjadi kesalahan koneksi server', 'error');
    console.error(err);
  }
}

// Step 2: Cek Detail Pesanan
function renderStep2Review() {
  const r = state.receipt;
  elements.receiptMerchantName.textContent = r.merchant || 'Struk Belanja';
  elements.receiptDateText.textContent = `${r.date || 'Hari ini'} • ${r.items.length} Item`;

  elements.receiptItemsReviewList.innerHTML = '';

  if (r.items.length === 0) {
    elements.receiptItemsReviewList.innerHTML = `
      <div style="text-align: center; padding: 1.5rem; color: #94a3b8; font-size: 0.85rem;">
        Belum ada menu yang terbaca. Klik <strong>+ Menu Manual</strong> untuk menambah.
      </div>
    `;
  }

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

// Step 3: Render All Components (Participant selection + Menu assignment)
function renderStep3() {
  renderParticipantSelection();
  renderStep3PayerDropdown();
  if (state.payerMode === "multi") renderMultiPayerInputs();
  renderAssignmentItems();
  renderStep3LiveShares();
}

// Step 3: Participant Selection Toggles
function renderParticipantSelection() {
  elements.participantsToggleList.innerHTML = '';

  state.allMembers.forEach(member => {
    const isParticipating = state.participatingMemberIds.includes(member.id);
    const chip = document.createElement('div');
    chip.className = 'participant-select-chip' + (isParticipating ? ' active' : '');
    chip.innerHTML = `
      <div class="participant-avatar-badge">${escapeHtml(member.initial)}</div>
      <div class="participant-chip-info">
        <span class="participant-chip-name">${escapeHtml(member.name)}</span>
        <span class="participant-chip-status">${isParticipating ? 'Ikut Patungan' : 'Tidak Ikut'}</span>
      </div>
      <span class="participant-check-icon">${isParticipating ? '✓' : ''}</span>
    `;

    chip.addEventListener('click', () => {
      toggleMemberParticipation(member.id);
    });

    elements.participantsToggleList.appendChild(chip);
  });
}

function toggleMemberParticipation(memberId) {
  const idx = state.participatingMemberIds.indexOf(memberId);
  if (idx > -1) {
    if (state.participatingMemberIds.length <= 1) {
      showToast('Minimal harus ada 1 orang yang ikut patungan', 'error');
      return;
    }
    state.participatingMemberIds.splice(idx, 1);

    // Remove from assigned items
    state.receipt.items.forEach(it => {
      if (it.assignedTo) {
        it.assignedTo = it.assignedTo.filter(id => id !== memberId);
      }
    });

    // If payer was unselected, assign to another participant
    if (state.payerId === memberId) {
      state.payerId = state.participatingMemberIds[0] || '';
    }
  } else {
    state.participatingMemberIds.push(memberId);
  }

  renderStep3();
}

function renderStep3PayerDropdown() {
  const active = getActiveParticipants();
  elements.step3PayerSelect.innerHTML = '';

  active.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    // Extract first account or summary for dropdown label
    let accountSummary = 'Belum ada rek';
    if (m.paymentInfo && m.paymentInfo.trim()) {
      const firstLine = m.paymentInfo.split('\n')[0].trim();
      const accountsCount = m.paymentInfo.split('\n').filter(Boolean).length;
      accountSummary = accountsCount > 1 ? `${firstLine} (+ ${accountsCount - 1} rek lainnya)` : firstLine;
    }
    opt.textContent = `${m.name} (${accountSummary})`;
    if (m.id === state.payerId) opt.selected = true;
    elements.step3PayerSelect.appendChild(opt);
  });

  if (!state.participatingMemberIds.includes(state.payerId) && active.length > 0) {
    state.payerId = active[0].id;
    elements.step3PayerSelect.value = state.payerId;
  }
}

// Step 3: Assignment Items List
function renderAssignmentItems() {
  elements.itemsContainer.innerHTML = '';
  const active = getActiveParticipants();

  let hasUnclaimed = false;

  state.receipt.items.forEach(item => {
    if (!item.assignedTo) item.assignedTo = [];

    // Clean up members who are no longer participating
    item.assignedTo = item.assignedTo.filter(id => state.participatingMemberIds.includes(id));

    if (item.assignedTo.length === 0) {
      hasUnclaimed = true;
    }

    const card = document.createElement('div');
    card.className = 'assignment-card';

    const isAllClaimed = active.length > 0 && item.assignedTo.length === active.length;
    let splitNote = '';
    if (item.assignedTo.length > 1) {
      const perPerson = Math.round(item.total / item.assignedTo.length);
      splitNote = `<span class="split-portion-note">(@ Rp ${formatRupiah(perPerson)} / org)</span>`;
    }

    card.innerHTML = `
      <div class="assignment-head">
        <div>
          <span class="qty-badge">${item.qty}x</span>
          <strong class="assignment-item-name">${escapeHtml(item.name)}</strong>
          ${splitNote}
        </div>
        <strong class="assignment-item-price">Rp ${formatRupiah(item.total)}</strong>
      </div>
      <div class="assignment-chips-row" id="chips-${item.id}"></div>
      <div style="display: flex; justify-content: flex-end;">
        <button type="button" class="btn-toggle-all" id="all-${item.id}">
          ${isAllClaimed ? 'Batalkan Semua' : 'Bagi Rata ke Semua'}
        </button>
      </div>
    `;

    const chipsRow = card.querySelector(`#chips-${item.id}`);
    active.forEach(member => {
      const isAssigned = item.assignedTo.includes(member.id);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'btn-member-chip' + (isAssigned ? ' active' : '');
      chip.innerHTML = `
        <span class="chip-avatar-mini">${escapeHtml(member.initial)}</span>
        <span>${escapeHtml(member.name)}</span>
        ${isAssigned ? '<span class="check-icon">✓</span>' : ''}
      `;

      chip.addEventListener('click', () => {
        if (isAssigned) {
          item.assignedTo = item.assignedTo.filter(id => id !== member.id);
        } else {
          item.assignedTo.push(member.id);
        }
        renderAssignmentItems();
        renderStep3LiveShares();
      });

      chipsRow.appendChild(chip);
    });

    // Toggle all button
    const btnAll = card.querySelector(`#all-${item.id}`);
    btnAll.addEventListener('click', () => {
      if (isAllClaimed) {
        item.assignedTo = [];
      } else {
        item.assignedTo = active.map(m => m.id);
      }
      renderAssignmentItems();
      renderStep3LiveShares();
    });

    elements.itemsContainer.appendChild(card);
  });

  elements.unclaimedWarningPill.classList.toggle('hidden', !hasUnclaimed);
}

// Step 3: Real-time Live Share Preview
function renderStep3LiveShares() {
  const shares = calculateSplits();
  elements.previewSharesGrid.innerHTML = '';

  const active = getActiveParticipants();
  active.forEach(m => {
    const s = shares[m.id] || { total: 0 };
    const isPayer = m.id === state.payerId;

    const div = document.createElement('div');
    div.className = 'share-preview-item' + (isPayer ? ' is-payer' : '');
    div.innerHTML = `
      <div class="share-preview-header">
        <div class="avatar-initial-sm">${escapeHtml(m.initial)}</div>
        <span class="share-preview-name">${escapeHtml(m.name)} ${isPayer ? '⭐ (Payer)' : ''}</span>
      </div>
      <strong class="share-preview-amount">Rp ${formatRupiah(s.total)}</strong>
    `;
    elements.previewSharesGrid.appendChild(div);
  });
}


// ==========================================================================
// MULTI-PAYER ENGINE & DEBT SETTLEMENT
// ==========================================================================
function setPayerMode(mode) {
  state.payerMode = mode;
  elements.btnPayerModeSingle.classList.toggle('active', mode === 'single');
  elements.btnPayerModeMulti.classList.toggle('active', mode === 'multi');
  elements.singlePayerContainer.classList.toggle('hidden', mode !== 'single');
  elements.multiPayerContainer.classList.toggle('hidden', mode !== 'multi');

  if (mode === 'multi') {
    initializeMultiPayerAmounts();
    renderMultiPayerInputs();
  }

  renderStep3LiveShares();
}

function initializeMultiPayerAmounts() {
  const active = getActiveParticipants();
  const total = state.receipt.total || 0;

  // If empty or payerAmounts don't match active members
  if (Object.keys(state.payerAmounts).length === 0) {
    state.payerAmounts = {};
    active.forEach(m => {
      state.payerAmounts[m.id] = (m.id === state.payerId) ? total : 0;
    });
  }
}

function renderMultiPayerInputs() {
  const active = getActiveParticipants();
  elements.multiPayerInputsList.innerHTML = '';
  const total = state.receipt.total || 0;

  active.forEach(m => {
    const currentPaid = state.payerAmounts[m.id] || 0;
    const row = document.createElement('div');
    row.className = 'multi-payer-row';
    row.innerHTML = `
      <div class="multi-payer-row-left">
        <div class="avatar-initial-sm">${escapeHtml(m.initial)}</div>
        <span class="multi-payer-name">${escapeHtml(m.name)}</span>
      </div>
      <div class="multi-payer-row-right">
        <span>Rp</span>
        <input type="number" class="input-payer-amount" data-id="${m.id}" value="${currentPaid}" step="1000" min="0">
        <button type="button" class="btn-all-pay" data-id="${m.id}" title="Orang ini bayar penuh">Full</button>
      </div>
    `;

    const input = row.querySelector('.input-payer-amount');
    input.addEventListener('input', (e) => {
      const val = Math.max(0, Number(e.target.value) || 0);
      state.payerAmounts[m.id] = val;
      updateMultiPayerStatus();
      renderStep3LiveShares();
    });

    const btnAll = row.querySelector('.btn-all-pay');
    btnAll.addEventListener('click', () => {
      active.forEach(item => {
        state.payerAmounts[item.id] = (item.id === m.id) ? total : 0;
      });
      renderMultiPayerInputs();
      renderStep3LiveShares();
    });

    elements.multiPayerInputsList.appendChild(row);
  });

  updateMultiPayerStatus();
}

function splitPayerAmountsEqually() {
  const active = getActiveParticipants();
  const total = state.receipt.total || 0;
  if (active.length === 0) return;

  const perPerson = Math.floor(total / active.length);
  const remainder = total - (perPerson * active.length);

  active.forEach((m, idx) => {
    state.payerAmounts[m.id] = perPerson + (idx === 0 ? remainder : 0);
  });

  renderMultiPayerInputs();
  renderStep3LiveShares();
  showToast('Total struk dibagi rata ke semua pembayar', 'info');
}

function updateMultiPayerStatus() {
  const active = getActiveParticipants();
  const totalReceipt = state.receipt.total || 0;
  const totalPaid = active.reduce((sum, m) => sum + (state.payerAmounts[m.id] || 0), 0);
  const diff = totalPaid - totalReceipt;

  elements.multiPaidTotal.textContent = `Rp ${formatRupiah(totalPaid)}`;
  elements.multiReceiptTotal.textContent = `Rp ${formatRupiah(totalReceipt)}`;

  elements.multiPaidDiff.className = 'paid-diff-pill';
  if (diff === 0) {
    elements.multiPaidDiff.classList.add('diff-match');
    elements.multiPaidDiff.textContent = 'Pas ✓';
  } else if (diff < 0) {
    elements.multiPaidDiff.classList.add('diff-under');
    elements.multiPaidDiff.textContent = `Kurang Rp ${formatRupiah(Math.abs(diff))}`;
  } else {
    elements.multiPaidDiff.classList.add('diff-over');
    elements.multiPaidDiff.textContent = `Lebih Rp ${formatRupiah(diff)}`;
  }
}

// Settlement Algorithm: Resolves Debt Graph with Minimum Transactions
function calculateSettlementTransfers(shares) {
  const active = getActiveParticipants();
  const balances = active.map(m => {
    const s = shares[m.id];
    let paid = 0;
    if (state.payerMode === 'single') {
      paid = (m.id === state.payerId) ? state.receipt.total : 0;
    } else {
      paid = state.payerAmounts[m.id] || 0;
    }
    const net = Math.round(paid - s.total);
    return {
      id: m.id,
      name: m.name,
      paid: paid,
      consumed: s.total,
      net: net
    };
  });

  // Debtors: net < 0 (must pay money)
  const debtors = balances.filter(b => b.net < -1).map(b => ({ ...b, debt: -b.net }));
  // Creditors: net > 0 (should receive money)
  const creditors = balances.filter(b => b.net > 1).map(b => ({ ...b, credit: b.net }));

  debtors.sort((a, b) => b.debt - a.debt);
  creditors.sort((a, b) => b.credit - a.credit);

  const transfers = [];
  let d = 0;
  let c = 0;

  while (d < debtors.length && c < creditors.length) {
    const debtor = debtors[d];
    const creditor = creditors[c];

    const amount = Math.min(debtor.debt, creditor.credit);
    if (amount > 0) {
      transfers.push({
        fromId: debtor.id,
        fromName: debtor.name,
        toId: creditor.id,
        toName: creditor.name,
        amount: Math.round(amount)
      });
    }

    debtor.debt -= amount;
    creditor.credit -= amount;

    if (debtor.debt <= 1) d++;
    if (creditor.credit <= 1) c++;
  }

  return { balances, transfers };
}

// Splitting Math Engine
function calculateSplits() {
  const active = getActiveParticipants();
  const shares = {};
  active.forEach(m => {
    shares[m.id] = {
      member: m,
      items: [],
      itemsSubtotal: 0,
      taxPortion: 0,
      servicePortion: 0,
      discountPortion: 0,
      total: 0
    };
  });

  // 1. Base Item Allocation
  state.receipt.items.forEach(item => {
    const assigned = (item.assignedTo || []).filter(id => shares[id]);
    if (assigned.length > 0) {
      const portion = item.total / assigned.length;
      assigned.forEach(id => {
        shares[id].items.push({
          name: item.name,
          qty: item.qty,
          price: portion,
          isShared: assigned.length > 1
        });
        shares[id].itemsSubtotal += portion;
      });
    }
  });

  const grandSubtotal = Object.values(shares).reduce((sum, s) => sum + s.itemsSubtotal, 0);
  const tax = Number(state.receipt.tax) || 0;
  const service = Number(state.receipt.service) || 0;
  const discount = Number(state.receipt.discount) || 0;
  const count = active.length || 1;

  // 2. Tax, Service & Discount Allocation
  active.forEach(m => {
    const s = shares[m.id];
    let ratio = 1 / count;
    if (state.taxSplitMode === 'proportional' && grandSubtotal > 0) {
      ratio = s.itemsSubtotal / grandSubtotal;
    }

    s.taxPortion = Math.round(tax * ratio);
    s.servicePortion = Math.round(service * ratio);
    s.discountPortion = Math.round(discount * ratio);

    let finalAmount = Math.max(0, s.itemsSubtotal + s.taxPortion + s.servicePortion - s.discountPortion);

    // Rounding
    if (state.roundingMode === '500') {
      finalAmount = Math.round(finalAmount / 500) * 500;
    } else if (state.roundingMode === '1000') {
      finalAmount = Math.round(finalAmount / 1000) * 1000;
    }

    s.total = Math.round(finalAmount);
  });

  return shares;
}

// Step 4: Final Breakdown & WhatsApp Message Generator
function calculateAndRenderFinal() {
  const shares = calculateSplits();
  const active = getActiveParticipants();
  const { balances, transfers } = calculateSettlementTransfers(shares);

  elements.finalMerchantName.textContent = state.receipt.merchant || 'Struk Belanja';
  elements.finalTotalAmount.textContent = `Total: Rp ${formatRupiah(state.receipt.total)}`;

  // Payer display in header
  if (state.payerMode === 'single') {
    const payer = state.allMembers.find(m => m.id === state.payerId) || active[0];
    elements.finalPayerInfo.textContent = `Penanggung: ${payer ? payer.name : '-'}`;
  } else {
    const payersList = active.filter(m => (state.payerAmounts[m.id] || 0) > 0);
    const payersNames = payersList.map(m => `${m.name} (Rp ${formatRupiah(state.payerAmounts[m.id])})`).join(', ');
    elements.finalPayerInfo.textContent = `Ditalangi: ${payersNames || '-'}`;
  }

  // Render Member Rows with net surplus / deficit badges
  elements.finalMembersContainer.innerHTML = '';
  balances.forEach(b => {
    const s = shares[b.id];
    const row = document.createElement('div');
    row.className = 'final-member-row' + (b.net > 0 ? ' is-payer' : '');

    let statusText = '';
    if (b.net > 0) {
      statusText = `<span style="color: #059669; font-weight: 800;">(Surplus: +Rp ${formatRupiah(b.net)})</span>`;
    } else if (b.net < 0) {
      statusText = `<span style="color: #dc2626; font-weight: 700;">(Transfer: Rp ${formatRupiah(-b.net)})</span>`;
    } else {
      statusText = `<span style="color: #64748b;">(Pas)</span>`;
    }

    row.innerHTML = `
      <div class="final-row-left">
        <div class="avatar-initial-badge">${escapeHtml(s.member.initial)}</div>
        <div>
          <span class="final-row-name">${escapeHtml(b.name)}</span>
          <div class="final-row-sub">Porsi: Rp ${formatRupiah(b.consumed)} ${statusText}</div>
        </div>
      </div>
      <div style="text-align: right;">
        <div class="final-row-amount">Rp ${formatRupiah(b.consumed)}</div>
        <div style="font-size: 0.7rem; color: #64748b;">Bayar: Rp ${formatRupiah(b.paid)}</div>
      </div>
    `;
    elements.finalMembersContainer.appendChild(row);
  });

  // Render Transfer Directions (Siapa Transfer ke Siapa)
  elements.transferDirectionsList.innerHTML = '';
  if (transfers.length === 0) {
    elements.transferDirectionsList.innerHTML = `
      <div style="text-align: center; color: #10b981; font-weight: 700; font-size: 0.82rem; padding: 0.5rem 0;">
        Semua tagihan sudah pas dan lunas! Tidak ada transfer tambahan.
      </div>
    `;
  } else {
    transfers.forEach(t => {
      const item = document.createElement('div');
      item.className = 'transfer-direction-item';
      item.innerHTML = `
        <div class="transfer-from-to">
          <strong>${escapeHtml(t.fromName)}</strong>
          <span class="transfer-arrow">➔</span>
          <span>transfer ke</span>
          <strong class="transfer-target-name">${escapeHtml(t.toName)}</strong>
        </div>
        <span class="transfer-amount-badge">Rp ${formatRupiah(t.amount)}</span>
      `;
      elements.transferDirectionsList.appendChild(item);
    });
  }

  // Generate WhatsApp Message
  const waText = formatWhatsAppText(shares, balances, transfers);
  elements.waPreview.textContent = waText;
}

function formatWhatsAppText(shares, balances, transfers) {
  const r = state.receipt;
  const active = getActiveParticipants();
  let text = `🧾 *RINCIAN SPLIT BILL — ${(r.merchant || 'PatungIn').toUpperCase()}*\n`;
  text += `📅 Tanggal: ${r.date || 'Hari ini'}\n`;
  text += `💰 Total Tagihan: Rp ${formatRupiah(r.total)}\n`;

  if (state.payerMode === 'single') {
    const payer = state.allMembers.find(m => m.id === state.payerId) || active[0];
    text += `💳 Ditalangi oleh: *${payer ? payer.name : '-' }*\n`;
  } else {
    text += `💳 *Ditalangi Bersama oleh:*\n`;
    active.forEach(m => {
      const paid = state.payerAmounts[m.id] || 0;
      if (paid > 0) {
        text += `  • ${m.name}: Rp ${formatRupiah(paid)}\n`;
      }
    });
  }
  text += `------------------------------------\n\n`;

  // Itemized breakdown per member
  text += `👥 *Porsi Konsumsi Masing-Masing:*\n`;
  active.forEach(m => {
    const s = shares[m.id];
    const b = balances.find(item => item.id === m.id) || { net: 0, paid: 0 };
    text += `👤 *${m.name}*\n`;
    s.items.forEach(it => {
      text += `  • ${it.name} ${it.isShared ? '(Patungan)' : ''}: Rp ${formatRupiah(it.price)}\n`;
    });
    if (s.taxPortion > 0) text += `  • Pajak: Rp ${formatRupiah(s.taxPortion)}\n`;
    if (s.servicePortion > 0) text += `  • Service: Rp ${formatRupiah(s.servicePortion)}\n`;
    if (s.discountPortion > 0) text += `  • Diskon: -Rp ${formatRupiah(s.discountPortion)}\n`;
    text += `  👉 *Porsi: Rp ${formatRupiah(s.total)}*`;
    if (state.payerMode === 'multi' && b.paid > 0) {
      text += ` _(Sudah bayar Rp ${formatRupiah(b.paid)})_`;
    }
    text += `\n\n`;
  });

  text += `------------------------------------\n`;

  // Transfer Directions (Siapa bayar ke siapa)
  if (transfers && transfers.length > 0) {
    text += `💸 *ARAHAN TRANSFER (SIAPA BAYAR KE SIAPA):*\n`;
    transfers.forEach(t => {
      text += `👉 *${t.fromName}* ➔ Transfer *Rp ${formatRupiah(t.amount)}* ke *${t.toName}*\n`;
    });
    text += `------------------------------------\n`;
  }

  // Creditors Bank Accounts
  text += `📲 *Pilihan Rekening Transfer:*\n`;
  const creditors = (transfers && transfers.length > 0)
    ? [...new Set(transfers.map(t => t.toId))].map(id => state.allMembers.find(m => m.id === id)).filter(Boolean)
    : (state.payerMode === 'single' ? [state.allMembers.find(m => m.id === state.payerId)].filter(Boolean) : active);

  creditors.forEach(creditor => {
    text += `• *Rekening ${creditor.name}:*\n`;
    if (creditor.paymentInfo && creditor.paymentInfo.trim()) {
      const lines = creditor.paymentInfo.split('\n').map(l => l.trim()).filter(Boolean);
      lines.forEach(l => {
        text += `  ${l}\n`;
      });
    } else {
      text += `  (Hubungi ${creditor.name} untuk nomor rekening/e-wallet)\n`;
    }
  });

  text += `\n_Dihitung otomatis dengan PatungIn_`;
  return text;
}

function copyWaMessage() {
  const text = elements.waPreview.textContent;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Pesan WhatsApp berhasil disalin ke clipboard! 📋', 'success');
  }).catch(() => {
    showToast('Gagal menyalin teks', 'error');
  });
}

function openWaDirect() {
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
  state.participatingMemberIds = state.allMembers.map(m => m.id);
  goToStep(1);
  showToast('Siap membuat split bill baru', 'info');
}

// Custom Item Modal
function openItemModal() {
  elements.inputItemName.value = '';
  elements.inputItemQty.value = '1';
  elements.inputItemPrice.value = '';
  elements.modalCustomItem.classList.remove('hidden');
  elements.inputItemName.focus();
}

function closeItemModal() {
  elements.modalCustomItem.classList.add('hidden');
}

function saveCustomItem() {
  const name = elements.inputItemName.value.trim();
  const qty = Number(elements.inputItemQty.value) || 1;
  const price = Number(elements.inputItemPrice.value) || 0;

  if (!name) {
    showToast('Nama menu tidak boleh kosong', 'error');
    return;
  }
  if (price <= 0) {
    showToast('Nominal harga harus lebih dari 0', 'error');
    return;
  }

  const active = getActiveParticipants();
  const activeIds = active.length > 0 ? active.map(m => m.id) : state.allMembers.map(m => m.id);

  const newItem = {
    id: 'custom_' + Date.now(),
    name: name,
    qty: qty,
    price: Math.round(price / qty),
    total: price,
    assignedTo: [activeIds[0] || 'm1']
  };

  state.receipt.items.push(newItem);
  closeItemModal();
  recalculateTotals();
  renderStep2Review();
  showToast(`Menu "${name}" berhasil ditambahkan`, 'success');
}

function promptEditCharge(field, label) {
  const current = state.receipt[field] || 0;
  const val = prompt(`Masukkan nominal baru untuk ${label} (Rp):`, current);
  if (val !== null) {
    const num = Number(val.replace(/[^0-9]/g, '')) || 0;
    state.receipt[field] = num;
    recalculateTotals();
    showToast(`${label} diperbarui menjadi Rp ${formatRupiah(num)}`, 'success');
  }
}



// ==========================================================================
// MODAL 1: PILIH ANGGOTA YANG IKUT (CLEAN & RINGAN)
// ==========================================================================
function openCircleModal() {
  renderCirclePickList();
  elements.modalCircle.classList.remove('hidden');
}

function closeCircleModal() {
  elements.modalCircle.classList.add('hidden');
}

function renderCirclePickList() {
  elements.circlePickListContainer.innerHTML = '';
  const canDelete = state.allMembers.length > 1;

  state.allMembers.forEach(m => {
    const isParticipating = state.participatingMemberIds.includes(m.id);
    const row = document.createElement('div');
    row.className = 'member-pick-row' + (isParticipating ? ' active' : '');

    row.innerHTML = `
      <div class="member-pick-left">
        <div class="member-checkbox-circle">${isParticipating ? '✓' : ''}</div>
        <div class="avatar-initial-badge">${escapeHtml(m.initial)}</div>
        <div>
          <div class="member-pick-name">${escapeHtml(m.name)}</div>
          <div class="member-pick-sub">${isParticipating ? 'Ikut Patungan' : 'Tidak Ikut'}</div>
        </div>
      </div>
      <button type="button" class="btn-delete-member" title="Hapus dari daftar master" ${canDelete ? '' : 'disabled style="opacity:0.25; cursor:not-allowed;"'}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    `;

    // Toggle participant status on row click
    row.querySelector('.member-pick-left').addEventListener('click', () => {
      toggleMemberParticipationInModal(m.id);
    });

    // Delete member
    const btnDelete = row.querySelector('.btn-delete-member');
    if (canDelete) {
      btnDelete.addEventListener('click', (e) => {
        e.stopPropagation();
        handleDeleteMemberMaster(m.id);
      });
    }

    elements.circlePickListContainer.appendChild(row);
  });
}

function toggleMemberParticipationInModal(memberId) {
  const idx = state.participatingMemberIds.indexOf(memberId);
  if (idx > -1) {
    if (state.participatingMemberIds.length <= 1) {
      showToast('Minimal harus ada 1 orang yang ikut patungan', 'error');
      return;
    }
    state.participatingMemberIds.splice(idx, 1);
  } else {
    state.participatingMemberIds.push(memberId);
  }
  renderCirclePickList();
}

function handleModalQuickAdd() {
  const name = elements.inputModalQuickName.value.trim();
  if (!name) {
    showToast('Ketik nama teman terlebih dahulu', 'error');
    return;
  }

  const newId = 'm_' + Date.now();
  const initial = name.charAt(0).toUpperCase();
  const newMember = {
    id: newId,
    name: name,
    initial: initial,
    paymentInfo: ''
  };

  state.allMembers.push(newMember);
  state.participatingMemberIds.push(newId);
  saveMembers();

  elements.inputModalQuickName.value = '';
  renderCirclePickList();
  showToast(`${name} ditambahkan dan ikut patungan`, 'success');
}

function handleDeleteMemberMaster(memberId) {
  if (state.allMembers.length <= 1) {
    showToast('Minimal harus ada 1 anggota', 'error');
    return;
  }

  const target = state.allMembers.find(m => m.id === memberId);
  state.allMembers = state.allMembers.filter(m => m.id !== memberId);
  state.participatingMemberIds = state.participatingMemberIds.filter(id => id !== memberId);

  // Clean from assigned items
  state.receipt.items.forEach(it => {
    if (it.assignedTo) {
      it.assignedTo = it.assignedTo.filter(id => id !== memberId);
    }
  });

  if (state.payerId === memberId) {
    state.payerId = state.allMembers[0]?.id || '';
  }

  saveMembers();
  renderCirclePickList();
  showToast(`${target ? target.name : 'Anggota'} dihapus dari daftar`, 'info');
}

function saveCircleModalChanges() {
  saveMembers();
  closeCircleModal();

  if (state.currentStep === 3) {
    renderStep3();
  } else if (state.currentStep === 4) {
    calculateAndRenderFinal();
  }

  showToast(`${state.participatingMemberIds.length} anggota aktif patungan`, 'success');
}

function resetDefaultCircle() {
  state.allMembers = JSON.parse(JSON.stringify(DEFAULT_MEMBERS));
  state.participatingMemberIds = state.allMembers.map(m => m.id);
  saveMembers();
  renderCirclePickList();
  showToast('Master anggota dikembalikan ke default', 'info');
}

// ==========================================================================
// MODAL 2: PENGATURAN NOMOR REKENING & E-WALLET (BCA, BSI, GOPAY, DLL)
// ==========================================================================
function openPaymentModal() {
  renderPaymentCardsList();
  elements.modalPayment.classList.remove('hidden');
}

function closePaymentModal() {
  elements.modalPayment.classList.add('hidden');
}

function renderPaymentCardsList() {
  elements.paymentSettingsForm.innerHTML = '';

  state.allMembers.forEach(m => {
    const card = document.createElement('div');
    card.className = 'payment-person-card';
    card.dataset.id = m.id;

    card.innerHTML = `
      <div class="payment-person-header">
        <div class="payment-person-title">
          <div class="avatar-initial-badge">${escapeHtml(m.initial)}</div>
          <span>${escapeHtml(m.name)}</span>
        </div>
        <div class="quick-bank-chips">
          <button type="button" class="btn-quick-bank" data-bank="BCA">+ BCA</button>
          <button type="button" class="btn-quick-bank" data-bank="BSI">+ BSI</button>
          <button type="button" class="btn-quick-bank" data-bank="Mandiri">+ Mandiri</button>
          <button type="button" class="btn-quick-bank" data-bank="GoPay">+ GoPay</button>
          <button type="button" class="btn-quick-bank" data-bank="DANA">+ DANA</button>
        </div>
      </div>
      <textarea class="textarea-payment" data-field="paymentInfo" rows="3" placeholder="Contoh:&#10;BCA: 1234567890 a.n ${escapeHtml(m.name)}&#10;BSI: 7123456789 a.n ${escapeHtml(m.name)}&#10;GoPay: 08123456789">${escapeHtml(m.paymentInfo || '')}</textarea>
    `;

    // Quick bank helper chips
    const textarea = card.querySelector('.textarea-payment');
    card.querySelectorAll('.btn-quick-bank').forEach(chip => {
      chip.addEventListener('click', () => {
        const bank = chip.dataset.bank;
        const currentVal = textarea.value.trim();
        const prefix = currentVal ? currentVal + '\n' : '';
        textarea.value = prefix + `${bank}:  a.n ${m.name}`;
        textarea.focus();
        const pos = textarea.value.lastIndexOf(': ') + 2;
        textarea.setSelectionRange(pos, pos);
      });
    });

    elements.paymentSettingsForm.appendChild(card);
  });
}

function savePaymentModalChanges() {
  const cards = elements.paymentSettingsForm.querySelectorAll('.payment-person-card');
  cards.forEach(card => {
    const id = card.dataset.id;
    const textarea = card.querySelector('.textarea-payment');
    const m = state.allMembers.find(item => item.id === id);
    if (m && textarea) {
      m.paymentInfo = textarea.value.trim();
    }
  });

  saveMembers();
  closePaymentModal();

  if (state.currentStep === 3) {
    renderStep3();
  } else if (state.currentStep === 4) {
    calculateAndRenderFinal();
  }

  showToast('Nomor rekening & e-wallet berhasil disimpan! ✓', 'success');
}



// API Key Modal
function openApiKeyModal() {
  elements.inputGeminiKey.value = state.apiKey || '';
  elements.modalApiKey.classList.remove('hidden');
}

function closeApiKeyModal() {
  elements.modalApiKey.classList.add('hidden');
}

function saveApiKey() {
  const val = elements.inputGeminiKey.value.trim();
  state.apiKey = val;
  if (val) {
    localStorage.setItem('gemini_api_key', val);
    showToast('Gemini API Key disimpan!', 'success');
  } else {
    localStorage.removeItem('gemini_api_key');
    showToast('Mode simulasi aktif (Key dikosongkan)', 'info');
  }
  closeApiKeyModal();
}

function clearApiKey() {
  state.apiKey = '';
  localStorage.removeItem('gemini_api_key');
  elements.inputGeminiKey.value = '';
  closeApiKeyModal();
  showToast('API Key dihapus. Mode simulasi aktif.', 'info');
}

// Utilities
function formatRupiah(num) {
  return (Math.round(num) || 0).toLocaleString('id-ID');
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

function showToast(msg, type = 'info') {
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.textContent = msg;
  elements.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 250);
  }, 2800);
}

// Run init on DOM ready
document.addEventListener('DOMContentLoaded', init);
