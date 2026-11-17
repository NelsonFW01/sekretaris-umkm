// lib/world-rewards.js
//
// Aturan & logika MURNI untuk "poin dunia 3D": mengubah aktivitas di Dunia 3D (checkpoint, koin, kunjungan
// pertama ke Ruang Usaha mitra) dan misi harian "catat transaksi" menjadi poin Dompet Poin.
//
// Prinsip anti-curang (klien tidak dipercaya):
//   • Hanya server yang menentukan jumlah poin — klien cuma melaporkan JENIS kejadian.
//   • Tiap kejadian idempoten (checkpoint 1×/hari, kunjungan ke mitra yang sama 1× seumur akun, misi 1×/hari).
//   • Batas harian per kategori + batas harian total (RULES.dailyCap).
//   • "Catat transaksi" dan "mitra ada" diperiksa server ke database; checkpoint & koin tidak bisa
//     diverifikasi server (dunia 3D berjalan di peramban) → nilainya sengaja kecil dan dibatasi.
//
// Semua fungsi di sini tanpa I/O supaya mudah diuji dan aman dipanggil ulang oleh transact().

export const RULES = Object.freeze({
  dailyCap: 40,                       // total poin dunia per hari per akun
  tx:     { poin: 10 },               // misi "catat transaksi hari ini" (diverifikasi server)
  visit:  { poin: 5, perDay: 3 },     // kunjungan PERTAMA ke Ruang Usaha seorang mitra (seumur akun)
  cp:     { gate: 2, pura: 2, subak: 2, kolam: 2, titian: 3, puncak: 6 }, // id = id checkpoint di dunia (Alun-alun tidak dihitung: aktif sejak awal)
  coins:  { per: 25, poin: 1, maxPoin: 5, maxPerCall: 300 }, // 25 koin dunia = 1 poin, maks 5 poin/hari
  maxEventsPerCall: 12,
  historyMax: 20,
  visitedMax: 300,
});

const SAFE_KEY = /^[A-Za-z0-9_-]{3,128}$/;

export function emptyWorld(day) {
  return { day, earned: 0, coins: 0, cp: {}, nv: 0, tx: false, visited: {} };
}

/** Ambil state dunia untuk `day`; hari baru → reset harian tapi pertahankan daftar mitra yang sudah dikunjungi. */
export function readWorld(cur, day) {
  const w = cur && typeof cur.world === 'object' && cur.world ? cur.world : null;
  const base = emptyWorld(day);
  if (!w) return base;
  const visited = (w.visited && typeof w.visited === 'object') ? { ...w.visited } : {};
  if (w.day !== day) return { ...base, visited };
  return {
    day,
    earned: Math.max(0, Number(w.earned) || 0),
    coins: Math.max(0, Number(w.coins) || 0),
    cp: (w.cp && typeof w.cp === 'object') ? { ...w.cp } : {},
    nv: Math.max(0, Number(w.nv) || 0),
    tx: !!w.tx,
    visited,
  };
}

export function publicStatus(world, poin) {
  return {
    day: world.day,
    earned: world.earned,
    cap: RULES.dailyCap,
    left: Math.max(0, RULES.dailyCap - world.earned),
    tx: !!world.tx,
    cp: Object.keys(world.cp),
    cpTotal: Object.keys(RULES.cp).length,
    visits: world.nv,
    visitsMax: RULES.visit.perDay,
    coins: world.coins,
    coinsMax: RULES.coins.maxPoin * RULES.coins.per,
    poin: Math.max(0, Number(poin) || 0),
  };
}

/** Validasi bentuk event dari klien. Mengembalikan daftar event bersih + jumlah yang ditolak. */
export function sanitizeEvents(raw) {
  if (!Array.isArray(raw)) return { ok: false, error: 'events harus berupa array' };
  if (raw.length > RULES.maxEventsPerCall) return { ok: false, error: `maksimal ${RULES.maxEventsPerCall} event per permintaan` };
  const out = [];
  for (const e of raw) {
    if (!e || typeof e !== 'object') { out.push({ type: 'invalid' }); continue; }
    const type = String(e.type || '');
    if (type === 'tx') out.push({ type });
    else if (type === 'cp') out.push({ type, id: String(e.id || '').slice(0, 24) });
    else if (type === 'visit') out.push({ type, partner: String(e.partner || '').slice(0, 130) });
    else if (type === 'coins') out.push({ type, n: Number(e.n) });
    else out.push({ type: 'invalid' });
  }
  return { ok: true, events: out };
}

const CP_LABEL = { gate: 'Candi Bentar', pura: 'Pura Meru', subak: 'Subak', kolam: 'Kolam Sakral', titian: 'Titian Dewata', puncak: 'Puncak Dewata' };

/**
 * Terapkan event ke `cur` (isi node gameData/{uid} saat ini, boleh null).
 * ctx: { day, now, hasTxToday:boolean, partners:Set<string> (uid mitra yang SUDAH terverifikasi ada), uid }
 * @returns {{ next:object|undefined, results:object[], awarded:number, world:object, lines:string[] }}
 *   next === undefined → tidak ada perubahan yang perlu ditulis.
 */
export function applyEvents(cur, events, ctx) {
  const world = readWorld(cur, ctx.day);
  const results = [];
  const lines = [];
  let awarded = 0;
  let changed = false;

  const room = () => Math.max(0, RULES.dailyCap - world.earned);
  const grant = (want) => { const g = Math.min(want, room()); world.earned += g; awarded += g; return g; };

  for (const ev of events) {
    const r = { type: ev.type, status: 'invalid', poin: 0 };
    if (ev.id) r.id = ev.id;
    if (ev.partner) r.partner = ev.partner;

    if (ev.type === 'tx') {
      if (world.tx) r.status = 'dup';
      else if (!ctx.hasTxToday) r.status = 'no_tx';
      else if (room() <= 0) r.status = 'cap';
      else {
        r.poin = grant(RULES.tx.poin); world.tx = true; changed = true; r.status = 'ok';
        lines.push(`+${r.poin} poin misi harian: catat transaksi (Dunia 3D)`);
      }
    } else if (ev.type === 'cp') {
      const val = Object.prototype.hasOwnProperty.call(RULES.cp, ev.id) ? RULES.cp[ev.id] : 0;
      if (!val) r.status = 'invalid';
      else if (world.cp[ev.id]) r.status = 'dup';
      else if (room() <= 0) r.status = 'cap';
      else {
        r.poin = grant(val); world.cp[ev.id] = 1; changed = true; r.status = 'ok';
        lines.push(`+${r.poin} poin checkpoint ${CP_LABEL[ev.id] || ev.id} (Dunia 3D)`);
      }
    } else if (ev.type === 'visit') {
      const p = ev.partner;
      if (!SAFE_KEY.test(p) || p === ctx.uid) r.status = 'invalid';
      else if (world.visited[p]) r.status = 'dup';
      else if (!ctx.partners || !ctx.partners.has(p)) r.status = 'invalid';
      else if (world.nv >= RULES.visit.perDay || room() <= 0) r.status = 'cap';
      else {
        r.poin = grant(RULES.visit.poin); world.nv += 1; world.visited[p] = ctx.day; changed = true; r.status = 'ok';
        lines.push(`+${r.poin} poin kunjungan pertama ke Ruang Usaha mitra (Dunia 3D)`);
      }
    } else if (ev.type === 'coins') {
      const maxRaw = RULES.coins.maxPoin * RULES.coins.per;
      const n = Math.floor(ev.n);
      if (!Number.isFinite(n) || n < 1) r.status = 'invalid';
      else if (world.coins >= maxRaw) r.status = 'cap';
      else {
        const before = world.coins;
        const after = Math.min(maxRaw, before + Math.min(n, RULES.coins.maxPerCall));
        const want = (Math.floor(after / RULES.coins.per) - Math.floor(before / RULES.coins.per)) * RULES.coins.poin;
        const g = want > 0 ? Math.min(want, room()) : 0;
        if (want > 0 && g < want) { r.status = 'cap'; } // jatah harian total habis → jangan hangus, koin tidak dihitung
        else {
          world.coins = after; changed = true; r.status = 'ok';
          if (g > 0) { r.poin = grant(g); lines.push(`+${r.poin} poin dari koin Dunia 3D`); }
        }
      }
    }
    results.push(r);
  }

  if (!changed) return { next: undefined, results, awarded: 0, world, lines: [] };

  // batasi ukuran daftar mitra yang sudah dikunjungi (buang yang terlama)
  const vk = Object.keys(world.visited);
  if (vk.length > RULES.visitedMax) {
    vk.sort((a, b) => String(world.visited[a]).localeCompare(String(world.visited[b])));
    for (const k of vk.slice(0, vk.length - RULES.visitedMax)) delete world.visited[k];
  }

  const added = lines.slice(); // urutan kejadian (lama → baru), untuk ditampilkan klien
  const hist = Array.isArray(cur && cur.history) ? cur.history.slice() : (cur && cur.history && typeof cur.history === 'object' ? Object.values(cur.history) : []);
  for (const msg of lines.reverse()) hist.unshift({ msg, ts: ctx.now });
  const poin = Math.max(0, Number(cur && cur.poin) || 0) + awarded;

  return {
    next: { ...(cur || {}), poin, history: hist.slice(0, RULES.historyMax), world },
    results, awarded, world, lines: added,
  };
}

/** Apakah ada transaksi hari ini (kalender WIB)? `dataStr` = isi `transaksi/{uid}/data` (JSON string array). */
export function hasTxOnDay(dataStr, day, nowMs) {
  let list;
  try { list = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr; } catch { return false; }
  if (!Array.isArray(list)) return false;
  const start = Date.parse(`${day}T00:00:00+07:00`);
  const end = start + 86400000;
  const lim = Math.min(end, nowMs + 5 * 60_000); // transaksi bertanggal masa depan tidak dihitung
  for (let i = list.length - 1; i >= 0; i--) {
    const t = Date.parse(list[i] && list[i].time);
    if (Number.isFinite(t) && t >= start && t < lim) return true;
  }
  return false;
}
