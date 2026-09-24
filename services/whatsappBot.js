function toTitleCase(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .split(' ')
    .map(w => w.replace(/^([a-z])/, c => c.toUpperCase()).replace(/(\()([a-z])/, (m, p1, p2) => p1 + p2.toUpperCase()))
    .join(' ')
    .trim();
}

import { startTunnel } from 'untun';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { parseReceiptWithGemini, parseMultipleReceipts, askGeminiText, chatWithGemini } from './geminiService.js';
import sessionStore from './sessionStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Auth state directory
const AUTH_DIR = process.env.VERCEL
  ? path.join('/tmp', 'wa_auth_info')
  : path.join(__dirname, '..', 'wa_auth_info');

try {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }
} catch (e) {
  console.warn('[WhatsAppBot] Could not create AUTH_DIR:', e.message);
}

let sock = null;
let currentQrDataUrl = null;
let currentQrRaw = null;
let botStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'qr_ready' | 'connected'
let botUser = null;

// Track processed messages to avoid duplicate executions
const processedMessages = new Set();

// Base URL for session links
const APP_PORT = process.env.PORT || 3000;

export let publicServerIp = null;

async function detectPublicIp() {
  try {
    const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      if (data?.ip) {
        publicServerIp = data.ip;
        console.log(`[WhatsAppBot] 🌐 Public Server IP terdeteksi: ${publicServerIp}`);
      }
    }
  } catch (_) {}
}

function getPrimaryNetworkIp() {
  const nets = os.networkInterfaces();
  // Find active non-internal IPv4 (skip virtualbox/hyper-v 192.168.56.x)
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('192.168.56.')) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

export let publicTunnelUrl = null;

async function setupPublicTunnel() {
  try {
    console.log('[WhatsAppBot] Mengaktifkan Cloudflare Quick Tunnel (tanpa warning page)...');
    const tunnel = await startTunnel({ port: APP_PORT });
    publicTunnelUrl = await tunnel.getURL();
    console.log(`\n🚀 [WhatsAppBot] Cloudflare HTTPS Tunnel Aktif (Langsung Buka, Tanpa Warning): ${publicTunnelUrl}\n`);
  } catch (err) {
    console.warn('[WhatsAppBot] Cloudflare tunnel tidak dapat dibuat, menggunakan fallback IP:', err.message);
  }
}

export function getAppBaseUrl() {
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL.replace(/\/$/, '');
  }
  if (publicTunnelUrl) {
    return publicTunnelUrl;
  }
  if (publicServerIp) {
    return `http://${publicServerIp}:${APP_PORT}`;
  }
  const ip = getPrimaryNetworkIp();
  return `http://${ip}:${APP_PORT}`;
}

/**
 * Unwrap message wrappers (ephemeral, viewOnce, etc.)
 */
function unwrapMessage(m) {
  let msg = m?.message;
  if (!msg) return { text: '', hasImage: false, rawMsg: null };

  while (
    msg?.ephemeralMessage?.message ||
    msg?.viewOnceMessage?.message ||
    msg?.viewOnceMessageV2?.message ||
    msg?.documentWithCaptionMessage?.message
  ) {
    msg =
      msg?.ephemeralMessage?.message ||
      msg?.viewOnceMessage?.message ||
      msg?.viewOnceMessageV2?.message ||
      msg?.documentWithCaptionMessage?.message;
  }

  const imageMessage = msg?.imageMessage || null;
  const hasImage = Boolean(imageMessage);
  const text = (
    imageMessage?.caption ||
    msg?.extendedTextMessage?.text ||
    msg?.conversation ||
    ''
  ).trim();

  return { text, hasImage, imageMessage, rawMsg: msg };
}

/**
 * Initialize WhatsApp Bot Socket with Baileys
 */

// Memory store for multi-turn conversations: chatId -> { history: [{ role, text }], lastActivity: timestamp }
const chatMemoryMap = new Map();
const MEMORY_TIMEOUT_MS = 45 * 60 * 1000; // 45 minutes idle reset

function getChatHistory(chatId) {
  const data = chatMemoryMap.get(chatId);
  if (!data) return [];
  if (Date.now() - data.lastActivity > MEMORY_TIMEOUT_MS) {
    chatMemoryMap.delete(chatId);
    return [];
  }
  return data.history || [];
}

function addChatTurn(chatId, role, text) {
  let data = chatMemoryMap.get(chatId);
  if (!data || Date.now() - data.lastActivity > MEMORY_TIMEOUT_MS) {
    data = { history: [], lastActivity: Date.now() };
    chatMemoryMap.set(chatId, data);
  }
  data.history.push({ role, text });
  if (data.history.length > 10) {
    data.history = data.history.slice(-10); // keep last 10 messages for context
  }
  data.lastActivity = Date.now();
}

export async function initWhatsAppBot() {
  detectPublicIp();
  setupPublicTunnel();
  try {
    botStatus = 'connecting';
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      auth: state,
      browser: ['PatungIn Bot', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        currentQrRaw = qr;
        try {
          currentQrDataUrl = await qrcode.toDataURL(qr, { margin: 2, scale: 7 });
          botStatus = 'qr_ready';
          console.log(`\n📱 [WhatsAppBot] QR Code siap di-scan! Buka di browser: ${getAppBaseUrl()}/wa-login\n`);
        } catch (err) {
          console.error('[WhatsAppBot] Error generating QR data URL:', err);
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        botStatus = 'disconnected';
        currentQrDataUrl = null;
        botUser = null;
        console.log(`[WhatsAppBot] Koneksi terputus (status: ${statusCode}). Reconnect: ${shouldReconnect}`);

        if (shouldReconnect) {
          setTimeout(() => initWhatsAppBot(), 3000);
        } else {
          console.log('[WhatsAppBot] Sesi telah logout. Menghapus wa_auth_info...');
          try {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            fs.mkdirSync(AUTH_DIR, { recursive: true });
          } catch (_) {}
          setTimeout(() => initWhatsAppBot(), 2000);
        }
      } else if (connection === 'open') {
        botStatus = 'connected';
        currentQrDataUrl = null;
        botUser = sock.user;
        console.log(`🚀 [WhatsAppBot] Berhasil terhubung ke WhatsApp! Akun: ${sock.user?.name || sock.user?.id || 'Bot'}`);
      }
    });

    // Incoming messages listener with Multi-Receipt Album Batching
    const imageBatchMap = new Map(); // chatId -> { images: [], chatId, isGroup, triggerMsg, timer }

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      for (const m of messages) {
        if (!m.message) continue;

        const msgId = m.key?.id;
        if (msgId && processedMessages.has(msgId)) continue;

        // Identifikasi nomor WA dan LID bot
        const botPhone = (sock.user?.id || '').split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
        const botLid = (sock.user?.lid || '').split(':')[0].split('@')[0].replace(/[^0-9]/g, '');

        // Pengirim pesan (grup atau private)
        const senderRaw = m.key?.participant || m.participant || (m.key?.remoteJid?.endsWith('@g.us') ? '' : m.key?.remoteJid) || '';
        const senderClean = senderRaw.split(':')[0].split('@')[0].replace(/[^0-9]/g, '');

        // Cegah loop tak berujung: Jangan pernah memproses pesan yang dikirim oleh bot sendiri
        const isFromBot = Boolean(
          m.key?.fromMe ||
          (botPhone && senderClean && senderClean === botPhone) ||
          (botLid && senderClean && senderClean === botLid) ||
          (botPhone && senderRaw.includes(botPhone)) ||
          (botLid && senderRaw.includes(botLid))
        );

        if (isFromBot) {
          if (msgId) processedMessages.add(msgId);
          continue;
        }

        // Jaga ukuran cache processedMessages agar tetap stabil
        if (processedMessages.size > 3000) {
          const toDelete = Array.from(processedMessages).slice(0, 1000);
          toDelete.forEach(id => processedMessages.delete(id));
        }

        const { text, hasImage, rawMsg } = unwrapMessage(m);
        const lowerText = text.toLowerCase();
        const chatId = m.key.remoteJid;
        const isGroup = chatId.endsWith('@g.us');

        const isTrigger =
          lowerText.startsWith('/bunted') ||
          lowerText.startsWith('/patungin') ||
          lowerText.startsWith('/split') ||
          lowerText.startsWith('/hitung');

        // Case A: Image with /bunted trigger
        if (isTrigger && hasImage) {
          if (msgId) processedMessages.add(msgId);
          console.log(`[WhatsAppBot] 📩 Trigger struk diterima di ${isGroup ? 'Grup' : 'Chat'}: ${chatId}`);

          let batch = imageBatchMap.get(chatId);
          if (batch) {
            batch.images.push({ m, rawMsg });
            if (batch.timer) clearTimeout(batch.timer);
            if (batch.images.length >= 2) {
              imageBatchMap.delete(chatId);
              processBatchReceipts(batch);
              continue;
            }
          } else {
            batch = {
              images: [{ m, rawMsg }],
              chatId,
              isGroup,
              triggerMsg: m,
              timer: null
            };
            imageBatchMap.set(chatId, batch);
          }

          // Debounce 2.5 seconds to catch 2nd photo in WhatsApp album
          batch.timer = setTimeout(() => {
            imageBatchMap.delete(chatId);
            processBatchReceipts(batch);
          }, 2500);
          continue;
        }

        // Case B: Additional image arriving in same chat within 2.5s of an active /bunted batch
        if (hasImage && imageBatchMap.has(chatId)) {
          if (msgId) processedMessages.add(msgId);
          const batch = imageBatchMap.get(chatId);
          batch.images.push({ m, rawMsg });
          console.log(`[WhatsAppBot] 📷 Foto struk ke-${batch.images.length} diterima dalam album yang sama!`);

          if (batch.timer) clearTimeout(batch.timer);
          if (batch.images.length >= 2) {
            imageBatchMap.delete(chatId);
            processBatchReceipts(batch);
            continue;
          } else {
            batch.timer = setTimeout(() => {
              imageBatchMap.delete(chatId);
              processBatchReceipts(batch);
            }, 2500);
            continue;
          }
        }

        // Case C: /bunted command without image
        if (isTrigger && !hasImage) {
          if (msgId) processedMessages.add(msgId);
          await sock.sendMessage(chatId, {
            text: '📸 *PatungIn Bot:* Silakan kirim *1 atau 2 foto struk* dengan caption */bunted* untuk memindai dan membuat link split bill!'
          });
          continue;
        }

        // Case D: Percakapan Alami 2 Arah dengan Context Memory (Owichan)
        const contextInfo = m.message?.extendedTextMessage?.contextInfo || rawMsg?.extendedTextMessage?.contextInfo;

        const mentionedJids = contextInfo?.mentionedJid || [];
        const isBotMentioned = mentionedJids.some(jid => {
          const cleanJid = jid.split('@')[0].split(':')[0];
          return (botPhone && cleanJid.includes(botPhone)) || (botLid && cleanJid.includes(botLid));
        });

        const replyParticipant = contextInfo?.participant ? contextInfo.participant.split('@')[0].split(':')[0] : '';
        const isReplyToBot = Boolean(
          (botPhone && replyParticipant.includes(botPhone)) ||
          (botLid && replyParticipant.includes(botLid))
        );

        // Deteksi panggilan Owi / Owichan / Bro di mana saja (awal, tengah, atau akhir kalimat)
        const hasTriggerKeyword = /\b(owichan|owi+|bro+)\b/i.test(lowerText);
        const startsWithCall = /^(\/tanya|@bot|bray\b|cuy\b|bang\b|bot\b|min\b|halo|hai|hei)/i.test(lowerText);

        const isPrivateChat = !isGroup;
        const shouldChat = !m.key?.fromMe && !isFromBot && (isPrivateChat || isBotMentioned || isReplyToBot || hasTriggerKeyword || startsWithCall);

        if (shouldChat && text && text.trim().length > 0) {
          if (msgId) processedMessages.add(msgId);

          // Ambil konteks quoted message jika ada
          const quotedText =
            contextInfo?.quotedMessage?.conversation ||
            contextInfo?.quotedMessage?.extendedTextMessage?.text ||
            '';

          // Bersihkan teks dari mention (@123456) dan prefix pembuka di awal kalimat
          let cleanPrompt = text
            .replace(/@[0-9]+/g, '')
            .replace(/^(\/tanya|@bot)[,:]?\s*/i, '')
            .replace(/^(halo|hai|hei|bro+|owichan|owi+|bray|cuy|bang|bot|min)[,:]?\s*/i, '')
            .trim();

          if (!cleanPrompt) {
            cleanPrompt = quotedText ? `kenapa ngetag gue soal ini: "${quotedText.trim()}"?` : 'kenapa ngetag gue? ada apa?';
          } else if (quotedText && !cleanPrompt.includes(quotedText)) {
            cleanPrompt = `[Membalas chat: "${quotedText.trim()}"]\n${cleanPrompt}`;
          }

          console.log(`[WhatsAppBot] 💬 Owichan chat dari ${m.pushName || 'User'} di ${isGroup ? 'Grup' : 'PC'}: "${cleanPrompt}" (Mention: ${isBotMentioned}, Reply: ${isReplyToBot}, Keyword: ${hasTriggerKeyword})`);

          try {
            await sock.sendPresenceUpdate('composing', chatId);
          } catch (_) {}

          const senderName = m.pushName || 'Teman';
          const history = getChatHistory(chatId);

          const aiRes = await chatWithGemini({
            history,
            message: cleanPrompt,
            senderName
          });

          if (aiRes.success) {
            addChatTurn(chatId, 'user', cleanPrompt);
            addChatTurn(chatId, 'model', aiRes.text);

            const sentMsg = await sock.sendMessage(chatId, { text: aiRes.text }, { quoted: m });
            if (sentMsg?.key?.id) {
              processedMessages.add(sentMsg.key.id);
            }
            console.log(`[WhatsAppBot] ✅ Owichan berhasil membalas ke ${chatId}`);
          } else {
            console.error('[WhatsAppBot] ❌ Error Owichan:', aiRes.error);
            const sentErr = await sock.sendMessage(chatId, {
              text: 'lagi pusing bentar, ntar colek lagi aja'
            }, { quoted: m });
            if (sentErr?.key?.id) {
              processedMessages.add(sentErr.key.id);
            }
          }
          continue;
        }



        // Case G: Cek status klaim ('/status', '/cek', '/list')
        if (lowerText === '/status' || lowerText === '/cek' || lowerText === '/list') {
          if (msgId) processedMessages.add(msgId);
          const session = sessionStore.getActiveSessionForGroup(chatId);
          if (!session || !session.receipt || !session.receipt.items) {
            await sock.sendMessage(chatId, {
              text: '⚠️ Belum ada sesi split bill aktif di grup ini. Kirim foto struk dengan */bunted* terlebih dahulu!'
            }, { quoted: m });
            continue;
          }

          const r = session.receipt;
          const allMembers = session.allMembers || [];
          const memberMap = new Map(allMembers.map(m => [m.id, m.name]));

          let statusLines = r.items.map((it, idx) => {
            const num = idx + 1;
            const priceStr = `Rp ${(it.total || (it.qty * it.price) || it.price).toLocaleString('id-ID')}`;
            const assigned = (it.assignedTo || []).map(id => memberMap.get(id) || 'Teman');
            let claimStatus = '⚠️ _(Belum diklaim)_';
            if (assigned.length === 1) {
              claimStatus = `👉 *${assigned[0]}*`;
            } else if (assigned.length > 1) {
              claimStatus = `👉 *${assigned.join(', ')}* _(Patungan)_`;
            }
            return `${num}. ${toTitleCase(it.name)} (${priceStr})\n   ${claimStatus}`;
          });

          const statusMsg =
`📋 *STATUS KLAIM MENU — ${(r.merchant && r.merchant !== 'Merchant' ? r.merchant : 'PATUNGIN').toUpperCase()}*
💰 *Total Tagihan:* Rp ${(r.total || 0).toLocaleString('id-ID')}
------------------------------------
${statusLines.join('\n\n')}
------------------------------------
• Balas: \`klaim [nomor]\` untuk klaim menu
• Ketik: */rekap* untuk menghitung rincian tagihan final!`;

          await sock.sendMessage(chatId, { text: statusMsg }, { quoted: m });
          continue;
        }

        // Case H: Rekap tagihan final ('/rekap', '/selesai')
        if (lowerText === '/rekap' || lowerText === '/selesai') {
          if (msgId) processedMessages.add(msgId);
          const session = sessionStore.getActiveSessionForGroup(chatId);
          if (!session || !session.receipt) {
            await sock.sendMessage(chatId, {
              text: '⚠️ Belum ada sesi split bill aktif di grup ini. Kirim foto struk dengan */bunted* terlebih dahulu!'
            }, { quoted: m });
            continue;
          }

          const finalRes = sessionStore.calculateFinalBill(session.id, session.createdByName || m.pushName);
          if (finalRes.success) {
            await sock.sendMessage(chatId, { text: finalRes.messageText });
          } else {
            await sock.sendMessage(chatId, {
              text: `⚠️ ${finalRes.error}`
            }, { quoted: m });
          }
          continue;
        }
      }
    });

  } catch (err) {
    console.error('[WhatsAppBot] Error initializing bot:', err);
    botStatus = 'disconnected';
  }
}

/**
 * Handle processing of 1 or 2 receipts from WhatsApp
 */
async function processBatchReceipts(batch) {
  const { images, chatId, isGroup } = batch;
  const count = Math.min(images.length, 2);

  try {
    // 1. Send processing indicator
    const statusText = count > 1
      ? '⏳ *Sedang memindai & menggabungkan 2 struk dengan Gemini AI...* Mohon tunggu sebentar.'
      : '⏳ *Sedang memindai struk dengan Gemini AI...* Mohon tunggu sebentar.';

    await sock.sendMessage(chatId, { text: statusText });

    // 2. Download media buffers and save to temp files
    const files = await Promise.all(
      images.slice(0, 2).map(async (item, idx) => {
        const downloadMsg = {
          key: item.m.key,
          message: item.rawMsg
        };
        const buffer = await downloadMediaMessage(downloadMsg, 'buffer', {});
        const tempPath = path.join(os.tmpdir(), `wa-receipt-${Date.now()}-${idx}.jpg`);
        fs.writeFileSync(tempPath, buffer);
        return { path: tempPath, mimetype: 'image/jpeg' };
      })
    );

    // 3. Parse with Gemini AI
    let result;
    if (files.length === 1) {
      result = await parseReceiptWithGemini(files[0].path, files[0].mimetype);
    } else {
      result = await parseMultipleReceipts(files);
    }

    // Clean up temp files
    files.forEach(f => {
      try { fs.unlinkSync(f.path); } catch (_) {}
    });

    if (!result.success || !result.receipt) {
      await sock.sendMessage(chatId, {
        text: `❌ *Gagal memindai struk:* ${result.error || 'Gambar tidak terbaca atau bukan struk belanja.'}`
      });
      return;
    }

    const r = result.receipt;

    // 4. Get group metadata if in group
    let groupName = 'Grup WhatsApp';
    if (isGroup) {
      try {
        const meta = await sock.groupMetadata(chatId);
        if (meta?.subject) groupName = meta.subject;
      } catch (_) {}
    }

    // 5. Create new session in sessionStore
    const session = sessionStore.createSession({
      groupId: chatId,
      groupName,
      createdByName: batch.triggerMsg?.pushName || 'Pembayar',
      receipt: r
    });

    const storeName = r.merchant && r.merchant !== 'Merchant' ? r.merchant : (count > 1 ? 'Gabungan 2 Struk' : 'Struk Belanja');
    const totalFormatted = (r.total || 0).toLocaleString('id-ID');
    const sessionUrl = `${getAppBaseUrl()}/?bill=${session.id}`;

    // 6. Reply to group with interactive link
    const titleText = count > 1
      ? '🧾 *2 STRUK BERHASIL DIPINDAI & DIGABUNGKAN!*'
      : '🧾 *STRUK BERHASIL DIPINDAI!*';

    const countDesc = count > 1 ? ` (${r.items?.length || 0} menu dari 2 struk)` : '';

    const replyText =
`${titleText}
🏪 *Toko:* ${storeName}
💰 *Total Tagihan:* Rp ${totalFormatted}
📦 *Jumlah Menu:* ${r.items?.length || 0} item${countDesc}

👉 *Buka link ini untuk split bill & atur patungan:*
${sessionUrl}`;

    await sock.sendMessage(chatId, { text: replyText });
    console.log(`[WhatsAppBot] Sesi ${session.id} (${count} struk) berhasil dibuat dan dikirim ke ${chatId}`);

  } catch (err) {
    console.error('[WhatsAppBot] Error handling batch receipts:', err);
    await sock.sendMessage(chatId, {
      text: '⚠️ Terjadi kendala teknis saat memproses struk. Silakan coba lagi.'
    });
  }
}
/**
 * Send final split bill breakdown message to WhatsApp group
 */
export async function sendSplitBillToGroup(groupId, messageText) {
  if (!sock || botStatus !== 'connected') {
    return {
      success: false,
      error: 'WhatsApp Bot belum terhubung. Silakan scan QR code terlebih dahulu.'
    };
  }

  try {
    await sock.sendMessage(groupId, { text: messageText });
    return { success: true };
  } catch (err) {
    console.error('[WhatsAppBot] Error sending split bill to group:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Get current bot status & QR Code
 */
export function getBotStatus() {
  return {
    status: botStatus,
    user: botUser,
    qrDataUrl: currentQrDataUrl
  };
}


/**
 * Logout and clear session to allow switching number
 */
export async function logoutWhatsAppBot() {
  try {
    console.log('[WhatsAppBot] Logging out bot session...');
    if (sock) {
      try {
        await sock.logout();
      } catch (_) {}
      try {
        sock.end();
      } catch (_) {}
      sock = null;
    }
    botStatus = 'disconnected';
    currentQrDataUrl = null;
    botUser = null;

    // Clear wa_auth_info
    try {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    } catch (_) {}

    // Trigger re-initialization to generate new QR
    setTimeout(() => initWhatsAppBot(), 1500);
    return { success: true };
  } catch (err) {
    console.error('[WhatsAppBot] Error during logout:', err);
    return { success: false, error: err.message };
  }
}

export default {
  initWhatsAppBot,
  sendSplitBillToGroup,
  getBotStatus,
  getAppBaseUrl,
  logoutWhatsAppBot
};
