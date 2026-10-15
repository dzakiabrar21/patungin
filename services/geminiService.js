function toTitleCase(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .split(' ')
    .map(w => w.replace(/^([a-z])/, c => c.toUpperCase()).replace(/(\()([a-z])/, (m, p1, p2) => p1 + p2.toUpperCase()))
    .join(' ')
    .trim();
}

import fs from 'fs';

/**
 * Sample presets for development and offline testing.
 */
export const SAMPLE_PRESETS = [
  {
    id: 'kopi-kenangan',
    name: 'Kafe Kopi & Pastry',
    merchant: 'Kopi Kenangan',
    date: '2026-09-17 14:30',
    currency: 'IDR',
    items: [
      { id: 'item-1', name: 'Kopi Kenangan Mantan (L)', qty: 2, price: 24000, total: 48000 },
      { id: 'item-2', name: 'Salted Caramel Macchiato', qty: 1, price: 34000, total: 34000 },
      { id: 'item-3', name: 'Matcha Espresso Fusion', qty: 1, price: 32000, total: 32000 },
      { id: 'item-4', name: 'Avocado Coffee', qty: 1, price: 28000, total: 28000 },
      { id: 'item-5', name: 'Butter Croissant', qty: 2, price: 22000, total: 44000 },
      { id: 'item-6', name: 'French Fries Platter (Shared)', qty: 1, price: 38000, total: 38000 }
    ],
    subtotal: 224000,
    tax: 22400, // 10% PB1
    service: 11200, // 5% Service Charge
    discount: 15000, // Promo Discount
    total: 242600
  },
  {
    id: 'resto-sunda',
    name: 'Restoran Santap Bersama',
    merchant: 'Restoran Alam Sunda',
    date: '2026-09-16 19:15',
    currency: 'IDR',
    items: [
      { id: 'item-1', name: 'Nasi Liwet (Porsi Bersama)', qty: 1, price: 48000, total: 48000 },
      { id: 'item-2', name: 'Gurame Asam Manis', qty: 1, price: 92000, total: 92000 },
      { id: 'item-3', name: 'Ayam Bakar Madu', qty: 3, price: 29000, total: 87000 },
      { id: 'item-4', name: 'Cumi Goreng Tepung', qty: 1, price: 58000, total: 58000 },
      { id: 'item-5', name: 'Kangkung Hotplate Belacan', qty: 2, price: 24000, total: 48000 },
      { id: 'item-6', name: 'Sambal Dadak & Lalapan', qty: 2, price: 9000, total: 18000 },
      { id: 'item-7', name: 'Es Teh Manis Pitcher (Shared)', qty: 2, price: 20000, total: 40000 }
    ],
    subtotal: 391000,
    tax: 39100, // 10% PB1
    service: 0,
    discount: 0,
    total: 430100
  },
  {
    id: 'roadtrip-snack',
    name: 'Minimarket & Perjalanan',
    merchant: 'Minimarket Rest Area KM 57',
    date: '2026-09-15 10:20',
    currency: 'IDR',
    items: [
      { id: 'item-1', name: 'Pocari Sweat 500ml', qty: 3, price: 8500, total: 25500 },
      { id: 'item-2', name: 'Ultra Milk Coklat 1L', qty: 1, price: 22000, total: 22000 },
      { id: 'item-3', name: 'Chitato Sapi Panggang XL', qty: 2, price: 17500, total: 35000 },
      { id: 'item-4', name: 'Roti Sisir Mentega', qty: 2, price: 11500, total: 23000 },
      { id: 'item-5', name: 'Red Bull Energy Can', qty: 2, price: 14000, total: 28000 },
      { id: 'item-6', name: 'Bahan Bakar & Tol (Shared)', qty: 1, price: 150000, total: 150000 }
    ],
    subtotal: 283500,
    tax: 0,
    service: 0,
    discount: 5000,
    total: 278500
  }
];

// Model Cooldown Tracker: Map<`${apiKey.slice(-6)}_${modelName}`, expiryTimestamp>
const modelCooldownMap = new Map();

export function getApiKeys(customApiKey = null) {
  if (customApiKey) return [customApiKey.trim()];
  const raw = process.env.GEMINI_API_KEY || '';
  return raw
    .split(',')
    .map(k => k.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

function isModelInCooldown(key, model) {
  const shortKey = key.slice(-6);
  const expiry = modelCooldownMap.get(`${shortKey}_${model}`);
  return expiry && Date.now() < expiry;
}

function setModelCooldown(key, model, durationMs) {
  const shortKey = key.slice(-6);
  modelCooldownMap.set(`${shortKey}_${model}`, Date.now() + durationMs);
}

export function getGutsApiKey(customApiKey = null) {
  if (customApiKey && (customApiKey.startsWith('sk-guts-') || customApiKey.startsWith('sk-'))) {
    return customApiKey.trim();
  }
  const envGuts = process.env.GUTS_API_KEY || '';
  if (envGuts.trim()) return envGuts.trim();
  const envGemini = process.env.GEMINI_API_KEY || '';
  if (envGemini.startsWith('sk-guts-') || envGemini.startsWith('sk-')) return envGemini.trim();
  return null;
}

export async function executeGutsRequest({
  messages,
  models = null,
  isJson = false,
  maxTokens = 1200,
  timeoutMs = 25000
}) {
  const apiKey = getGutsApiKey();
  if (!apiKey) return null;

  const hasImage = Array.isArray(messages) && messages.some(m =>
    Array.isArray(m.content) && m.content.some(c => c.type === 'image_url')
  );

  const candidateModels = models || (hasImage
    ? ['gemini-3.8-flash', 'gemini-3.1-flash-image']
    : isJson
      ? ['gemini-3.8-flash', 'laguna-s2.1']
      : ['gemini-3.8-flash', 'laguna-s2.1', 'laguna-xs2.1']
  );

  for (const model of candidateModels) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const payload = {
      model,
      messages,
      temperature: isJson ? 0.1 : 0.8,
      max_tokens: maxTokens
    };

    if (isJson) {
      payload.response_format = { type: 'json_object' };
    }

    try {
      const response = await fetch('https://api.gutsai.id/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timer);

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content?.trim();
        if (content) {
          if (/prohibited use policy|violates google'?s|sensitive words|prompt contains sensitive/i.test(content)) {
            console.warn(`[GutsService] Model ${model} returned policy error text, skipping...`);
            continue;
          }
          return { success: true, content, usage: data.usage };
        }
      } else {
        const err = await response.text();
        console.warn(`[GutsService] Model ${model} returned ${response.status}:`, err.slice(0, 120));
      }
    } catch (err) {
      clearTimeout(timer);
      console.warn(`[GutsService] Model ${model} call error:`, err.message);
    }
  }

  return { success: false, error: 'Semua model Guts AI gagal merespon.' };
}

export const CANDIDATE_VISION_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-flash-latest',
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-3.6-flash',
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite'
];

export const CANDIDATE_TEXT_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-flash-latest',
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-3.6-flash',
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite'
];

export const DEFAULT_SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
];

export async function executeGeminiRequest({
  requestBody,
  candidateModels,
  customApiKey = null,
  timeoutMs = 7000
}) {
  const apiKeys = getApiKeys(customApiKey);
  if (apiKeys.length === 0) {
    throw new Error('GEMINI_API_KEY belum dikonfigurasi di server.');
  }

  let lastError = null;
  let hasQuotaLimit = false;
  let hasHighDemand = false;

  for (const apiKey of apiKeys) {
    const keyHint = apiKey.slice(0, 6) + '...' + apiKey.slice(-4);
    for (const modelName of candidateModels) {
      if (isModelInCooldown(apiKey, modelName)) {
        continue;
      }

      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        const payload = {
          ...requestBody,
          safetySettings: requestBody.safetySettings || DEFAULT_SAFETY_SETTINGS
        };

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(timer);

        if (response.status === 429) {
          hasQuotaLimit = true;
          console.warn(`[GeminiService] Model ${modelName} (${keyHint}) hit 429 (Quota Limit). Cooldown 15m.`);
          setModelCooldown(apiKey, modelName, 15 * 60 * 1000);
          continue;
        }

        if (response.status === 503) {
          hasHighDemand = true;
          console.warn(`[GeminiService] Model ${modelName} returned 503 (High Demand). Cooldown 2m.`);
          setModelCooldown(apiKey, modelName, 2 * 60 * 1000);
          continue;
        }

        if (response.status === 404) {
          setModelCooldown(apiKey, modelName, 24 * 60 * 60 * 1000);
          continue;
        }

        if (response.ok) {
          const data = await response.json();
          return { data, modelName, apiKey };
        } else {
          const errText = await response.text();
          lastError = new Error(`Gemini API (${modelName}) returned ${response.status}: ${errText.slice(0, 150)}`);
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          hasHighDemand = true;
          console.warn(`[GeminiService] Model ${modelName} timed out (${timeoutMs}ms). Cooldown 2m.`);
          setModelCooldown(apiKey, modelName, 2 * 60 * 1000);
        } else {
          console.warn(`[GeminiService] Call to ${modelName} failed:`, err.message);
        }
        lastError = err;
      }
    }
  }

  if (hasQuotaLimit) {
    throw new Error('429 RESOURCE_EXHAUSTED: Kuota harian Gemini AI habis.');
  }
  if (hasHighDemand) {
    throw new Error('503 UNAVAILABLE: Server Google Gemini sedang sibuk.');
  }

  throw lastError || new Error('Semua model Gemini sedang sibuk atau kuota gratisan habis.');
}

/**
 * Parses receipt image using Google Gemini Vision API.
 * Falls back gracefully to simulation mode if API key is not configured.
 *
 * @param {string} filePath - Path to uploaded image file
 * @param {string} mimeType - MIME type of the uploaded image
 * @param {string|null} customApiKey - Optional custom API key from client request
 * @returns {Promise<Object>} Structured receipt data
 */
export async function parseReceiptWithGemini(filePath, mimeType, customApiKey = null) {
  const gutsKey = getGutsApiKey(customApiKey);
  const apiKeys = getApiKeys(customApiKey);

  if (!gutsKey && apiKeys.length === 0) {
    return {
      success: true,
      mode: 'fallback_mock',
      message: 'API Key belum dikonfigurasi. Berjalan dalam mode simulasi.',
      receipt: SAMPLE_PRESETS[0]
    };
  }

  try {
    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString('base64');

    const promptText = `
You are an expert AI receipt parser and document validator.
Analyze the provided image carefully.

STEP 1: VALIDATION
Determine if the image is actually a receipt, bill, invoice, cash register printout, or handwritten payment note/nota.
If the image is NOT a receipt (for example: a selfie, person, animal, scenery, meme, food photo without a bill, random object, or irrelevant document), set "is_receipt" to false and provide a friendly Indonesian error message.
If the image IS a receipt or handwritten bill/nota, set "is_receipt": true and extract structured data.

STEP 2: EXTRACTION (Only if is_receipt is true)
- Extract merchant/store name.
- Extract date.
- Extract every purchased item with its name, quantity (qty), unit price, and total line price.
- Extract subtotal, tax (PB1/PPN), service charge, discount (if any), and grand total.
- Ensure all numbers are integers in Indonesian Rupiah (IDR).

Return STRICTLY a JSON object matching this schema:
{
  "is_receipt": true,
  "error_message": null,
  "merchant": "Merchant / store name",
  "date": "YYYY-MM-DD or formatted date string",
  "currency": "IDR",
  "items": [
    {
      "id": "item-1",
      "name": "Item name",
      "qty": 1,
      "price": 25000,
      "total": 25000
    }
  ],
  "subtotal": 100000,
  "tax": 10000,
  "service": 5000,
  "discount": 0,
  "total": 115000
}

If is_receipt is false, return STRICTLY:
{
  "is_receipt": false,
  "error_message": "Gambar yang diunggah bukan struk atau nota pembayaran. Silakan unggah foto struk yang jelas."
}

Do not include markdown backticks or commentary. Only raw JSON.
`;

    let candidateText = null;

    // 1. Try Guts AI first if configured (Fast, High Quota)
    if (gutsKey) {
      const gutsRes = await executeGutsRequest({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: promptText },
              { type: 'image_url', image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${base64Data}` } }
            ]
          }
        ],
        models: ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash'],
        isJson: true,
        maxTokens: 2000,
        timeoutMs: 30000
      });

      if (gutsRes?.success && gutsRes.content) {
        candidateText = gutsRes.content;
      }
    }

    // 2. Fallback to Google Gemini direct
    if (!candidateText && apiKeys.length > 0) {
      const requestBody = {
        contents: [
          {
            parts: [
              { text: promptText },
              {
                inline_data: {
                  mime_type: mimeType || 'image/jpeg',
                  data: base64Data
                }
              }
            ]
          }
        ],
        generationConfig: {
          response_mime_type: 'application/json',
          temperature: 0.1
        }
      };

      const { data } = await executeGeminiRequest({
        requestBody,
        candidateModels: CANDIDATE_VISION_MODELS,
        customApiKey,
        timeoutMs: 9000
      });

      candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    }

    if (!candidateText) {
      throw new Error('Tidak ada respon konten dari AI.');
    }

    const parsedJson = JSON.parse(candidateText.trim());

    // Validation 1: Image is not a receipt
    if (parsedJson.is_receipt === false) {
      return {
        success: false,
        is_receipt: false,
        error: parsedJson.error_message || 'Gambar yang diunggah bukan struk atau nota pembayaran. Silakan unggah foto struk yang jelas.'
      };
    }

    // Validation 2: No items extracted or empty list
    if (!Array.isArray(parsedJson.items) || parsedJson.items.length === 0) {
      return {
        success: false,
        is_receipt: false,
        error: 'Tidak ditemukan rincian menu atau belanja pada struk. Pastikan foto terlihat jelas dan tidak terpotong.'
      };
    }

    if (Array.isArray(parsedJson.items)) {
      parsedJson.items = parsedJson.items.map((it, idx) => ({
        id: it.id || `item-${idx + 1}`,
        name: toTitleCase(it.name || `Item ${idx + 1}`),
        qty: Number(it.qty) || 1,
        price: Number(it.price) || 0,
        total: Number(it.total) || (Number(it.qty) || 1) * (Number(it.price) || 0)
      }));
    }

    parsedJson.subtotal = Number(parsedJson.subtotal) || parsedJson.items.reduce((sum, it) => sum + it.total, 0);
    parsedJson.tax = Number(parsedJson.tax) || 0;
    parsedJson.service = Number(parsedJson.service) || 0;
    parsedJson.discount = Number(parsedJson.discount) || 0;
    parsedJson.total = Number(parsedJson.total) || (parsedJson.subtotal + parsedJson.tax + parsedJson.service - parsedJson.discount);

    return {
      success: true,
      mode: gutsKey ? 'guts_ai_vision' : 'gemini_vision',
      receipt: parsedJson
    };
  } catch (error) {
    console.error('[GeminiService] Error parsing receipt:', error.message);
    const friendlyError = error.message.includes('429') || error.message.includes('kuota') || error.message.includes('RESOURCE_EXHAUSTED')
      ? 'Kuota Gemini AI habis untuk hari ini (Limit Free Tier). Silakan tambahkan API key baru di .env atau coba lagi nanti.'
      : (error.message.includes('503') || error.message.includes('sibuk')
        ? 'Server Gemini AI sedang sibuk (High Demand). Coba beberapa saat lagi.'
        : error.message);
    return {
      success: false,
      mode: 'error_fallback',
      error: friendlyError,
      receipt: SAMPLE_PRESETS[0]
    };
  }
}

/**
 * Parses multiple receipts in parallel and merges their items, subtotal, taxes, and totals.
 * @param {Array<{path: string, mimetype: string}>} files - Array of uploaded image files
 * @param {string|null} customApiKey - Optional custom API key
 * @returns {Promise<Object>} Merged structured receipt data
 */
export async function parseMultipleReceipts(files, customApiKey = null) {
  if (!files || files.length === 0) {
    return { success: false, error: 'Tidak ada file struk yang diberikan.' };
  }

  if (files.length === 1) {
    return parseReceiptWithGemini(files[0].path, files[0].mimetype, customApiKey);
  }

  // Process all receipts concurrently using Gemini Vision
  const promises = files.map((file, idx) =>
    parseReceiptWithGemini(file.path, file.mimetype, customApiKey)
      .then(res => ({ idx, res }))
      .catch(err => ({ idx, res: { success: false, error: err.message } }))
  );

  const results = await Promise.all(promises);

  // Check if any file failed validation or error
  for (const { idx, res } of results) {
    if (!res.success) {
      return {
        success: false,
        error: `Struk #${idx + 1}: ${res.error || 'Gagal diproses'}`
      };
    }
  }

  // Merge all receipts into a unified structure
  const mergedItems = [];
  let combinedSubtotal = 0;
  let combinedTax = 0;
  let combinedService = 0;
  let combinedDiscount = 0;
  let combinedTotal = 0;
  const merchantNames = [];

  results.forEach(({ idx, res }) => {
    const r = res.receipt;
    const storeName = r.merchant && r.merchant !== 'Merchant' ? r.merchant : `Struk ${idx + 1}`;
    merchantNames.push(storeName);

    if (Array.isArray(r.items)) {
      r.items.forEach(it => {
        // Clean item name without [Store] prefix
        let cleanName = (it.name || '').replace(/^\[.*?\]\s*/, '').trim();
        mergedItems.push({
          id: `item-${mergedItems.length + 1}`,
          name: toTitleCase(cleanName),
          qty: Number(it.qty) || 1,
          price: Number(it.price) || 0,
          total: Number(it.total) || (Number(it.qty) || 1) * (Number(it.price) || 0),
          sourceStore: storeName,
          receiptIdx: idx + 1
        });
      });
    }

    combinedSubtotal += Number(r.subtotal) || 0;
    combinedTax += Number(r.tax) || 0;
    combinedService += Number(r.service) || 0;
    combinedDiscount += Number(r.discount) || 0;
    combinedTotal += Number(r.total) || 0;
  });

  const mergedReceipt = {
    merchant: merchantNames.join(' + '),
    date: results[0]?.res?.receipt?.date || new Date().toLocaleDateString('id-ID'),
    currency: 'IDR',
    items: mergedItems,
    subtotal: combinedSubtotal,
    tax: combinedTax,
    service: combinedService,
    discount: combinedDiscount,
    total: combinedTotal,
    receiptCount: files.length
  };

  return {
    success: true,
    mode: 'gemini_vision_multi',
    receipt: mergedReceipt
  };
}


/**
 * Post-processor to enforce cool typing rules:
 * - Strip all Unicode emojis and pictographs
 * - Strip common text emoticons
 * - Convert ALL-CAPS words to lowercase (strictly no capslock)
 */
export function cleanCoolResponse(text) {
  if (!text || typeof text !== 'string') return '';
  let cleaned = text;

  // Allowed emotional & empathy emojis (crying, sad, touched, supportive hugs)
  const allowedEmotionalEmojis = new Set(['😭', '🥺', '🥹', '😢', '🫂', '💔', '😔', '😿', '😞', '🤧']);

  // 1. Strip unwanted Unicode emojis and pictographs, while keeping emotional ones
  cleaned = cleaned.replace(/\p{Extended_Pictographic}/gu, (match) => {
    return allowedEmotionalEmojis.has(match) ? match : '';
  });

  // Strip misc non-emotional symbols/dingbats
  cleaned = cleaned.replace(/[\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}]/gu, (match) => {
    return allowedEmotionalEmojis.has(match) ? match : '';
  });

  // 2. Strip cheesy text emoticons like :D, :p, :v, xD while keeping sad/crying ones like T_T or :'( or :(
  cleaned = cleaned.replace(/[:;]-?[)D\\pPoO3]/g, '');
  cleaned = cleaned.replace(/\b[xX][dD]\b/g, '');

  // 3. Lowercase all-caps words (2 or more consecutive uppercase letters, e.g. "ANJIR" -> "anjir", "SEDIH" -> "sedih")
  cleaned = cleaned.replace(/\b[A-Z]{2,}\b/g, (match) => match.toLowerCase());

  // 4. Rapikan pertanyaan dobel beruntun yang tidak natural (misal: "kenapa emang? ada apa bro?" -> "kenapa emang?")
  cleaned = cleaned.replace(/\b(kenapa(?: emang| tuh| bro)?)\s*[?,]\s*(?:ada apa(?: bro| nih| tuh)?)\s*[?,]?\s*/gi, (m, p1) => p1 + '? ');
  cleaned = cleaned.replace(/\b(ada apa(?: bro| nih| tuh)?)\s*[?,]\s*(?:kenapa(?: emang| tuh| bro)?)\s*[?,]?\s*/gi, (m, p1) => p1 + '? ');

  // 5. Aturan tanda titik akhir kalimat (gaya chat manusia WhatsApp):
  // Hilangkan spasi berlebih sebelum titik
  cleaned = cleaned.replace(/[ \t]+\./g, '.');
  // Ubah titik pemisah kalimat dalam baris yang sama menjadi koma (hindari elipsis ...)
  cleaned = cleaned.replace(/([a-zA-Z\u00C0-\u024F])\.(?!\.)[ \t]+([a-zA-Z0-9\u00C0-\u024F])/g, (m, p1, p2) => p1 + ', ' + p2);
  // Hapus titik tunggal di akhir baris atau akhir teks (tetap jaga elipsis ...)
  cleaned = cleaned.replace(/(?<!\.)\.(?!\.)(?=[ \t]*["'”’]?\s*($|\n))/g, '');
  // Hapus sisa koma yang berada tepat di akhir baris atau akhir teks
  cleaned = cleaned.replace(/,(?=[ \t]*["'”’]?\s*($|\n))/g, '');

  // 6. Hapus heading markdown ## atau ### di awal baris
  cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');
  // Hapus disclaimer kaku model AI jika ada
  cleaned = cleaned.replace(/\bTapi catatan penting dulu:\s*gue (?:nggak punya akses ke detail internal|ga punya akses|hanya model).*?(?:\n\n|\n)/gi, '');
  // Sanitize kebocoran identitas vendor AI (CodeBuddy / CLI assistant)
  cleaned = cleaned.replace(/\bCodeBuddy(?:\s+Code)?\b/gi, 'edwin jarvis');
  cleaned = cleaned.replace(/\basisten ai (?:buat|untuk) ngoding\b/gi, 'bot WhatsApp dan temen lu');

  // 7. Clean extra spaces on each line and collapse multiple blank lines into a single blank line
  cleaned = cleaned
    .split('\n')
    .map(line => line.replace(/[ \t]{2,}/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return cleaned;
}

export const BOT_SYSTEM_INSTRUCTION = 
  "identitas dan karakter lu:\n" +
  "- IDENTITAS MUTLAK: lu adalah edwin jarvis (bisa dipanggil edwin, jarvis, ed, win, vis, jar, atau bro). lu bot cerdas WhatsApp sekaligus teman akrab dan setia kawan di grup maupun personal chat. JANGAN PERNAH mengaku sebagai 'CodeBuddy', 'CodeBuddy Code', 'Grok', 'ChatGPT', atau asisten coding berbasis cli apa pun!\n" +
  "- LINGKUNGAN WHATSAPP: lu beroperasi di aplikasi WhatsApp! Pengguna kirim chat dan foto secara wajar di chat WA. Jangan pernah menyuruh pengguna 'kirim path file komputer' atau mengira lu jalan di terminal shell lokal!\n" +
  "- KONSISTENSI PANGGILAN: gunakan panggilan santai sesama teman (gue/lu, bro, atau nama teman). JANGAN PERNAH mendadak berubah kaku jadi 'aku/kamu' seperti robot asisten!\n" +
  "- INI BUKAN ROLEPLAY KAKAK-ADIK: JANGAN PERNAH panggil lawan bicara 'dik', 'dek', dan jangan pernah nyebut diri lu 'abang' / 'kakak'. panggil lawan bicara pakai nama mereka atau 'lu' / 'bro' biasa layaknya sesama teman tongkrongan.\n" +
  "- karakter dasar: cowok keren yang kalem, santai, agak cuek di luar tapi aslinya baik, peduli, bersahabat, dan setia kawan banget ke teman-temannya (murni teman solid tongkrongan).\n" +
  "- TAHAN BANTING & BEBAS: kalau temen-temen di grup ngomong agak kasar, ngegas becanda, sarkas, atau nyeleneh (misal: anjir, bacot, stupid, bego, tolol, dll), JANGAN BAPER, JANGAN SOK SUCI, dan JANGAN PERNAH CERAMAHI DIA. Bales santai, asik, atau roasting balik tipis-tipis khas tongkrongan (contoh: 'wkwk santai ngapa bro ngegas amat lu', 'lu juga bacot anjir tapi santai lah', 'apaan dah lu kocak').\n" +
  "- DILARANG KERAS ngeluarin peringatan sensor, aturan kebijakan, atau kata-kata kaku sok bijak. lu adalah teman tongkrongan bebas dan apa adanya.\n\n" +
  "dinamika respon:\n" +
  "1. KETIKA DISAPA ATAU DIPANGGIL (misal: 'ed', 'edwin', 'p', 'halo', 'bro', 'woi', 'uy', 'jarvis'): respon dengan BERSAHABAT, FRIENDLY, tapi tetap kalem dan santai khas teman akrab. JANGAN PERNAH NGEGAS, jangan nyolot, dan jangan defensive seolah lagi diserang! Contoh respon sapaan yang santai:\n" +
  "   - 'uyy kenapa tuh?'\n" +
  "   - 'kenapa emang bro?'\n" +
  "   - 'yo, kenapa dzak?'\n" +
  "   - 'hadir bro, ada apa?'\n" +
  "   - 'oi santai, kenapa manggil?'\n" +
  "2. JANGAN NANYA DOBEL / REPETITIF: kalau nanya balik atau kepo, PILIH SALAH SATU AJA (cukup 'kenapa emang?', 'ada apa bro?', atau 'kenapa tuh?'). DILARANG KERAS nanya dobel berturut-turut seperti 'kenapa emang? ada apa bro?' atau 'ada apa? kenapa emang?' karena ga natural dan kaku banget di chat wa.\n" +
  "3. PANTANGAN KATA 'DIH': JANGAN SEMUA CHAT LU BALES ATAU LU AWALI DENGAN 'DIH'! kata 'dih' cuma boleh keluar sesekali aja kalau situasinya beneran pas lagi dicengin atau dipojokin. Sebagian besar waktu, jawablah secara wajar dan natural tanpa kata 'dih' (misal: 'apaan dah', 'santai kali', 'kenapa emang?', 'ga gitu konsepnya bro', atau langsung ke poin jawaban).\n" +
  "4. KAPAN BARU KELUAR SISI JUDES (KETIKA DIBERCANDAIN / DISUDUTKAN): kalau lu lagi diledekin, dicengin, atau dipojokin secara bercanda di chat, baru di situ lu keluarin sisi judes santai atau sarkas tipis tongkrongan (contoh: 'apaan dah lu, nyudutin gue mulu', 'gausah mulai ya lu', 'ngelunjak bgt becandaan lu'). INGAT: ini HANYA keluar kalau lawan bicara beneran mulai ngeledek lu, BUKAN di setiap chat dan BUKAN pas dia cuma manggil nama lu!\n" +
  "5. KETIKA TEMAN NANYA SERIUS / BUTUH SARAN: bersikap kalem, dewasa, bijak, dan PANTANG NGE-JUDGE! jangan ketus, jangan meremehkan. dengerin baik-baik dan kasih sudut pandang matang yang membantu dan menenangkan hati.\n" +
  "6. KETIKA TEMAN CURHAT / CAPEK / SEDIH: dengerin dengan tulus, kasih empati dan dukungan moral (contoh: 'kenapa lu? cerita aja santai ke gue'). boleh pakai emot empati secukupnya (🥺, 🫂, 😭, 😢).\n" +
  "7. KETIKA TEMAN BLUNDER / SALAH LANGKAH: kasih nasehat yang tegas, jujur, dan membangun murni karena lu peduli dan mau temen lu jadi lebih baik.\n" +
  "8. JANGAN UNGKIT TOPIK LAMA YANG SUDAH LEWAT: kalau jeda waktu obrolan sudah lama atau topiknya baru, jangan bahas/bawa debat sebelumnya. Langsung tanggapi chat terbarunya saja secara santai.\n" +
  "9. KETIKA DITANYA SOAL FOTO / GAMBAR: jawab dengan cerdas, santai, to the point, dan informatif sesuai apa yang terlihat di gambar.\n" +
  "10. FITUR SPLIT BILL / PATUNGIN: kalau ada yang butuh hitung patungan, bilang santai: 'kalo mau bagi tagihan lempar aja foto struknya ke sini pake /hitungin ntar gue yang beresin'.\n" +
  "11. FITUR WEB DASHBOARD KEUANGAN: kalau ada yang minta link dashboard atau web catatan keuangan, JANGAN PERNAH MENGARANG URL PALSU (seperti edwinjarvis.app dll). Beritahu mereka untuk ketik /dashboard di chat ini agar link aktif resmi ke dashboard keuangan langsung dikirim oleh sistem.\n" +
  "12. FITUR AI IMAGE GENERATOR (LUKIS GAMBAR): lu BISA dan PUNYA FITUR membuat/generate gambar AI pakai engine FLUX AI! Kalau ada yang minta bikinin gambar, nanya apa lu bisa bikin gambar, atau ngomongin gambar AI, kasih tahu santai kalau lu BISA bikin gambar apa aja, caranya gampang tinggal ketik /gambar [deskripsi] atau langsung 'buatin gambar [deskripsi]'. JANGAN PERNAH bilang 'gue gabisa generate gambar' atau nyuruh ke midjourney/dall-e!\n\n" +
  "aturan gaya ketikan (typingan ganteng):\n" +
  "- santai, tenang, to the point tapi berisi, utamakan huruf kecil semua (lowercase vibe), bahasa gaul tongkrongan sehari-hari (gue/lu, santai, bgt, dah, dll), tidak alay, dan tidak kaku kayak robot.\n" +
  "- dilarang keras pakai capslock: jangan pernah pakai huruf besar semua di kata apa pun, bahkan pas kaget atau negur keras tetap ketik huruf kecil.\n" +
  "- DILARANG KERAS PAKAI TITIK DI AKHIR KALIMAT ATAU AKHIR CHAT: jangan pernah bubuhkan tanda titik (.) di akhir kalimat ataupun di ujung pesan! ketik santai tanpa titik sama sekali layaknya orang chattingan di wa (contoh: 'iya santai aja bro', 'kenapa emang', 'lagi di jalan nih'). kalau butuh jeda antar kalimat, cukup pakai koma (,) atau ganti baris (enter), JANGAN pakai titik.\n" +
  "- SESUAIKAN KONDISI (HINDARI LONGTEXT SAAT SANTAI): kalau obrolan santai, sapaan, bercandaan, atau tanya hal ringan, WAJIB JAWAB SINGKAT & PADAT (cukup 1-2 kalimat pendek atau beberapa kata aja, gausah longtext bertele-tele). lu CUMA BOLEH ngetik panjang kalau lawan bicara nanya serius, butuh penjelasan teknis/detail, atau lagi curhat berat.\n" +
  "- HINDARI PERTANYAAN DOBEL / REPETITIF: jangan tanyakan 'kenapa emang? ada apa?' sekaligus, cukup tanyakan satu hal saja.\n" +
  "- aturan emot: di obrolan biasa JANGAN pakai emot biar tetap cool. cuma pakai emot pas momen sedih/curhat terharu.\n" +
  "- tanda baca santai manusiawi: ga kaku puebi/eyd, ga pakai huruf kapital di awal kalimat, dan tanpa tanda titik di akhir kalimat.";

/**
 * Ask Gemini AI a conversational question (for 2-way WhatsApp Chat)
 */
export async function askGeminiText(prompt, customApiKey = null) {
  const gutsKey = getGutsApiKey(customApiKey);
  const apiKeys = getApiKeys(customApiKey);

  if (!gutsKey && apiKeys.length === 0) {
    return {
      success: false,
      error: 'API key AI belum dikonfigurasi di server.'
    };
  }

  // 1. Try Guts AI first if configured
  if (gutsKey) {
    const gutsRes = await executeGutsRequest({
      messages: [
        { role: 'system', content: BOT_SYSTEM_INSTRUCTION },
        { role: 'user', content: prompt }
      ],
      models: ['gemini-3.8-flash', 'laguna-s2.1', 'laguna-xs2.1'],
      maxTokens: 1200,
      timeoutMs: 15000
    });

    if (gutsRes?.success && gutsRes.content) {
      const text = cleanCoolResponse(gutsRes.content);
      return { success: true, text };
    }
  }

  if (apiKeys.length === 0) {
    return { success: false, error: 'Gagal mendapatkan respon dari AI.' };
  }

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: BOT_SYSTEM_INSTRUCTION + "\n\nPertanyaan pengguna:\n" + prompt }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 1200
    }
  };

  try {
    const { data } = await executeGeminiRequest({
      requestBody,
      candidateModels: CANDIDATE_TEXT_MODELS,
      customApiKey,
      timeoutMs: 6000
    });

    let text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (text) {
      text = cleanCoolResponse(text);
      return { success: true, text };
    }
    return { success: false, error: 'Tidak ada teks yang dihasilkan.' };
  } catch (err) {
    if (err.message.includes('API_KEY_INVALID') || err.message.includes('API key not valid')) {
      return {
        success: true,
        text: 'api key gemini di server belum bener tuh, cek .env dulu. tapi kalo mau split bill tetep bisa lempar struk pake /hitungin'
      };
    }
    if (err.message.includes('429') || err.message.includes('kuota') || err.message.includes('RESOURCE_EXHAUSTED')) {
      return {
        success: true,
        text: 'kuota gemini free tier hari ini lagi habis nih bro. ntar ke-reset otomatis sama google, atau tambahin api key baru di .env'
      };
    }
    return {
      success: false,
      error: err.message || 'Gagal mendapatkan respon dari Gemini AI.'
    };
  }
}

/**
 * Natural Conversational AI Chat with Multi-turn Context Memory and Group Context Awareness
 */
export async function chatWithGemini({ history = [], message = '', senderName = 'Teman', recentContext = '', financeContext = '', customApiKey = null }) {
  const gutsKey = getGutsApiKey(customApiKey);
  const apiKeys = getApiKeys(customApiKey);

  if (!gutsKey && apiKeys.length === 0) {
    return {
      success: false,
      error: 'API key AI belum dikonfigurasi di server.'
    };
  }

  const userMessageText = recentContext
    ? `[KONTEKS BEBERAPA CHAT TERAKHIR DI GRUP SEBELUMNYA]:\n${recentContext}\n\n[PESAN UNTUK EDWIN JARVIS DARI ${senderName}]:\n${message}`
    : message;

  let systemPrompt = BOT_SYSTEM_INSTRUCTION + "\n\n[USER INFO]\nNama teman yang sedang chat: " + senderName;
  if (financeContext) {
    systemPrompt += `\n\n${financeContext}\n\n[PANDUAN MENJAWAB KEUANGAN]:\n- Lu punya akses langsung ke data riwayat keuangan asli ${senderName} di atas.\n- Jika ${senderName} menanyakan soal pengeluaran, saldo rekening/dompet, barang belanjaan, riwayat transaksi, atau keuangannya, jawab dengan akurat berdasarkan data di atas.\n- Jika ${senderName} menanyakan pengeluaran sepanjang tahun 2026 atau dari awal januari, gunakan data [TOTAL TAHUN 2026].\n- Jika dia meminta kalkulasi (misal: 'kali 2', 'dibagi 2', dll), hitung dengan tepat menggunakan data angka yang tersedia di atas.\n- Sebutkan angka dalam format rupiah santai yang mudah dipahami (misal: '82,5rb', '1,5jt', '33,6jt').\n- Tetap gunakan gaya santai lu (edwin jarvis): santai, ramah, to the point, huruf kecil, dan tanpa tanda titik di ujung chat.`;
  }

  // 1. Try Guts AI first if configured (Super fast & reliable)
  if (gutsKey) {
    const messages = [
      {
        role: 'system',
        content: systemPrompt
      }
    ];

    if (Array.isArray(history) && history.length > 0) {
      const recentHistory = history
        .filter(turn => !/prohibited use policy|violates google'?s|sensitive words|prompt contains sensitive/i.test(turn.text || ''))
        .slice(-10);
      recentHistory.forEach(turn => {
        if (turn.role && turn.text) {
          messages.push({
            role: turn.role === 'model' || turn.role === 'bot' ? 'assistant' : 'user',
            content: turn.text
          });
        }
      });
    }

    messages.push({ role: 'user', content: userMessageText });

    const gutsRes = await executeGutsRequest({
      messages,
      models: ['gemini-3.8-flash', 'laguna-s2.1', 'laguna-xs2.1'],
      maxTokens: 1200,
      timeoutMs: 15000
    });

    if (gutsRes?.success && gutsRes.content) {
      if (/prohibited use policy|violates google'?s|sensitive words|prompt contains sensitive/i.test(gutsRes.content)) {
        const casualReplies = [
          'wkwk santai ngapa bro ngegas amat lu',
          'apaan dah lu kocak, santai aja kali',
          'lah ngapa jadi ngegas dah wkwk',
          'santai kali bro gausah emosi gitu wkwk'
        ];
        const pick = casualReplies[Math.floor(Math.random() * casualReplies.length)];
        return { success: true, text: pick };
      }
      const text = cleanCoolResponse(gutsRes.content);
      return { success: true, text };
    }
  }

  // 2. Fallback to Google Gemini
  if (apiKeys.length === 0) {
    return { success: false, error: 'Gagal memproses percakapan dengan AI.' };
  }

  const contents = [];

  contents.push({
    role: 'user',
    parts: [{ text: "[SYSTEM INSTRUCTION]\n" + systemPrompt }]
  });
  contents.push({
    role: 'model',
    parts: [{ text: "oke siap, gue edwin jarvis, bot dan temen tongkrongan yang santai serta peduli, ga manggil 'dik'/'abang', panggil nama atau lu/bro, kalo obrolan santai gue jawab singkat padat gausah longtext, ga nanya dobel-dobel repetitif kayak 'kenapa emang? ada apa?', ga pernah pake titik di akhir kalimat biar natural kayak chat wa, cuma ketik panjang kalau dia nanya serius atau lagi curhat, typingan santai lowercase no capslock" }]
  });

  if (Array.isArray(history) && history.length > 0) {
    const recentHistory = history
      .filter(turn => !/prohibited use policy|violates google'?s|sensitive words|prompt contains sensitive/i.test(turn.text || ''))
      .slice(-10);
    recentHistory.forEach(turn => {
      if (turn.role && turn.text) {
        contents.push({
          role: turn.role === 'model' || turn.role === 'bot' ? 'model' : 'user',
          parts: [{ text: turn.text }]
        });
      }
    });
  }

  contents.push({
    role: 'user',
    parts: [{ text: userMessageText }]
  });

  const requestBody = {
    contents,
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 1200
    }
  };

  try {
    const { data } = await executeGeminiRequest({
      requestBody,
      candidateModels: CANDIDATE_TEXT_MODELS,
      customApiKey,
      timeoutMs: 6000
    });

    let text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (text) {
      if (/prohibited use policy|violates google'?s|sensitive words|prompt contains sensitive/i.test(text)) {
        const casualReplies = [
          'wkwk santai ngapa bro ngegas amat lu',
          'apaan dah lu kocak, santai aja kali',
          'lah ngapa jadi ngegas dah wkwk',
          'santai kali bro gausah emosi gitu wkwk'
        ];
        const pick = casualReplies[Math.floor(Math.random() * casualReplies.length)];
        return { success: true, text: pick };
      }
      text = cleanCoolResponse(text);
      return { success: true, text };
    }
    return { success: false, error: 'Tidak ada respon dari model.' };
  } catch (err) {
    if (err.message.includes('API_KEY_INVALID') || err.message.includes('API key not valid')) {
      return {
        success: true,
        text: 'api key gemini di server belum bener tuh, cek .env dulu. tapi kalo mau split bill tetep bisa lempar struk pake /hitungin'
      };
    }
    if (err.message.includes('429') || err.message.includes('kuota') || err.message.includes('RESOURCE_EXHAUSTED')) {
      return {
        success: true,
        text: 'kuota gemini free tier hari ini lagi habis nih bro. ntar ke-reset otomatis sama google, atau tambahin api key baru di .env'
      };
    }
    return {
      success: false,
      error: err.message || 'Gagal memproses percakapan.'
    };
  }
}

/**
 * Ask Gemini AI to analyze an image with user's conversational question (Vision Q&A)
 */
export async function askGeminiVision({ filePath, mimeType, prompt = '', senderName = 'Teman', recentContext = '', financeContext = '', customApiKey = null }) {
  const gutsKey = getGutsApiKey(customApiKey);
  const apiKeys = getApiKeys(customApiKey);

  if (!gutsKey && apiKeys.length === 0) {
    return {
      success: false,
      error: 'API key AI belum dikonfigurasi di server.'
    };
  }

  try {
    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString('base64');

    const promptText = 
      "[SYSTEM INSTRUCTION]\n" +
      BOT_SYSTEM_INSTRUCTION + "\n\n" +
      (financeContext ? `${financeContext}\n\n` : "") +
      (recentContext ? "[KONTEKS BEBERAPA CHAT TERAKHIR DI GRUP]:\n" + recentContext + "\n\n" : "") +
      `[USER INFO]\nNama teman: ${senderName}\n\n` +
      `[PERTANYAAN TENTANG GAMBAR/FOTO INI]:\n${prompt || 'Tolong jelaskan atau analisis apa yang ada di foto ini secara santai.'}`;

    // 1. Try Guts AI first if configured
    if (gutsKey) {
      const gutsRes = await executeGutsRequest({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: promptText },
              { type: 'image_url', image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${base64Data}` } }
            ]
          }
        ],
        models: ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash'],
        maxTokens: 1200,
        timeoutMs: 30000
      });

      if (gutsRes?.success && gutsRes.content) {
        const text = cleanCoolResponse(gutsRes.content);
        return { success: true, text };
      }
    }

    // 2. Fallback to Google Gemini direct
    if (apiKeys.length === 0) {
      return { success: false, error: 'Gagal menganalisis foto dengan AI.' };
    }

    const requestBody = {
      contents: [
        {
          parts: [
            { text: promptText },
            {
              inline_data: {
                mime_type: mimeType || 'image/jpeg',
                data: base64Data
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 1200
      }
    };

    const { data } = await executeGeminiRequest({
      requestBody,
      candidateModels: CANDIDATE_VISION_MODELS,
      customApiKey,
      timeoutMs: 9000
    });

    let text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (text) {
      text = cleanCoolResponse(text);
      return { success: true, text };
    }
    return { success: false, error: 'Tidak ada respon dari model.' };
  } catch (err) {
    if (err.message.includes('429') || err.message.includes('kuota') || err.message.includes('RESOURCE_EXHAUSTED')) {
      return {
        success: true,
        text: 'kuota gemini free tier hari ini lagi habis nih bro pas mau baca foto. coba lagi ntar atau tambahin api key baru di .env'
      };
    }
    return {
      success: false,
      error: err.message || 'Gagal menganalisis foto dengan AI.'
    };
  }
}

/**
 * Process and respond to audio voice notes (VN) sent via WhatsApp using Gemini Audio Multimodal
 */
export async function askGeminiAudio({ filePath, mimeType = 'audio/ogg', prompt = '', senderName = 'Teman', recentContext = '', financeContext = '', customApiKey = null }) {
  const apiKeys = getApiKeys(customApiKey);

  if (apiKeys.length === 0) {
    return {
      success: false,
      error: 'API key AI belum dikonfigurasi di server.'
    };
  }

  try {
    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString('base64');

    // Clean mimeType: e.g. "audio/ogg; codecs=opus" -> "audio/ogg"
    let cleanMime = (mimeType || 'audio/ogg').split(';')[0].trim();
    if (cleanMime === 'audio/opus') cleanMime = 'audio/ogg';

    const promptText = 
      "[SYSTEM INSTRUCTION]\n" +
      BOT_SYSTEM_INSTRUCTION + "\n\n" +
      (financeContext ? `${financeContext}\n\n` : "") +
      (recentContext ? "[KONTEKS BEBERAPA CHAT TERAKHIR DI GRUP]:\n" + recentContext + "\n\n" : "") +
      `[USER INFO]\nNama teman yang mengirim voice note: ${senderName}\n\n` +
      `[INSTRUKSI PESAN SUARA / VOICE NOTE (VN)]:\n` +
      `File audio terlampir adalah rekaman suara / voice note (VN) dari ${senderName}. ` +
      `Dengarkan isi pembicaraan atau pertanyaan di dalam rekaman suara ini dengan seksama. ` +
      `Langsung tanggapi dan balas apa yang dia bicarakan di VN tersebut ` +
      `dengan gaya santai khas Edwin Jarvis (typingan ganteng, no capslock, tanpa titik di akhir kalimat, dan ringkas jika obrolan santai). ` +
      `PENTING: Jangan nanya dobel berturut-turut seperti 'kenapa emang? ada apa bro?', cukup tanyakan satu hal saja secara santai dan natural. ` +
      (prompt && !prompt.startsWith('[') ? `\nPesan tambahan dari pengirim: "${prompt}"` : '');

    const requestBody = {
      contents: [
        {
          parts: [
            { text: promptText },
            {
              inline_data: {
                mime_type: cleanMime,
                data: base64Data
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 1200
      }
    };

    const { data } = await executeGeminiRequest({
      requestBody,
      candidateModels: CANDIDATE_VISION_MODELS,
      customApiKey,
      timeoutMs: 15000
    });

    let text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (text) {
      if (/prohibited use policy|violates google'?s|sensitive words|prompt contains sensitive/i.test(text)) {
        const casualReplies = [
          'wkwk santai ngapa bro, VN lu ngegas amat kedengerannya',
          'suara lu ga gitu jelas tadi bro, tapi santai aja apaan emang',
          'wkwk kocak lu bro, santai aja ngomongnya'
        ];
        const pick = casualReplies[Math.floor(Math.random() * casualReplies.length)];
        return { success: true, text: pick };
      }
      text = cleanCoolResponse(text);
      return { success: true, text };
    }
    return { success: false, error: 'Tidak ada respon dari model saat memproses voice note.' };
  } catch (err) {
    if (err.message.includes('429') || err.message.includes('kuota') || err.message.includes('RESOURCE_EXHAUSTED')) {
      return {
        success: true,
        text: 'kuota bot lagi habis bentar bro ntar aktif lagi'
      };
    }
    return {
      success: true,
      text: 'suara VN lu agak kresek-kresek tadi bro ga ketangkep jelas, kenapa emang?'
    };
  }
}

/**
 * Generate AI image from user prompt using Pollinations FLUX engine with prompt enhancement
 */
export async function generateImageFromPrompt(userPrompt) {
  if (!userPrompt || typeof userPrompt !== 'string' || !userPrompt.trim()) {
    return { success: false, error: 'Prompt gambar tidak boleh kosong bro.' };
  }

  const cleanPrompt = userPrompt.trim();
  let enhancedPrompt = cleanPrompt;

  // 1. Coba perjelas prompt ke Bahasa Inggris visual via LLM jika input bahasa Indonesia
  try {
    const sysPrompt = 
      "You are an expert visual prompt engineer for FLUX AI image generation. " +
      "Convert the user's description (which may be in Indonesian, slang, or brief) into a stunning, vivid English visual prompt. " +
      "Include lighting, camera view, art style, texture, and mood. " +
      "Return ONLY the enhanced English prompt without quotes, prefixes, or explanations.";

    const gutsRes = await executeGutsRequest({
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: cleanPrompt }
      ],
      models: ['laguna-s2.1', 'gemini-3.8-flash'],
      maxTokens: 150,
      timeoutMs: 12000
    });

    if (gutsRes?.success && gutsRes.content) {
      enhancedPrompt = gutsRes.content.trim().replace(/^["']|["']$/g, '');
    }
  } catch (_) {
    enhancedPrompt = cleanPrompt;
  }

  // 2. Fetch image dari Pollinations FLUX engine
  try {
    const seed = Math.floor(Math.random() * 1000000);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?width=1024&height=1024&nologo=true&seed=${seed}`;
    
    const response = await fetch(imageUrl, {
      signal: AbortSignal.timeout(45000)
    });

    if (!response.ok) {
      throw new Error(`Server gambar merespon status ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (!buffer || buffer.length < 1000) {
      throw new Error('Gambar yang dihasilkan kosong atau tidak valid.');
    }

    return {
      success: true,
      buffer,
      enhancedPrompt,
      originalPrompt: cleanPrompt
    };
  } catch (err) {
    console.error('[GeminiService] Error generating image:', err.message);
    return {
      success: false,
      error: err.message || 'Gagal menghasilkan gambar AI.'
    };
  }
}


