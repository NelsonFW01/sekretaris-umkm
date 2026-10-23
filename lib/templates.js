// lib/templates.js
//
// Teks cadangan (tanpa AI) + perakit email akhir.
//
// KENAPA ADA: robot HARUS tetap jalan walau semua LLM gratis sedang kena rate-limit atau down.
// Kalau AI tidak tersedia, robot memakai template ini dan menandai `aiGenerated:false`
// di laporan — bukan diam-diam gagal.
//
// FAKTA (jumlah, tanggal, info pembayaran) SELALU diambil dari database oleh server dan
// ditempel di blok "Rincian tagihan". AI hanya menyumbang kalimat pembuka/penutup.

import { formatRupiah, formatTanggalID } from './dates.js';

function namaSapaan(inv) {
  return String(inv?.customerName || 'Bapak/Ibu').trim() || 'Bapak/Ibu';
}

/** Paragraf cadangan per jenis pengingat. */
export function templateParagraph({ kind, inv, daysUntil, tone = 'ramah' }) {
  const nama = namaSapaan(inv);
  const desc = inv?.description ? ` untuk "${String(inv.description).trim()}"` : '';
  const jumlah = formatRupiah(inv?.amount);
  const tanggal = formatTanggalID(inv?.dueDate);

  if (kind === 'd3') {
    return `Halo ${nama},\n\nKami ingin mengingatkan bahwa tagihan${desc} sebesar ${jumlah} akan jatuh tempo pada ${tanggal} (3 hari lagi). Mohon disiapkan ya. Jika sudah melakukan pembayaran, abaikan pesan ini dan terima kasih banyak.`;
  }
  if (kind === 'due') {
    return `Halo ${nama},\n\nTagihan${desc} sebesar ${jumlah} jatuh tempo HARI INI (${tanggal}). Mohon dapat diselesaikan hari ini. Jika sudah melakukan pembayaran, abaikan pesan ini dan terima kasih banyak.`;
  }
  const hari = Math.abs(Number(daysUntil) || 0);
  const penutup = tone === 'tegas'
    ? 'Mohon konfirmasi jadwal pembayaran paling lambat 2 hari ke depan. Jika ada kendala, silakan hubungi kami agar bisa dicarikan solusi bersama.'
    : 'Mohon segera diselesaikan, atau hubungi kami bila ada kendala agar bisa dicarikan solusi bersama.';
  return `Halo ${nama},\n\nTagihan${desc} sebesar ${jumlah} telah melewati jatuh tempo (${tanggal}), yaitu ${hari} hari yang lalu. ${penutup} Jika sudah membayar, abaikan pesan ini dan terima kasih.`;
}

export function templateSubject({ kind, inv, daysUntil }) {
  const tanggal = formatTanggalID(inv?.dueDate);
  if (kind === 'd3') return `Pengingat: tagihan jatuh tempo ${tanggal}`;
  if (kind === 'due') return 'Pengingat: tagihan jatuh tempo HARI INI';
  return `Tagihan melewati jatuh tempo (${Math.abs(Number(daysUntil) || 0)} hari)`;
}

/**
 * Pesan WhatsApp untuk kasus tanpa email (manusia yang menekan kirim lewat tautan wa.me di aplikasi).
 * Paragraf = dari AI (tervalidasi) atau template; angka & info pembayaran = dari database.
 */
export function assembleWaText({ paragraph, inv, owner = {} }) {
  const lines = [String(paragraph).trim(), '', `Tagihan: ${formatRupiah(inv?.amount)}`, `Jatuh tempo: ${formatTanggalID(inv?.dueDate)}`];
  if (owner.paymentId) lines.push(`Pembayaran: ${String(owner.paymentId).trim()}`);
  if (owner.paymentLink) lines.push(`Link/QR: ${String(owner.paymentLink).trim()}`);
  const penandatangan = String(owner.storeName || owner.displayName || '').trim();
  if (penandatangan) lines.push('', `— ${penandatangan}`);
  return lines.join('\n');
}

/**
 * Rakit email final: paragraf (AI atau template) + rincian dari database + info pembayaran + tanda tangan.
 * @param {{paragraph:string, inv:object, owner?:object}} p
 */
export function assembleEmailText({ paragraph, inv, owner = {} }) {
  const lines = [String(paragraph).trim(), '', 'Rincian tagihan:'];
  if (inv?.description) lines.push(`- Untuk: ${String(inv.description).trim()}`);
  lines.push(`- Jumlah: ${formatRupiah(inv?.amount)}`);
  lines.push(`- Jatuh tempo: ${formatTanggalID(inv?.dueDate)}`);

  const bayar = [];
  if (owner.paymentId) bayar.push(`- Rekening/e-wallet: ${String(owner.paymentId).trim()}`);
  if (owner.paymentLink) bayar.push(`- Link / QR pembayaran: ${String(owner.paymentLink).trim()}`);
  if (bayar.length) lines.push('', 'Cara pembayaran:', ...bayar);

  const penandatangan = String(owner.storeName || owner.displayName || 'Sekretaris UMKM').trim();
  lines.push('', 'Salam,', penandatangan);
  return lines.join('\n');
}
