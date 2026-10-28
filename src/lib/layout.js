// Mesin tata letak: mengubah dokumen SOP menjadi daftar halaman berisi primitif gambar
// (rect, poly, circle, text, image). Hasil yang sama dirender ke SVG (pratinjau) dan
// ke jsPDF (ekspor), sehingga pratinjau identik dengan PDF. Semua satuan dalam mm.
import { jsPDF } from 'jspdf';
import { pdfFont, registerFonts, fontRevision } from './fonts.js';
import { formatTanggal } from './model.js';
import logoSrc from '../assets/logo-ub.png?inline';

const LOGO = { src: logoSrc, width: 418, height: 420 };

export const PAGE = { w: 297, h: 210, m: 10 };
export const PT = 25.4 / 72;
const LH = 1.2;

const INK = '#000000';
const FLOW = '#2f5597';
const BORDER = 0.25;
const BAND = 7; // pita untuk konektor antarhalaman

let measurer = null;
let measuredWith = -1;

export const lineHeight = (size) => size * PT * LH;
/** Posisi baseline baris ke-i dari item teks (dipakai kedua renderer). */
export const baseline = (item, i) => item.y + i * lineHeight(item.size) + item.size * PT * 0.86;

function wrap(text, size, bold, width) {
  const t = String(text ?? '').replace(/\r/g, '');
  if (!t.trim()) return [];
  if (measuredWith !== fontRevision()) {
    measurer = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    registerFonts(measurer);
    measuredWith = fontRevision();
  }
  measurer.setFont(pdfFont(), bold ? 'bold' : 'normal');
  measurer.setFontSize(size);
  return measurer.splitTextToSize(t, Math.max(width, 2));
}

const textH = (lines, size) => lines.length * lineHeight(size);

function fit(img, maxW, maxH) {
  const s = Math.min(maxW / img.width, maxH / img.height);
  return { w: img.width * s, h: img.height * s };
}

export function layoutDocument(doc) {
  const pages = [];
  layoutIdentity(doc, pages);
  layoutFlow(doc, pages);
  return pages;
}

function newPage(pages) {
  // fields: area yang bisa diedit langsung di pratinjau (tidak ikut dicetak).
  const p = { w: PAGE.w, h: PAGE.h, items: [], fields: [] };
  pages.push(p);
  return p;
}

const rect = (x, y, w, h, extra = {}) => ({ t: 'rect', x, y, w, h, stroke: INK, lw: BORDER, ...extra });
const text = (x, y, lines, size, extra = {}) => ({ t: 'text', x, y, lines, size, bold: false, align: 'left', color: INK, ...extra });

// ---------------------------------------------------------------------------
// Halaman identitas
// ---------------------------------------------------------------------------

function layoutIdentity(doc, pages) {
  const { m, w: PW, h: PH } = PAGE;
  const W = PW - 2 * m;
  const leftW = 128;
  const labelW = 32;
  const valW = W - leftW - labelW;
  const xLab = m + leftW;
  const xVal = xLab + labelW;
  const S = 10;
  const pad = 1.4;
  const hd = doc.header;

  let page = newPage(pages);
  let y = m;

  // Area isian teks: kotak (x, y, w, h) dengan jarak dalam `pad`; tinggi minimal satu baris.
  const field = (key, x, y, w, lines, size, opts = {}) => {
    const p = opts.pad ?? 0;
    const h = opts.h ?? Math.max(1, lines.length) * lineHeight(size) + 2 * p;
    page.fields.push({ id: 'h:' + key, kind: 'text', key, x, y, w, h, pad: p, size, bold: false, align: 'left', ...opts });
  };

  // Baris-baris kanan
  const simple = (label, key, opts = {}) => {
    const value = opts.date ? formatTanggal(hd[key]) : hd[key];
    const bold = !!opts.bold;
    const lines = wrap(value, S, bold, valW - 2 * pad);
    const labLines = wrap(label, S, true, labelW - 2 * pad);
    const h = Math.max(7, Math.max(textH(lines, S), textH(labLines, S)) + 2 * pad);
    return { h, draw: (yy) => {
      page.items.push(rect(xLab, yy, labelW, h), rect(xVal, yy, valW, h));
      page.items.push(text(xLab + pad, yy + pad, labLines, S, { bold: true }));
      page.items.push(text(xVal + pad, yy + pad, lines, S, { bold }));
      if (opts.date) page.fields.push({ id: 'd:' + key, kind: 'date', key, x: xVal, y: yy, w: valW, h, pad, size: S, label });
      else field(key, xVal, yy, valW, lines, S, { h, pad, bold, label, placeholder: opts.placeholder });
    } };
  };

  const jab = wrap(hd.disahkanJabatan, S, false, valW - 4);
  const nama = wrap(hd.disahkanNama, S, false, valW - 4);
  const nip = wrap(hd.disahkanNip, S, false, valW - 4);
  const sigH = 24;
  const signRow = {
    h: Math.max(40, 2 * pad + textH(jab, S) + sigH + 2 + textH(nama, S) + textH(nip, S)),
    draw: (yy) => {
      const h = signRow.h;
      page.items.push(rect(xLab, yy, labelW, h), rect(xVal, yy, valW, h));
      page.items.push(text(xLab + pad, yy + pad, wrap('DISAHKAN OLEH', S, true, labelW - 2 * pad), S, { bold: true }));
      const cx = xVal + valW / 2;
      page.items.push(text(cx, yy + pad, jab, S, { align: 'center' }));
      const bottomText = textH(nama, S) + textH(nip, S);
      const sigTop = yy + pad + textH(jab, S) + 1;
      const sigBottom = yy + h - pad - bottomText - 1;
      if (hd.signature) {
        const f = fit(hd.signature, valW - 10, sigBottom - sigTop);
        page.items.push({ t: 'image', src: hd.signature.src, x: cx - f.w / 2, y: sigTop + (sigBottom - sigTop - f.h) / 2, w: f.w, h: f.h });
      }
      page.items.push(text(cx, yy + h - pad - bottomText, nama, S, { align: 'center' }));
      page.items.push(text(cx, yy + h - pad - textH(nip, S), nip, S, { align: 'center' }));

      // Isian kosong tetap mendapat satu baris agar bisa diklik.
      const line = lineHeight(S);
      const nipY = yy + h - pad - Math.max(1, nip.length) * line;
      const namaY = nipY - Math.max(1, nama.length) * line;
      const jabY = yy + pad;
      const jabB = jabY + Math.max(1, jab.length) * line;
      const c = { align: 'center', pad: 0 };
      field('disahkanJabatan', xVal + 2, jabY, valW - 4, jab, S, { ...c, label: 'Jabatan pengesah', placeholder: 'Jabatan pengesah' });
      field('disahkanNama', xVal + 2, namaY, valW - 4, nama, S, { ...c, label: 'Nama pengesah', placeholder: 'Nama pengesah' });
      field('disahkanNip', xVal + 2, nipY, valW - 4, nip, S, { ...c, label: 'NIP pengesah', placeholder: 'NIP. …' });
      page.fields.push({ id: 'sig', kind: 'image', key: 'signature', x: xVal + 5, y: jabB + 0.5, w: valW - 10, h: Math.max(4, namaY - jabB - 1), label: 'Tanda tangan / stempel' });
    }
  };

  const rightRows = [
    simple('NOMOR SOP', 'nomor'),
    simple('TGL PEMBUATAN', 'tglPembuatan', { date: true }),
    simple('TGL REVISI', 'tglRevisi', { date: true }),
    simple('TGL EFEKTIF', 'tglEfektif', { date: true }),
    signRow,
    simple('NAMA SOP', 'namaSop', { bold: true, placeholder: 'NAMA SOP' })
  ];
  const blockH = rightRows.reduce((a, r) => a + r.h, 0);

  // Blok kiri: logo UB (baku) + nama instansi
  page.items.push(rect(m, y, leftW, blockH));
  const inst = wrap(hd.institution, 11, true, leftW - 8);
  const instH = textH(inst, 11);
  const logoAreaTop = y + 3;
  const logoAreaBottom = y + blockH - instH - 4;
  const f = fit(LOGO, 52, Math.min(38, logoAreaBottom - logoAreaTop));
  page.items.push({ t: 'image', src: LOGO.src, x: m + (leftW - f.w) / 2, y: logoAreaTop + (logoAreaBottom - logoAreaTop - f.h) / 2, w: f.w, h: f.h });
  page.items.push(text(m + leftW / 2, y + blockH - instH - 2, inst, 11, { bold: true, align: 'center' }));
  const instFieldH = Math.max(1, inst.length) * lineHeight(11);
  field('institution', m + 4, y + blockH - 2 - instFieldH, leftW - 8, inst, 11, {
    bold: true, align: 'center', multiline: true, label: 'Nama instansi', placeholder: 'NAMA INSTANSI'
  });

  let yy = y;
  for (const r of rightRows) {
    r.draw(yy);
    yy += r.h;
  }
  y += blockH;

  // Pasangan bagian (kiri | kanan)
  const pairs = [
    ['dasarHukum', 'DASAR HUKUM', 'kualifikasi', 'KUALIFIKASI PELAKSANA'],
    ['keterkaitan', 'KETERKAITAN', 'peralatan', 'PERALATAN/PERLENGKAPAN'],
    ['peringatan', 'PERINGATAN', 'pencatatan', 'PENCATATAN DAN PENDATAAN']
  ];
  const rightW = labelW + valW;
  for (const [lk, lt, rk, rt] of pairs) {
    const L = listBlock(doc.sections[lk], lk, leftW, S);
    const R = listBlock(doc.sections[rk], rk, rightW, S);
    const headH = 7;
    const bodyH = Math.max(8, L.h, R.h);
    const h = headH + bodyH;
    if (y + h > PH - m && y > m + 1) {
      page = newPage(pages);
      y = m;
    }
    page.items.push(rect(m, y, leftW, headH), rect(xLab, y, rightW, headH));
    page.items.push(text(m + pad, y + 1.4, [lt], S, { bold: true }), text(xLab + pad, y + 1.4, [rt], S, { bold: true }));
    page.items.push(rect(m, y + headH, leftW, bodyH), rect(xLab, y + headH, rightW, bodyH));
    L.draw(page, m, y + headH);
    R.draw(page, xLab, y + headH);
    for (const [key, title, x0, w] of [[lk, lt, m, leftW], [rk, rt, xLab, rightW]]) {
      page.fields.push({ id: 'sh:' + key, kind: 'section', key, title, x: x0, y, w, h: headH });
      if (!doc.sections[key].items.length) page.fields.push({ id: 'sb:' + key, kind: 'empty', key, title, x: x0, y: y + headH, w, h: bodyH });
    }
    y += h;
  }
}

function listBlock(section, key, width, S) {
  const pad = 1.4;
  const numW = section.numbered ? 5 : 0;
  const items = section.items.map((t) => wrap(t, S, false, width - 2 * pad - numW));
  const gap = 0.5;
  let h = 2 * pad;
  for (const l of items) h += Math.max(1, l.length) * lineHeight(S) + gap;
  return {
    h: items.length ? h : 0,
    draw(page, x, y) {
      let yy = y + pad;
      items.forEach((lines, i) => {
        if (section.numbered) page.items.push(text(x + pad, yy, [String(i + 1)], S));
        page.items.push(text(x + pad + numW, yy, lines, S));
        const h = Math.max(1, lines.length) * lineHeight(S);
        page.fields.push({ id: `s:${key}:${i}`, kind: 'item', key, index: i, x: x + pad + numW, y: yy, w: width - 2 * pad - numW, h, pad: 0, size: S, align: 'left' });
        yy += h + gap;
      });
    }
  };
}

// ---------------------------------------------------------------------------
// Halaman diagram alir
// ---------------------------------------------------------------------------

function layoutFlow(doc, pages) {
  const { m, w: PW, h: PH } = PAGE;
  const W = PW - 2 * m;
  const actors = doc.actors;
  const n = Math.max(1, actors.length);
  const TS = 9;
  const HS = 9;
  const pad = 1.2;

  // Lebar kolom
  const col = { no: 8, keg: 48, kel: 26, wkt: 16, out: 26, ket: 46 };
  const fixed = () => Object.values(col).reduce((a, b) => a + b, 0);
  const minAct = 16;
  const deficit = Math.max(0, minAct * n - (W - fixed()));
  if (deficit > 0) {
    const room = { keg: col.keg - 26, ket: col.ket - 26, kel: col.kel - 18, out: col.out - 18 };
    const total = Object.values(room).reduce((a, b) => a + b, 0);
    const take = Math.min(deficit, total);
    for (const k of Object.keys(room)) col[k] -= (take * room[k]) / total;
  }
  const actW = (W - fixed()) / n;
  const x = {};
  x.no = m;
  x.keg = x.no + col.no;
  x.act = x.keg + col.keg;
  x.kel = x.act + actW * n;
  x.wkt = x.kel + col.kel;
  x.out = x.wkt + col.wkt;
  x.ket = x.out + col.out;
  x.end = x.ket + col.ket;

  // Header tabel
  const actorLines = actors.map((a) => wrap(a.name, HS, true, actW - 2));
  const H1 = 6.5;
  const H2 = Math.max(8, Math.max(0, ...actorLines.map((l) => textH(l, HS))) + 2 * pad);
  const headerH = H1 + H2;
  const drawHeader = (page) => {
    const y = m;
    const it = page.items;
    const cell = (cx, cy, w, h, label, italic = false) => {
      it.push(rect(cx, cy, w, h));
      const lines = Array.isArray(label) ? label : wrap(label, HS, true, w - 2);
      it.push(text(cx + w / 2, cy + (h - textH(lines, HS)) / 2, lines, HS, { bold: true, italic, align: 'center' }));
    };
    cell(x.no, y, col.no, headerH, 'No.');
    cell(x.keg, y, col.keg, headerH, 'Kegiatan');
    cell(x.act, y, actW * n, H1, 'Pelaksana');
    actors.forEach((a, i) => {
      const cx = x.act + i * actW;
      cell(cx, y + H1, actW, H2, actorLines[i]);
      const fh = Math.max(1, actorLines[i].length) * lineHeight(HS);
      // `hot`: isian yang sekelompok; alat kelompok tampil saat salah satunya disorot.
      const hot = 'a:' + a.id;
      page.fields.push(
        { id: 'at:' + a.id, kind: 'actor-tools', hot, actor: a.id, index: i, x: cx, y: y + H1, w: actW, h: H2 },
        {
          id: 'a:' + a.id, kind: 'text', hot, actor: a.id, key: 'name', x: cx + 1, y: y + H1 + (H2 - fh) / 2, w: actW - 2, h: fh,
          pad: 0, size: HS, bold: true, align: 'center', label: `Pelaksana ${i + 1}`, placeholder: 'Pelaksana'
        }
      );
    });
    cell(x.kel, y, col.kel + col.wkt + col.out, H1, 'Mutu Baku');
    cell(x.kel, y + H1, col.kel, H2, 'Kelengkapan');
    cell(x.wkt, y + H1, col.wkt, H2, 'Waktu');
    cell(x.out, y + H1, col.out, H2, 'Output', true); // istilah asing ditulis miring
    cell(x.ket, y, col.ket, headerH, 'Keterangan');
  };
  const colBounds = [
    [x.no, col.no], [x.keg, col.keg],
    ...actors.map((_, i) => [x.act + i * actW, actW]),
    [x.kel, col.kel], [x.wkt, col.wkt], [x.out, col.out], [x.ket, col.ket]
  ];
  const drawBand = (page, y) => {
    for (const [cx, w] of colBounds) page.items.push(rect(cx, y, w, BAND));
  };

  // Ukuran baris & bentuk
  const steps = doc.steps;
  const actorIdx = new Map(actors.map((a, i) => [a.id, i]));
  const shapeSize = (shape) =>
    shape === 'decision' ? { w: Math.min(actW * 0.7, 22), h: 8 } : { w: Math.min(actW * 0.62, 20), h: 5.5 };

  const rows = steps.map((s, i) => {
    const cells = {
      no: wrap(String(i + 1), TS, false, col.no - 2 * pad),
      keg: wrap(s.kegiatan, TS, false, col.keg - 2 * pad),
      kel: wrap(s.kelengkapan, TS, false, col.kel - 2 * pad),
      wkt: wrap(s.waktu, TS, false, col.wkt - 2 * pad),
      out: wrap(s.output, TS, false, col.out - 2 * pad),
      ket: wrap(s.keterangan, TS, false, col.ket - 2 * pad)
    };
    const size = shapeSize(s.shape);
    const textNeed = Math.max(...Object.values(cells).map((l) => textH(l, TS))) + 2 * pad;
    return { step: s, cells, size, col: actorIdx.get(s.actor) ?? 0, h: Math.max(textNeed, size.h + 7, 12.5) };
  });

  // Paginasi (selalu sisakan ruang untuk dua pita konektor)
  const avail = PH - 2 * m - headerH - 2 * BAND;
  const pageOf = [];
  let p = 0;
  let used = 0;
  rows.forEach((r, i) => {
    if (used > 0 && used + r.h > avail) {
      p++;
      used = 0;
    }
    pageOf[i] = p;
    used += r.h;
  });
  const nPages = rows.length ? p + 1 : 1;

  // Sisi-sisi diagram
  const idx = new Map(steps.map((s, i) => [s.id, i]));
  const edges = [];
  steps.forEach((s, i) => {
    let to = s.next === 'auto' ? (i + 1 < steps.length ? i + 1 : null) : s.next === 'none' ? null : idx.get(s.next) ?? null;
    const dec = s.shape === 'decision';
    if (to !== null && to !== i) edges.push({ from: i, to, alt: false, label: dec ? s.yesLabel : '' });
    if (dec && s.alt) {
      const a = idx.get(s.alt);
      if (a !== undefined && a !== i) edges.push({ from: i, to: a, alt: true, label: s.noLabel });
    }
  });

  const top = Array(nPages).fill(false);
  const bot = Array(nPages).fill(false);
  for (const e of edges) {
    const ps = pageOf[e.from];
    const pd = pageOf[e.to];
    if (pd > ps) (bot[ps] = true), (top[pd] = true);
    else if (pd < ps) (top[ps] = true), (bot[pd] = true);
  }

  // Posisi baris
  const pageObjs = [];
  const bodyTop = m + headerH;
  const bandBottomY = [];
  for (let q = 0; q < nPages; q++) pageObjs.push(newPage(pages));
  const rowY = [];
  {
    const yCur = pageObjs.map((_, q) => bodyTop + (top[q] ? BAND : 0));
    rows.forEach((r, i) => {
      rowY[i] = yCur[pageOf[i]];
      yCur[pageOf[i]] += r.h;
    });
    yCur.forEach((y, q) => (bandBottomY[q] = y));
  }

  // Gambar tabel
  pageObjs.forEach((page, q) => {
    drawHeader(page);
    if (top[q]) drawBand(page, bodyTop);
    if (bot[q]) drawBand(page, bandBottomY[q]);
  });
  if (!rows.length) pageObjs[0].fields.push({ id: 'st:add', kind: 'add-step', x: x.no, y: bodyTop, w: x.end - x.no, h: 12.5 });
  rows.forEach((r, i) => {
    const page = pageObjs[pageOf[i]];
    const y = rowY[i];
    for (const [cx, w] of colBounds) page.items.push(rect(cx, y, w, r.h));
    const put = (key, cx) => page.items.push(text(cx + pad, y + pad, r.cells[key], TS));
    page.items.push(text(x.no + col.no / 2, y + pad, r.cells.no, TS, { align: 'center' }));
    put('keg', x.keg);
    put('kel', x.kel);
    put('wkt', x.wkt);
    put('out', x.out);
    put('ket', x.ket);

    // Isian langsung: sel teks langkah, dan sel lajur pelaksana lain untuk memindahkan bentuk.
    // Alas sebaris penuh (paling bawah) menampung tombol tambah/hapus kegiatan.
    const sid = r.step.id;
    const hot = 'r:' + sid;
    page.fields.push({ id: `sr:${sid}`, kind: 'step-tools', hot, step: sid, index: i, x: x.no, y, w: x.end - x.no, h: r.h });
    for (const [c, key, label] of CELL_FIELDS) {
      page.fields.push({
        id: `st:${sid}:${key}`, kind: 'text', hot, step: sid, key, x: x[c] + pad, y: y + pad, w: col[c] - 2 * pad, h: r.h - 2 * pad,
        pad: 0, size: TS, bold: false, align: 'left', multiline: true, label: `Langkah ${i + 1} · ${label}`
      });
    }
    actors.forEach((a, j) => {
      if (j !== r.col) page.fields.push({ id: `ln:${sid}:${a.id}`, kind: 'lane', hot, step: sid, actor: a.id, name: a.name, x: x.act + j * actW, y, w: actW, h: r.h });
    });
  });

  // Kotak bentuk
  const box = rows.map((r, i) => {
    const cx = x.act + (r.col + 0.5) * actW;
    const cy = rowY[i] + r.h / 2;
    const { w, h } = r.size;
    return { cx, cy, w, h, top: cy - h / 2, bottom: cy + h / 2, shape: r.step.shape };
  });
  // Isian bentuk: diklik untuk mengganti simbol dan tujuan alurnya.
  rows.forEach((r, i) => {
    const b = box[i];
    const sid = r.step.id;
    pageObjs[pageOf[i]].fields.push({ id: `sy:${sid}`, kind: 'shape', hot: 'r:' + sid, step: sid, index: i, x: b.cx - b.w / 2 - 1, y: b.top - 1, w: b.w + 2, h: b.h + 2 });
  });
  // Konektor: tiap garis dirutekan di kisi ortogonal per halaman (lihat findPath) sehingga
  // menghindari bentuk dan tidak menumpuk dengan garis lain.
  const lines = pageObjs.map(() => []);
  const labels = pageObjs.map(() => []);
  let letter = 0;
  const R = 2.5;

  const colXs = [];
  const connXs = [];
  for (let j = 0; j < n; j++) {
    const c0 = x.act + j * actW;
    const c = c0 + actW / 2;
    colXs.push(c, c0 + 1.2, c0 + 2.4, c0 + actW - 1.2, c0 + actW - 2.4);
    for (const sz of [shapeSize('decision'), shapeSize('process')]) colXs.push(c - sz.w / 2 - 1, c + sz.w / 2 + 1);
    connXs.push(c);
    if (5.8 + R <= actW / 2 - 0.4) connXs.push(c - 5.8, c + 5.8);
  }
  const topPortY = bodyTop + BAND / 2 + R; // ujung bawah konektor di pita atas
  const botPortY = (q) => bandBottomY[q] + BAND / 2 - R; // ujung atas konektor di pita bawah
  const grids = pageObjs.map((_, q) => {
    const ids = rows.map((_, i) => i).filter((i) => pageOf[i] === q);
    const xs = [...colXs];
    const ys = [];
    for (const i of ids) {
      const t = rowY[i];
      const h = rows[i].h;
      ys.push(t + 1, t + h - 1, t + h - 2, box[i].cy);
      for (const p of [...boxPorts(box[i], true), ...boxPorts(box[i], false)]) xs.push(p.x), ys.push(p.y);
    }
    if (top[q]) xs.push(...connXs), ys.push(topPortY);
    if (bot[q]) xs.push(...connXs), ys.push(botPortY(q));
    return makeGrid(xs, ys, ids.map((i) => box[i]), ids.length ? rowY[ids[0]] : bodyTop, bandBottomY[q]);
  });
  const bands = pageObjs.map(() => ({ top: [], bot: [] }));
  const connPorts = (used, y, d, prefX) => {
    const free = connXs.filter((cx) => used.every((u) => Math.abs(u - cx) >= 2 * R + 0.8));
    return (free.length ? free : connXs).map((cx) => ({
      x: cx, y, d, cost: (free.length ? 0 : OVER) + (prefX == null || Math.abs(cx - prefX) < 0.01 ? 0 : 4)
    }));
  };
  // Biaya titik sambung: alur utama keluar dari bawah dan masuk dari atas; cabang "tidak" keluar dari samping;
  // garis balik keluar dari samping dan masuk dari bawah/samping.
  const exits = (b, fwdMain) => boxPorts(b, false).map((p) => ({ ...p, cost: p.side === 'bottom' ? (fwdMain ? 0 : 6) : fwdMain ? 20 : 0 }));
  const entries = (b, forward) => boxPorts(b, true).map((p) => ({
    ...p, cost: p.off * 0.4 + (forward ? { top: 0, left: 14, right: 14, bottom: 20 } : { top: 15, left: 3, right: 3, bottom: 3 })[p.side]
  }));

  const order = edges.map((_, k) => k).sort((a, b) => {
    const A = edges[a];
    const B = edges[b];
    return A.alt - B.alt || (A.to < A.from) - (B.to < B.from) || Math.abs(A.to - A.from) - Math.abs(B.to - B.from) || a - b;
  });
  for (const k of order) {
    const e = edges[k];
    const s = box[e.from];
    const d = box[e.to];
    const ps = pageOf[e.from];
    const pd = pageOf[e.to];
    const forward = e.to > e.from;
    const starts = exits(s, forward && !e.alt);

    let first;
    if (ps === pd) {
      first = findPath(grids[ps], starts, entries(d, forward)) ?? [[s.cx, s.bottom], [d.cx, d.top]];
      lines[ps].push(first);
    } else {
      const tag = String.fromCharCode(65 + (letter++ % 26)) + (letter > 26 ? Math.floor((letter - 1) / 26) : '');
      const [srcUsed, srcY, srcD, dstUsed, dstY, dstD] = forward
        ? [bands[ps].bot, botPortY(ps), 1, bands[pd].top, topPortY, 1]
        : [bands[ps].top, topPortY, 3, bands[pd].bot, botPortY(pd), 3];
      first = findPath(grids[ps], starts, connPorts(srcUsed, srcY, srcD)) ?? [[s.cx, s.bottom], [s.cx, srcY]];
      const x1 = first.at(-1)[0];
      srcUsed.push(x1);
      lines[ps].push(first);
      labels[ps].push(...connector(x1, srcY + (forward ? R : -R), R, tag));
      const second = findPath(grids[pd], connPorts(dstUsed, dstY, dstD, x1), entries(d, forward)) ?? [[x1, dstY], [d.cx, d.top]];
      const x2 = second[0][0];
      dstUsed.push(x2);
      lines[pd].push(second);
      labels[pd].push(...connector(x2, dstY + (forward ? -R : R), R, tag));
    }

    // Label cabang diletakkan di sisi yang tidak dilalui ruas kedua garis.
    if (e.label) {
      const [P, Q, T] = first;
      const dir = Math.sign(Q[0] - P[0]);
      const lh = lineHeight(7);
      if (dir) {
        const below = T && T[1] < Q[1];
        labels[ps].push(text(P[0] + dir * 0.8, below ? P[1] + 0.6 : P[1] - 0.6 - lh, [e.label], 7, { align: dir > 0 ? 'left' : 'right', color: FLOW }));
      } else {
        const left = T && T[0] > Q[0] && Q[1] - P[1] < lh + 1;
        labels[ps].push(text(P[0] + (left ? -1 : 1), P[1] + 0.4, [e.label], 7, { align: left ? 'right' : 'left', color: FLOW }));
      }
    }
  }

  pageObjs.forEach((page, q) => {
    for (const pts of lines[q]) page.items.push(...arrowLine(pts));
  });
  rows.forEach((r, i) => pageObjs[pageOf[i]].items.push(shapeItem(box[i])));
  pageObjs.forEach((page, q) => page.items.push(...labels[q]));
}

const CELL_FIELDS = [
  ['keg', 'kegiatan', 'Kegiatan'],
  ['kel', 'kelengkapan', 'Kelengkapan'],
  ['wkt', 'waktu', 'Waktu'],
  ['out', 'output', 'Output'],
  ['ket', 'keterangan', 'Keterangan']
];

// ---------------------------------------------------------------------------
// Perutean garis
// ---------------------------------------------------------------------------
// Kisi dibentuk dari koordinat penting (tengah & tepi lajur, titik sambung bentuk, celah antarbaris).
// Jalur dicari dengan Dijkstra (biaya = panjang + belokan). Ruas atau titik belok yang sudah dipakai
// garis lain diberi penalti besar dan setiap titik sambung hanya dipakai satu garis, sehingga garis
// tidak menumpuk; persilangan hanya diberi penalti kecil.

const BEND = 6;
const OVER = 400;
const CROSS = 2;
const snap = (v) => Math.round(v * 100) / 100;

function insideBox(b, px, py, mg) {
  const dx = Math.abs(px - b.cx);
  const dy = Math.abs(py - b.cy);
  if (b.shape === 'decision') return dx / (b.w / 2 + mg) + dy / (b.h / 2 + mg) < 1;
  return dx < b.w / 2 + mg && dy < b.h / 2 + mg;
}

/** Titik sambung bentuk. d = arah gerak garis di titik itu (0 kanan, 1 bawah, 2 kiri, 3 atas). */
function boxPorts(b, entry) {
  const dec = b.shape === 'decision';
  const along = entry && !dec ? [0, -2, 2, -4, 4].filter((o) => Math.abs(o) <= b.w / 2 - 1.2) : [0];
  const across = entry && !dec ? [0, -1.5, 1.5] : [0];
  const ports = [];
  for (const o of along) {
    ports.push({ side: 'bottom', x: b.cx + o, y: b.bottom, d: entry ? 3 : 1, off: Math.abs(o) });
    if (entry) ports.push({ side: 'top', x: b.cx + o, y: b.top, d: 1, off: Math.abs(o) });
  }
  for (const o of across) {
    ports.push({ side: 'left', x: b.cx - b.w / 2, y: b.cy + o, d: entry ? 0 : 2, off: Math.abs(o) });
    ports.push({ side: 'right', x: b.cx + b.w / 2, y: b.cy + o, d: entry ? 2 : 0, off: Math.abs(o) });
  }
  return ports;
}

function makeGrid(xsIn, ysIn, boxes, yMin, yMax) {
  const xs = [...new Set(xsIn.map(snap))].sort((a, b) => a - b);
  const ys = [...new Set(ysIn.map(snap))].sort((a, b) => a - b);
  const nx = xs.length;
  const ny = ys.length;
  const N = nx * ny;
  const xi = new Map(xs.map((v, i) => [v, i]));
  const yi = new Map(ys.map((v, i) => [v, i]));
  const hit = (px, py, mg) => boxes.some((b) => insideBox(b, px, py, mg));
  const blocked = new Uint8Array(N);
  const badH = new Uint8Array(N);
  const badV = new Uint8Array(N);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      // 2 = di dalam bentuk/di luar area baris (tak bisa dilewati; titik sambung hanya jadi awal/tujuan);
      // 1 = terlalu dekat tepi bentuk: boleh dilewati lurus, tidak boleh berbelok.
      blocked[k] = ys[j] < yMin || ys[j] > yMax || hit(xs[i], ys[j], 0.05) ? 2 : hit(xs[i], ys[j], 0.6) ? 1 : 0;
      if (i + 1 < nx) badH[k] = hit((xs[i] + xs[i + 1]) / 2, ys[j], 0) ? 1 : 0;
      if (j + 1 < ny) badV[k] = hit(xs[i], (ys[j] + ys[j + 1]) / 2, 0) ? 1 : 0;
    }
  }
  return {
    xs, ys, nx, ny, N, yMax, blocked, badH, badV,
    edgeH: new Uint8Array(N), edgeV: new Uint8Array(N), pass: new Uint8Array(N), ports: new Set(),
    node: (px, py) => yi.get(snap(py)) * nx + xi.get(snap(px))
  };
}

/** Jalur termurah dari salah satu `starts` ke salah satu `goals`; ditandai terpakai pada kisi. */
function findPath(g, starts, goals) {
  const S = g.N * 4;
  const avail = (list) => {
    const free = list.filter((p) => !g.ports.has(g.node(p.x, p.y)));
    return free.length ? free : list.map((p) => ({ ...p, cost: p.cost + OVER }));
  };
  starts = avail(starts);
  goals = avail(goals);
  const goalAt = new Map();
  goals.forEach((p, k) => {
    const key = g.node(p.x, p.y) * 4 + p.d;
    if (!goalAt.has(key) || goals[goalAt.get(key)].cost > p.cost) goalAt.set(key, k);
  });
  const dist = new Float64Array(S + goals.length).fill(Infinity);
  const prev = new Int32Array(S + goals.length).fill(-1);
  const heap = new Heap();
  for (const p of starts) {
    const st = g.node(p.x, p.y) * 4 + p.d;
    if (p.cost < dist[st]) (dist[st] = p.cost), heap.push(p.cost, st);
  }
  let end = -1;
  while (heap.size) {
    const [c, st] = heap.pop();
    if (c > dist[st]) continue;
    if (st >= S) {
      end = st;
      break;
    }
    const nd0 = st & 3;
    const k = st >> 2;
    const i = k % g.nx;
    const j = (k - i) / g.nx;
    for (let nd = 0; nd < 4; nd++) {
      if (nd === (nd0 + 2) % 4) continue;
      const turn = nd !== nd0;
      if (turn && g.blocked[k]) continue;
      let m, bad, used, len;
      if (nd === 0) {
        if (i + 1 >= g.nx) continue;
        (m = k + 1), (bad = g.badH[k]), (used = g.edgeH[k]), (len = g.xs[i + 1] - g.xs[i]);
      } else if (nd === 2) {
        if (i === 0) continue;
        (m = k - 1), (bad = g.badH[m]), (used = g.edgeH[m]), (len = g.xs[i] - g.xs[i - 1]);
      } else if (nd === 1) {
        if (j + 1 >= g.ny) continue;
        (m = k + g.nx), (bad = g.badV[k]), (used = g.edgeV[k]), (len = g.ys[j + 1] - g.ys[j]);
      } else {
        if (j === 0) continue;
        (m = k - g.nx), (bad = g.badV[m]), (used = g.edgeV[m]), (len = g.ys[j] - g.ys[j - 1]);
      }
      if (bad) continue;
      let nc = c + len + (used ? OVER : 0);
      if (turn) nc += BEND + (g.pass[k] ? OVER : 0);
      else if (g.pass[k] & (nd % 2 ? 1 : 2)) nc += CROSS;
      // Pemecah seri: ruas mendatar lebih disukai di bawah (belok dekat tujuan pada alur turun).
      if (nd % 2 === 0) nc += len * (g.yMax - g.ys[j]) * 1e-4;
      const gk = goalAt.get(m * 4 + nd);
      if (gk !== undefined) {
        const gc = nc + goals[gk].cost;
        if (gc < dist[S + gk]) (dist[S + gk] = gc), (prev[S + gk] = st), heap.push(gc, S + gk);
      }
      if (g.blocked[m] === 2) continue;
      if (g.blocked[m]) nc += CROSS;
      const t = m * 4 + nd;
      if (nc < dist[t]) (dist[t] = nc), (prev[t] = st), heap.push(nc, t);
    }
  }
  if (end < 0) return null;

  const goal = goals[end - S];
  const nodes = [g.node(goal.x, goal.y)];
  for (let st = prev[end]; st >= 0; st = prev[st]) nodes.push(st >> 2);
  nodes.reverse();
  const pt = (k) => [g.xs[k % g.nx], g.ys[Math.floor(k / g.nx)]];
  const pts = [pt(nodes[0])];
  for (let q = 1; q < nodes.length; q++) {
    const a = nodes[q - 1];
    const b = nodes[q];
    const horiz = Math.abs(a - b) === 1;
    if (horiz) g.edgeH[Math.min(a, b)] = 1;
    else g.edgeV[Math.min(a, b)] = 1;
    g.pass[a] |= horiz ? 1 : 2;
    g.pass[b] |= horiz ? 1 : 2;
    const c = nodes[q + 1];
    if (c === undefined || (Math.abs(b - c) === 1) !== horiz) pts.push(pt(b));
  }
  g.ports.add(nodes[0]);
  g.ports.add(nodes.at(-1));
  return pts;
}

class Heap {
  c = [];
  v = [];
  get size() {
    return this.c.length;
  }
  push(cost, val) {
    const { c, v } = this;
    let i = c.length;
    c.push(cost);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (c[p] <= cost) break;
      (c[i] = c[p]), (v[i] = v[p]), (i = p);
    }
    (c[i] = cost), (v[i] = val);
  }
  pop() {
    const { c, v } = this;
    const top = [c[0], v[0]];
    const lc = c.pop();
    const lv = v.pop();
    if (c.length) {
      let i = 0;
      for (;;) {
        let s = 2 * i + 1;
        if (s >= c.length) break;
        if (s + 1 < c.length && c[s + 1] < c[s]) s++;
        if (c[s] >= lc) break;
        (c[i] = c[s]), (v[i] = v[s]), (i = s);
      }
      (c[i] = lc), (v[i] = lv);
    }
    return top;
  }
}

function arrowLine(pts) {
  const clean = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.01);
  if (clean.length < 2) return [];
  const [a, b] = clean.slice(-2);
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = (b[0] - a[0]) / len;
  const uy = (b[1] - a[1]) / len;
  const L = Math.min(2, len);
  const Wd = 0.9;
  const base = [b[0] - ux * L, b[1] - uy * L];
  const shaft = [...clean.slice(0, -1), base];
  return [
    { t: 'poly', pts: shaft, stroke: FLOW, lw: 0.3 },
    { t: 'poly', pts: [b, [base[0] - uy * Wd, base[1] + ux * Wd], [base[0] + uy * Wd, base[1] - ux * Wd]], closed: true, fill: FLOW, stroke: FLOW, lw: 0.1 }
  ];
}

// Konektor antarhalaman: segilima menunjuk ke bawah (garis masuk di sisi atas, keluar dari ujung bawah).
function connector(cx, cy, r, tag) {
  const shoulder = cy + r * 0.25;
  const pts = [[cx - r, cy - r], [cx + r, cy - r], [cx + r, shoulder], [cx, cy + r], [cx - r, shoulder]];
  return [
    { t: 'poly', closed: true, pts, stroke: FLOW, fill: '#ffffff', lw: 0.3 },
    text(cx, cy - r * 0.2 - lineHeight(7) / 2, [tag], 7, { bold: true, align: 'center', color: FLOW })
  ];
}

function shapeItem(b) {
  const style = { stroke: FLOW, fill: '#ffffff', lw: 0.35 };
  if (b.shape === 'decision') {
    return { t: 'poly', closed: true, pts: [[b.cx, b.top], [b.cx + b.w / 2, b.cy], [b.cx, b.bottom], [b.cx - b.w / 2, b.cy]], ...style };
  }
  return { t: 'rect', x: b.cx - b.w / 2, y: b.top, w: b.w, h: b.h, r: b.shape === 'terminator' ? b.h / 2 : 0, ...style };
}
