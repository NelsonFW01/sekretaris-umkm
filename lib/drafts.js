// lib/drafts.js
//
// Membuat DRAF tindakan di `agentDrafts/{uid}` — tempat yang sama dengan panel
// "Draf Tindakan Agen" di index.html. Di sinilah MANUSIA menyetujui atau menolak.
//
// Dipakai oleh robot UiPath (api/robot.js, op=drafts) dan cron cadangan.
// Setiap item harus membawa tanda tangan server (lib/sign.js) kecuali requireSig=false
// (jalur cron yang item-nya baru dibuat di proses yang sama).

import { isSafeKey } from './http.js';
import { verifyItem } from './sign.js';

const PENDING = new Set(['menunggu_persetujuan', 'disetujui']);
// Draf yang BARU SAJA ditolak / dieksekusi / dilewati tidak dibuat ulang dalam jendela ini.
// Tanpa ini, tagihan telat yang drafnya ditolak pemilik akan muncul lagi di setiap robot berjalan.
const RECENT_MS = 3 * 86_400_000;

function sameTarget(d, it) {
  return d.tipe === it.tipe && (
    it.tipe === 'pengingat_tagihan' ? (d.invoiceId === it.invoiceId && d.kind === it.kind) : d.item === it.item
  );
}

function duplicateReason(existing, it, now) {
  for (const d of existing) {
    if (!sameTarget(d, it)) continue;
    if (PENDING.has(d.status)) return 'draf_sudah_ada';
    if (now - Number(d.createdAt || 0) < RECENT_MS) return 'draf_baru_diproses';
  }
  return null;
}

export async function createDrafts(rtdb, uid, items, { sumber, requireSig = true, now = Date.now() } = {}) {
  const raw = (await rtdb.get(`agentDrafts/${uid}`)) || {};
  const existing = Object.values(raw).filter((d) => d && typeof d === 'object');
  const created = [];
  const skipped = [];

  for (const it of (Array.isArray(items) ? items : []).slice(0, 100)) {
    const ref = String(it?.invoiceId || it?.item || '?');
    if (!it || typeof it !== 'object') { skipped.push({ ref, reason: 'item_rusak' }); continue; }
    if (requireSig && !verifyItem(uid, it)) { skipped.push({ ref, reason: 'tanda_tangan_tidak_valid' }); continue; }
    if (!['approval', 'manual_wa'].includes(it.route)) { skipped.push({ ref, reason: 'rute_bukan_draf' }); continue; }
    const dup = duplicateReason(existing, it, now);
    if (dup) { skipped.push({ ref, reason: dup }); continue; }

    if (it.tipe === 'pengingat_tagihan') {
      if (!isSafeKey(it.invoiceId)) { skipped.push({ ref, reason: 'invoiceId_tidak_valid' }); continue; }
      const inv = await rtdb.get(`invoices/${uid}/${it.invoiceId}`);
      if (!inv || inv.status === 'lunas') { skipped.push({ ref, reason: 'tagihan_lunas_atau_hilang' }); continue; }
      if (it.route === 'approval' && String(inv.customerEmail || '').trim().toLowerCase() !== String(it.to || '').toLowerCase()) {
        skipped.push({ ref, reason: 'penerima_berubah' }); continue;
      }
      if (isStale(inv, it)) { skipped.push({ ref, reason: 'tagihan_berubah' }); continue; }
    }

    const draft = {
      // — bagian yang ikut ditandatangani (jangan diubah) —
      tipe: it.tipe, route: it.route, invoiceId: it.invoiceId || null, kind: it.kind || null,
      to: it.to || '', subject: it.subject || '', body: it.body || '',
      judul: it.judul || '', pesan: it.pesan || '', wa: it.wa || '', item: it.item || null,
      amount: it.amount ?? null, dueDate: it.dueDate || null, planDate: it.planDate || null,
      sig: it.sig || null,
      // — metadata —
      urgensi: it.urgensi || null, reasons: it.reasons || [], flags: it.flags || [], note: it.note || '',
      aiGenerated: !!it.aiGenerated,
      status: 'menunggu_persetujuan', createdAt: now, sumber,
    };
    const id = await rtdb.push(`agentDrafts/${uid}`, draft);
    existing.push(draft);
    created.push({ ref, draftId: id });
  }
  return { created, skipped };
}

/** Rekonstruksi item bertanda tangan dari sebuah draf (untuk verifikasi saat eksekusi). */
export function draftToItem(d) {
  return {
    tipe: d.tipe, route: d.route, invoiceId: d.invoiceId, kind: d.kind,
    to: d.to, subject: d.subject, body: d.body,
    judul: d.judul, pesan: d.pesan, wa: d.wa, item: d.item,
    amount: d.amount, dueDate: d.dueDate, planDate: d.planDate, sig: d.sig,
  };
}

/**
 * Rencana BASI? Nominal atau tanggal jatuh tempo yang ikut ditandatangani sudah tidak sama dengan tagihan saat ini
 * (mis. tagihan diedit setelah rencana dibuat) — isi email yang sudah disetujui/ditandatangani tak lagi sesuai kenyataan.
 */
export function isStale(inv, item) {
  return Number(inv?.amount) !== Number(item?.amount) || String(inv?.dueDate ?? '') !== String(item?.dueDate ?? '');
}
