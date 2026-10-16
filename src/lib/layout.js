// Mesin tata letak: mengubah dokumen SOP menjadi daftar halaman berisi primitif gambar
// (rect, poly, circle, text, image). Hasil yang sama dirender ke SVG (pratinjau) dan
// ke jsPDF (ekspor), sehingga pratinjau identik dengan PDF. Semua satuan dalam mm.
import { jsPDF } from 'jspdf';
import { FONT, registerFonts } from './fonts.js';
import { formatTanggal } from './model.js';

export const PAGE = { w: 297, h: 210, m: 10 };
export const PT = 25.4 / 72;
const LH = 1.2;

const INK = '#000000';
const FLOW = '#2f5597';
const BORDER = 0.25;
const BAND = 7; // pita untuk konektor antarhalaman

let measurer = null;

export const lineHeight = (size) => size * PT * LH;
/** Posisi baseline baris ke-i dari item teks (dipakai kedua renderer). */
export const baseline = (item, i) => item.y + i * lineHeight(item.size) + item.size * PT * 0.86;

function wrap(text, size, bold, width) {
  const t = String(text ?? '').replace(/\r/g, '');
  if (!t.trim()) return [];
  if (!measurer) {
    measurer = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    registerFonts(measurer);
  }
  measurer.setFont(FONT, bold ? 'bold' : 'normal');
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
  const p = { w: PAGE.w, h: PAGE.h, items: [] };
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

  // Baris-baris kanan
  const simple = (label, value, bold = false) => {
    const lines = wrap(value, S, bold, valW - 2 * pad);
    const labLines = wrap(label, S, true, labelW - 2 * pad);
    const h = Math.max(7, Math.max(textH(lines, S), textH(labLines, S)) + 2 * pad);
    return { h, draw: (yy) => {
      page.items.push(rect(xLab, yy, labelW, h), rect(xVal, yy, valW, h));
      page.items.push(text(xLab + pad, yy + pad, labLines, S, { bold: true }));
      page.items.push(text(xVal + pad, yy + pad, lines, S, { bold }));
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
    }
  };

  const rightRows = [
    simple('NOMOR SOP', hd.nomor),
    simple('TGL PEMBUATAN', formatTanggal(hd.tglPembuatan)),
    simple('TGL REVISI', hd.tglRevisi),
    simple('TGL EFEKTIF', formatTanggal(hd.tglEfektif)),
    signRow,
    simple('NAMA SOP', hd.namaSop, true)
  ];
  const blockH = rightRows.reduce((a, r) => a + r.h, 0);

  // Blok kiri: logo + nama instansi
  page.items.push(rect(m, y, leftW, blockH));
  const inst = wrap(hd.institution, 11, true, leftW - 8);
  const instH = textH(inst, 11);
  const logoAreaTop = y + 3;
  const logoAreaBottom = y + blockH - instH - 4;
  const logoMaxH = Math.min(44, logoAreaBottom - logoAreaTop);
  if (hd.logo) {
    const f = fit(hd.logo, 60, logoMaxH);
    page.items.push({ t: 'image', src: hd.logo.src, x: m + (leftW - f.w) / 2, y: logoAreaTop + (logoAreaBottom - logoAreaTop - f.h) / 2, w: f.w, h: f.h });
  } else {
    const s = Math.min(30, logoMaxH);
    page.items.push({ t: 'placeholder', x: m + (leftW - s) / 2, y: logoAreaTop + (logoAreaBottom - logoAreaTop - s) / 2, w: s, h: s, label: 'Logo' });
  }
  page.items.push(text(m + leftW / 2, y + blockH - instH - 2, inst, 11, { bold: true, align: 'center' }));

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
    const L = listBlock(doc.sections[lk], leftW, S);
    const R = listBlock(doc.sections[rk], rightW, S);
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
    y += h;
  }
}

function listBlock(section, width, S) {
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
        yy += Math.max(1, lines.length) * lineHeight(S) + gap;
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
    const cell = (cx, cy, w, h, label) => {
      it.push(rect(cx, cy, w, h));
      const lines = Array.isArray(label) ? label : wrap(label, HS, true, w - 2);
      it.push(text(cx + w / 2, cy + (h - textH(lines, HS)) / 2, lines, HS, { bold: true, align: 'center' }));
    };
    cell(x.no, y, col.no, headerH, 'No');
    cell(x.keg, y, col.keg, headerH, 'Kegiatan');
    cell(x.act, y, actW * n, H1, 'Pelaksana');
    actors.forEach((a, i) => cell(x.act + i * actW, y + H1, actW, H2, actorLines[i]));
    cell(x.kel, y, col.kel + col.wkt + col.out, H1, 'Mutu Baku');
    cell(x.kel, y + H1, col.kel, H2, 'Kelengkapan');
    cell(x.wkt, y + H1, col.wkt, H2, 'Waktu');
    cell(x.out, y + H1, col.out, H2, 'Output');
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
  rows.forEach((r, i) => {
    const page = pageObjs[pageOf[i]];
    const y = rowY[i];
    for (const [cx, w] of colBounds) page.items.push(rect(cx, y, w, r.h));
    const put = (key, cx) => page.items.push(text(cx + pad, y + pad, r.cells[key], TS));
    put('no', x.no);
    put('keg', x.keg);
    put('kel', x.kel);
    put('wkt', x.wkt);
    put('out', x.out);
    put('ket', x.ket);
  });

  // Kotak bentuk
  const box = rows.map((r, i) => {
    const cx = x.act + (r.col + 0.5) * actW;
    const cy = rowY[i] + r.h / 2;
    const { w, h } = r.size;
    return { cx, cy, w, h, top: cy - h / 2, bottom: cy + h / 2, col: r.col, shape: r.step.shape, lane: cx + Math.max(w / 2 + 1.5, actW / 2 - 1.5) };
  });
  const entryBottomY = (b, ex) => (b.shape === 'decision' ? b.cy + (b.h / 2) * (1 - (2 * Math.abs(ex - b.cx)) / b.w) : b.bottom);

  // Konektor
  const lines = pageObjs.map(() => []);
  const labels = pageObjs.map(() => []);
  let letter = 0;
  const R = 2;

  for (const e of edges) {
    const s = box[e.from];
    const d = box[e.to];
    const ps = pageOf[e.from];
    const pd = pageOf[e.to];
    const forward = e.to > e.from;
    const sameCol = s.col === d.col;
    const blocked = forward && sameCol && rows.slice(e.from + 1, e.to).some((r) => r.col === s.col);
    const sideExit = e.alt || !forward || blocked;
    const dir = d.col < s.col ? -1 : 1;
    const P = sideExit ? [s.cx + (dir * s.w) / 2, s.cy] : [s.cx, s.bottom];
    // Masuk dari bawah target, sedikit bergeser ke arah sumber agar tidak menumpuk dengan garis keluar target.
    const backOff = Math.min(d.w / 2 - 1, Math.max(d.w * 0.25, 2 * R + 0.6));
    const backX = sameCol ? s.lane : d.cx + (s.col > d.col ? 1 : -1) * backOff;

    if (e.label) {
      if (sideExit) labels[ps].push(text(P[0] + dir * 0.8, P[1] - 0.6 - lineHeight(7), [e.label], 7, { align: dir > 0 ? 'left' : 'right', color: FLOW }));
      else labels[ps].push(text(P[0] + 1, P[1] + 0.4, [e.label], 7, { color: FLOW }));
    }

    if (ps === pd) {
      let pts;
      if (forward && !sideExit) pts = zDown(P, [d.cx, d.top]);
      else if (forward && !sameCol) pts = [P, [d.cx, P[1]], [d.cx, d.top]];
      else if (sameCol) pts = [P, [s.lane, P[1]], [s.lane, d.cy], [d.cx + d.w / 2, d.cy]];
      else pts = [P, [backX, P[1]], [backX, entryBottomY(d, backX)]];
      lines[ps].push(pts);
      continue;
    }

    const tag = String.fromCharCode(65 + (letter++ % 26)) + (letter > 26 ? Math.floor((letter - 1) / 26) : '');
    if (forward) {
      const x1 = !sideExit ? s.cx : sameCol ? s.lane : d.cx;
      const c1 = bandBottomY[ps] + BAND / 2;
      lines[ps].push(sideExit ? [P, [x1, P[1]], [x1, c1 - R]] : [P, [x1, c1 - R]]);
      labels[ps].push(...connector(x1, c1, R, tag));
      const c2 = bodyTop + BAND / 2;
      const S0 = [x1, c2 + R];
      let pts;
      if (Math.abs(x1 - d.cx) < 0.01) pts = [S0, [d.cx, d.top]];
      else if (sameCol) pts = [S0, [x1, d.cy], [d.cx + d.w / 2, d.cy]];
      else pts = zDown(S0, [d.cx, d.top]);
      lines[pd].push(pts);
      labels[pd].push(...connector(x1, c2, R, tag));
    } else {
      const x1 = backX;
      const c1 = bodyTop + BAND / 2;
      lines[ps].push([P, [x1, P[1]], [x1, c1 + R]]);
      labels[ps].push(...connector(x1, c1, R, tag));
      const c2 = bandBottomY[pd] + BAND / 2;
      const S0 = [x1, c2 - R];
      lines[pd].push(sameCol ? [S0, [x1, d.cy], [d.cx + d.w / 2, d.cy]] : [S0, [x1, entryBottomY(d, x1)]]);
      labels[pd].push(...connector(x1, c2, R, tag));
    }
  }

  pageObjs.forEach((page, q) => {
    for (const pts of lines[q]) page.items.push(...arrowLine(pts));
  });
  rows.forEach((r, i) => pageObjs[pageOf[i]].items.push(shapeItem(box[i])));
  pageObjs.forEach((page, q) => page.items.push(...labels[q]));
}

function zDown(P, Q) {
  if (Math.abs(P[0] - Q[0]) < 0.01) return [P, Q];
  const ym = Q[1] - Math.min(2.5, (Q[1] - P[1]) / 2);
  return [P, [P[0], ym], [Q[0], ym], Q];
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

function connector(cx, cy, r, tag) {
  return [
    { t: 'circle', cx, cy, r, stroke: FLOW, fill: '#ffffff', lw: 0.3 },
    text(cx, cy - lineHeight(7) / 2, [tag], 7, { bold: true, align: 'center', color: FLOW })
  ];
}

function shapeItem(b) {
  const style = { stroke: FLOW, fill: '#ffffff', lw: 0.35 };
  if (b.shape === 'decision') {
    return { t: 'poly', closed: true, pts: [[b.cx, b.top], [b.cx + b.w / 2, b.cy], [b.cx, b.bottom], [b.cx - b.w / 2, b.cy]], ...style };
  }
  return { t: 'rect', x: b.cx - b.w / 2, y: b.top, w: b.w, h: b.h, r: b.shape === 'terminator' ? b.h / 2 : 0, ...style };
}
