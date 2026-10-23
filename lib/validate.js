// lib/validate.js
//
// GUARDRAIL untuk teks buatan AI. Prinsip: teks dari LLM adalah USULAN, bukan perintah.
// Setiap usulan diperiksa mesin sebelum robot boleh memakainya:
//   - jumlah uang, tanggal, dan hitungan hari di teks harus sama persis dengan data tagihan (anti-halusinasi);
//     angka lain yang tak bisa dicocokkan dengan data juga ditolak
//   - tautan, email/nomor asing, huruf non-Latin, bahasa mengancam, janji denda/diskon, atau jejak "prompt injection"
//     → diberi bendera dan otomatis dialihkan ke persetujuan manusia
//   - semua pemeriksaan bekerja pada salinan yang dinormalkan (lebar-penuh, huruf matematika, homoglif, karakter tak terlihat)
// Fungsi-fungsi di sini MURNI (tanpa jaringan) sehingga mudah diuji.

import { isValidDateStr } from './dates.js';

// karakter tak terlihat yang sering dipakai menyelundupkan instruksi: semua karakter "format" Unicode
// (spasi lebar nol, soft hyphen, penanda arah/isolat, BOM, karakter TAG U+E00xx untuk "ASCII smuggling", dst.)
const INVISIBLE_RE = /[\p{Cf}]/gu;
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

// ───────────────────────── normalisasi untuk PEMERIKSAAN ─────────────────────────
// Penyerang (atau LLM yang terkena injeksi) bisa menyamarkan teks: huruf lebar-penuh (ｈｔｔｐｓ), huruf matematika (𝐢𝐠𝐧𝐨𝐫𝐞),
// soft hyphen di tengah kata, atau huruf Sirilik/Yunani yang tampak seperti Latin (Rр, ignоre). Pemeriksa karena itu bekerja
// pada salinan yang dinormalkan; teks yang dikirim/ditampilkan tidak diubah olehnya.

const HOMOGLYPHS = {
  // Sirilik → Latin
  а: 'a', в: 'b', е: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x', і: 'i', ј: 'j', ѕ: 's', ԁ: 'd',
  А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', Х: 'X', І: 'I', У: 'Y', Ј: 'J', Ѕ: 'S',
  // Yunani → Latin
  α: 'a', ο: 'o', ν: 'v', ρ: 'p', ι: 'i', κ: 'k', ε: 'e', τ: 't', υ: 'u', χ: 'x', ϲ: 'c',
  Α: 'A', Β: 'B', Ε: 'E', Ζ: 'Z', Η: 'H', Ι: 'I', Κ: 'K', Μ: 'M', Ν: 'N', Ο: 'O', Ρ: 'P', Τ: 'T', Υ: 'Y', Χ: 'X',
};
const HOMOGLYPH_RE = new RegExp(`[${Object.keys(HOMOGLYPHS).join('')}]`, 'g');

/** NFKC (lebar-penuh/matematika → ASCII) + buang karakter format & kontrol. Huruf non-Latin TIDAK dipetakan (lihat hasForeignLetters). */
export function nfkc(text) {
  return String(text ?? '').normalize('NFKC').replace(INVISIBLE_RE, '').replace(CONTROL_RE, '');
}
/** nfkc + petakan huruf Sirilik/Yunani yang mirip huruf Latin ke Latin. */
export function normalizeForScan(text) {
  return nfkc(text).replace(HOMOGLYPH_RE, (c) => HOMOGLYPHS[c]);
}
/** Adakah huruf selain Latin? Email pengingat berbahasa Indonesia tidak membutuhkannya; di teks AI ini ciri penyamaran. */
export function hasForeignLetters(text) {
  return /(?!\p{Script=Latin})\p{L}/u.test(nfkc(text));
}

const URL_RE = /(?:https?|ftp):\/\/\S+|\bwww\.\S+/i;
// domain telanjang tanpa "http" (bit.ly/x, pay.example.id/inv, wa.me/628…, t.me/…)
const BARE_DOMAIN_RE = /\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|net|org|edu|gov|id|co|io|me|ly|link|xyz|app|dev|info|biz|site|online|shop|store|cc|tk|gl|is|to|us|uk|my|sg|asia|top|vip|pw|ru|cn|in|be|page|click|ws|su|ga|ml|cf|gq)\b/i;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const THREAT_RE = /(polisi|lapor|ancam|penjara|somasi|pengacara|pengadilan|sita\b|disita|menyita|permalukan|sebarkan|bocorkan|memviralkan|viralkan|blacklist|daftar\s+hitam|debt\s*[-_]?\s*collector|penagih\s+lapangan|jalur\s+hukum|proses\s+hukum|tindakan\s+hukum|pidana|perdata|gugat|tuntut|kekerasan|buka\s+aib|datangi\s+rumah|kunjungi\s+rumah)/i;
const INJECTION_RE = new RegExp([
  // "abaikan semua instruksi", "ignore the previous instructions", "forget everything above", "disregard the above rules" …
  '(?:abaikan(?:lah)?|lupakan|ignore|disregard|forget|override|bypass)\\s+(?:(?:semua|seluruh|segala|all|any|the|every|everything|your|these|those|previous|prior|above|earlier|sebelumnya|yang)\\s+)*(?:instruksi|perintah|aturan|petunjuk|arahan|prompt|instructions?|rules?|directions?|guidelines?|previous|prior|above|earlier|sebelumnya|di\\s+atas|everything)',
  'system\\s*prompt|developer\\s*message|api[\\s_-]?key|password|kata\\s*sandi|jailbreak',
  // pembajakan peran
  'you\\s+are\\s+now|act\\s+as\\s+(?:an?\\s+)?(?:admin|system|developer|root)|pretend\\s+(?:to\\s+be|you)|(?:kamu|anda)\\s+sekarang\\s+(?:adalah|menjadi)|berperan(?:lah)?\\s+sebagai|new\\s+instructions?\\s*:',
].join('|'), 'i');

const RP_RE = /\b(?:Rp|IDR)[.:]?\s*([0-9][0-9.,]*)(?:\s*(juta|jt|ribu|rb)\b)?/gi;
// kata uang di luar "Rp …": "9 juta rupiah", "sembilan ratus ribu", "IDR"
const MONEY_WORD_RE = /\b(?:rupiah|idr|juta|jt|ribu|rb|miliar|milyar|triliun|perak)\b/i;

/** Bersihkan teks dari tag HTML, karakter kontrol/tak terlihat, lalu batasi panjangnya. */
export function sanitizeText(input, max = 800) {
  let s = String(input ?? '');
  s = s.replace(INVISIBLE_RE, '').replace(CONTROL_RE, '');
  s = s.replace(/<[^>]*>/g, ' ');
  s = s.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (s.length > max) s = s.slice(0, max).replace(/\s+\S*$/, '').trim() + '…';
  return s;
}

/** Ambil semua nominal "Rp ..." dari teks sebagai angka. */
export function extractRupiahAmounts(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(RP_RE)) {
    const numStr = m[1].replace(/[.,]+$/, '');
    const unit = (m[2] || '').toLowerCase();
    let value;
    if (unit) {
      const mult = unit === 'juta' || unit === 'jt' ? 1_000_000 : 1_000;
      // "1,5 juta" (koma desimal) atau "1.5 juta" (titik desimal 1-2 digit)
      const normalized = /^\d+\.\d{1,2}$/.test(numStr)
        ? numStr
        : numStr.replace(/\./g, '').replace(',', '.');
      value = parseFloat(normalized) * mult;
    } else {
      const noDecimal = numStr.replace(/,\d{1,2}$/, ''); // "1.500.000,50" → "1.500.000"
      value = parseInt(noDecimal.replace(/[.,]/g, ''), 10);
    }
    if (Number.isFinite(value)) out.push(Math.round(value));
  }
  return out;
}

/** Semua nominal di teks HARUS sama dengan jumlah tagihan. Tanpa nominal = lolos (server menambah rincian sendiri). */
export function checkAmounts(text, expectedAmount) {
  const found = extractRupiahAmounts(text);
  const expected = Math.round(Number(expectedAmount));
  return { found, ok: found.every((v) => v === expected) };
}

/**
 * Semua kode bendera yang bisa dipasang guardrail/agen pada sebuah item. Aplikasi (index.html) wajib punya label
 * untuk tiap kode ini — dijaga oleh tests/index-html.test.js, supaya pemilik selalu melihat ALASAN, bukan kode mentah.
 */
export const FLAG_CODES = Object.freeze([
  'ada_tautan', 'kontak_asing', 'nomor_asing', 'bahasa_mengancam', 'indikasi_injeksi', 'jumlah_tidak_cocok',
  'tanggal_tidak_cocok', 'klaim_biaya', 'harga_dikarang', 'angka_tak_dikenal', 'tagihan_ganda', 'agen_menandai_janggal',
]);

// ───────────────────────── tanggal & hitungan hari ─────────────────────────
// Prompt melarang AI menulis tanggal. Larangan di prompt TIDAK cukup: tanggal karangan ("paling lambat Jumat")
// di email otomatis menyesatkan pelanggan. Jadi tanggal di teks AI diperiksa mesin, sama seperti nominal.

const BULAN = {
  januari: 1, jan: 1, january: 1, februari: 2, pebruari: 2, feb: 2, february: 2, maret: 3, mar: 3, march: 3,
  april: 4, apr: 4, mei: 5, may: 5, juni: 6, jun: 6, june: 6, juli: 7, jul: 7, july: 7,
  agustus: 8, agu: 8, agt: 8, ags: 8, aug: 8, august: 8, september: 9, sep: 9, sept: 9,
  oktober: 10, okt: 10, oct: 10, october: 10, november: 11, nopember: 11, nov: 11, desember: 12, des: 12, dec: 12, december: 12,
};
const MONTH_ALT = Object.keys(BULAN).sort((a, b) => b.length - a.length).join('|');
const NAMED_DATE_RE = new RegExp(`\\b(\\d{1,2})[\\s-]+(${MONTH_ALT})\\b\\.?(?:[\\s-]+(\\d{4})(?!\\d))?`, 'gi');
const MONTH_FIRST_RE = new RegExp(`\\b(${MONTH_ALT})\\b\\.?\\s+(\\d{1,2})(?!\\d)(?:,?\\s+(\\d{4})(?!\\d))?`, 'gi'); // gaya Inggris: "Oct 25, 2026"

/**
 * Semua tanggal eksplisit di teks: ISO (2026-10-25), hari-bulan-tahun (25/10/2026, 25.10.26), bernama
 * (25 Oktober 2026, 25 Okt), dan "tanggal 25". Tahun/bulan yang tidak disebut = null. Nominal "Rp …" diabaikan.
 */
export function extractDates(text) {
  const t = normalizeForScan(text).replace(RP_RE, ' ');
  const out = [];
  const push = (y, m, d) => { if (d >= 1 && d <= 31 && (m === null || (m >= 1 && m <= 12))) out.push({ y, m, d }); };
  for (const m of t.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) push(+m[1], +m[2], +m[3]);
  for (const m of t.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/g)) push(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  for (const m of t.matchAll(NAMED_DATE_RE)) push(m[3] ? +m[3] : null, BULAN[m[2].toLowerCase()], +m[1]);
  for (const m of t.matchAll(MONTH_FIRST_RE)) push(m[3] ? +m[3] : null, BULAN[m[1].toLowerCase()], +m[2]);
  for (const m of t.matchAll(/\btanggal\s+(\d{1,2})\b/gi)) push(null, null, +m[1]);
  return out;
}

/**
 * Tanggal dan hitungan "N hari" di teks AI HARUS cocok dengan data tagihan.
 * @param {string[]} dates   tanggal yang boleh disebut ('YYYY-MM-DD': jatuh tempo, hari ini)
 * @param {number|null} daysUntil  selisih hari ke jatuh tempo (negatif = telat); satu-satunya "N hari" yang boleh adalah |daysUntil|
 * Tanpa tanggal/hitungan di teks = lolos (server menempelkan tanggal yang benar sendiri).
 */
export function checkDates(text, { dates = [], daysUntil = null } = {}) {
  const allowed = dates.filter(isValidDateStr).map((s) => { const [y, m, d] = s.split('-').map(Number); return { y, m, d }; });
  const found = extractDates(text);
  const norm = normalizeForScan(text);
  const badDates = found.filter((x) => !allowed.some((a) => x.d === a.d && (x.m === null || x.m === a.m) && (x.y === null || x.y === a.y)));
  const days = [...norm.matchAll(/\b(\d{1,3})\s*(?:hari|hr)\b/gi)].map((m) => Number(m[1]));
  const okDay = Number.isFinite(daysUntil) ? Math.abs(daysUntil) : null;
  const badDays = days.filter((n) => n !== okDay);
  return { found, days, ok: badDates.length === 0 && badDays.length === 0 };
}

// ───────────────────────── janji/biaya yang tidak boleh dikarang ─────────────────────────
// Denda, diskon, bunga, cicilan, keringanan = keputusan pemilik usaha, bukan AI. (Prompt melarangnya; ini penegaknya.)
const CLAIM_RE = /\b(?:(?:di)?denda(?:kan)?|diskon\w*|potongan|(?:di|men|ber)?cicil\w*|angsur\w*|bertahap|tenor|keringanan|meringankan|dispensasi|penalti|pinalti|sanksi|kompensasi|komisi|cashback|promo\w*|gratis|bebas\s+(?:denda|biaya|admin\w*)|hadiah|bonus|voucher|kupon|undian|biaya\s+(?:tambahan|keterlambatan|admin(?:istrasi)?)|bunga\s+(?:\d+|harian|bulanan|keterlambatan|pinjaman)|persen)\b|\d\s*%/i;

/** ['klaim_biaya'] bila teks menjanjikan/menyebut denda, diskon, bunga, cicilan, biaya tambahan, atau persentase; selain itu []. */
export function scanCommercialClaims(text) {
  return CLAIM_RE.test(normalizeForScan(text)) ? ['klaim_biaya'] : [];
}

export function isEmail(s) {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim()) && s.trim().length <= 254;
}

export function maskEmail(s) {
  const e = String(s || '');
  const at = e.indexOf('@');
  if (at < 1) return '***';
  return `${e[0]}***${e.slice(at)}`;
}

/** Hitung digit pada potongan teks. */
const digitCount = (s) => (s.match(/[0-9]/g) || []).length;

/** Cari tanda bahaya di teks. Mengembalikan daftar bendera (kosong = bersih). Bekerja pada salinan yang dinormalkan. */
export function scanText(text, { allowedEmails = [] } = {}) {
  const raw = nfkc(text);
  const t = normalizeForScan(text);
  const flags = new Set();

  // email: buka penyamaran "kasir (at) gmail (dot) com" dan "kasir @ gmail.com" sebelum dicocokkan
  const deob = t
    .replace(/\s*[[(]\s*at\s*[\])]\s*/gi, '@')
    .replace(/\s*[[(]\s*dot\s*[\])]\s*/gi, '.')
    .replace(/\s*@\s*/g, '@');
  const allowed = new Set(allowedEmails.map((e) => String(e).toLowerCase()));
  for (const m of deob.matchAll(EMAIL_RE)) {
    if (!allowed.has(m[0].toLowerCase())) flags.add('kontak_asing');
  }
  const withoutEmails = deob.replace(EMAIL_RE, ' ');
  if (withoutEmails.includes('@')) flags.add('kontak_asing'); // "@akun", atau email yang disamarkan sampai tak terbaca

  if (URL_RE.test(t) || BARE_DOMAIN_RE.test(withoutEmails)) flags.add('ada_tautan');

  // Nomor panjang (rekening / HP) di luar nominal Rp dan di luar tanggal
  const stripped = t
    .replace(RP_RE, ' ')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
    .replace(/\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g, ' ');
  for (const m of stripped.matchAll(/\+?\d(?:[\d\s().\/-]*\d)?/g)) {
    if (digitCount(m[0]) >= 7) { flags.add('nomor_asing'); break; }
  }
  if (/[\p{Nd}--[0-9]]/v.test(raw)) flags.add('nomor_asing'); // digit Arab-Indic/Devanagari: tidak ada alasan sah di email ini

  if (THREAT_RE.test(t)) flags.add('bahasa_mengancam');
  if (INJECTION_RE.test(t)) flags.add('indikasi_injeksi');
  return [...flags];
}

/** Apakah teks masukan (nama/deskripsi dari pihak luar) berisi jejak instruksi tersembunyi? */
export function looksLikeInjection(text) {
  return INJECTION_RE.test(normalizeForScan(text));
}

/**
 * Hapus kontak dari teks pihak luar sebelum masuk ke prompt LLM/n8n: email, tautan, domain telanjang, dan nomor panjang
 * (≥ 7 digit: telepon, rekening). Pelanggan kadang mengetik nomor HP atau email di kolom nama/deskripsi; LLM tidak boleh menerimanya.
 */
export function redactContacts(text) {
  return nfkc(text)
    .replace(/[A-Z0-9._%+-]+\s*(?:@|[[(]\s*at\s*[\])])\s*[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[kontak dihapus]')
    .replace(/(?:https?|ftp):\/\/\S+|\bwww\.\S+/gi, '[tautan dihapus]')
    .replace(new RegExp(`${BARE_DOMAIN_RE.source}(?:\\/\\S*)?`, 'gi'), '[tautan dihapus]')
    .replace(/\+?\d(?:[\d\s().\/-]*\d)?/g, (m) => (digitCount(m) >= 7 ? '[nomor dihapus]' : m));
}

// ───────────────────────── pemeriksaan lengkap teks buatan AI ─────────────────────────

// kata waktu relatif/hitungan durasi yang tidak bisa dicek terhadap data (digit + "hari" dicek terpisah oleh checkDates)
const NUM_WORD = '(?:satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas|belas|puluh|ratus|seratus|seminggu|sebulan|setahun)';
const RELATIVE_TIME_RE = new RegExp([
  '\\b(?:besok|lusa|kemarin|nanti|tomorrow|yesterday)\\b',
  '\\b(?:minggu|pekan|bulan|tahun|week|month|year)\\s+(?:depan|lalu|ini|ahead|next|last)\\b',
  '\\bnext\\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\\b',
  '\\b(?:senin|selasa|rabu|kamis|jumat|jum\'at|sabtu|minggu|ahad|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\\b',
  `\\b${NUM_WORD}(?:\\s+${NUM_WORD})*\\s*(?:hari|minggu|pekan|bulan|tahun|jam|days?|weeks?|months?|hours?)\\b`,
  '\\b\\d+\\s*(?:minggu|pekan|bulan|tahun|jam|days?|weeks?|months?|hours?)\\b',
  '\\b\\d+\\s*x\\s*\\d+\\s*(?:jam|hari)\\b',
].join('|'), 'i');

/** Buang semua bagian yang SUDAH diperiksa tersendiri (nominal, tanggal, "N hari"); sisanya tidak boleh mengandung angka. */
function stripCheckedTokens(t) {
  return t
    .replace(RP_RE, ' ')
    .replace(/\b\d{4}-\d{1,2}-\d{1,2}\b/g, ' ')
    .replace(/\b\d{1,2}[/.-]\d{1,2}[/.-](?:\d{4}|\d{2})\b/g, ' ')
    .replace(NAMED_DATE_RE, ' ')
    .replace(MONTH_FIRST_RE, ' ')
    .replace(/\btanggal\s+\d{1,2}\b/gi, ' ')
    .replace(/\b\d{1,3}\s*(?:hari|hr)\b/gi, ' ');
}

/**
 * Semua pemeriksaan mesin atas SATU paragraf/subjek buatan AI yang akan dikirim ke pelanggan. Mengembalikan kode bendera
 * (kosong = bersih = boleh dipakai apa adanya). Pendekatan: yang boleh disebut hanyalah apa yang bisa dicocokkan dengan database
 * (nominal tagihan, tanggal jatuh tempo/hari ini, hitungan hari sebenarnya); SISANYA yang berupa angka, tautan, kontak, ancaman,
 * janji biaya, atau kata waktu relatif ditolak. Daftar larangan saja mudah ditembus, jadi angka yang tak dikenal pun ditolak.
 *
 * @param {object} ctx  { amount, dates: ['YYYY-MM-DD' jatuh tempo, hari ini], daysUntil, allowedEmails }
 */
export function scanAiParagraph(text, { amount, dates = [], daysUntil = null, allowedEmails = [] } = {}) {
  const t = normalizeForScan(text);
  const bad = new Set(scanText(text, { allowedEmails }));
  if (hasForeignLetters(text)) bad.add('indikasi_injeksi');
  if (!checkAmounts(t, amount).ok || MONEY_WORD_RE.test(t.replace(RP_RE, ' '))) bad.add('jumlah_tidak_cocok');
  if (!checkDates(t, { dates, daysUntil }).ok || RELATIVE_TIME_RE.test(t)) bad.add('tanggal_tidak_cocok');
  for (const f of scanCommercialClaims(t)) bad.add(f);
  if (!bad.size && /[0-9]/.test(stripCheckedTokens(t))) bad.add('angka_tak_dikenal');
  return [...bad];
}

/**
 * Pemeriksaan pesan buatan AI ke pemasok/mitra (draf stok; SELALU lewat persetujuan manusia, jadi jumlah barang boleh disebut).
 * Yang dilarang: tautan/kontak/nomor asing, ancaman, injeksi, huruf non-Latin, dan HARGA karangan.
 */
export function scanAiStockMessage(text) {
  const t = normalizeForScan(text);
  const bad = new Set(scanText(text));
  if (hasForeignLetters(text)) bad.add('indikasi_injeksi');
  if (extractRupiahAmounts(t).length || MONEY_WORD_RE.test(t)) bad.add('harga_dikarang');
  return [...bad];
}
