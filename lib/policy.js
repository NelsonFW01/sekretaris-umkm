// lib/policy.js
//
// ATURAN BISNIS yang deterministik (bukan tebakan AI). Dipakai di tiga tempat dengan hasil sama:
//   1. Robot UiPath  → menentukan tagihan mana yang perlu ditindaklanjuti hari ini
//   2. Server        → memeriksa ULANG (server adalah otoritas terakhir)
//   3. Tes otomatis  → membuktikan semua kasus tepi (lihat tests/policy.test.js)
//
// Pembagian peran:
//   - Aturan   : kapan sebuah tagihan layak diingatkan (D-3, hari-H, telat berulang)
//   - AI agen  : MENYUSUN kata-kata, memilih nada, menandai kejanggalan
//   - Kebijakan: menentukan apakah boleh jalan OTOMATIS atau harus disetujui MANUSIA

import { daysBetween, isValidDateStr } from './dates.js';

export const DEFAULT_POLICY = Object.freeze({
  approvalAmount: 5_000_000,   // tagihan >= nilai ini selalu minta persetujuan pemilik
  approvalOverdueDays: 14,     // telat >= 14 hari selalu minta persetujuan pemilik
  repeatOverdueEveryDays: 3,   // pengingat telat diulang tiap 3 hari (sama dengan cron lama)
  maxInvoicesPerUser: 60,      // batas pengaman per pengguna per sekali jalan
});

export function policyFromEnv(env = process.env) {
  const num = (key, fallback) => {
    const v = Number(env[key]);
    return Number.isFinite(v) && v > 0 ? v : fallback;
  };
  return {
    approvalAmount: num('POLICY_APPROVAL_AMOUNT', DEFAULT_POLICY.approvalAmount),
    approvalOverdueDays: num('POLICY_APPROVAL_OVERDUE_DAYS', DEFAULT_POLICY.approvalOverdueDays),
    repeatOverdueEveryDays: num('POLICY_REPEAT_OVERDUE_DAYS', DEFAULT_POLICY.repeatOverdueEveryDays),
    maxInvoicesPerUser: num('POLICY_MAX_INVOICES_PER_USER', DEFAULT_POLICY.maxInvoicesPerUser),
  };
}

const skip = (reason, daysUntil = null) => ({ eligible: false, kind: null, daysUntil, skipReason: reason });
const ok = (kind, daysUntil) => ({ eligible: true, kind, daysUntil, skipReason: null });

/**
 * Apakah tagihan ini perlu diingatkan HARI INI?
 * @returns {{eligible:boolean, kind:'d3'|'due'|'overdue'|null, daysUntil:number|null, skipReason:string|null}}
 */
export function classifyInvoice(inv, today, policy = DEFAULT_POLICY) {
  if (!inv || typeof inv !== 'object') return skip('data_rusak');
  if (inv.status === 'lunas') return skip('lunas');
  if (!isValidDateStr(inv.dueDate)) return skip('tanggal_tidak_valid');
  const amount = Number(inv.amount);
  if (!Number.isFinite(amount) || amount <= 0) return skip('jumlah_tidak_valid');

  const daysUntil = daysBetween(today, inv.dueDate); // + = belum jatuh tempo, - = telat
  const sent = inv.remindersSent && typeof inv.remindersSent === 'object' ? inv.remindersSent : {};

  if (daysUntil === 3) return sent.d3 ? skip('sudah_diingatkan', daysUntil) : ok('d3', daysUntil);
  if (daysUntil === 0) return sent.due ? skip('sudah_diingatkan', daysUntil) : ok('due', daysUntil);
  if (daysUntil < 0) {
    if (!isValidDateStr(sent.overdueLast)) return ok('overdue', daysUntil);
    const since = daysBetween(sent.overdueLast, today);
    return since >= policy.repeatOverdueEveryDays ? ok('overdue', daysUntil) : skip('sudah_diingatkan', daysUntil);
  }
  return skip('belum_waktunya', daysUntil);
}

/**
 * Otomatis atau minta persetujuan manusia?
 *  - tanpa email tapi ada nomor HP  → 'manual_wa' (manusia yang kirim WA)
 *  - tanpa kontak sama sekali       → 'skip'
 *  - nilai tinggi / telat lama / nada tegas / ada bendera keamanan → 'approval'
 *  - selain itu                     → 'auto'
 */
export function decideRoute({ amount, kind, daysUntil, tone, flags = [], hasEmail, hasPhone }, policy = DEFAULT_POLICY) {
  if (!hasEmail) {
    return hasPhone
      ? { route: 'manual_wa', reasons: ['tanpa_email'] }
      : { route: 'skip', reasons: ['tanpa_kontak'] };
  }
  const reasons = [];
  if (Number(amount) >= policy.approvalAmount) reasons.push('nilai_tinggi');
  if (kind === 'overdue' && typeof daysUntil === 'number' && -daysUntil >= policy.approvalOverdueDays) reasons.push('telat_lama');
  if (tone === 'tegas') reasons.push('nada_tegas');
  for (const f of flags) if (!reasons.includes(f)) reasons.push(f);
  return reasons.length ? { route: 'approval', reasons } : { route: 'auto', reasons: [] };
}

/** Tingkat urgensi stok — deterministik, supaya konsisten walau AI tidak tersedia. */
export function urgensiStok(item) {
  const sisa = Number(item?.sisaStok);
  const titik = Number(item?.titikPesanUlang);
  if (!Number.isFinite(sisa) || !Number.isFinite(titik) || titik <= 0) return null;
  if (sisa > titik) return null; // masih aman
  const ratio = sisa / titik;
  if (ratio <= 0.2) return 'tinggi';
  if (ratio <= 0.6) return 'sedang';
  return 'rendah';
}
