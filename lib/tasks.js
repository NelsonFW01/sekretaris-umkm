// lib/tasks.js
//
// TIGA TUGAS AGEN: tindak lanjut tagihan, pemesanan ulang stok, ringkasan harian.
//
// Pola yang sama di ketiganya (inilah "agentic"-nya, sekaligus pagar pengamannya):
//
//   data dari database ──► [AI agen: tool-calling] ──► USULAN ──► [validasi mesin + kebijakan] ──► RENCANA bertanda tangan
//                                                                                                    │
//                                              robot UiPath mengeksekusi (auto) atau menaruh draf untuk MANUSIA
//
//  • AI hanya MENYUSUN. Tidak ada tool yang mengirim/menulis ke dunia luar.
//  • Penerima email SELALU dari data tagihan di database, bukan dari teks AI.
//  • Semua angka (jumlah, tanggal, rekening) ditempel dari database, bukan dari teks AI.
//  • Bila AI tidak tersedia / gagal validasi → template cadangan, ditandai aiGenerated:false.

import { listProviders, runAgent } from './agent-core.js';
import { SYSTEM_RINGKASAN, SYSTEM_STOK, SYSTEM_TAGIHAN, SYSTEM_TAGIHAN_EKSTERNAL, TOOL_DEFS } from './prompts.js';
import { DEFAULT_POLICY, classifyInvoice, decideRoute, urgensiStok } from './policy.js';
import { hasForeignLetters, isEmail, looksLikeInjection, redactContacts, sanitizeText, scanAiParagraph, scanAiStockMessage, scanText } from './validate.js';
import { assembleEmailText, assembleWaText, templateParagraph, templateSubject } from './templates.js';
import { signItem } from './sign.js';
import { daysBetween, formatRupiah, isValidDateStr, todayJakarta } from './dates.js';

const CHUNK = 6; // tagihan per panggilan LLM (hemat token & muat di kuota gratis)
const TONES = ['ramah', 'netral', 'tegas'];
const AKSI = ['kirim_email', 'draf_wa', 'lewati'];

const digits = (s) => String(s ?? '').replace(/\D/g, '');
function normPhone(s) {
  const d = digits(s);
  return d.length >= 8 ? d.replace(/^0/, '62') : '';
}

// ───────────────────────── util umum ─────────────────────────

export async function loadOwner(rtdb, uid) {
  // Baca field satu per satu: node users/{uid} juga memuat foto base64 yang besar.
  const keys = ['displayName', 'storeName', 'email', 'paymentId', 'paymentLink'];
  const vals = await Promise.all(keys.map((k) => rtdb.get(`users/${uid}/${k}`).catch(() => null)));
  const u = Object.fromEntries(keys.map((k, i) => [k, vals[i]]));
  return {
    displayName: sanitizeText(u.displayName, 80),
    storeName: sanitizeText(u.storeName, 80),
    email: isEmail(u.email) ? String(u.email).trim() : '',
    paymentId: sanitizeText(u.paymentId, 120),
    paymentLink: sanitizeText(u.paymentLink, 200),
  };
}

function normalizeDecisions(args) {
  const list = Array.isArray(args) ? args : (args?.keputusan || args?.decisions || []);
  return Array.isArray(list) ? list.filter((d) => d && typeof d === 'object' && !Array.isArray(d)) : [];
}

function parseJsonText(content) {
  const raw = String(content || '').trim();
  if (!raw) return null;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const candidate = fenced ? fenced[1] : raw;
  try {
    const obj = JSON.parse(candidate);
    return obj && typeof obj === 'object' && (Array.isArray(obj.keputusan) || Array.isArray(obj)) ? obj : null;
  } catch { return null; }
}

// ───────────────────────── 1. TAGIHAN ─────────────────────────

function riwayatPelanggan(invoices, name, today) {
  const key = String(name || '').trim().toLowerCase();
  const mine = Object.values(invoices).filter((i) => i && String(i.customerName || '').trim().toLowerCase() === key);
  let lunas = 0, terbuka = 0, telat = 0, telatHariLunas = 0, telatLunasCount = 0;
  for (const i of mine) {
    if (i.status === 'lunas') {
      lunas++;
      if (i.paidAt && isValidDateStr(i.dueDate)) {
        const late = daysBetween(i.dueDate, todayJakarta(new Date(Number(i.paidAt))));
        if (late > 0) { telat++; telatLunasCount++; telatHariLunas += late; }
      }
    } else {
      terbuka++;
      if (isValidDateStr(i.dueDate) && daysBetween(i.dueDate, today) > 0) telat++;
    }
  }
  return {
    namaPelanggan: name,
    totalTagihan: mine.length,
    lunas,
    masihTerbuka: terbuka,
    pernahTelat: telat,
    rataTelatHariSaatLunas: telatLunasCount ? Math.round(telatHariLunas / telatLunasCount) : 0,
  };
}

/**
 * Teks dari PIHAK LUAR (nama/deskripsi pelanggan, judul/deskripsi tawaran Kongsi milik pengguna lain, catatan pemasok) yang
 * boleh masuk prompt: jejak instruksi tersembunyi → disembunyikan seluruhnya; kontak yang diketik di dalamnya → dihapus.
 */
const forPrompt = (s, max, hidden = '[disembunyikan]') => (looksLikeInjection(s) ? hidden : redactContacts(sanitizeText(s, max)));

function buildTagihanPrompt(chunk, extraFor = null) {
  const data = chunk.map(({ id, inv, c, hasEmail, phone }) => ({
    invoiceId: id,
    namaPelanggan: forPrompt(inv.customerName, 80),
    deskripsi: forPrompt(inv.description, 120, '[disembunyikan: terindikasi instruksi tersembunyi]'),
    jumlah: Number(inv.amount),
    jatuhTempo: inv.dueDate,
    hariKeJatuhTempo: c.daysUntil,
    jenis: c.kind,
    adaEmail: !!hasEmail,
    adaWA: !!phone,
    pengingatSebelumnya: Object.keys(inv.remindersSent && typeof inv.remindersSent === 'object' ? inv.remindersSent : {}).length,
    ...(extraFor ? extraFor(inv) : {}),
  }));
  return `Susun rencana pengingat untuk tagihan berikut.\n\n<DATA_TAGIHAN>\n${JSON.stringify(data, null, 1)}\n</DATA_TAGIHAN>`;
}
/**
 * Tampilan AMAN dari sebuah tagihan untuk teks yang akan DITAMPILKAN/DIKIRIM (email, WA, judul draf).
 * Nama & deskripsi berasal dari luar (bisa hasil impor/OCR/pelanggan) → bila berisi jejak instruksi
 * tersembunyi, TIDAK diteruskan apa adanya ke email maupun ke AI. Tagihannya sendiri tetap diproses
 * (diberi bendera `indikasi_injeksi` dan dialihkan ke persetujuan manusia).
 */
export function safeInvoiceView(inv) {
  const clean = (s, max) => (looksLikeInjection(s) ? '' : sanitizeText(s, max));
  return { ...inv, customerName: clean(inv?.customerName, 80), description: clean(inv?.description, 120) };
}

function skipItem(id, inv, reason, c) {
  return {
    tipe: 'pengingat_tagihan', invoiceId: id,
    customerName: sanitizeText(safeInvoiceView(inv || {}).customerName, 80),
    amount: Number(inv?.amount) || 0, dueDate: inv?.dueDate || null,
    kind: null, daysUntil: c?.daysUntil ?? null,
    route: 'skip', reasons: [reason], tone: null, flags: [], note: '', aiGenerated: false,
    to: '', subject: '', body: '', wa: '', judul: '', pesan: '', sig: null,
  };
}

function judulTagihan(inv, c) {
  const nama = String(inv.customerName || 'pelanggan').slice(0, 60);
  // (inv di sini sudah "tampilan aman", lihat safeInvoiceView)
  const suffix = c.kind === 'overdue' ? ` (telat ${-c.daysUntil} hari)` : c.kind === 'due' ? ' (jatuh tempo hari ini)' : ' (3 hari lagi)';
  return `Pengingat ke ${nama} — ${formatRupiah(inv.amount)}${suffix}`;
}

function finalizeInvoice({ uid, id, inv: rawInv, c, flags: baseFlags, hasEmail, phone, decision, owner, policy, today }) {
  const inv = safeInvoiceView(rawInv); // semua teks keluar memakai tampilan aman ini
  const flags = [...baseFlags];
  const d = decision || null;
  // semua pemeriksaan mesin untuk teks buatan AI yang akan dikirim ke pelanggan (kosong = bersih)
  const scanAiText = (txt) => scanAiParagraph(txt, { amount: inv.amount, dates: [inv.dueDate, today], daysUntil: c.daysUntil });
  const tone = TONES.includes(d?.nada) ? d.nada : 'ramah';
  const aksi = AKSI.includes(d?.aksi) ? d.aksi : null;

  // 1) kalimat: AI (lolos validasi) atau template
  let paragraph = null;
  let aiGenerated = false;
  // AI kadang menyalin penanda "[disembunyikan]" dari prompt → ganti dengan sapaan netral
  const unhide = (s) => s.replace(/\[disembunyikan\]/gi, 'Bapak/Ibu').replace(/\[disembunyikan:[^\]]*\]/gi, '').replace(/ {2,}/g, ' ');
  const para = d?.isi ? unhide(sanitizeText(d.isi, 700)) : '';
  if (para.length >= 20) {
    const bad = scanAiText(para);
    for (const b of bad) if (!flags.includes(b)) flags.push(b);
    if (!bad.length) { paragraph = para; aiGenerated = true; }
  }
  if (!paragraph) paragraph = templateParagraph({ kind: c.kind, inv, daysUntil: c.daysUntil, tone });

  let subject = templateSubject({ kind: c.kind, inv, daysUntil: c.daysUntil });
  const subj = d?.subjek ? unhide(sanitizeText(d.subjek, 100)).replace(/\s*\n\s*/g, ' ') : '';
  if (subj.length >= 8) {
    const bad = scanAiText(subj);
    for (const b of bad) if (!flags.includes(b)) flags.push(b);
    if (!bad.length && aiGenerated) subject = subj;
  }

  // 2) rute: otomatis / persetujuan manusia / WA manual / lewati
  let { route, reasons } = decideRoute(
    { amount: inv.amount, kind: c.kind, daysUntil: c.daysUntil, tone, flags, hasEmail, hasPhone: !!phone }, policy,
  );
  if (route === 'auto' || route === 'approval') {
    if (aksi === 'draf_wa' && phone) { route = 'manual_wa'; reasons = ['agen_pilih_wa']; }
    else if (aksi === 'lewati' && !reasons.includes('agen_menandai_janggal')) { route = 'approval'; reasons = [...reasons, 'agen_menandai_janggal']; }
  }

  const nameHidden = looksLikeInjection(rawInv.customerName);
  const hiddenText = nameHidden || looksLikeInjection(rawInv.description);
  const base = {
    tipe: 'pengingat_tagihan', invoiceId: id,
    customerName: nameHidden ? '(nama disembunyikan)' : inv.customerName,
    amount: Number(inv.amount), dueDate: inv.dueDate,
    kind: c.kind, daysUntil: c.daysUntil, planDate: today,
    route, reasons, tone, flags,
    note: [d?.catatan ? sanitizeText(d.catatan, 200) : '', hiddenText ? 'Sebagian teks tagihan disembunyikan karena terindikasi instruksi tersembunyi.' : ''].filter(Boolean).join(' '),
    aiGenerated,
  };
  const judul = judulTagihan(inv, c);

  if (route === 'skip') return { ...base, to: '', subject: '', body: '', wa: '', judul, pesan: '', sig: null };

  let item;
  if (route === 'manual_wa') {
    item = { ...base, to: '', subject: '', body: '', wa: phone, judul, pesan: assembleWaText({ paragraph, inv, owner }) };
  } else {
    const body = assembleEmailText({ paragraph, inv, owner });
    item = { ...base, to: String(inv.customerEmail).trim(), subject, body, wa: '', judul, pesan: body };
  }
  item.sig = signItem(uid, item);
  return item;
}

/**
 * Tahap 1 (tanpa AI): pilih kandidat, terapkan aturan kelayakan, tandai kejanggalan.
 * Dipakai bersama oleh agen internal (planInvoiceFollowup) dan konteks untuk "otak" eksternal (describeInvoiceContext).
 */
async function prepareInvoiceEntries({ rtdb, uid, invoiceIds, today, policy }) {
  const [all, owner] = await Promise.all([rtdb.get(`invoices/${uid}`), loadOwner(rtdb, uid)]);
  const invoices = all && typeof all === 'object' ? all : {};
  const warnings = [];

  let targetIds = Array.isArray(invoiceIds) && invoiceIds.length
    ? [...new Set(invoiceIds.map(String))]
    : Object.keys(invoices);
  if (targetIds.length > policy.maxInvoicesPerUser) {
    warnings.push(`Dibatasi ${policy.maxInvoicesPerUser} tagihan per proses (ada ${targetIds.length}).`);
    targetIds = targetIds.slice(0, policy.maxInvoicesPerUser);
  }

  // deteksi tagihan ganda (nama + jumlah + jatuh tempo sama) di antara tagihan terbuka
  const dupKey = (i) => `${String(i.customerName || '').trim().toLowerCase()}|${Number(i.amount)}|${i.dueDate}`;
  const dupCount = new Map();
  for (const i of Object.values(invoices)) {
    if (i && i.status !== 'lunas') dupCount.set(dupKey(i), (dupCount.get(dupKey(i)) || 0) + 1);
  }

  const resultById = new Map();
  const entries = [];
  for (const id of targetIds) {
    const inv = invoices[id];
    if (!inv || typeof inv !== 'object') { resultById.set(id, skipItem(id, null, 'tidak_ditemukan')); continue; }
    const c = classifyInvoice(inv, today, policy);
    if (!c.eligible) { resultById.set(id, skipItem(id, inv, c.skipReason, c)); continue; }
    const flags = [];
    if (dupCount.get(dupKey(inv)) > 1) flags.push('tagihan_ganda');
    if (looksLikeInjection(inv.customerName) || looksLikeInjection(inv.description)) flags.push('indikasi_injeksi');
    entries.push({ id, inv, c, flags, hasEmail: isEmail(inv.customerEmail), phone: normPhone(inv.customerPhone) });
  }
  return { invoices, owner, targetIds, entries, resultById, warnings };
}

/**
 * Susun rencana tindak lanjut tagihan untuk satu pengguna.
 * @param {object} o
 * @param {string[]|null} o.invoiceIds  kandidat dari robot; null = server memilih sendiri semua yang layak
 * @param {Array|null}    o.decisions   keputusan dari "otak" eksternal (mis. n8n); null = pakai agen internal
 */
export async function planInvoiceFollowup({
  rtdb, uid, invoiceIds = null, today = todayJakarta(), policy = DEFAULT_POLICY,
  env = process.env, fetchImpl = fetch, providers, decisions = null, now = Date.now(),
}) {
  const { invoices, owner, targetIds, entries, resultById, warnings } = await prepareInvoiceEntries({ rtdb, uid, invoiceIds, today, policy });
  const trace = [];

  // keputusan AI
  const decisionMap = new Map();
  let aiUsed = false;
  let provider = null;
  let model = null;
  const usage = { prompt: 0, completion: 0 };

  if (Array.isArray(decisions)) {
    for (const d of normalizeDecisions(decisions)) decisionMap.set(String(d.invoiceId), d);
    aiUsed = decisionMap.size > 0;
    provider = 'eksternal';
  } else if (entries.length) {
    const provs = providers || listProviders(env);
    if (!provs.length) {
      warnings.push('Tidak ada API key LLM yang diset — memakai template cadangan (aiGenerated:false).');
    } else {
      const deadlineAt = now + (Number(env.AGENT_BUDGET_MS) || 45_000);
      for (let i = 0; i < entries.length; i += CHUNK) {
        const chunk = entries.slice(i, i + CHUNK);
        const r = await runAgent({
          system: SYSTEM_TAGIHAN,
          user: buildTagihanPrompt(chunk),
          tools: [
            { def: TOOL_DEFS.riwayat_pelanggan, handler: (a) => riwayatPelanggan(invoices, a?.namaPelanggan, today) },
            { def: TOOL_DEFS.submit_rencana_tagihan },
          ],
          terminal: 'submit_rencana_tagihan',
          parseText: parseJsonText,
          deadlineAt, providers: provs, fetchImpl, env,
        });
        trace.push(...r.trace.map((t) => ({ ...t, chunk: i / CHUNK })));
        usage.prompt += r.usage.prompt; usage.completion += r.usage.completion;
        if (r.ok) {
          aiUsed = true; provider = r.provider; model = r.model;
          for (const d of normalizeDecisions(r.terminal)) decisionMap.set(String(d.invoiceId), d);
        } else {
          warnings.push(`AI tidak tersedia (${r.error}) — sisa tagihan memakai template cadangan.`);
          break; // jangan boroskan kuota: anggap AI sedang bermasalah
        }
      }
    }
  }

  for (const e of entries) {
    resultById.set(e.id, finalizeInvoice({ uid, ...e, decision: decisionMap.get(e.id) || null, owner, policy, today }));
  }

  const items = targetIds.map((id) => resultById.get(id));
  const stats = { kandidat: targetIds.length, auto: 0, approval: 0, manual_wa: 0, skip: 0, aiGenerated: 0, templateCadangan: 0 };
  for (const it of items) {
    stats[it.route] = (stats[it.route] || 0) + 1;
    if (it.route !== 'skip') it.aiGenerated ? stats.aiGenerated++ : stats.templateCadangan++;
  }

  return { ok: true, task: 'invoice_followup', uid, today, aiUsed, provider, model, usage, items, stats, warnings, trace, policy };
}

/**
 * KONTEKS untuk "otak" eksternal (n8n, Agent Builder UiPath, dsb.): data kandidat yang SUDAH aman
 * (teks tak tepercaya disembunyikan, tanpa email/HP) + prompt + skema tool. Otak eksternal menjawab dengan
 * `keputusan`, lalu mengirimkannya kembali sebagai `decisions` ke task invoice_followup agar divalidasi
 * dengan guardrail yang SAMA seperti agen internal. Endpoint ini tidak memanggil LLM sama sekali.
 */
export async function describeInvoiceContext({ rtdb, uid, invoiceIds = null, today = todayJakarta(), policy = DEFAULT_POLICY }) {
  const { invoices, targetIds, entries, resultById, warnings } = await prepareInvoiceEntries({ rtdb, uid, invoiceIds, today, policy });
  // otak eksternal tidak punya tool riwayat → sertakan ringkasan kebiasaan bayar langsung di data (hanya angka, tanpa nama)
  const withHistory = (inv) => {
    const { namaPelanggan, ...angka } = riwayatPelanggan(invoices, inv.customerName, today);
    return { riwayat: angka };
  };
  const chunks = [];
  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK);
    chunks.push({ invoiceIds: chunk.map((e) => e.id), userPrompt: buildTagihanPrompt(chunk, withHistory) });
  }
  const skipped = targetIds.filter((id) => !entries.some((e) => e.id === id)).map((id) => ({ invoiceId: id, reason: resultById.get(id)?.reasons?.[0] || 'dilewati' }));
  return {
    ok: true, task: 'invoice_context', uid, today,
    systemPrompt: SYSTEM_TAGIHAN_EKSTERNAL,
    tool: { type: 'function', function: TOOL_DEFS.submit_rencana_tagihan },
    candidates: entries.length, chunks, skipped, warnings,
  };
}

// ───────────────────────── 2. STOK ─────────────────────────

const STOK_JENIS = ['hubungi_mitra', 'kongsi_belanja', 'pesanan_pemasok', 'lewati'];

function sameName(a, b) { return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(); }

function stokTemplatePesan({ jenis, s, namaTujuan, qty }) {
  const nama = s.namaBahan;
  const satuan = s.satuan || 'pcs';
  if (jenis === 'pesanan_pemasok') {
    return `Halo ${namaTujuan}, saya mau pesan ulang ${nama}. Stok saya tinggal ${s.sisaStok} ${satuan}; perkiraan kebutuhan ${qty} ${satuan}. Mohon info ketersediaan dan harga terbaru ya, terima kasih!`;
  }
  if (jenis === 'hubungi_mitra') {
    return `Halo ${namaTujuan}, saya lihat kamu punya stok ${nama} di Pasar Kongsi. Saya butuh sekitar ${qty} ${satuan}. Masih tersedia? Boleh tahu harganya? Terima kasih!`;
  }
  return `Halo teman-teman UMKM! Stok ${nama} saya menipis (sisa ${s.sisaStok} ${satuan}). Ada yang mau patungan beli ${nama} bareng supaya dapat harga lebih murah? Perkiraan kebutuhan saya ${qty} ${satuan}.`;
}

export async function planStockReorder({
  rtdb, uid, env = process.env, fetchImpl = fetch, providers, decisions = null, now = Date.now(),
}) {
  const [stokRaw, pemasokRaw] = await Promise.all([rtdb.get(`stokInventori/${uid}`), rtdb.get(`pemasok/${uid}`)]);
  const stok = Object.entries(stokRaw || {}).filter(([, v]) => v && typeof v === 'object').map(([id, v]) => ({ id, ...v, namaBahan: sanitizeText(v.namaBahan, 80), satuan: sanitizeText(v.satuan, 20) }));
  const pemasok = Object.entries(pemasokRaw || {}).filter(([, v]) => v && typeof v === 'object').map(([id, v]) => ({ id, ...v, namaPemasok: sanitizeText(v.namaPemasok, 80), catatan: sanitizeText(v.catatan, 100) }));
  const low = stok.map((s) => ({ s, urgensi: urgensiStok(s) })).filter((x) => x.urgensi && x.s.namaBahan);

  const empty = { ok: true, task: 'stock_reorder', uid, aiUsed: false, provider: null, model: null, usage: { prompt: 0, completion: 0 }, items: [], stats: { stokMenipis: 0, draf: 0, aiGenerated: 0, templateCadangan: 0 }, warnings: [], trace: [] };
  if (!low.length) return { ...empty, summary: 'Semua stok aman — tidak ada tindakan.' };

  // tawaran Pasar Kongsi (data publik komunitas) — dibaca sekali, lazy
  let kongsiCache = null;
  const loadKongsi = async () => {
    if (!kongsiCache) {
      const raw = (await rtdb.get('pasarKongsi')) || {};
      kongsiCache = Object.entries(raw).filter(([, v]) => v && v.mode === 'stok').map(([id, v]) => ({ id, ...v }));
    }
    return kongsiCache;
  };

  const warnings = [];
  const trace = [];
  const usage = { prompt: 0, completion: 0 };
  const decisionMap = new Map();
  let aiUsed = false, provider = null, model = null;

  if (Array.isArray(decisions)) {
    for (const d of normalizeDecisions(decisions)) decisionMap.set(String(d.item || '').toLowerCase(), d);
    aiUsed = decisionMap.size > 0; provider = 'eksternal';
  } else {
    const provs = providers || listProviders(env);
    if (!provs.length) {
      warnings.push('Tidak ada API key LLM yang diset — memakai template cadangan (aiGenerated:false).');
    } else {
      const dataStok = low.map(({ s, urgensi }) => ({ item: forPrompt(s.namaBahan, 80), sisa: Number(s.sisaStok), titikPesanUlang: Number(s.titikPesanUlang), satuan: s.satuan || 'pcs', urgensi }));
      const dataPemasok = pemasok.map((p) => ({ namaPemasok: forPrompt(p.namaPemasok, 80), catatan: forPrompt(p.catatan, 100), adaWA: !!normPhone(p.wa) }));
      const r = await runAgent({
        system: SYSTEM_STOK,
        user: `Susun draf tindakan untuk stok yang menipis.\n\n<DATA_STOK_MENIPIS>\n${JSON.stringify(dataStok, null, 1)}\n</DATA_STOK_MENIPIS>\n\n<DAFTAR_PEMASOK>\n${JSON.stringify(dataPemasok, null, 1)}\n</DAFTAR_PEMASOK>`,
        tools: [
          {
            def: TOOL_DEFS.cari_tawaran_kongsi,
            handler: async (a) => {
              const kw = String(a?.kataKunci || '').trim().toLowerCase();
              if (kw.length < 2) return { hasil: [] };
              const list = await loadKongsi();
              return {
                hasil: list
                  .filter((it) => String(it.title || '').toLowerCase().includes(kw) || String(it.desc || '').toLowerCase().includes(kw))
                  .slice(0, 5)
                  .map((it) => ({ tawaranId: it.id, judul: forPrompt(it.title, 80), deskripsi: forPrompt(it.desc, 120), adaWA: !!normPhone(it.wa) })),
              };
            },
          },
          { def: TOOL_DEFS.daftar_pemasok, handler: () => ({ pemasok: dataPemasok }) },
          { def: TOOL_DEFS.submit_rencana_stok },
        ],
        terminal: 'submit_rencana_stok',
        parseText: parseJsonText,
        deadlineAt: now + (Number(env.AGENT_BUDGET_MS) || 45_000),
        providers: provs, fetchImpl, env,
      });
      trace.push(...r.trace);
      usage.prompt += r.usage.prompt; usage.completion += r.usage.completion;
      if (r.ok) {
        aiUsed = true; provider = r.provider; model = r.model;
        for (const d of normalizeDecisions(r.terminal)) decisionMap.set(String(d.item || '').trim().toLowerCase(), d);
      } else {
        warnings.push(`AI tidak tersedia (${r.error}) — memakai template cadangan.`);
      }
    }
  }

  const items = [];
  for (const { s, urgensi } of low) {
    const d = decisionMap.get(s.namaBahan.toLowerCase()) || null;
    const qty = Math.max(Math.round(Number(s.titikPesanUlang) * 2 - Number(s.sisaStok)), 1);
    let jenis = STOK_JENIS.includes(d?.jenis) ? d.jenis : null;

    // resolusi penerima dari DATABASE (bukan dari teks AI)
    let supplier = null, offer = null;
    if (jenis === 'pesanan_pemasok') supplier = pemasok.find((p) => sameName(p.namaPemasok, d?.namaPemasok)) || null;
    if (jenis === 'hubungi_mitra') {
      const list = await loadKongsi();
      offer = list.find((o) => o.id === String(d?.tawaranId || '')) || null;
    }
    if (jenis === 'pesanan_pemasok' && !supplier) jenis = null;
    if (jenis === 'hubungi_mitra' && !offer) jenis = null;

    let aiGenerated = !!d && !!jenis;
    if (!jenis) { // cadangan deterministik
      supplier = pemasok.find((p) => p.catatan && p.catatan.toLowerCase().includes(s.namaBahan.toLowerCase())) || pemasok[0] || null;
      jenis = supplier ? 'pesanan_pemasok' : 'kongsi_belanja';
      aiGenerated = false;
    }
    if (jenis === 'lewati') {
      items.push({ tipe: 'tandai_stok', item: s.namaBahan, urgensi, route: 'skip', reasons: ['agen_lewati'], flags: [], judul: '', pesan: '', wa: '', namaTujuan: '', note: sanitizeText(d?.catatan, 200), aiGenerated: true, sig: null });
      continue;
    }

    const namaTujuan = jenis === 'pesanan_pemasok' ? supplier.namaPemasok
      : jenis === 'hubungi_mitra' ? sanitizeText(offer.ownerName || offer.name || 'pemilik tawaran', 60) : '';
    const wa = jenis === 'pesanan_pemasok' ? normPhone(supplier.wa) : jenis === 'hubungi_mitra' ? normPhone(offer.wa) : '';

    const flags = [];
    let pesan = '';
    const aiPesan = d?.pesan ? sanitizeText(d.pesan, 500) : '';
    if (aiPesan.length >= 20) {
      const bad = scanAiStockMessage(aiPesan); // tautan/kontak/ancaman/injeksi + harga karangan ("jangan mengarang harga")
      if (bad.length) { for (const b of bad) if (!flags.includes(b)) flags.push(b); } else { pesan = aiPesan; }
    }
    if (!pesan) { pesan = stokTemplatePesan({ jenis, s, namaTujuan, qty }); aiGenerated = false; }

    const judul = jenis === 'pesanan_pemasok' ? `Pesanan ke ${namaTujuan}: ${s.namaBahan}`
      : jenis === 'hubungi_mitra' ? `Pesan ke ${namaTujuan}: ${s.namaBahan}` : `Ajak patungan beli ${s.namaBahan}`;
    const item = {
      tipe: jenis, item: s.namaBahan, urgensi, sisa: Number(s.sisaStok), titik: Number(s.titikPesanUlang), satuan: s.satuan || 'pcs',
      route: 'approval', reasons: ['draf_stok', ...flags], flags, judul, pesan, wa, namaTujuan,
      note: sanitizeText(d?.catatan, 200), aiGenerated,
    };
    item.sig = signItem(uid, item);
    items.push(item);
  }

  const stats = { stokMenipis: low.length, draf: items.filter((i) => i.route === 'approval').length, aiGenerated: items.filter((i) => i.route === 'approval' && i.aiGenerated).length, templateCadangan: items.filter((i) => i.route === 'approval' && !i.aiGenerated).length };
  return { ...empty, aiUsed, provider, model, usage, items, stats, warnings, trace, summary: `${low.length} item stok menipis, ${stats.draf} draf menunggu persetujuan.` };
}

// ───────────────────────── 3. RINGKASAN HARIAN ─────────────────────────

const clampNum = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), 1_000_000_000) : 0; };

export async function planDailyBrief({
  rtdb, uid, stats = {}, today = todayJakarta(), env = process.env, fetchImpl = fetch, providers, now = Date.now(),
}) {
  const [all, owner] = await Promise.all([rtdb.get(`invoices/${uid}`), loadOwner(rtdb, uid)]);
  const open = Object.values(all || {}).filter((i) => i && i.status !== 'lunas' && isValidDateStr(i.dueDate) && Number(i.amount) > 0);
  const numbers = {
    tagihanTerbuka: open.length,
    totalPiutangRp: open.reduce((s, i) => s + Number(i.amount), 0),
    tagihanTelat: open.filter((i) => daysBetween(today, i.dueDate) < 0).length,
    jatuhTempo3Hari: open.filter((i) => daysBetween(today, i.dueDate) === 3).length,
    emailTerkirim: clampNum(stats.emailTerkirim),
    drafMenungguPersetujuan: clampNum(stats.drafDibuat),
    dilewati: clampNum(stats.dilewati),
    galat: clampNum(stats.galat),
    stokMenipis: clampNum(stats.stokMenipis),
  };

  const fallback = {
    ringkasan: `${owner.storeName || 'Usahamu'} punya ${numbers.tagihanTerbuka} tagihan terbuka senilai ${formatRupiah(numbers.totalPiutangRp)}, ${numbers.tagihanTelat} di antaranya sudah telat. Robot mengirim ${numbers.emailTerkirim} email pengingat dan menyiapkan ${numbers.drafMenungguPersetujuan} draf yang menunggu persetujuanmu.`,
    sorotan: [
      numbers.tagihanTelat ? `${numbers.tagihanTelat} tagihan sudah telat` : 'Tidak ada tagihan telat',
      numbers.stokMenipis ? `${numbers.stokMenipis} bahan stoknya menipis` : 'Stok aman',
    ],
    saran: numbers.drafMenungguPersetujuan ? ['Buka tab Agen Rantai Pasok dan setujui/tolak draf yang menunggu.'] : ['Tidak ada yang perlu disetujui hari ini.'],
  };

  const provs = providers || listProviders(env);
  let aiUsed = false, provider = null, model = null;
  let out = fallback;
  const warnings = [];
  if (!provs.length) {
    warnings.push('Tidak ada API key LLM — ringkasan memakai template.');
  } else {
    const r = await runAgent({
      system: SYSTEM_RINGKASAN,
      user: `<STATISTIK>\n${JSON.stringify(numbers, null, 1)}\n</STATISTIK>`,
      tools: [{ def: TOOL_DEFS.submit_ringkasan_harian }],
      terminal: 'submit_ringkasan_harian',
      maxTurns: 3,
      deadlineAt: now + (Number(env.AGENT_BUDGET_MS) || 45_000),
      providers: provs, fetchImpl, env,
    });
    if (r.ok) {
      const t = r.terminal;
      const ringkasan = sanitizeText(t.ringkasan, 600);
      if (ringkasan.length >= 20 && !hasForeignLetters(ringkasan) && scanText(ringkasan).filter((f) => f !== 'nomor_asing').length === 0) {
        aiUsed = true; provider = r.provider; model = r.model;
        out = {
          ringkasan,
          sorotan: (Array.isArray(t.sorotan) ? t.sorotan : []).slice(0, 3).map((x) => sanitizeText(x, 140)).filter(Boolean),
          saran: (Array.isArray(t.saran) ? t.saran : []).slice(0, 3).map((x) => sanitizeText(x, 140)).filter(Boolean),
        };
      } else warnings.push('Ringkasan AI ditolak validasi — memakai template.');
    } else warnings.push(`AI tidak tersedia (${r.error}) — ringkasan memakai template.`);
  }
  return { ok: true, task: 'daily_brief', uid, today, aiUsed, provider, model, ...out, numbers, warnings };
}
