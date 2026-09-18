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
You are an expert AI receipt parser.
Analyze this receipt image and extract structured data.
Extract every item with its quantity, unit price, and total line price.
Extract subtotal, tax (PB1/PPN), service charge, discount (if any), and grand total.
Always ensure numbers are integers in Indonesian Rupiah (IDR).

Return STRICTLY a JSON object matching this schema:
{
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
    const CANDIDATE_MODELS = ['gemini-3.6-flash', 'gemini-flash-latest'];
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

    if (Array.isArray(parsedJson.items)) {
      parsedJson.items = parsedJson.items.map((it, idx) => ({
        id: it.id || `item-${idx + 1}`,
        name: it.name || `Item ${idx + 1}`,
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
