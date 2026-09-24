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
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Data directory for persistent session files
const DATA_DIR = process.env.VERCEL
  ? path.join('/tmp', 'data', 'sessions')
  : path.join(__dirname, '..', 'data', 'sessions');

try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (e) {
  console.warn('[SessionStore] Could not create DATA_DIR:', e.message);
}

// In-memory cache
const sessionsCache = new Map();

// Helper to generate clean, short ID (e.g., "b-7k9p2x")
function generateSessionId() {
  const chars = '23456789abcdefghjkmnpqrstuvwxyz';
  let str = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    str += chars[bytes[i] % chars.length];
  }
  return `b-${str}`;
}

export const sessionStore = {
  /**
   * Create a new bill session
   */
  createSession(data) {
    const id = generateSessionId();
    const session = {
      id,
      groupId: data.groupId || null,
      groupName: data.groupName || 'Grup WhatsApp',
      createdByName: data.createdByName || null,
      receipt: data.receipt || null,
      allMembers: data.allMembers || [],
      customApiKey: data.customApiKey || null,
      createdAt: new Date().toISOString(),
      status: 'active',
      ...data
    };

    sessionsCache.set(id, session);

    // Save to disk asynchronously
    try {
      fs.writeFileSync(path.join(DATA_DIR, `${id}.json`), JSON.stringify(session, null, 2), 'utf8');
    } catch (err) {
      console.error('[SessionStore] Error writing session to disk:', err);
    }

    return session;
  },

  /**
   * Retrieve a session by ID
   */
  getSession(id) {
    if (!id) return null;

    // Check memory cache first
    if (sessionsCache.has(id)) {
      return sessionsCache.get(id);
    }

    // Check disk
    const filePath = path.join(DATA_DIR, `${id}.json`);
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const session = JSON.parse(raw);
        sessionsCache.set(id, session);
        return session;
      } catch (err) {
        console.error('[SessionStore] Error reading session file:', err);
        return null;
      }
    }

    return null;
  },

  /**
   * Update an existing session
   */
  updateSession(id, updates) {
    const session = this.getSession(id);
    if (!session) return null;

    const updated = {
      ...session,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    sessionsCache.set(id, updated);

    try {
      fs.writeFileSync(path.join(DATA_DIR, `${id}.json`), JSON.stringify(updated, null, 2), 'utf8');
    } catch (err) {
      console.error('[SessionStore] Error updating session file:', err);
    }

    return updated;
  },

  /**
   * Delete a session
   */
  deleteSession(id) {
    sessionsCache.delete(id);
    const filePath = path.join(DATA_DIR, `${id}.json`);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error('[SessionStore] Error deleting session file:', err);
      }
    }
    return true;
  },

  /**
   * Get the most recent active session for a specific group/chat
   */
  getActiveSessionForGroup(groupId) {
    if (!groupId) return null;

    // Check in-memory cache first (reverse iterate to find newest)
    const sessions = Array.from(sessionsCache.values());
    for (let i = sessions.length - 1; i >= 0; i--) {
      const s = sessions[i];
      if (s.groupId === groupId && s.status === 'active') {
        return s;
      }
    }

    // Check disk files
    try {
      const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
      const sorted = files.map(f => ({
        file: f,
        mtime: fs.statSync(path.join(DATA_DIR, f)).mtime
      })).sort((a, b) => b.mtime - a.mtime);

      for (const item of sorted) {
        try {
          const content = fs.readFileSync(path.join(DATA_DIR, item.file), 'utf8');
          const s = JSON.parse(content);
          if (s.groupId === groupId && s.status === 'active') {
            sessionsCache.set(s.id, s);
            return s;
          }
        } catch (_) {}
      }
    } catch (err) {
      console.error('[SessionStore] Error reading session files for group:', err);
    }

    return null;
  },

  /**
   * Claim items for a member in WhatsApp chat
   */
  claimItemsForMember(sessionId, memberName, itemNumbers) {
    const session = this.getSession(sessionId);
    if (!session || !session.receipt || !session.receipt.items) {
      return { success: false, error: 'Sesi atau daftar menu tidak ditemukan.' };
    }

    session.allMembers = session.allMembers || [];
    const cleanName = (memberName || 'Teman').trim();

    // Find or create member in allMembers
    let member = session.allMembers.find(m => m.name.toLowerCase() === cleanName.toLowerCase());
    if (!member) {
      member = {
        id: 'm-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6),
        name: cleanName
      };
      session.allMembers.push(member);
    }

    const items = session.receipt.items;
    const claimedItems = [];

    for (const num of itemNumbers) {
      const idx = num - 1;
      if (idx >= 0 && idx < items.length) {
        const item = items[idx];
        item.assignedTo = item.assignedTo || [];
        if (!item.assignedTo.includes(member.id)) {
          item.assignedTo.push(member.id);
        }
        claimedItems.push({
          num,
          name: item.name,
          price: item.total || (item.qty * item.price) || item.price,
          isShared: item.assignedTo.length > 1
        });
      }
    }

    if (claimedItems.length === 0) {
      return { success: false, error: 'Nomor menu tidak valid. Periksa daftar menu dengan */status*.' };
    }

    this.updateSession(sessionId, {
      receipt: session.receipt,
      allMembers: session.allMembers
    });

    return {
      success: true,
      memberName: member.name,
      claimedItems,
      session
    };
  },

  /**
   * Unclaim items for a member in WhatsApp chat
   */
  unclaimItemsForMember(sessionId, memberName, itemNumbers) {
    const session = this.getSession(sessionId);
    if (!session || !session.receipt || !session.receipt.items) {
      return { success: false, error: 'Sesi atau daftar menu tidak ditemukan.' };
    }

    session.allMembers = session.allMembers || [];
    const cleanName = (memberName || 'Teman').trim();
    const member = session.allMembers.find(m => m.name.toLowerCase() === cleanName.toLowerCase());
    if (!member) {
      return { success: false, error: `${cleanName} belum pernah mengklaim menu.` };
    }

    const items = session.receipt.items;
    const unclaimedItems = [];

    for (const num of itemNumbers) {
      const idx = num - 1;
      if (idx >= 0 && idx < items.length) {
        const item = items[idx];
        if (item.assignedTo && item.assignedTo.includes(member.id)) {
          item.assignedTo = item.assignedTo.filter(id => id !== member.id);
          unclaimedItems.push({ num, name: item.name });
        }
      }
    }

    this.updateSession(sessionId, {
      receipt: session.receipt,
      allMembers: session.allMembers
    });

    return {
      success: true,
      memberName: member.name,
      unclaimedItems,
      session
    };
  },

  /**
   * Calculate final split bill and generate WhatsApp breakdown message
   */
  calculateFinalBill(sessionId, defaultPayerName = null) {
    const session = this.getSession(sessionId);
    if (!session || !session.receipt || !session.receipt.items) {
      return { success: false, error: 'Sesi atau rincian menu tidak ditemukan.' };
    }

    const r = session.receipt;
    const items = r.items;
    const allMembers = session.allMembers || [];

    // Find active members (who have claimed at least 1 item)
    const activeMemberIds = new Set();
    items.forEach(it => {
      (it.assignedTo || []).forEach(id => activeMemberIds.add(id));
    });

    const activeMembers = allMembers.filter(m => activeMemberIds.has(m.id));

    if (activeMembers.length === 0) {
      return {
        success: false,
        error: 'Belum ada anggota yang mengklaim menu! Balas dengan format *klaim 1, 2* untuk memilih menu terlebih dahulu.'
      };
    }

    // Determine Payer
    const payerName = defaultPayerName || session.createdByName || activeMembers[0].name;

    // Calculate shares
    const shares = {};
    activeMembers.forEach(m => {
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
    items.forEach(it => {
      const assigned = (it.assignedTo || []).filter(id => shares[id]);
      if (assigned.length > 0) {
        const itemTotal = Number(it.total) || (Number(it.qty || 1) * Number(it.price || 0));
        const portion = itemTotal / assigned.length;
        assigned.forEach(id => {
          shares[id].items.push({
            name: it.name,
            qty: it.qty,
            price: portion,
            isShared: assigned.length > 1
          });
          shares[id].itemsSubtotal += portion;
        });
      }
    });

    const grandSubtotal = Object.values(shares).reduce((sum, s) => sum + s.itemsSubtotal, 0);
    const tax = Number(r.tax) || 0;
    const service = Number(r.service) || 0;
    const discount = Number(r.discount) || 0;
    const count = activeMembers.length || 1;

    // 2. Tax, Service & Discount Proportional Allocation
    activeMembers.forEach(m => {
      const s = shares[m.id];
      const ratio = grandSubtotal > 0 ? (s.itemsSubtotal / grandSubtotal) : (1 / count);
      s.taxPortion = Math.round(tax * ratio);
      s.servicePortion = Math.round(service * ratio);
      s.discountPortion = Math.round(discount * ratio);
      s.total = Math.max(0, Math.round(s.itemsSubtotal + s.taxPortion + s.servicePortion - s.discountPortion));
    });

    // Format WhatsApp message
    const merchantName = (r.merchant && r.merchant !== 'Merchant' ? r.merchant : 'PATUNGIN').toUpperCase();
    const dateStr = r.date || new Date().toLocaleDateString('id-ID');
    const totalFormatted = (Number(r.total) || 0).toLocaleString('id-ID');

    let text = `🧾 *RINCIAN SPLIT BILL — ${merchantName}*\n`;
    text += `Tanggal: ${dateStr}\n`;
    text += `Total Tagihan: Rp ${totalFormatted}\n`;
    text += `Ditalangi oleh: *${payerName}*\n`;
    text += '------------------------------------\n\n';

    text += '👥 *Porsi Konsumsi Masing-Masing:*\n';
    activeMembers.forEach(m => {
      const s = shares[m.id];
      text += `👤 *${m.name}*\n`;
      s.items.forEach(it => {
        const sharedLabel = it.isShared ? ' _(Patungan)_' : '';
        text += `  • ${toTitleCase(it.name)}${sharedLabel}: Rp ${Math.round(it.price).toLocaleString('id-ID')}\n`;
      });
      if (s.taxPortion > 0) text += `  • Pajak: Rp ${s.taxPortion.toLocaleString('id-ID')}\n`;
      if (s.servicePortion > 0) text += `  • Service: Rp ${s.servicePortion.toLocaleString('id-ID')}\n`;
      if (s.discountPortion > 0) text += `  • Diskon: -Rp ${s.discountPortion.toLocaleString('id-ID')}\n`;
      text += `  👉 *Total: Rp ${s.total.toLocaleString('id-ID')}*\n\n`;
    });

    text += '------------------------------------\n';
    text += '💸 *ARAHAN TRANSFER:*\n';
    let transferCount = 0;
    activeMembers.forEach(m => {
      if (m.name.toLowerCase() !== payerName.toLowerCase()) {
        const s = shares[m.id];
        if (s.total > 0) {
          transferCount++;
          text += `• *${m.name}* transfer ke *${payerName}*: *Rp ${s.total.toLocaleString('id-ID')}*\n`;
        }
      }
    });

    if (transferCount === 0) {
      text += '_Semua pesanan dikonsumsi oleh penanggung bill._\n';
    }

    text += '\n✨ _Dihitung otomatis oleh PatungIn Bot_';

    return {
      success: true,
      payerName,
      shares,
      messageText: text,
      session
    };
  }
};

export default sessionStore;
