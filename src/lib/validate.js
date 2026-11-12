// Pemeriksa dokumen: alur diagram (langkah tak terjangkau, keputusan tanpa cabang, alur tanpa akhir)
// dan isian penting yang kosong. Tiap temuan membawa `ref` = data-field isian di halaman untuk dituju.
import { plainText } from './richtext.js';
import { SECTION_DEFS, formatTanggal, todayIso } from './model.js';

// Singkatan yang sering ditulis berganti-ganti dengan bentuk panjangnya.
const ABBR = {
  form: 'formulir', mhs: 'mahasiswa', dospem: 'dosen pembimbing', ttd: 'tanda tangan', kaprodi: 'ketua program studi',
  sk: 'surat keputusan', dok: 'dokumen', no: 'nomor', tgl: 'tanggal', thn: 'tahun', email: 'email', bag: 'bagian',
  subbag: 'subbagian', subag: 'subbagian', kasubbag: 'kepala subbagian', kasubag: 'kepala subbagian', kabag: 'kepala bagian', wd: 'wakil dekan', sekprodi: 'sekretaris program studi'
};

/** Kunci pembanding istilah: tanpa beda huruf besar/kecil, tanda baca, spasi ganda, dan singkatan umum. */
export function termKey(t) {
  return plainText(String(t ?? ''))
    .toLowerCase()
    .replace(/[-_.'’`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .map((w) => ABBR[w] ?? w)
    .join(' ');
}
const tidy = (t) => plainText(String(t ?? '')).replace(/\s+/g, ' ').trim();

/**
 * level: 'error' (salah/akan tercetak keliru), 'warn' (sebaiknya diperbaiki), 'info' (saran).
 * opts.reviewYears: SOP yang berlaku lebih lama dari ini (sejak tanggal efektif/revisi) diberi saran ditinjau.
 */
export function checkDocument(doc, { reviewYears = 0, today = todayIso() } = {}) {
  const out = [];
  const add = (level, msg, ref = null) => out.push({ level, msg, ref });
  const hd = doc.header;

  // Identitas
  if (!hd.namaSop?.trim()) add('error', 'Nama SOP masih kosong.', 'h:namaSop');
  if (!hd.nomor?.trim() || /\/$/.test(hd.nomor.trim())) add('warn', 'Nomor SOP belum lengkap.', 'h:nomor');
  if (!hd.tglPembuatan) add('warn', 'Tanggal pembuatan belum diisi.', 'd:tglPembuatan');
  if (!hd.tglEfektif) add('warn', 'Tanggal efektif belum diisi.', 'd:tglEfektif');
  const iso = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
  if (iso(hd.tglPembuatan) && iso(hd.tglEfektif) && hd.tglEfektif < hd.tglPembuatan)
    add('warn', 'Tanggal efektif lebih awal dari tanggal pembuatan.', 'd:tglEfektif');
  if (iso(hd.tglPembuatan) && iso(hd.tglRevisi) && hd.tglRevisi < hd.tglPembuatan)
    add('warn', 'Tanggal revisi lebih awal dari tanggal pembuatan.', 'd:tglRevisi');
  if (!hd.disahkanJabatan?.trim()) add('warn', 'Jabatan pengesah masih kosong.', 'h:disahkanJabatan');
  if (!hd.disahkanNama?.trim()) add('warn', 'Nama pengesah masih kosong.', 'h:disahkanNama');
  if (!hd.disahkanNip?.trim()) add('info', 'NIP pengesah masih kosong.', 'h:disahkanNip');
  if (reviewYears) {
    const since = [hd.tglEfektif, hd.tglRevisi].filter(iso).sort().at(-1);
    if (since && `${Number(since.slice(0, 4)) + reviewYears}${since.slice(4)}` <= today) {
      const what = since === hd.tglRevisi ? 'Revisi terakhir' : 'SOP berlaku sejak';
      add('warn', `${what} ${formatTanggal(since)}, sudah lebih dari ${reviewYears} tahun: sebaiknya ditinjau ulang, lalu perbarui tanggal revisi.`, 'd:tglRevisi');
    }
  }

  for (const def of SECTION_DEFS) {
    const sec = doc.sections[def.key];
    if (!sec.items.length) add('info', `Bagian ${def.title} masih kosong.`, 'sb:' + def.key);
    sec.items.forEach((t, i) => {
      if (!plainText(t).trim()) add('warn', `Butir ${i + 1} ${def.title} kosong.`, `s:${def.key}:${i}`);
    });
  }

  // Pelaksana
  const names = new Map();
  doc.actors.forEach((a, i) => {
    const name = a.name.trim();
    if (!name) add('warn', `Nama pelaksana ke-${i + 1} masih kosong.`, 'a:' + a.id);
    else if (names.has(name.toLowerCase())) add('warn', `Pelaksana "${name}" ditulis dua kali.`, 'a:' + a.id);
    else {
      const twin = doc.actors.slice(0, i).find((b) => b.name.trim() && termKey(b.name) === termKey(name));
      if (twin) add('warn', `Pelaksana "${name}" dan "${twin.name.trim()}" tampaknya sama, hanya ditulis berbeda.`, 'a:' + a.id);
    }
    names.set(name.toLowerCase(), a.id);
    const used = doc.steps.some((s) => s.actor === a.id || s.with?.includes(a.id));
    if (!used) add('info', `Pelaksana "${name || `ke-${i + 1}`}" tidak punya kegiatan.`, 'a:' + a.id);
  });

  // Alur
  const steps = doc.steps;
  if (!steps.length) {
    add('error', 'Belum ada kegiatan.', 'st:add');
    return out;
  }
  const idx = new Map(steps.map((s, i) => [s.id, i]));
  const label = (i) => {
    const k = plainText(steps[i].kegiatan).trim();
    return `Langkah ${i + 1}${k ? ` (${k.length > 40 ? k.slice(0, 40) + '…' : k})` : ''}`;
  };
  const sy = (i) => 'sy:' + steps[i].id;
  const outs = steps.map(() => []);
  const ins = steps.map(() => []);
  const link = (a, b) => (outs[a].push(b), ins[b].push(a));

  steps.forEach((s, i) => {
    const dec = s.shape === 'decision';
    if (!plainText(s.kegiatan).trim()) add('error', `Langkah ${i + 1}: kegiatan masih kosong.`, `st:${s.id}:kegiatan`);
    let next = null;
    if (s.next === 'auto') next = i + 1 < steps.length ? i + 1 : null;
    else if (s.next !== 'none') {
      next = idx.get(s.next) ?? null;
      if (next === null) add('error', `${label(i)}: tujuan alurnya sudah tidak ada.`, sy(i));
    }
    if (next === i) add('error', `${label(i)}: alurnya menuju dirinya sendiri.`, sy(i)), (next = null);
    if (next !== null) link(i, next);
    if (!dec) return;
    let alt = null;
    if (s.alt) {
      alt = idx.get(s.alt) ?? null;
      if (alt === null) add('error', `${label(i)}: tujuan cabang "${s.noLabel || 'tidak'}" sudah tidak ada.`, sy(i));
      else if (alt === i) add('error', `${label(i)}: cabang "${s.noLabel || 'tidak'}" menuju dirinya sendiri.`, sy(i)), (alt = null);
    }
    if (next === null) add('error', `${label(i)}: keputusan tanpa cabang "${s.yesLabel || 'ya'}".`, sy(i));
    if (alt === null && !s.alt) add('error', `${label(i)}: keputusan tanpa cabang "${s.noLabel || 'tidak'}".`, sy(i));
    if (alt !== null) {
      if (alt === next) add('warn', `${label(i)}: kedua cabang keputusan menuju langkah yang sama.`, sy(i));
      link(i, alt);
    }
    if (!s.yesLabel?.trim() || !s.noLabel?.trim()) add('info', `${label(i)}: label cabang keputusan kosong.`, sy(i));
  });

  // Langkah yang terjangkau dari langkah pertama.
  const seen = new Set([0]);
  const queue = [0];
  while (queue.length) for (const j of outs[queue.shift()]) if (!seen.has(j)) seen.add(j), queue.push(j);
  steps.forEach((_, i) => {
    if (!seen.has(i)) add('warn', `${label(i)} tidak pernah dicapai dari langkah 1.`, sy(i));
  });

  // Titik akhir: langkah tanpa alur keluar. Harus ada, dan setiap langkah terjangkau harus bisa sampai ke sana.
  const ends = steps.map((_, i) => i).filter((i) => !outs[i].length);
  if (!ends.length) add('error', 'Alur tidak pernah selesai: tidak ada langkah tanpa alur keluar (semua berputar).', sy(steps.length - 1));
  else {
    const done = new Set(ends);
    const back = [...ends];
    while (back.length) for (const j of ins[back.pop()]) if (!done.has(j)) done.add(j), back.push(j);
    const stuck = [...seen].filter((i) => !done.has(i)).sort((a, b) => a - b);
    if (stuck.length) add('error', `${label(stuck[0])} masuk ke putaran yang tidak pernah sampai ke Selesai.`, sy(stuck[0]));
  }
  for (const i of ends) {
    if (steps[i].shape !== 'terminator') add('warn', `${label(i)} mengakhiri alur, tetapi simbolnya bukan Mulai/Selesai.`, sy(i));
  }
  if (steps[0].shape !== 'terminator') add('warn', 'Alur sebaiknya diawali simbol Mulai/Selesai.', sy(0));
  steps.forEach((s, i) => {
    if (s.shape === 'terminator' && i > 0 && outs[i].length && ins[i].length)
      add('warn', `${label(i)}: simbol Mulai/Selesai berada di tengah alur.`, sy(i));
  });

  // Kelengkapan isian per langkah.
  const seenKegiatan = new Map();
  steps.forEach((s, i) => {
    if (s.shape === 'terminator') return;
    if (!plainText(s.output).trim()) add('info', `${label(i)}: kolom Output masih kosong.`, `st:${s.id}:output`);
    const k = plainText(s.kegiatan).trim();
    if (s.shape === 'decision' && k && !/\?\s*$/.test(k)) add('info', `${label(i)}: kegiatan keputusan sebaiknya berupa pertanyaan (diakhiri "?").`, `st:${s.id}:kegiatan`);
    const kk = termKey(k);
    if (kk && seenKegiatan.has(kk)) add('info', `${label(i)}: kegiatannya sama dengan langkah ${seenKegiatan.get(kk) + 1}.`, `st:${s.id}:kegiatan`);
    else if (kk) seenKegiatan.set(kk, i);
  });

  // Istilah yang sama tetapi ditulis berbeda di kolom Kelengkapan dan Output, mis. "Form Pendaftaran" dan "formulir pendaftaran".
  const terms = new Map(); // kunci → Map(tulisan → ref pertama)
  steps.forEach((s) => {
    for (const f of ['kelengkapan', 'output']) {
      for (const part of plainText(s[f] ?? '').split(/[,;\n]+/)) {
        const t = tidy(part);
        const k = termKey(t);
        if (!k) continue;
        if (!terms.has(k)) terms.set(k, new Map());
        const forms = terms.get(k);
        if (!forms.has(t)) forms.set(t, `st:${s.id}:${f}`);
      }
    }
  });
  for (const forms of terms.values()) {
    if (forms.size < 2) continue;
    const list = [...forms.keys()];
    add('info', `Istilah ditulis berbeda: ${list.map((t) => `"${t}"`).join(', ')}. Samakan penulisannya.`, forms.get(list[1]));
  }

  const rank = { error: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}
