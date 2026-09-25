function toTitleCase(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .split(' ')
    .map(w => w.replace(/^([a-z])/, c => c.toUpperCase()).replace(/(\()([a-z])/, (m, p1, p2) => p1 + p2.toUpperCase()))
    .join(' ')
    .trim();
}


// Client-side image compression & format normalization for mobile browsers
async function compressImageIfNeeded(file, maxDimension = 1800, quality = 0.82) {
  // If file is small (< 1MB) and not HEIC, no need to compress
  if (file.size < 1024 * 1024 && !file.name.toLowerCase().endsWith('.heic')) {
    return file;
  }

  return new Promise((resolve) => {
    try {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob && blob.size < file.size) {
              const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
              const compressedFile = new File([blob], newName, {
                type: 'image/jpeg',
                lastModified: Date.now()
              });
              resolve(compressedFile);
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          quality
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(file); // fallback to original file if decode fails
      };

      img.src = url;
    } catch (err) {
      console.warn('Compression failed, using original file:', err);
      resolve(file);
    }
  });
}

/**
 * PatungIn - Smart Receipt Split Bill Engine
 * Open-source receipt scanner and proportional bill splitting utility.
 * Architecture: 4-Step Stepper (Upload -> Review -> Assign -> Settlement)
 */

const DEFAULT_MEMBERS = [
  { 
    id: 'm1', 
    name: 'jeki', 
    initial: 'J', 
    paymentInfo: 'Transfer ke jeki' 
  },
  { 
    id: 'm2', 
    name: 'nabiluy', 
    initial: 'N', 
    paymentInfo: 'Transfer ke nabiluy' 
  },
  { 
    id: 'm3', 
    name: 'alysuy', 
    initial: 'A', 
    paymentInfo: 'Transfer ke alysuy' 
  },
  { 
    id: 'm4', 
    name: 'gifaruy', 
    initial: 'G', 
    paymentInfo: 'Transfer ke gifaruy' 
  },
  { 
    id: 'm5', 
    name: 'salwuy', 
    initial: 'S', 
    paymentInfo: 'Transfer ke salwuy' 
  },
  { 
    id: 'm6', 
    name: 'sosuy', 
    initial: 'S', 
    paymentInfo: 'DANA: a.n sosuy' 
  }
];

const state = {
  currentStep: 1,
  activeSession: null,
  uploadMode: 'single',
  dualFiles: {
    file1: null,
    file2: null
  },
  allMembers: [], // Master friends pool
  participatingMemberIds: [], // IDs of members active in this specific bill
  payerMode: 'single', // 'single' | 'multi'
  payerId: 'm1',
  payerAmounts: {},
  primaryPayerId: 'm1', // { [memberId]: number } for multi-payer mode
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

  // Dual Receipt Mode Elements
  btnMode1Receipt: document.getElementById('btn-mode-1-receipt'),
  btnMode2Receipt: document.getElementById('btn-mode-2-receipt'),
  singleUploadContainer: document.getElementById('single-upload-container'),
  dualUploadContainer: document.getElementById('dual-upload-container'),
  fileInputDual1: document.getElementById('file-input-dual-1'),
  fileInputDual2: document.getElementById('file-input-dual-2'),
  slotCard1: document.getElementById('slot-card-1'),
  slotCard2: document.getElementById('slot-card-2'),
  slotEmpty1: document.getElementById('slot-empty-1'),
  slotEmpty2: document.getElementById('slot-empty-2'),
  slotPreview1: document.getElementById('slot-preview-1'),
  slotPreview2: document.getElementById('slot-preview-2'),
  imgPreview1: document.getElementById('img-preview-1'),
  imgPreview2: document.getElementById('img-preview-2'),
  filename1: document.getElementById('filename-1'),
  filename2: document.getElementById('filename-2'),
  btnRemoveDual1: document.getElementById('btn-remove-dual-1'),
  btnRemoveDual2: document.getElementById('btn-remove-dual-2'),
  btnScanDual: document.getElementById('btn-scan-dual'),
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
  btnSendToWaGroup: document.getElementById('btn-send-to-wa-group'),
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
  checkAndLoadSessionFromUrl();
  goToStep(1);
}

// Members Management
function loadMembers() {
  const saved = localStorage.getItem('patungin_members');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      // Auto-migrate if device still holds the old default ["Saya", "Andi", "Budi", "Citra"]
      const isOldDefault = Array.isArray(parsed) && parsed.length === 4 && parsed.some(m => m.name === 'Saya' || m.name === 'Andi');
      if (isOldDefault) {
        state.allMembers = JSON.parse(JSON.stringify(DEFAULT_MEMBERS));
        saveMembers();
      } else {
        state.allMembers = parsed;
      }
    } catch {
      state.allMembers = JSON.parse(JSON.stringify(DEFAULT_MEMBERS));
    }
  } else {
    state.allMembers = JSON.parse(JSON.stringify(DEFAULT_MEMBERS));
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

    // Check if there are unassigned/unclaimed items
    const unclaimed = state.receipt.items.filter(it => !it.assignedTo || it.assignedTo.length === 0);
    if (unclaimed.length > 0) {
      openUnclaimedConfirmModal(unclaimed);
      return;
    }

    proceedToStep4WithIosHud();
  });

  // Modal Unclaimed Confirmation Listeners
  const btnCloseUnclaimed = document.getElementById('btn-close-unclaimed-modal');
  const btnUnclaimedBack = document.getElementById('btn-unclaimed-back');
  const btnUnclaimedProceed = document.getElementById('btn-unclaimed-proceed');

  if (btnCloseUnclaimed) btnCloseUnclaimed.addEventListener('click', closeUnclaimedConfirmModal);
  if (btnUnclaimedBack) btnUnclaimedBack.addEventListener('click', closeUnclaimedConfirmModal);
  if (btnUnclaimedProceed) {
    btnUnclaimedProceed.addEventListener('click', () => {
      closeUnclaimedConfirmModal();
      proceedToStep4WithIosHud();
    });
  }

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
  // elements.btnBrowse is handled inside setupCleanUploadListeners() to avoid double clicks on mobile
  setupCleanUploadListeners();
  elements.dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.dropzone.classList.add('dragover');
  });
  elements.dropzone.addEventListener('dragleave', () => elements.dropzone.classList.remove('dragover'));
  elements.dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.dropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const picked = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')).slice(0, 2);
      if (picked.length > 0) {
        selectedReceiptFiles = picked;
        renderReceiptsPreview();
      }
    }
  });

  // WhatsApp Actions
  elements.btnCopyWa.addEventListener('click', copyWaMessage);
  elements.btnOpenWa.addEventListener('click', openWaDirect);

  const btnSendWa = elements.btnSendToWaGroup || document.getElementById('btn-send-to-wa-group');
  if (btnSendWa) {
    btnSendWa.addEventListener('click', sendFinalBillToWhatsAppGroup);
    console.log('✅ Click listener attached to btn-send-to-wa-group');
  }

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

  if (elements.btnApiKey) elements.btnApiKey.addEventListener('click', openApiKeyModal);
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
    recalculateTotals();
    return;
  }

  // Auto-clean any legacy [Store Name] prefix from item.name and assign to sourceStore
  r.items.forEach(it => {
    if (it.name && it.name.startsWith('[')) {
      const match = it.name.match(/^\[(.*?)\]\s*(.*)$/);
      if (match) {
        if (!it.sourceStore) it.sourceStore = match[1];
        it.name = match[2];
      }
    }
  });

  // Check if multiple stores exist
  const uniqueStores = [...new Set(r.items.map(it => it.sourceStore).filter(Boolean))];

  if (uniqueStores.length > 1) {
    // Ensure any item with missing sourceStore is assigned to the first store
    r.items.forEach(it => {
      if (!it.sourceStore) {
        it.sourceStore = uniqueStores[0];
      }
    });

    // Group and render by store sections
    uniqueStores.forEach((storeName, idx) => {
      const storeItems = r.items.filter(it => it.sourceStore === storeName);

      // Section Header
      const header = document.createElement('div');
      header.className = 'receipt-store-section-header';
      header.innerHTML = `
        <div class="store-section-title">
          <span class="store-badge-tag">Struk #${idx + 1}</span>
          <strong class="store-name-text">${escapeHtml(storeName)}</strong>
        </div>
        <span class="store-item-count">${storeItems.length} menu</span>
      `;
      elements.receiptItemsReviewList.appendChild(header);

      // Store Item Rows
      storeItems.forEach(item => {
        const row = createReviewItemRow(item);
        elements.receiptItemsReviewList.appendChild(row);
      });
    });
  } else {
    // Single store - render items normally without extra headers
    r.items.forEach(item => {
      const row = createReviewItemRow(item);
      elements.receiptItemsReviewList.appendChild(row);
    });
  }

  recalculateTotals();
}

function createReviewItemRow(item) {
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

  return row;
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
    // Clean label: nama (Transfer ke nama)
    opt.textContent = `${m.name} (Transfer ke ${m.name})`;
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

  // Auto-clean any legacy [Store Name] prefix from item.name
  state.receipt.items.forEach(it => {
    if (it.name && it.name.startsWith('[')) {
      const match = it.name.match(/^\[(.*?)\]\s*(.*)$/);
      if (match) {
        if (!it.sourceStore) it.sourceStore = match[1];
        it.name = match[2];
      }
    }
  });

  const uniqueStores = [...new Set(state.receipt.items.map(it => it.sourceStore).filter(Boolean))];

  if (uniqueStores.length > 1) {
    state.receipt.items.forEach(it => {
      if (!it.sourceStore) {
        it.sourceStore = uniqueStores[0];
      }
    });

    // Render grouped by store section
    uniqueStores.forEach((storeName, sIdx) => {
      const storeItems = state.receipt.items.filter(it => it.sourceStore === storeName);

      const header = document.createElement('div');
      header.className = 'receipt-store-section-header';
      header.innerHTML = `
        <div class="store-section-title">
          <span class="store-badge-tag">Struk #${sIdx + 1}</span>
          <strong class="store-name-text">${escapeHtml(storeName)}</strong>
        </div>
        <span class="store-item-count">${storeItems.length} menu</span>
      `;
      elements.itemsContainer.appendChild(header);

      storeItems.forEach(item => {
        const card = createAssignmentCard(item, active);
        elements.itemsContainer.appendChild(card);
        if (!item.assignedTo || item.assignedTo.length === 0) {
          hasUnclaimed = true;
        }
      });
    });
  } else {
    // Normal single store
    state.receipt.items.forEach(item => {
      const card = createAssignmentCard(item, active);
      elements.itemsContainer.appendChild(card);
      if (!item.assignedTo || item.assignedTo.length === 0) {
        hasUnclaimed = true;
      }
    });
  }

  elements.unclaimedWarningPill.classList.toggle('hidden', !hasUnclaimed);
}

function createAssignmentCard(item, active) {
  if (!item.assignedTo) item.assignedTo = [];

  // Clean up members who are no longer participating
  item.assignedTo = item.assignedTo.filter(id => state.participatingMemberIds.includes(id));

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

  return card;
}

// Step 3: Real-time Live Share Preview
function renderStep3LiveShares() {
  const shares = calculateSplits();
  elements.previewSharesGrid.innerHTML = '';

  const active = getActiveParticipants();
  active.forEach(m => {
    const s = shares[m.id] || { total: 0 };
    let isPayer = false;
    let payerBadgeHtml = '';
    let payerSubInfo = '';

    if (state.payerMode === 'single') {
      isPayer = (m.id === state.payerId);
      if (isPayer) {
        payerBadgeHtml = '<span class="payer-badge-tag">⭐ Payer</span>';
      }
    } else {
      const paid = state.payerAmounts[m.id] || 0;
      isPayer = (paid > 0);
      if (isPayer) {
        payerBadgeHtml = `<span class="payer-badge-tag">⭐ Bayar Rp ${formatRupiah(paid)}</span>`;
        payerSubInfo = `<div style="font-size: 0.7rem; color: #047857; font-weight: 700; margin-top: 0.15rem;">Telah bayar: Rp ${formatRupiah(paid)}</div>`;
      }
    }

    const div = document.createElement('div');
    div.className = 'share-preview-item' + (isPayer ? ' is-payer' : '');
    div.innerHTML = `
      <div class="share-preview-header">
        <div class="avatar-initial-sm">${escapeHtml(m.initial)}</div>
        <span class="share-preview-name">${escapeHtml(m.name)}</span>
        ${payerBadgeHtml}
      </div>
      <strong class="share-preview-amount">Rp ${formatRupiah(s.total)}</strong>
      ${payerSubInfo}
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

  if (!state.primaryPayerId || !active.some(m => m.id === state.primaryPayerId)) {
    state.primaryPayerId = state.payerId || active[0]?.id;
  }

  // If empty or payerAmounts don't match active members
  if (Object.keys(state.payerAmounts).length === 0) {
    state.payerAmounts = {};
    active.forEach(m => {
      state.payerAmounts[m.id] = (m.id === state.primaryPayerId) ? total : 0;
    });
  }
}

function renderMultiPayerInputs() {
  const active = getActiveParticipants();
  elements.multiPayerInputsList.innerHTML = '';
  const total = state.receipt.total || 0;

  if (!state.primaryPayerId || !active.some(m => m.id === state.primaryPayerId)) {
    state.primaryPayerId = state.payerId || active[0]?.id;
  }

  active.forEach(m => {
    const currentPaid = state.payerAmounts[m.id] || 0;
    const isPrimary = (m.id === state.primaryPayerId);
    const row = document.createElement('div');
    row.className = 'multi-payer-row' + (isPrimary ? ' is-primary-payer' : '');
    row.innerHTML = `
      <div class="multi-payer-row-left">
        <div class="avatar-initial-sm">${escapeHtml(m.initial)}</div>
        <span class="multi-payer-name">${escapeHtml(m.name)}</span>
        ${isPrimary ? '<span class="primary-payer-tag">Utama</span>' : ''}
      </div>
      <div class="multi-payer-row-right">
        <span>Rp</span>
        <input type="number" class="input-payer-amount" data-id="${m.id}" value="${currentPaid}" step="1000" min="0">
        <button type="button" class="btn-all-pay ${isPrimary ? 'active' : ''}" data-id="${m.id}" title="${isPrimary ? 'Penampung sisa tagihan utama' : 'Jadikan pembayar utama (Full)'}">Full</button>
      </div>
    `;

    const input = row.querySelector('.input-payer-amount');
    input.addEventListener('input', (e) => {
      const val = Math.max(0, Number(e.target.value) || 0);
      state.payerAmounts[m.id] = val;

      // AUTO-BALANCE LOGIC:
      // If editing someone other than the primary payer,
      // automatically adjust the primary payer's amount so total stays equal to total receipt!
      if (state.primaryPayerId && m.id !== state.primaryPayerId) {
        const othersSum = active
          .filter(item => item.id !== state.primaryPayerId)
          .reduce((sum, item) => sum + (state.payerAmounts[item.id] || 0), 0);

        const remainder = Math.max(0, total - othersSum);
        state.payerAmounts[state.primaryPayerId] = remainder;

        const primaryInput = elements.multiPayerInputsList.querySelector(`.input-payer-amount[data-id="${state.primaryPayerId}"]`);
        if (primaryInput) {
          primaryInput.value = remainder;
        }
      }

      updateMultiPayerStatus();
      renderStep3LiveShares();
    });

    const btnAll = row.querySelector('.btn-all-pay');
    btnAll.addEventListener('click', () => {
      // Set this member as primary payer
      state.primaryPayerId = m.id;
      state.payerId = m.id;
      if (elements.step3PayerSelect) elements.step3PayerSelect.value = m.id;
      
      // Give them full total and reset others to 0
      active.forEach(item => {
        state.payerAmounts[item.id] = (item.id === m.id) ? total : 0;
      });
      renderMultiPayerInputs();
      renderStep3LiveShares();
      showToast(`${m.name} dijadikan pembayar utama (Full)`, 'info');
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
  const merchant = (r.merchant || 'PatungIn').toUpperCase();
  const dateStr = r.date || 'Hari ini';
  const totalFormatted = formatRupiah(r.total);

  let payerName = '';
  if (state.payerMode === 'single') {
    const payer = state.allMembers.find(m => m.id === state.payerId) || active[0];
    payerName = payer ? payer.name : '-';
  } else {
    payerName = 'Bersama';
  }

  let text = `🧾 *RINCIAN SPLIT BILL — ${merchant}*\n`;
  text += `Tanggal: ${dateStr}\n`;
  text += `Total Tagihan: Rp ${totalFormatted}\n`;
  text += `Ditalangi oleh: *${payerName}*\n`;
  text += `-----------------------------------\n`;

  // Itemized breakdown per member
  active.forEach(m => {
    const s = shares[m.id];
    text += `👤 *${m.name}*\n`;
    s.items.forEach(it => {
      const sharedLabel = it.isShared ? ' (Patungan)' : '';
      text += `  • ${toTitleCase(it.name)}${sharedLabel} : Rp ${formatRupiah(it.price)}\n`;
    });
    if (s.taxPortion > 0) text += `  • Pajak: Rp ${formatRupiah(s.taxPortion)}\n`;
    if (s.servicePortion > 0) text += `  • Service: Rp ${formatRupiah(s.servicePortion)}\n`;
    if (s.discountPortion > 0) text += `  • Diskon: -Rp ${formatRupiah(s.discountPortion)}\n`;
    text += `  *Porsi: Rp ${formatRupiah(s.total)}*\n\n`;
  });

  text += `-----------------------------------\n`;

  // Transfer Directions (Siapa bayar ke siapa)
  if (transfers && transfers.length > 0) {
    text += `💸 *ARAHAN TRANSFER:*\n`;
    transfers.forEach(t => {
      text += `- *${t.fromName}* ➔ Transfer *Rp ${formatRupiah(t.amount)}* ke *${t.toName}*\n`;
    });
    text += `-----------------------------------\n`;
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
      text += `  Transfer ke ${creditor.name}\n`;
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

  const storeGroup = document.getElementById('form-group-item-store');
  const storeSelect = document.getElementById('select-item-store');
  const uniqueStores = [...new Set(state.receipt.items.map(it => it.sourceStore).filter(Boolean))];

  if (storeGroup && storeSelect) {
    if (uniqueStores.length > 1) {
      storeGroup.style.display = 'block';
      storeSelect.innerHTML = '';
      uniqueStores.forEach((storeName, idx) => {
        const opt = document.createElement('option');
        opt.value = storeName;
        opt.textContent = `Struk #${idx + 1}: ${storeName}`;
        storeSelect.appendChild(opt);
      });
    } else {
      storeGroup.style.display = 'none';
    }
  }

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

  const storeSelect = document.getElementById('select-item-store');
  const uniqueStores = [...new Set(state.receipt.items.map(it => it.sourceStore).filter(Boolean))];
  const targetStore = (storeSelect && storeSelect.value) ? storeSelect.value : (uniqueStores[0] || null);

  const active = getActiveParticipants();
  const activeIds = active.length > 0 ? active.map(m => m.id) : state.allMembers.map(m => m.id);

  const newItem = {
    id: 'custom_' + Date.now(),
    name: name,
    qty: qty,
    price: Math.round(price / qty),
    total: price,
    sourceStore: targetStore,
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

// ==========================================================================
// CLEAN & INTUITIVE RECEIPT UPLOAD LOGIC (Supports 1 or 2 Receipts)
// ==========================================================================
let selectedReceiptFiles = []; // Array of File objects (max 2)

function isValidImageFile(file) {
  if (!file) return false;
  if (!file.type) return true; // file selected via accept="image/*"
  if (file.type.startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|heic|heif|bmp|gif|tiff?)$/i.test(file.name || '');
}

function setupCleanUploadListeners() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const fileInputSecond = document.getElementById('file-input-second');
  const btnBrowse = document.getElementById('btn-browse-file');
  const btnClearAll = document.getElementById('btn-clear-all-receipts');
  const btnStartScan = document.getElementById('btn-start-scan');
  const btnTriggerSecond = document.getElementById('btn-trigger-second-file');

  // Click on dropzone card or browse button opens file picker
  if (dropzone && fileInput) {
    dropzone.addEventListener('click', (e) => {
      // Prevent double trigger if clicked directly on btnBrowse
      if (e.target.closest('#btn-browse-file')) return;
      fileInput.click();
    });
  }

  if (btnBrowse && fileInput) {
    btnBrowse.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        const picked = Array.from(files).filter(isValidImageFile).slice(0, 2);
        if (picked.length > 0) {
          selectedReceiptFiles = picked;
          renderReceiptsPreview();
        }
      }
    });
  }

  if (btnTriggerSecond && fileInputSecond) {
    btnTriggerSecond.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInputSecond.click();
    });
  }

  if (fileInputSecond) {
    fileInputSecond.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        if (isValidImageFile(file) && selectedReceiptFiles.length < 2) {
          selectedReceiptFiles.push(file);
          renderReceiptsPreview();
        }
      }
    });
  }

  if (btnClearAll) {
    btnClearAll.addEventListener('click', resetReceiptSelection);
  }

  if (btnStartScan) {
    btnStartScan.addEventListener('click', executeReceiptScan);
  }
}

function renderReceiptsPreview() {
  const dropzone = document.getElementById('dropzone');
  const previewCard = document.getElementById('receipts-preview-card');
  const listContainer = document.getElementById('selected-receipts-list');
  const titleEl = document.getElementById('selected-receipts-title');
  const addSecondBox = document.getElementById('add-second-receipt-box');
  const scanBtnText = document.getElementById('btn-start-scan-text');

  if (selectedReceiptFiles.length === 0) {
    previewCard.classList.add('hidden');
    dropzone.classList.remove('hidden');
    return;
  }

  // Switch views
  dropzone.classList.add('hidden');
  previewCard.classList.remove('hidden');

  titleEl.textContent = `Struk Terpilih (${selectedReceiptFiles.length})`;
  listContainer.innerHTML = '';

  selectedReceiptFiles.forEach((file, idx) => {
    const row = document.createElement('div');
    row.className = 'selected-receipt-row';

    let thumbUrl = '';
    try {
      thumbUrl = URL.createObjectURL(file);
    } catch (_) {
      thumbUrl = '';
    }
    const label = idx === 0 ? 'Struk #1' : 'Struk #2';

    row.innerHTML = `
      <div class="selected-receipt-left">
        ${thumbUrl ? `<img src="${thumbUrl}" alt="${label}" class="selected-receipt-thumb">` : ''}
        <div class="selected-receipt-meta">
          <span class="selected-receipt-label">${label}</span>
          <span class="selected-receipt-name">${file.name || 'Foto Struk'}</span>
        </div>
      </div>
      <button type="button" class="btn-remove-receipt" title="Hapus struk ini" data-idx="${idx}">✕</button>
    `;

    row.querySelector('.btn-remove-receipt').addEventListener('click', () => {
      removeReceiptAtIndex(idx);
    });

    listContainer.appendChild(row);
  });

  // Toggle "Add 2nd receipt" box
  if (selectedReceiptFiles.length < 2) {
    addSecondBox.classList.remove('hidden');
    scanBtnText.textContent = 'Pindai Struk Sekarang →';
  } else {
    addSecondBox.classList.add('hidden');
    scanBtnText.textContent = '✨ Pindai 2 Struk →';
  }

  // Ensure card is visible in mobile viewport
  try {
    previewCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (_) {}
}

function removeReceiptAtIndex(idx) {
  selectedReceiptFiles.splice(idx, 1);
  const fileInput = document.getElementById('file-input');
  const fileInputSecond = document.getElementById('file-input-second');
  if (fileInput) fileInput.value = '';
  if (fileInputSecond) fileInputSecond.value = '';
  renderReceiptsPreview();
}

function resetReceiptSelection() {
  selectedReceiptFiles = [];
  const fileInput = document.getElementById('file-input');
  const fileInputSecond = document.getElementById('file-input-second');
  if (fileInput) fileInput.value = '';
  if (fileInputSecond) fileInputSecond.value = '';
  renderReceiptsPreview();
}

async function executeReceiptScan() {
  if (selectedReceiptFiles.length === 0) {
    showToast('Silakan pilih foto struk terlebih dahulu', 'error');
    return;
  }

  elements.spinnerOverlay.classList.remove('hidden');
  elements.spinnerStatus.textContent = 'Menyiapkan foto struk...';

  try {
    // Compress large mobile photos to avoid Vercel 4.5MB payload limit
    const compressedFiles = await Promise.all(
      selectedReceiptFiles.map(f => compressImageIfNeeded(f))
    );

    elements.spinnerStatus.textContent = compressedFiles.length > 1
      ? 'Memindai 2 struk dengan AI...'
      : 'Memindai struk dengan AI...';

    const formData = new FormData();
    compressedFiles.forEach(file => {
      formData.append('receiptImages', file);
    });
    if (state.apiKey) {
      formData.append('apiKey', state.apiKey);
    }

    const response = await fetch('/api/scan-receipt', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      let errMsg = 'Gagal memindai struk (Error ' + response.status + ')';
      try {
        const errJson = await response.json();
        if (errJson.error) errMsg = errJson.error;
      } catch (_) {
        if (response.status === 413) {
          errMsg = 'Ukuran foto terlalu besar. Silakan coba foto dengan resolusi lebih rendah.';
        }
      }
      elements.spinnerOverlay.classList.add('hidden');
      showToast(errMsg, 'error');
      return;
    }

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
      if (selectedReceiptFiles.length > 1) {
        showToast('2 Struk berhasil digabungkan oleh AI! ✓', 'success');
      } else {
        showToast('Struk berhasil dipindai oleh AI! ✓', 'success');
      }

      resetReceiptSelection();
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
// Unclaimed Items Confirmation Modal Functions
function openUnclaimedConfirmModal(unclaimedItems) {
  const modal = document.getElementById('modal-confirm-unclaimed');
  const listEl = document.getElementById('unclaimed-items-modal-list');
  const descEl = document.getElementById('unclaimed-modal-desc');

  if (descEl) descEl.textContent = `Ada ${unclaimedItems.length} menu yang belum dipilih oleh siapa pun:`;
  if (listEl) {
    listEl.innerHTML = '';
    unclaimedItems.forEach(it => {
      const row = document.createElement('div');
      row.className = 'unclaimed-modal-item';
      row.innerHTML = `
        <span class="unclaimed-item-name">${it.qty}x ${escapeHtml(it.name)}</span>
        <span class="unclaimed-item-price">Rp ${formatRupiah(it.total)}</span>
      `;
      listEl.appendChild(row);
    });
  }

  if (modal) modal.classList.remove('hidden');
}

function closeUnclaimedConfirmModal() {
  const modal = document.getElementById('modal-confirm-unclaimed');
  if (modal) modal.classList.add('hidden');
}


// iOS-Style Success & Calculation HUD
function proceedToStep4WithIosHud() {
  const hud = document.getElementById('ios-success-hud');
  const spinner = document.getElementById('ios-hud-spinner');
  const checkmark = document.getElementById('ios-hud-checkmark');
  const text = document.getElementById('ios-hud-text');

  if (!hud) {
    goToStep(4);
    return;
  }

  // Phase 1: Loading calculation state
  spinner.classList.remove('hidden');
  checkmark.classList.add('hidden');
  text.textContent = 'Menghitung tagihan...';
  hud.classList.remove('hidden');

  // Phase 2: Switch to iOS checkmark success after brief calculation
  setTimeout(() => {
    spinner.classList.add('hidden');
    checkmark.classList.remove('hidden');
    text.textContent = 'Rincian Siap!';

    // Phase 3: Smoothly land on Step 4
    setTimeout(() => {
      hud.classList.add('hidden');
      goToStep(4);
    }, 600);
  }, 650);
}


// ==========================================
// WhatsApp Bot Group Session Integration
// ==========================================

async function checkAndLoadSessionFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const billId = urlParams.get('bill');

  if (!billId) return;

  elements.spinnerOverlay.classList.remove('hidden');
  elements.spinnerStatus.textContent = 'Memuat tagihan dari grup WhatsApp...';

  try {
    const res = await fetch(`/api/bill/${billId}`);
    const data = await res.json();
    elements.spinnerOverlay.classList.add('hidden');

    if (data.success && data.session) {
      state.activeSession = data.session;
      state.receipt = data.session.receipt;

      // Show group session banner
      const banner = document.getElementById('group-session-banner');
      const titleEl = document.getElementById('group-session-title');
      if (banner && titleEl) {
        titleEl.textContent = `Sesi Grup: ${data.session.groupName || 'Grup WhatsApp'}`;
        banner.classList.remove('hidden');
      }

      // Show "Kirim ke Grup WA" button in Step 4
      const btnSendWa = document.getElementById('btn-send-to-wa-group');
      if (btnSendWa) {
        btnSendWa.classList.remove('hidden');
      }

      // Assign items to members if needed
      const active = getActiveParticipants();
      const activeIds = active.length > 0 ? active.map(m => m.id) : state.allMembers.map(m => m.id);

      if (Array.isArray(state.receipt.items)) {
        state.receipt.items.forEach((item, idx) => {
          if (!item.assignedTo || item.assignedTo.length === 0) {
            item.assignedTo = [activeIds[idx % activeIds.length]];
          }
        });
      }

      showToast(`Tagihan dari "${data.session.groupName || 'Grup WA'}" berhasil dimuat! 📋`, 'success');
      goToStep(2);
    } else {
      showToast(data.error || 'Sesi tagihan tidak ditemukan.', 'error');
    }
  } catch (err) {
    elements.spinnerOverlay.classList.add('hidden');
    console.error('Error loading session:', err);
    showToast('Gagal memuat sesi tagihan dari server.', 'error');
  }
}

async function sendFinalBillToWhatsAppGroup() {
  console.log('[sendFinalBillToWhatsAppGroup] Clicked!');

  // Fallback if activeSession is missing from state
  if (!state.activeSession || !state.activeSession.groupId) {
    const billId = new URLSearchParams(window.location.search).get('bill');
    if (billId) {
      try {
        const res = await fetch(`/api/bill/${billId}`);
        const data = await res.json();
        if (data.success && data.session) {
          state.activeSession = data.session;
        }
      } catch (e) {
        console.error('Failed to reload session:', e);
      }
    }
  }

  if (!state.activeSession || !state.activeSession.groupId) {
    showToast('Sesi ini tidak terhubung ke grup WhatsApp.', 'error');
    return;
  }

  // Ensure WA message preview is up to date
  if (typeof generateWaMessage === 'function') {
    generateWaMessage();
  }

  const messageText = (elements.waPreview || document.getElementById('wa-message-preview'))?.textContent;
  if (!messageText || messageText.includes('Membuat format')) {
    showToast('Format rincian tagihan belum siap. Silakan tunggu sebentar.', 'error');
    return;
  }

  // Disable button to prevent spamming
  const btnSend = elements.btnSendToWaGroup || document.getElementById('btn-send-to-wa-group');
  if (btnSend) {
    btnSend.disabled = true;
    btnSend.style.opacity = '0.6';
  }

  // Trigger iOS HUD
  const hud = document.getElementById('ios-success-hud');
  const spinner = document.getElementById('ios-hud-spinner');
  const checkmark = document.getElementById('ios-hud-checkmark');
  const text = document.getElementById('ios-hud-text');

  if (hud) {
    spinner.classList.remove('hidden');
    checkmark.classList.add('hidden');
    text.textContent = 'Mengirim ke WhatsApp...';
    hud.classList.remove('hidden');
  }

  const MAX_RETRIES = 3;
  let success = false;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 1 && hud && text) {
        text.textContent = `Mencoba kirim ulang (${attempt}/${MAX_RETRIES})...`;
      }

      // 8s timeout controller
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(`/api/bill/${state.activeSession.id}/send-to-wa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageText }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const data = await res.json();

      if (data.success) {
        success = true;
        if (hud) {
          spinner.classList.add('hidden');
          checkmark.classList.remove('hidden');
          text.textContent = 'Terkirim ke Grup!';
          setTimeout(() => hud.classList.add('hidden'), 1200);
        }
        showToast('Rincian tagihan berhasil dikirim ke grup WhatsApp! 🚀', 'success');
        break;
      } else {
        // Server returned an explicit error response
        lastError = new Error(data.error || 'Gagal mengirim ke grup WhatsApp.');
        break;
      }
    } catch (err) {
      console.warn(`[sendFinalBillToWhatsAppGroup] Attempt ${attempt} failed:`, err);
      lastError = err;
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  if (!success) {
    if (hud) hud.classList.add('hidden');

    // Auto-copy text to clipboard so user never loses it
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(messageText);
      }
    } catch (_) {}

    // Show Fallback Modal
    openSendFallbackModal(messageText, lastError?.message);
  }

  if (btnSend) {
    btnSend.disabled = false;
    btnSend.style.opacity = '1';
  }
}

function openSendFallbackModal(messageText, errorMsg) {
  const modal = document.getElementById('modal-send-fallback');
  if (!modal) {
    showToast('Terjadi kendala koneksi ke server WhatsApp. Rincian sudah disalin ke clipboard!', 'error');
    return;
  }

  modal.classList.remove('hidden');

  const btnOpenWa = document.getElementById('btn-fallback-open-wa');
  const btnRetry = document.getElementById('btn-fallback-retry');
  const btnClose = document.getElementById('btn-close-fallback-modal');

  if (btnOpenWa) {
    btnOpenWa.onclick = () => {
      modal.classList.add('hidden');
      window.location.href = 'https://wa.me/?text=' + encodeURIComponent(messageText);
    };
  }

  if (btnRetry) {
    btnRetry.onclick = () => {
      modal.classList.add('hidden');
      sendFinalBillToWhatsAppGroup();
    };
  }

  if (btnClose) {
    btnClose.onclick = () => {
      modal.classList.add('hidden');
    };
  }
}
