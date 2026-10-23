// lib/dates.js
//
// Helper tanggal & format. Semua perhitungan "hari ini" memakai zona Asia/Jakarta (WIB),
// BUKAN UTC — supaya pengingat tagihan tidak geser sehari untuk pemilik UMKM di Indonesia.

export const TZ = 'Asia/Jakarta';

const BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

/** 'YYYY-MM-DD' menurut kalender WIB. */
export function todayJakarta(now = new Date()) {
  // locale en-CA menghasilkan format YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

/** true hanya untuk tanggal kalender yang benar-benar ada (menolak 2026-02-31 dll). */
export function isValidDateStr(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Selisih hari (toStr - fromStr). Positif kalau toStr lebih akhir. */
export function daysBetween(fromStr, toStr) {
  const a = Date.parse(fromStr + 'T00:00:00Z');
  const b = Date.parse(toStr + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

/** '2026-10-17' -> '17 Oktober 2026' */
export function formatTanggalID(s) {
  if (!isValidDateStr(s)) return String(s || '-');
  const [y, m, d] = s.split('-').map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
}

/** 1500000 -> 'Rp 1.500.000' (tanpa ketergantungan ICU supaya hasil selalu sama). */
export function formatRupiah(n) {
  const v = Math.round(Number(n) || 0);
  const sign = v < 0 ? '-' : '';
  return `${sign}Rp ${String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

/** Tambah n hari ke tanggal 'YYYY-MM-DD' (hasil 'YYYY-MM-DD'). */
export function addDays(dateStr, n) {
  const t = Date.parse(dateStr + 'T00:00:00Z') + n * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}
