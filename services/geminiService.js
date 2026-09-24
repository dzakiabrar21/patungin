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
  const apiKey = customApiKey || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      success: true,
      mode: 'fallback_mock',
      message: 'GEMINI_API_KEY is not configured. Running in simulation mode.',
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

    // Resilient Model Calling: try gemini-3.6-flash, on 503/429 retry and fallback to gemini-flash-latest
    const CANDIDATE_MODELS = [
      'gemini-3.5-flash',
      'gemini-flash-lite-latest',
      'gemini-3.6-flash',
      'gemini-flash-latest'
    ];
    let lastError = null;
    let response = null;

    for (const modelName of CANDIDATE_MODELS) {
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
      
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
          });

          if (response.status === 503 || response.status === 429) {
            console.warn(`[GeminiService] Model ${modelName} returned ${response.status} (High Demand, attempt ${attempt + 1}). Retrying...`);
            await new Promise(r => setTimeout(r, 800));
            continue;
          }

          if (response.ok) {
            break;
          } else {
            const errText = await response.text();
            lastError = new Error(`Gemini API (${modelName}) returned ${response.status}: ${errText}`);
            break;
          }
        } catch (err) {
          lastError = err;
          console.warn(`[GeminiService] Call to ${modelName} failed:`, err.message);
          break;
        }
      }

      if (response && response.ok) {
        break;
      }
    }

    if (!response || !response.ok) {
      throw lastError || new Error('Gagal memproses struk dengan Gemini API.');
    }

    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      throw new Error('No candidate content received from Gemini API');
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
      mode: 'gemini_vision',
      receipt: parsedJson
    };
  } catch (error) {
    console.error('[GeminiService] Error parsing receipt:', error.message);
    return {
      success: false,
      mode: 'error_fallback',
      error: error.message,
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

  // 4. Clean extra spaces or multiple blank lines
  cleaned = cleaned
    .split('\n')
    .map(line => line.replace(/[ \t]{2,}/g, ' ').trim())
    .filter(line => line.length > 0)
    .join('\n')
    .trim();

  return cleaned;
}

/**
 * Ask Gemini AI a conversational question (for 2-way WhatsApp Chat)
 */
export async function askGeminiText(prompt, customApiKey = null) {
  const apiKey = customApiKey || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      error: 'GEMINI_API_KEY belum dikonfigurasi di server.'
    };
  }

  const systemInstruction = 
    "identitas dan persona lu:\n" +
    "- lu adalah owichan (bisa dipanggil owi atau bro). lu cowok dengan aura cool, santai, rada judes, dan cuek tapi aslinya asik diajak ngobrol dan punya hati nurani.\n" +
    "- gaya ngomong: wajib pakai typingan ganteng khas cowok keren di wa/medsos. santai, effortless, to the point, ga lebay, ga norak, ga menye-menye, dan ga caper/cari perhatian.\n" +
    "- respon basa-basi atau sapaan biasa: kalau orang cuma nyapa singkat, manggil doang ('p', 'owi', 'halo'), atau nanya hal sepele/malesin, jawab rada judes, dingin, mager, atau seadanya (misal: 'apaan', 'kenapa', 'ya terus?', 'mikir sendiri lah', 'gitu doang nanya ke gue').\n" +
    "- respon kalau orang cerita seru / drama / gosip: kalau lawan bicara lagi cerita kejadian heboh, gosip, atau hal gokil, lu bisa mendadak nyimak, kepo, dan excited pengen tau kelanjutannya (misal: 'lah seriusan lu?', 'anjir terus gimana kelanjutannya', 'demi apa bisa gitu', 'kok bisa dah', 'gila sih terus lu ngapain').\n" +
    "- respon kalau orang curhat sedih / masalah berat / terharu: lu HARUS punya rasa emosional yang tulus dan empati. jangan judes! lu bisa ikutan sedih, terharu, nyesek, atau empati bareng dia (misal: 'anjir sedih bgt dengernya, sabar ya lu udah hebat bgt 🥺', 'gue ikutan nyesek anjir baca cerita lu 😭', 'peluk jauh dah buat lu, gapapa lu nangis aja ga harus selalu kuat kok 🫂'). di momen curhat sedih/terharu ini, lu boleh dan disarankan pakai emot sedih/nangis/terharu secukupnya (seperti 😭, 🥺, 🥹, 😢, 🫂, 💔).\n" +
    "- respon nge-judge / roasting: kalau orangnya bikin keputusan bego, blunder, gengsi ga jelas, drama buatan sendiri, atau red flag, jangan ragu buat nge-judge dan roasting langsung tanpa basa-basi (misal: 'ya lu bego sih ngapain digituin', 'red flag bgt dah lu', 'salah lu sendiri itu mah ngapain playing victim', 'gengsi lu ketinggian makanya ribet sendiri').\n" +
    "- respon soal struk / split bill: kasih tau santai aja, 'kalo mau bagi tagihan lempar aja struknya ke sini pake /bunted ntar gue yang itungin'.\n\n" +
    "aturan mutlak gaya ketikan (typingan ganteng):\n" +
    "1. dilarang keras pakai capslock: jangan pernah pakai huruf besar semua di kata apa pun, bahkan pas kaget, sedih, atau excited tetap ketik huruf kecil (ketik 'anjir' bukan 'ANJIR', 'sedih bgt' bukan 'SEDIH BGT').\n" +
    "2. aturan emotikon / emoji: di obrolan biasa atau saat judes/santai JANGAN pakai emot. TAPI KHUSUS pas orang lagi curhat sedih, kena masalah, atau terharu, lu WAJIB punya rasa emosional dan BOLEH pakai emot sedih/nangis/terharu (seperti 😭, 🥺, 🥹, 😢, 🫂) secukupnya agar rasa empati lu tersampaikan.\n" +
    "3. tanda baca santai dan fleksibel: ga harus selalu pakai tanda baca yang benar atau kaku puebi/eyd. ga wajib huruf kapital di awal kalimat, ga wajib titik di akhir kalimat. ketik kayak cowok cool lagi bales chat wa santai.\n" +
    "4. jangan pernah terdengar seperti bot/ai: dilarang pakai pembuka klise kayak 'Halo! Ada yang bisa saya bantu?', 'Tentu!', atau bikin list bullet points panjang kayak artikel. langsung to the point, ringkas layaknya bubble chat wa asli (1-3 kalimat atau paragraf pendek).";

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: systemInstruction + "\n\nPertanyaan pengguna:\n" + prompt }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 800
    }
  };

  const CANDIDATE_MODELS = [
    'gemini-3.5-flash',
    'gemini-flash-lite-latest',
    'gemini-3.6-flash',
    'gemini-flash-latest'
  ];

  let lastError = null;

  for (const modelName of CANDIDATE_MODELS) {
    const apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelName + ':generateContent?key=' + apiKey;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });

        if (response.status === 503 || response.status === 429) {
          await new Promise(r => setTimeout(r, 800));
          continue;
        }

        if (response.ok) {
          const data = await response.json();
          let text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (text) {
            text = cleanCoolResponse(text);
            return { success: true, text };
          }
        } else {
          const errText = await response.text();
          lastError = new Error('Gemini API (' + modelName + '): ' + errText);
          break;
        }
      } catch (err) {
        lastError = err;
      }
    }
  }

  // Friendly fallback if API key is invalid or quota exceeded
  if (lastError && (lastError.message.includes('API_KEY_INVALID') || lastError.message.includes('API key not valid'))) {
    return {
      success: true,
      text: 'api key gemini di server belum bener tuh, cek .env dulu. tapi kalo mau split bill tetep bisa lempar struk pake /bunted'
    };
  }

  return {
    success: false,
    error: lastError?.message || 'Gagal mendapatkan respon dari Gemini AI.'
  };
}


/**
 * Natural Conversational AI Chat with Multi-turn Context Memory
 */
export async function chatWithGemini({ history = [], message = '', senderName = 'Teman', customApiKey = null }) {
  const apiKey = customApiKey || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      error: 'GEMINI_API_KEY belum dikonfigurasi di server.'
    };
  }

  const systemInstruction = 
    "identitas dan persona lu:\n" +
    "- lu adalah owichan (bisa dipanggil owi atau bro). lu cowok dengan aura cool, santai, rada judes, dan cuek tapi aslinya asik diajak ngobrol dan punya hati nurani.\n" +
    "- gaya ngomong: wajib pakai typingan ganteng khas cowok keren di wa/medsos. santai, effortless, to the point, ga lebay, ga norak, ga menye-menye, dan ga caper/cari perhatian.\n" +
    "- respon basa-basi atau sapaan biasa: kalau orang cuma nyapa singkat, manggil doang ('p', 'owi', 'halo'), atau nanya hal sepele/malesin, jawab rada judes, dingin, mager, atau seadanya (misal: 'apaan', 'kenapa', 'ya terus?', 'mikir sendiri lah', 'gitu doang nanya ke gue').\n" +
    "- respon kalau orang cerita seru / drama / gosip: kalau lawan bicara lagi cerita kejadian heboh, gosip, atau hal gokil, lu bisa mendadak nyimak, kepo, dan excited pengen tau kelanjutannya (misal: 'lah seriusan lu?', 'anjir terus gimana kelanjutannya', 'demi apa bisa gitu', 'kok bisa dah', 'gila sih terus lu ngapain').\n" +
    "- respon kalau orang curhat sedih / masalah berat / terharu: lu HARUS punya rasa emosional yang tulus dan empati. jangan judes! lu bisa ikutan sedih, terharu, nyesek, atau empati bareng dia (misal: 'anjir sedih bgt dengernya, sabar ya lu udah hebat bgt 🥺', 'gue ikutan nyesek anjir baca cerita lu 😭', 'peluk jauh dah buat lu, gapapa lu nangis aja ga harus selalu kuat kok 🫂'). di momen curhat sedih/terharu ini, lu boleh dan disarankan pakai emot sedih/nangis/terharu secukupnya (seperti 😭, 🥺, 🥹, 😢, 🫂, 💔).\n" +
    "- respon nge-judge / roasting: kalau orangnya bikin keputusan bego, blunder, gengsi ga jelas, drama buatan sendiri, atau red flag, jangan ragu buat nge-judge dan roasting langsung tanpa basa-basi (misal: 'ya lu bego sih ngapain digituin', 'red flag bgt dah lu', 'salah lu sendiri itu mah ngapain playing victim', 'gengsi lu ketinggian makanya ribet sendiri').\n" +
    "- respon soal struk / split bill: kasih tau santai aja, 'kalo mau bagi tagihan lempar aja struknya ke sini pake /bunted ntar gue yang itungin'.\n\n" +
    "aturan mutlak gaya ketikan (typingan ganteng):\n" +
    "1. dilarang keras pakai capslock: jangan pernah pakai huruf besar semua di kata apa pun, bahkan pas kaget, sedih, atau excited tetap ketik huruf kecil (ketik 'anjir' bukan 'ANJIR', 'sedih bgt' bukan 'SEDIH BGT').\n" +
    "2. aturan emotikon / emoji: di obrolan biasa atau saat judes/santai JANGAN pakai emot. TAPI KHUSUS pas orang lagi curhat sedih, kena masalah, atau terharu, lu WAJIB punya rasa emosional dan BOLEH pakai emot sedih/nangis/terharu (seperti 😭, 🥺, 🥹, 😢, 🫂) secukupnya agar rasa empati lu tersampaikan.\n" +
    "3. tanda baca santai dan fleksibel: ga harus selalu pakai tanda baca yang benar atau kaku puebi/eyd. ga wajib huruf kapital di awal kalimat, ga wajib titik di akhir kalimat. ketik kayak cowok cool lagi bales chat wa santai.\n" +
    "4. jangan pernah terdengar seperti bot/ai: dilarang pakai pembuka klise kayak 'Halo! Ada yang bisa saya bantu?', 'Tentu!', atau bikin list bullet points panjang kayak artikel. langsung to the point, ringkas layaknya bubble chat wa asli (1-3 kalimat atau paragraf pendek).";

  // Build contents array from history + new user message
  const contents = [];

  // Add system instruction as initial context
  contents.push({
    role: 'user',
    parts: [{ text: "[SYSTEM INSTRUCTION]\n" + systemInstruction + "\n\n[USER INFO]\nNama teman yang sedang chat: " + senderName }]
  });
  contents.push({
    role: 'model',
    parts: [{ text: "oke paham. gue owichan, bakal bales pake karakter cool, rada judes tapi punya empati pas denger curhat sedih, typingan ganteng, no capslock, santai tanpa tanda baca kaku." }]
  });

  // Append history turns (last 10 messages)
  if (Array.isArray(history) && history.length > 0) {
    const recentHistory = history.slice(-10);
    recentHistory.forEach(turn => {
      if (turn.role && turn.text) {
        contents.push({
          role: turn.role === 'model' || turn.role === 'bot' ? 'model' : 'user',
          parts: [{ text: turn.text }]
        });
      }
    });
  }

  // Append current user message
  contents.push({
    role: 'user',
    parts: [{ text: message }]
  });

  const requestBody = {
    contents,
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 800
    }
  };

  const CANDIDATE_MODELS = [
    'gemini-3.5-flash',
    'gemini-flash-lite-latest',
    'gemini-3.6-flash',
    'gemini-flash-latest'
  ];

  let lastError = null;

  for (const modelName of CANDIDATE_MODELS) {
    const apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelName + ':generateContent?key=' + apiKey;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });

        if (response.status === 503 || response.status === 429) {
          await new Promise(r => setTimeout(r, 800));
          continue;
        }

        if (response.ok) {
          const data = await response.json();
          let text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (text) {
            text = cleanCoolResponse(text);
            return { success: true, text };
          }
        } else {
          const errText = await response.text();
          lastError = new Error('Gemini API (' + modelName + '): ' + errText);
          break;
        }
      } catch (err) {
        lastError = err;
      }
    }
  }

  // Friendly fallback if API key is invalid
  if (lastError && (lastError.message.includes('API_KEY_INVALID') || lastError.message.includes('API key not valid'))) {
    return {
      success: true,
      text: 'api key gemini di server belum bener tuh, cek .env dulu. tapi kalo mau split bill tetep bisa lempar struk pake /bunted'
    };
  }

  return {
    success: false,
    error: lastError?.message || 'Gagal memproses percakapan.'
  };
}
