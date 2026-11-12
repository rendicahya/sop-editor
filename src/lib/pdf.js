import { jsPDF } from 'jspdf';
import { layoutDocument, pagesOf, baseline, PAGE, PT } from './layout.js';
import { pdfFont, registerFonts } from './fonts.js';
import { zlibSync, unzlibSync, strToU8, strFromU8 } from 'fflate';
import { slug } from './files.js';
import { docMeta } from './model.js';

/**
 * Perlindungan isi PDF:
 * - none: teks bisa diseleksi dan disalin; data SOP disisipkan agar PDF bisa dibuka lagi di editor.
 * - lock: PDF terenkripsi dengan izin cetak saja (tanpa salin dan ubah). Dipatuhi Acrobat, Chrome, Edge, dll.,
 *   tetapi sebagian penampil mengabaikannya. Data SOP tidak disisipkan.
 * - image: setiap halaman menjadi gambar (teks tidak ada sama sekali), ditambah izin seperti `lock`.
 */
export const PDF_PROTECT = ['none', 'lock', 'image'];

/** `meta`: { title, author, subject, keywords } untuk properti PDF. */
function newPdf(meta, protect) {
  const pdf = new jsPDF({
    unit: 'mm',
    format: 'a4',
    orientation: 'landscape',
    compress: true,
    // Kata sandi pemilik acak: tidak ada yang bisa membuka PDF dengan hak penuh untuk mencabut larangan.
    ...(protect !== 'none' && { encryption: { userPassword: '', ownerPassword: randomPassword(), userPermissions: ['print'] } })
  });
  pdf.setProperties({ ...meta, creator: 'SOP Editor' });
  return pdf;
}

/** Penggambar halaman SOP ke `pdf` sesuai mode perlindungan; halaman pertama bawaan jsPDF dipakai lebih dulu. */
async function pageWriter(pdf, protect, wm, vectorFonts) {
  let used = false;
  const images = new Map();
  const png = protect === 'image' ? await import('./png.js') : null;
  if (png) await png.loadDocFonts();
  pdf.setLineJoin('miter');
  if (!png || vectorFonts) registerFonts(pdf);
  const next = () => {
    if (used) pdf.addPage('a4', 'landscape');
    used = true;
    return pdf.getNumberOfPages();
  };
  return {
    next,
    /** Menambah satu halaman tata letak (layout.js). */
    async page(page) {
      next();
      if (png) {
        const canvas = await png.renderPage(page, images, IMAGE_DPI);
        if (wm) paintWatermark(canvas, page, wm, png.FONT);
        pdf.addImage(canvas, 'PNG', 0, 0, page.w, page.h, undefined, 'FAST');
      } else {
        for (const it of page.items) drawItem(pdf, it);
        if (wm) drawWatermark(pdf, page, wm);
      }
    }
  };
}

const cleanWatermark = (w) => String(w ?? '').replace(/\s+/g, ' ').trim();

function randomPassword() {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => (b % 94) + 33).map((c) => String.fromCharCode(c)).join('');
}

/** Teks watermark siap pakai (selain itu teks bebas). */
export const WATERMARKS = ['DRAFT', 'SALINAN TERKENDALI', 'SALINAN TIDAK TERKENDALI', 'RAHASIA', 'CONTOH'];
const WM_GRAY = 128;
const WM_OPACITY = 0.16;
const WM_MAX_PT = 150;
const IMAGE_DPI = 250;

/** Sudut diagonal halaman dan ukuran font (pt) agar lebar teks ≈ 70% diagonal. `width1` = lebar teks pada 1 pt (mm). */
function wmGeometry(page, width1) {
  const angle = Math.atan2(page.h, page.w);
  const size = Math.min(WM_MAX_PT, (0.7 * Math.hypot(page.w, page.h)) / width1);
  return { angle, size };
}

/** Watermark miring dan transparan di atas isi halaman (vektor). */
function drawWatermark(pdf, page, text) {
  pdf.saveGraphicsState();
  pdf.setGState(new pdf.GState({ opacity: WM_OPACITY }));
  pdf.setFont(pdfFont(), 'bold');
  pdf.setFontSize(1);
  const { angle, size } = wmGeometry(page, pdf.getTextWidth(text));
  pdf.setFontSize(size);
  pdf.setTextColor(WM_GRAY, WM_GRAY, WM_GRAY);
  const w = pdf.getTextWidth(text);
  const cap = size * PT * 0.64; // tinggi huruf kapital Calibri
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  // Titik awal baseline sehingga teks berpusat di tengah halaman, naik dari kiri bawah ke kanan atas.
  const x = page.w / 2 - (w / 2) * c + (cap / 2) * s;
  const y = page.h / 2 + (w / 2) * s + (cap / 2) * c;
  pdf.text(text, x, y, { angle: (angle * 180) / Math.PI });
  pdf.restoreGraphicsState();
}

/** Watermark yang sama pada canvas halaman (mode Gambar). */
function paintWatermark(canvas, page, text, font) {
  const g = canvas.getContext('2d');
  const S = canvas.width / page.w;
  g.save();
  g.font = `700 ${PT * S}px ${font}`;
  const { angle, size } = wmGeometry(page, g.measureText(text).width / S);
  g.font = `700 ${size * PT * S}px ${font}`;
  g.translate(canvas.width / 2, canvas.height / 2);
  g.rotate(-angle);
  g.globalAlpha = WM_OPACITY;
  g.fillStyle = `rgb(${WM_GRAY} ${WM_GRAY} ${WM_GRAY})`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 0, 0);
  g.restore();
}

/**
 * opts: { protect: lihat PDF_PROTECT, watermark: teks (kosong = tanpa watermark), part: lihat PDF_PARTS }.
 * Data SOP yang disisipkan selalu utuh, juga saat hanya sebagian halaman yang diekspor.
 */
export async function exportPdf(doc, { protect = 'none', watermark = '', part = 'all' } = {}) {
  const pdf = newPdf(docMeta(doc), protect);
  const w = await pageWriter(pdf, protect, cleanWatermark(watermark), false);
  for (const page of pagesOf(layoutDocument(doc), part)) await w.page(page);
  if (protect === 'none') attachSop(pdf, doc);
  return pdf;
}

// ---- Buku SOP: beberapa SOP dalam satu PDF, diawali daftar isi ----
const TOC = { x: 20, right: 277, top: 18, bottom: 192, cols: [12, 70], size: 10 };

/**
 * Menggabungkan `docs` (dokumen SOP, berurutan) menjadi satu PDF dengan halaman daftar isi yang bisa diklik dan
 * bookmark per SOP. `title`: judul buku. opts sama dengan exportPdf; data SOP tidak disisipkan.
 */
export async function exportPdfBook(docs, title, { protect = 'none', watermark = '', part = 'all' } = {}) {
  const first = docs[0] ? docMeta(docs[0]) : {};
  const pdf = newPdf({ title, author: first.author ?? '', subject: `Kumpulan ${docs.length} Standar Operasional Prosedur`, keywords: '' }, protect);
  const wm = cleanWatermark(watermark);
  const w = await pageWriter(pdf, protect, wm, true);
  const layouts = docs.map((d) => pagesOf(layoutDocument(d), part));
  const font = pdfFont();

  // Baris daftar isi: tinggi tiap baris mengikuti jumlah baris nama SOP.
  const lh = TOC.size * PT * 1.3;
  const nameX = TOC.x + TOC.cols[0] + TOC.cols[1];
  const nameW = TOC.right - 22 - nameX;
  pdf.setFont(font, 'normal');
  pdf.setFontSize(TOC.size);
  const rows = docs.map((d, i) => {
    const name = pdf.splitTextToSize(d.header.namaSop?.trim() || 'SOP tanpa judul', nameW);
    const nomor = pdf.splitTextToSize(d.header.nomor?.trim() || '—', TOC.cols[1] - 4);
    return { i, name, nomor, h: Math.max(name.length, nomor.length) * lh + 2.6 };
  });
  // Pembagian baris ke halaman daftar isi: halaman pertama memuat judul buku, berikutnya hanya kepala tabel.
  const tocPages = [[]];
  let y = 58;
  for (const r of rows) {
    if (y + r.h > TOC.bottom && tocPages.at(-1).length) {
      tocPages.push([]);
      y = 36;
    }
    tocPages.at(-1).push(r);
    y += r.h;
  }
  const starts = [];
  let p = tocPages.length + 1;
  for (const l of layouts) {
    starts.push(p);
    p += l.length;
  }
  const total = p - 1;

  const tableHead = (y0) => {
    pdf.setFont(font, 'bold');
    pdf.setFontSize(TOC.size);
    pdf.setTextColor('#000000');
    pdf.text('No', TOC.x, y0);
    pdf.text('Nomor SOP', TOC.x + TOC.cols[0], y0);
    pdf.text('Nama SOP', nameX, y0);
    pdf.text('Halaman', TOC.right, y0, { align: 'right' });
    pdf.setDrawColor('#000000');
    pdf.setLineWidth(0.3);
    pdf.line(TOC.x, y0 + 2, TOC.right, y0 + 2);
    return y0 + 2;
  };
  const tocPage = { w: 297, h: 210 };
  tocPages.forEach((list, k) => {
    w.next();
    let y0;
    if (k === 0) {
      pdf.setFont(font, 'bold');
      pdf.setFontSize(18);
      pdf.setTextColor('#000000');
      const heading = pdf.splitTextToSize(title, TOC.right - TOC.x);
      pdf.text(heading.slice(0, 2), tocPage.w / 2, 28, { align: 'center' });
      pdf.setFont(font, 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor('#555555');
      pdf.text(`${docs.length} SOP · ${total} halaman`, tocPage.w / 2, 28 + Math.min(2, heading.length) * 18 * PT * 1.2 + 1, { align: 'center' });
      pdf.setFont(font, 'bold');
      pdf.setFontSize(12);
      pdf.setTextColor('#000000');
      pdf.text('DAFTAR ISI', TOC.x, 50);
      y0 = tableHead(56) + 0.4;
    } else {
      pdf.setFont(font, 'bold');
      pdf.setFontSize(12);
      pdf.setTextColor('#000000');
      pdf.text('DAFTAR ISI (lanjutan)', TOC.x, TOC.top + 6);
      y0 = tableHead(32) + 0.4;
    }
    for (const r of list) {
      const base = y0 + 1.3 + TOC.size * PT * 0.85;
      pdf.setFont(font, 'normal');
      pdf.setFontSize(TOC.size);
      pdf.setTextColor('#000000');
      pdf.text(`${r.i + 1}.`, TOC.x, base);
      pdf.text(r.nomor, TOC.x + TOC.cols[0], base, { lineHeightFactor: 1.3 });
      pdf.setTextColor('#1d4ed8');
      pdf.text(r.name, nameX, base, { lineHeightFactor: 1.3 });
      pdf.setTextColor('#000000');
      pdf.text(String(starts[r.i]), TOC.right, base, { align: 'right' });
      pdf.link(TOC.x, y0, TOC.right - TOC.x, r.h, { pageNumber: starts[r.i] });
      y0 += r.h;
      pdf.setDrawColor('#cccccc');
      pdf.setLineWidth(0.15);
      pdf.line(TOC.x, y0, TOC.right, y0);
    }
    if (wm) drawWatermark(pdf, tocPage, wm);
  });

  for (const l of layouts) for (const page of l) await w.page(page);

  // Plugin outline jsPDF menulis judul bookmark tanpa enkripsi, sehingga rusak pada PDF terkunci; judul dienkripsi di sini.
  const outline = pdf.outline;
  const objStart = outline.objStart;
  let node = null;
  outline.objStart = function (n) {
    node = n;
    return objStart.call(this, n);
  };
  outline.makeString = (val) => `(${pdf.internal.pdfEscape(pdf.internal.getEncryptor(node.id)(val))})`;
  pdf.outline.add(null, 'Daftar Isi', { pageNumber: 1 });
  docs.forEach((d, i) => pdf.outline.add(null, `${i + 1}. ${d.header.namaSop?.trim() || 'SOP tanpa judul'}`, { pageNumber: starts[i] }));
  return pdf;
}

// Data SOP disisipkan sebagai lampiran PDF (embedded file, dikompres Flate) agar PDF ini bisa dibuka & diedit lagi.
// Penanda /SOPEditor pada kamus stream dipakai saat membaca kembali (lihat sopFromPdf).
function attachSop(pdf, doc) {
  const json = JSON.stringify(doc);
  const raw = strToU8(json);
  const z = zlibSync(raw, { level: 9 });
  let bin = '';
  for (let i = 0; i < z.length; i += 0x8000) bin += String.fromCharCode.apply(null, z.subarray(i, i + 0x8000));
  const name = (slug(doc.header.namaSop).normalize('NFKD').replace(/[^A-Za-z0-9-]/g, '') || 'dokumen') + '.sop';
  let fileSpec;
  pdf.internal.events.subscribe('postPutResources', function () {
    const ef = this.internal.newObject();
    this.internal.out(
      `<< /Type /EmbeddedFile /Subtype /application#2Fjson /SOPEditor 1 /Filter /FlateDecode /Length ${z.length} /Params << /Size ${raw.length} >> >>`
    );
    this.internal.out('stream');
    this.internal.out(bin);
    this.internal.out('endstream');
    this.internal.out('endobj');
    fileSpec = this.internal.newObject();
    this.internal.out(
      `<< /Type /Filespec /F (${name}) /UF (${name}) /Desc (Data SOP Editor) /AFRelationship /Source /EF << /F ${ef} 0 R >> >>`
    );
    this.internal.out('endobj');
  });
  pdf.internal.events.subscribe('putCatalog', function () {
    this.internal.out(`/Names << /EmbeddedFiles << /Names [(${name}) ${fileSpec} 0 R] >> >>`);
    this.internal.out(`/AF [${fileSpec} 0 R]`);
  });
}

/** Mengambil JSON SOP dari PDF hasil ekspor app ini; null bila tidak ada. */
export function sopFromPdf(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  const at = s.lastIndexOf('/SOPEditor 1');
  if (at < 0) return null;
  const dictStart = s.lastIndexOf('<<', at);
  const m = /\/Length (\d+)/.exec(s.slice(dictStart, s.indexOf('stream', at)));
  if (!m) return null;
  let p = s.indexOf('stream', at) + 6;
  if (s[p] === '\r') p++;
  if (s[p] === '\n') p++;
  try {
    return strFromU8(unzlibSync(bytes.subarray(p, p + Number(m[1]))));
  } catch {
    return null;
  }
}

function style(pdf, it) {
  pdf.setLineWidth(it.lw ?? 0.25);
  pdf.setDrawColor(it.stroke ?? '#000000');
  if (it.fill) pdf.setFillColor(it.fill);
  return it.fill ? (it.stroke ? 'FD' : 'F') : 'S';
}

function drawItem(pdf, it) {
  switch (it.t) {
    case 'rect': {
      const st = style(pdf, it);
      if (it.r) pdf.roundedRect(it.x, it.y, it.w, it.h, it.r, it.r, st);
      else pdf.rect(it.x, it.y, it.w, it.h, st);
      break;
    }
    case 'poly': {
      const st = style(pdf, it);
      const [x0, y0] = it.pts[0];
      const deltas = [];
      for (let i = 1; i < it.pts.length; i++) {
        deltas.push([it.pts[i][0] - it.pts[i - 1][0], it.pts[i][1] - it.pts[i - 1][1]]);
      }
      pdf.lines(deltas, x0, y0, [1, 1], it.closed ? st : 'S', !!it.closed);
      break;
    }
    case 'circle':
      pdf.circle(it.cx, it.cy, it.r, style(pdf, it));
      break;
    case 'text':
      pdf.setFont(pdfFont(), it.bold ? 'bold' : 'normal');
      pdf.setFontSize(it.size);
      pdf.setTextColor(it.color ?? '#000000');
      it.lines.forEach((line, i) => {
        const y = baseline(it, i);
        if (typeof line === 'string') pdf.text(line, it.x, y, { align: it.align ?? 'left', ...(it.italic && { angle: oblique(pdf, y) }) });
        else richLine(pdf, it, line, y);
      });
      break;
    case 'image': {
      const fmt = it.src.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
      pdf.addImage(it.src, fmt, it.x, it.y, it.w, it.h, undefined, 'FAST');
      break;
    }
  }
}

/** Satu baris berformat: tiap run ditulis berurutan dengan fontnya sendiri. */
function richLine(pdf, it, runs, y) {
  const font = (r) => {
    pdf.setFont(pdfFont(), r.b || it.bold ? 'bold' : 'normal');
    pdf.setFontSize(it.size);
  };
  const widths = runs.map((r) => (font(r), pdf.getTextWidth(r.text)));
  const total = widths.reduce((a, w) => a + w, 0);
  let x = it.align === 'center' ? it.x - total / 2 : it.align === 'right' ? it.x - total : it.x + (runs.indent ?? 0);
  runs.forEach((r, k) => {
    font(r);
    pdf.text(r.text, x, y, r.i || it.italic ? { angle: oblique(pdf, y) } : {});
    if (r.u) {
      // Posisi dan tebal garis bawah mengikuti metrik Calibri.
      const uy = y + it.size * PT * 0.13;
      pdf.setDrawColor(it.color ?? '#000000');
      pdf.setLineWidth(it.size * PT * 0.06);
      pdf.line(x, uy, x + widths[k], uy);
    }
    x += widths[k];
  });
}

// Miring tiruan (tanpa file font italic), sudut sama dengan italic sintetis browser di pratinjau.
// jsPDF ikut memiringkan posisi teks, jadi geser balik sebesar kemiringan pada baseline-nya.
const SLANT = 0.25;
function oblique(pdf, y) {
  const k = pdf.internal.scaleFactor;
  return new pdf.Matrix(1, 0, SLANT, 1, -SLANT * (pdf.internal.pageSize.getHeight() - y) * k, 0);
}

export { PAGE };
