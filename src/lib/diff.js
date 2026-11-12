// Perbandingan dua isi SOP (mis. dua versi di Riwayat). Hasilnya berupa daftar perubahan yang siap ditampilkan;
// teks diubah dibandingkan per kata.
import { plainText } from './richtext.js';
import { SECTION_DEFS, SHAPES, META_FIELDS, formatTanggal } from './model.js';

const txt = (v) => plainText(String(v ?? '')).replace(/\s+/g, ' ').trim();
const key = (v) => txt(v).toLowerCase();

/**
 * Urutan operasi LCS antara `a` dan `b`: { op: 'same' | 'del' | 'add', a?, b? } (a/b = indeks).
 * `eq(i, j)` menentukan apakah a[i] dan b[j] dianggap sama.
 */
export function lcs(a, b, eq) {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) dp[i][j] = eq(i, j) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (eq(i, j)) out.push({ op: 'same', a: i++, b: j++ });
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ op: 'del', a: i++ });
    else out.push({ op: 'add', b: j++ });
  }
  while (i < n) out.push({ op: 'del', a: i++ });
  while (j < m) out.push({ op: 'add', b: j++ });
  return out;
}

const MAX_WORD_CELLS = 250000;

/** Perbedaan per kata: [{ op: 'same' | 'del' | 'add', text }]. */
export function wordDiff(oldText, newText) {
  const a = txt(oldText).match(/\S+|\s+/g) ?? [];
  const b = txt(newText).match(/\S+|\s+/g) ?? [];
  if (a.length * b.length > MAX_WORD_CELLS) {
    return [...(a.length ? [{ op: 'del', text: a.join('') }] : []), ...(b.length ? [{ op: 'add', text: ' ' + b.join('') }] : [])];
  }
  const segs = [];
  for (const o of lcs(a, b, (i, j) => a[i] === b[j])) {
    const text = o.op === 'add' ? b[o.b] : a[o.a];
    const last = segs.at(-1);
    if (last?.op === o.op) last.text += text;
    else segs.push({ op: o.op, text });
  }
  return segs;
}

const HEADER = [
  ['namaSop', 'Nama SOP'],
  ['nomor', 'Nomor'],
  ['institution', 'Kop'],
  ['tglPembuatan', 'Tanggal pembuatan', true],
  ['tglRevisi', 'Tanggal revisi', true],
  ['tglEfektif', 'Tanggal efektif', true],
  ['disahkanJabatan', 'Jabatan pengesah'],
  ['disahkanNama', 'Nama pengesah'],
  ['disahkanNip', 'NIP pengesah']
];

const STEP_FIELDS = [
  ['kegiatan', 'Kegiatan'],
  ['pelaksana', 'Pelaksana'],
  ['shape', 'Simbol'],
  ['kelengkapan', 'Kelengkapan'],
  ['waktu', 'Waktu'],
  ['output', 'Output'],
  ['keterangan', 'Keterangan'],
  ['next', 'Alur berikutnya'],
  ['alt', 'Cabang "tidak"'],
  ['labels', 'Label cabang']
];

const shapeLabel = (v) => SHAPES.find((s) => s.value === v)?.label ?? v;
const short = (t, n = 50) => (t.length > n ? t.slice(0, n) + '…' : t);

/** Membandingkan dokumen `a` (lama) dengan `b` (baru). Kedua dokumen sudah dinormalkan. */
export function diffDocs(a, b) {
  let count = 0;
  const changed = (x, y) => x !== y && (count++, true);

  // Kepala SOP
  const header = [];
  for (const [k, label, date] of HEADER) {
    const [x, y] = [txt(a.header?.[k]), txt(b.header?.[k])];
    if (changed(x, y)) header.push({ label, old: date ? formatTanggal(x) : x, new: date ? formatTanggal(y) : y, segs: date ? null : wordDiff(x, y) });
  }
  for (const { key: k, label } of META_FIELDS) {
    const [x, y] = [txt(a.meta?.[k]), txt(b.meta?.[k])];
    if (changed(x, y)) header.push({ label: `Properti dokumen: ${label}`, old: x, new: y, segs: wordDiff(x, y) });
  }

  // Bagian berbutir
  const sections = [];
  for (const def of SECTION_DEFS) {
    const [x, y] = [a.sections[def.key].items, b.sections[def.key].items];
    const ops = lcs(x, y, (i, j) => key(x[i]) === key(y[j]));
    const items = pairEdits(ops).map((o) =>
      o.op === 'same' ? { op: 'same', text: txt(y[o.b]), n: o.b + 1 }
      : o.op === 'mod' ? { op: 'mod', segs: wordDiff(x[o.a], y[o.b]), n: o.b + 1 }
      : o.op === 'add' ? { op: 'add', text: txt(y[o.b]), n: o.b + 1 }
      : { op: 'del', text: txt(x[o.a]), n: o.a + 1 }
    );
    const changes = items.filter((it) => it.op !== 'same').length;
    count += changes;
    sections.push({ title: def.title, items, changes });
  }

  // Pelaksana: dicocokkan menurut id, lalu menurut nama.
  const actorMatch = matchBy(a.actors, b.actors, (x) => x.id, (x) => key(x.name));
  const actors = [];
  b.actors.forEach((y, j) => {
    const i = actorMatch.ba.get(j);
    if (i === undefined) actors.push({ op: 'add', name: txt(y.name) });
    else if (changed(txt(a.actors[i].name), txt(y.name))) actors.push({ op: 'mod', segs: wordDiff(a.actors[i].name, y.name) });
    else actors.push({ op: 'same', name: txt(y.name) });
  });
  a.actors.forEach((x, i) => !actorMatch.ab.has(i) && actors.push({ op: 'del', name: txt(x.name) }));
  count += actors.filter((x) => x.op === 'add' || x.op === 'del').length;

  // Langkah: dicocokkan menurut id, lalu menurut teks kegiatan. Yang cocok tetapi urutannya berubah ditandai pindah.
  const stepMatch = matchBy(a.steps, b.steps, (s) => s.id, (s) => key(s.kegiatan));
  const actorName = (doc, id) => txt(doc.actors.find((x) => x.id === id)?.name) || '?';
  const people = (doc, s) => [s.actor, ...(s.with ?? [])].map((id) => actorName(doc, id)).join(', ');
  // Tujuan alur dinyatakan dengan nomor langkah pada dokumen baru agar penomoran ulang tidak dianggap perubahan.
  const targetOf = (doc, s, i, branch) => {
    if (branch === 'alt') return s.shape === 'decision' && s.alt ? doc.steps.findIndex((t) => t.id === s.alt) : -2;
    if (s.next === 'none') return -1;
    return s.next === 'auto' ? (i + 1 < doc.steps.length ? i + 1 : -1) : doc.steps.findIndex((t) => t.id === s.next);
  };
  const flowText = (doc, s, i, branch, inNew) => {
    let t = targetOf(doc, s, i, branch);
    if (t === -2) return '';
    if (t === -1) return 'tidak ada (akhir alur)';
    const label = short(txt(doc.steps[t].kegiatan), 40);
    if (!inNew) {
      const mapped = stepMatch.ab.get(t);
      if (mapped === undefined) return `langkah lama "${label}" (dihapus)`;
      t = mapped;
    }
    return `langkah ${t + 1}${label ? ` (${label})` : ''}`;
  };
  const fieldOf = (doc, s, i, f, inNew) =>
    f === 'pelaksana' ? people(doc, s)
    : f === 'shape' ? shapeLabel(s.shape)
    : f === 'next' || f === 'alt' ? flowText(doc, s, i, f, inNew)
    : f === 'labels' ? (s.shape === 'decision' ? `${txt(s.yesLabel)} / ${txt(s.noLabel)}` : '')
    : txt(s[f]);

  const ops = lcs(a.steps, b.steps, (i, j) => stepMatch.ab.get(i) === j);
  const steps = [];
  for (const o of ops) {
    if (o.op === 'del' && stepMatch.ab.has(o.a)) continue; // pindah: ditampilkan di posisi barunya
    if (o.op === 'del') {
      count++;
      steps.push({ op: 'del', n: o.a + 1, kegiatan: txt(a.steps[o.a].kegiatan), pelaksana: people(a, a.steps[o.a]) });
      continue;
    }
    const j = o.b;
    const y = b.steps[j];
    const i = stepMatch.ba.get(j);
    if (i === undefined) {
      count++;
      steps.push({ op: 'add', n: j + 1, kegiatan: txt(y.kegiatan), pelaksana: people(b, y) });
      continue;
    }
    const x = a.steps[i];
    const fields = [];
    for (const [f, label] of STEP_FIELDS) {
      const [p, q] = [fieldOf(a, x, i, f, false), fieldOf(b, y, j, f, true)];
      if (p !== q) fields.push({ label, segs: f === 'next' || f === 'alt' || f === 'shape' ? [{ op: 'del', text: p || '—' }, { op: 'add', text: q || '—' }] : wordDiff(p, q), swap: f === 'next' || f === 'alt' || f === 'shape' });
    }
    const moved = o.op === 'add' ? i + 1 : null;
    if (moved) count++;
    count += fields.length;
    steps.push({ op: fields.length || moved ? 'mod' : 'same', n: j + 1, from: moved, kegiatan: txt(y.kegiatan), fields });
  }

  const linkSet = (doc) => new Map((doc.links ?? []).map((l) => [key(l.text) + '\u0000' + l.sop, txt(l.title) || txt(l.text)]));
  const [la, lb] = [linkSet(a), linkSet(b)];
  const links = [
    ...[...lb].filter(([k]) => !la.has(k)).map(([, t]) => ({ op: 'add', text: t })),
    ...[...la].filter(([k]) => !lb.has(k)).map(([, t]) => ({ op: 'del', text: t }))
  ];
  count += links.length;

  return { count, header, sections, actors, steps, links };
}

/** Pasangan hapus+tambah yang berdampingan dibaca sebagai satu butir yang diubah. */
function pairEdits(ops) {
  const out = [];
  for (let k = 0; k < ops.length; ) {
    if (ops[k].op === 'same') {
      out.push(ops[k++]);
      continue;
    }
    const dels = [];
    const adds = [];
    while (k < ops.length && ops[k].op !== 'same') (ops[k].op === 'del' ? dels : adds).push(ops[k++]);
    const n = Math.min(dels.length, adds.length);
    for (let p = 0; p < n; p++) out.push({ op: 'mod', a: dels[p].a, b: adds[p].b });
    for (const d of dels.slice(n)) out.push(d);
    for (const d of adds.slice(n)) out.push(d);
  }
  return out;
}

/** Pencocokan satu-satu antara daftar `a` dan `b`: lebih dulu lewat `primary`, sisanya lewat `secondary`. */
function matchBy(a, b, primary, secondary) {
  const ab = new Map();
  const ba = new Map();
  for (const f of [primary, secondary]) {
    const free = new Map();
    b.forEach((y, j) => {
      const k = f(y);
      if (!ba.has(j) && k && !free.has(k)) free.set(k, j);
    });
    a.forEach((x, i) => {
      if (ab.has(i)) return;
      const j = free.get(f(x));
      if (j === undefined || ba.has(j)) return;
      ab.set(i, j);
      ba.set(j, i);
      free.delete(f(x));
    });
  }
  return { ab, ba };
}
