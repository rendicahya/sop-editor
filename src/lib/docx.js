// Ekspor DOCX. Halaman identitas menjadi tabel Word biasa (bisa diedit, mengalir antarhalaman).
// Halaman diagram alir menjadi tabel dengan ukuran kolom/baris persis seperti tata letak, ditambah
// simbol, garis alur, dan label sebagai shape Word yang bisa diedit, diposisikan relatif terhadap halaman.
import { zipSync, strToU8 } from 'fflate';
import { layoutDocument, markerWidth, PT, PAGE } from './layout.js';
import { formatTanggal } from './model.js';
import { parseRich, lineText, hasList, listMarker, plainText, sliceRich } from './richtext.js';

const TW = 1440 / 25.4; // twip per mm
const EMU = 36000; // EMU per mm
const tw = (mm) => Math.round(mm * TW);
const emu = (mm) => Math.round(mm * EMU);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const SECTION_PAIRS = [
  ['dasarHukum', 'DASAR HUKUM', 'kualifikasi', 'KUALIFIKASI PELAKSANA'],
  ['keterkaitan', 'KETERKAITAN', 'peralatan', 'PERALATAN/PERLENGKAPAN'],
  ['peringatan', 'PERINGATAN', 'pencatatan', 'PENCATATAN DAN PENDATAAN']
];

// ---------------------------------------------------------------------------
// Potongan WordprocessingML
// ---------------------------------------------------------------------------

/** Teks isian berformat (<b>, <i>, <u>) menjadi beberapa run Word. */
const richRun = (text, opts = {}) =>
  parseRich(text).map((r) => run(r.text, { ...opts, bold: r.b || opts.bold, italic: r.i || opts.italic, underline: r.u })).join('') || run('', opts);

function run(text, { size, bold, italic, underline, color } = {}) {
  const pr =
    (bold ? '<w:b/><w:bCs/>' : '') + (italic ? '<w:i/><w:iCs/>' : '') + (color ? `<w:color w:val="${color.replace('#', '')}"/>` : '') +
    (underline ? '<w:u w:val="single"/>' : '') +
    (size ? `<w:sz w:val="${Math.round(size * 2)}"/><w:szCs w:val="${Math.round(size * 2)}"/>` : '');
  const parts = String(text ?? '').replace(/\r/g, '').split('\n');
  const body = parts.map((p) => `<w:t xml:space="preserve">${esc(p)}</w:t>`).join('<w:br/>');
  return `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}${body}</w:r>`;
}

/** Paragraf; spasi baris tetap size × 1,2 seperti tata letak (line dalam twip, 0 = otomatis). */
function para(content, { size = 10, align, before = 0, after = 0, line = size * 24, keepNext, num, hang } = {}) {
  const pr =
    (keepNext ? '<w:keepNext/>' : '') + (num ? `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${num}"/></w:numPr>` : '') +
    `<w:spacing w:before="${Math.round(before)}" w:after="${Math.round(after)}" ` +
    (line ? `w:line="${Math.round(line)}" w:lineRule="exact"/>` : 'w:line="240" w:lineRule="auto"/>') +
    (hang ? `<w:ind w:left="${tw(hang)}" w:hanging="${tw(hang)}"/>` : '') +
    (align ? `<w:jc w:val="${align}"/>` : '') + `<w:rPr><w:sz w:val="${size * 2}"/><w:szCs w:val="${size * 2}"/></w:rPr>`;
  return `<w:p><w:pPr>${pr}</w:pPr>${content}</w:p>`;
}

function cell(w, body, { span, vMerge, vAlign, mar } = {}) {
  const pr =
    `<w:tcW w:w="${tw(w)}" w:type="dxa"/>` + (span > 1 ? `<w:gridSpan w:val="${span}"/>` : '') +
    (vMerge ? `<w:vMerge${vMerge === 'restart' ? ' w:val="restart"' : ''}/>` : '') +
    (mar ? `<w:tcMar>${Object.entries(mar).map(([k, v]) => `<w:${k} w:w="${tw(v)}" w:type="dxa"/>`).join('')}</w:tcMar>` : '') +
    (vAlign ? `<w:vAlign w:val="${vAlign}"/>` : '');
  return `<w:tc><w:tcPr>${pr}</w:tcPr>${body || para('')}</w:tc>`;
}

/** Tinggi `exact` mencakup jarak dalam sel; tinggi `atLeast` di Word belum termasuk jarak dalam atas/bawah (`padY`). */
function row(cells, h, rule = 'atLeast', { header, padY = 0 } = {}) {
  const v = rule === 'exact' ? h : Math.max(0, h - padY);
  return `<w:tr><w:trPr><w:cantSplit/>${header ? '<w:tblHeader/>' : ''}<w:trHeight w:val="${tw(v)}" w:hRule="${rule}"/></w:trPr>${cells.join('')}</w:tr>`;
}

function table(widths, rows, pad) {
  const b = (s) => `<w:${s} w:val="single" w:sz="6" w:space="0" w:color="000000"/>`;
  const total = widths.reduce((a, v) => a + tw(v), 0);
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/><w:tblInd w:w="0" w:type="dxa"/>` +
    `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(b).join('')}</w:tblBorders>` +
    `<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="${tw(pad.top)}" w:type="dxa"/><w:left w:w="${tw(pad.x)}" w:type="dxa"/>` +
    `<w:bottom w:w="${tw(pad.bottom)}" w:type="dxa"/><w:right w:w="${tw(pad.x)}" w:type="dxa"/></w:tblCellMar>` +
    `<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr>` +
    `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${tw(w)}"/>`).join('')}</w:tblGrid>${rows.join('')}</w:tbl>`
  );
}

// ---------------------------------------------------------------------------
// Gambar
// ---------------------------------------------------------------------------

class Media {
  constructor() {
    this.files = {};
    this.rels = [];
    this.n = 0;
  }
  add(bytes, ext) {
    const id = 'rIdImg' + ++this.n;
    const name = `image${this.n}.${ext}`;
    this.files['word/media/' + name] = bytes;
    this.rels.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}"/>`);
    return id;
  }
  addDataUrl(src) {
    const [head, data] = src.split(',');
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return this.add(bytes, head.includes('jpeg') ? 'jpeg' : 'png');
  }
}

function graphic(rid, w, h, id) {
  return (
    `<wp:docPr id="${id}" name="Gambar ${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>` +
    `<pic:nvPicPr><pic:cNvPr id="${id}" name="Gambar ${id}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic>`
  );
}

let drawingId = 0;
const inlineImage = (rid, w, h) =>
  `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${emu(w)}" cy="${emu(h)}"/>` +
  `<wp:effectExtent l="0" t="0" r="0" b="0"/>${graphic(rid, w, h, ++drawingId)}</wp:inline></w:drawing></w:r>`;

// ---------------------------------------------------------------------------
// Diagram sebagai shape Word (bisa dipindah, diubah ukurannya, dan diedit teksnya)
// ---------------------------------------------------------------------------

const hex = (c) => (c ?? '#000000').replace('#', '').toUpperCase();
const prst = (p) => `<a:prstGeom prst="${p}"><a:avLst/></a:prstGeom>`;

/**
 * Satu shape mengambang di depan tabel, posisinya relatif terhadap pojok halaman (mm).
 * `text`: isi kotak teks (paragraf WordprocessingML), tanpa jarak dalam.
 */
function shape(x, y, w, h, name, geom, { fill, line, lw = 0, arrow, text, txBox } = {}) {
  const id = ++drawingId;
  const fillX = fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : '<a:noFill/>';
  const lnX = line
    ? `<a:ln w="${emu(lw)}"><a:solidFill><a:srgbClr val="${line}"/></a:solidFill><a:miter lim="800000"/>${arrow ? '<a:tailEnd type="triangle" w="med" len="med"/>' : ''}</a:ln>`
    : '<a:ln><a:noFill/></a:ln>';
  const [cx, cy] = [Math.max(1, emu(w)), Math.max(1, emu(h))];
  return (
    `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${id + 2}" behindDoc="0" locked="0" layoutInCell="0" allowOverlap="1">` +
    `<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>${emu(x)}</wp:posOffset></wp:positionH>` +
    `<wp:positionV relativeFrom="page"><wp:posOffset>${emu(y)}</wp:posOffset></wp:positionV><wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${id}" name="${name} ${id}"/><wp:cNvGraphicFramePr/>` +
    `<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp>` +
    `<wps:cNvSpPr${txBox ? ' txBox="1"' : ''}/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>${geom}${fillX}${lnX}</wps:spPr>` +
    (text ? `<wps:txbx><w:txbxContent>${text}</w:txbxContent></wps:txbx>` : '') +
    `<wps:bodyPr rot="0" vert="horz" wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="${text && !txBox ? 'ctr' : 't'}" anchorCtr="0"><a:noAutofit/></wps:bodyPr>` +
    `</wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`
  );
}

/** Garis alur (polyline) dengan ujung panah; koordinat titik relatif terhadap kotak pembatasnya. */
function lineShape(pts, it, arrow) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [x, y] = [Math.min(...xs), Math.min(...ys)];
  const [w, h] = [Math.max(...xs) - x, Math.max(...ys) - y];
  const W = Math.max(1, emu(w));
  const H = Math.max(1, emu(h));
  const path = pts.map(([px, py], j) => `<a:${j ? 'lnTo' : 'moveTo'}><a:pt x="${emu(px - x)}" y="${emu(py - y)}"/></a:${j ? 'lnTo' : 'moveTo'}>`).join('');
  const geom = `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${W}" h="${H}" fill="none">${path}</a:path></a:pathLst></a:custGeom>`;
  return shape(x, y, w, h, 'Garis alur', geom, { line: hex(it.stroke), lw: it.lw, arrow });
}

/** Label (Ya/Tidak, huruf penghubung) sebagai kotak teks; `bg` = latar putih label cabang. */
function labelShape(it, bg) {
  const lh = it.size * PT * 1.2;
  const w = bg ? bg.w : Math.max(...it.lines.map((l) => markerWidth(lineText(l), it.size))) * (it.bold ? 1.1 : 1) + 1;
  const x = bg ? bg.x : it.align === 'center' ? it.x - w / 2 : it.align === 'right' ? it.x - w : it.x;
  const align = bg ? 'center' : it.align;
  const text = it.lines
    .map((l) => para(run(lineText(l), { size: it.size, bold: it.bold, color: it.color }), { size: it.size, align: align === 'left' ? null : align }))
    .join('');
  return shape(x, it.y, w, it.lines.length * lh, 'Label', prst('rect'), { fill: bg ? 'FFFFFF' : null, text, txBox: true });
}

/** Item diagram satu halaman (garis, simbol, penghubung, label) menjadi shape Word. */
function diagramShapes(items) {
  const out = [];
  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    const style = { fill: it.fill ? hex(it.fill) : null, line: it.stroke ? hex(it.stroke) : null, lw: it.lw };
    if (it.t === 'poly' && !it.closed) {
      // Batang + mata panah (segitiga berikutnya) menjadi satu garis dengan ujung panah.
      const head = items[k + 1];
      const arrow = head?.t === 'poly' && head.closed && head.pts.length === 3;
      out.push(lineShape(arrow ? [...it.pts.slice(0, -1), head.pts[0]] : it.pts, it, arrow));
      if (arrow) k++;
    } else if (it.t === 'rect' && it.bg) {
      if (items[k + 1]?.t === 'text') out.push(labelShape(items[++k], it));
    } else if (it.t === 'rect') {
      out.push(shape(it.x, it.y, it.w, it.h, it.r ? 'Mulai/Selesai' : 'Proses', prst(it.r ? 'flowChartTerminator' : 'flowChartProcess'), style));
    } else if (it.t === 'poly' && it.closed && (it.pts.length === 4 || it.pts.length === 5)) {
      const xs = it.pts.map((p) => p[0]);
      const ys = it.pts.map((p) => p[1]);
      const [x, y] = [Math.min(...xs), Math.min(...ys)];
      const dec = it.pts.length === 4;
      const [w, h] = [Math.max(...xs) - x, Math.max(...ys) - y];
      out.push(shape(x, y, w, h, dec ? 'Keputusan' : 'Penghubung', prst(dec ? 'flowChartDecision' : 'flowChartOffpageConnector'), style));
    } else if (it.t === 'text') {
      out.push(labelShape(it, null));
    }
  }
  return out.join('');
}

// ---------------------------------------------------------------------------
// Halaman identitas
// ---------------------------------------------------------------------------

function identityTable(doc, meta, media, numbering) {
  const { leftW, labelW, valW } = meta;
  const hd = doc.header;
  const S = 10;
  const label = (t) => para(run(t, { bold: true }), { size: S });

  const logo = inlineImage(media.addDataUrl(meta.logoSrc), meta.logo.w, meta.logo.h);
  const left =
    para(logo, { size: S, align: 'center', after: tw(3), line: 0 }) +
    para(run(hd.institution, { bold: true, size: 11 }), { size: 11, align: 'center' });

  // Tanda tangan/stempel; bila kosong, sisakan ruang kosong setinggi area tanda tangan.
  let sig = para('', { size: S, line: tw(24) });
  if (hd.signature) {
    const s = Math.min(meta.sigW / hd.signature.width, 24 / hd.signature.height);
    const img = inlineImage(media.addDataUrl(hd.signature.src), hd.signature.width * s, hd.signature.height * s);
    sig = para(img, { size: S, align: 'center', before: 40, after: 40, line: 0 });
  }
  const value = (t, bold) => para(run(t, { bold }), { size: S });
  const right = [
    ['NOMOR SOP', value(hd.nomor)],
    ['TGL PEMBUATAN', value(formatTanggal(hd.tglPembuatan))],
    ['TGL REVISI', value(formatTanggal(hd.tglRevisi))],
    ['TGL EFEKTIF', value(formatTanggal(hd.tglEfektif))],
    ['DISAHKAN OLEH',
      para(run(hd.disahkanJabatan), { size: S, align: 'center' }) + sig +
      para(run(hd.disahkanNama), { size: S, align: 'center' }) + para(run(hd.disahkanNip), { size: S, align: 'center' }), 40],
    ['NAMA SOP', value(hd.namaSop, true)]
  ];
  const R = { padY: 2 * 1.4 + 0.25 }; // jarak dalam atas+bawah dan tebal garis
  const rows = right.map(([lab, val, h = 7], i) =>
    row([cell(leftW, i ? '' : left, { vMerge: i ? 'continue' : 'restart', vAlign: 'center' }), cell(labelW, label(lab)), cell(valW, val)], h, 'atLeast', R)
  );

  const list = (key) => {
    const sec = doc.sections[key];
    const num = sec.numbered && sec.items.length ? numbering.add() : 0;
    return sec.items.map((t) => para(richRun(t), { size: S, num, after: tw(0.5) })).join('');
  };
  for (const [lk, lt, rk, rt] of SECTION_PAIRS) {
    rows.push(row([cell(leftW, para(run(lt, { bold: true }), { size: S, keepNext: true })), cell(labelW + valW, para(run(rt, { bold: true }), { size: S, keepNext: true }), { span: 2 })], 7, 'atLeast', R));
    rows.push(row([cell(leftW, list(lk)), cell(labelW + valW, list(rk), { span: 2 })], 8, 'atLeast', R));
  }
  return table([leftW, labelW, valW], rows, { top: 1.4, bottom: 1.4, x: 1.4 });
}

// ---------------------------------------------------------------------------
// Halaman diagram alir
// ---------------------------------------------------------------------------

function flowTable(doc, f) {
  const { widths: w, size: S } = f;
  const n = w.length - 6;
  const sum = (a, b) => w.slice(a, b).reduce((s, v) => s + v, 0);
  const hdr = (t, italic) => para(run(t, { bold: true, italic, size: S }), { size: S, align: 'center' });
  const hm = { top: 0, left: 1, bottom: 0, right: 1 }; // urutan elemen tcMar mengikuti skema
  const h = { vAlign: 'center', mar: hm };

  const rows = [
    row([
      cell(w[0], hdr('No.'), { ...h, vMerge: 'restart' }),
      cell(w[1], hdr('Kegiatan'), { ...h, vMerge: 'restart' }),
      cell(sum(2, 2 + n), hdr('Pelaksana'), { ...h, span: n }),
      cell(sum(2 + n, 5 + n), hdr('Mutu Baku'), { ...h, span: 3 }),
      cell(w[5 + n], hdr('Keterangan'), { ...h, vMerge: 'restart' })
    ], f.H1, 'exact', { header: true }),
    row([
      cell(w[0], '', { vMerge: 'continue' }),
      cell(w[1], '', { vMerge: 'continue' }),
      ...doc.actors.map((a, i) => cell(w[2 + i], hdr(a.name), h)),
      cell(w[2 + n], hdr('Kelengkapan'), h),
      cell(w[3 + n], hdr('Waktu'), h),
      cell(w[4 + n], hdr('Output', true), h),
      cell(w[5 + n], '', { vMerge: 'continue' })
    ], f.H2, 'exact', { header: true })
  ];
  const band = () => row(w.map((x) => cell(x, '')), f.band, 'exact');
  if (f.top) rows.push(band());
  for (const r of f.rows) {
    const s = doc.steps[r.index];
    const t = (v) => cellText(v, S);
    rows.push(row([
      cell(w[0], para(run(String(r.index + 1), { size: S }), { size: S, align: 'center' })),
      cell(w[1], t(s.kegiatan)),
      ...doc.actors.map((_, i) => cell(w[2 + i], '')),
      cell(w[2 + n], t(s.kelengkapan)),
      cell(w[3 + n], t(s.waktu)),
      cell(w[4 + n], t(s.output)),
      cell(w[5 + n], t(s.keterangan))
    ], r.h, 'exact'));
  }
  if (f.bot) rows.push(band());
  return table(w, rows, { top: f.pad, bottom: 0, x: f.pad });
}

/**
 * Isi sel langkah. Sel berdaftar menjadi satu paragraf per baris; butir daftar diberi indentasi gantung
 * selebar penandanya dan tab setelah penanda, sehingga baris lanjutan rata seperti di pratinjau.
 */
function cellText(v, S) {
  if (!hasList(v)) return para(richRun(v, { size: S }), { size: S });
  let at = 0;
  return plainText(v)
    .split('\n')
    .map((l) => {
      const m = listMarker(l);
      const body = richRun(sliceRich(v, at + m.length, at + l.length), { size: S });
      at += l.length + 1;
      if (!m) return para(body, { size: S });
      return para(run(m.trimEnd(), { size: S }) + '<w:r><w:tab/></w:r>' + body, { size: S, hang: markerWidth(m, S) });
    })
    .join('');
}

// ---------------------------------------------------------------------------
// Paket DOCX
// ---------------------------------------------------------------------------

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" ' +
  'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const sectPr = (bottom) =>
  `<w:sectPr><w:pgSz w:w="${tw(PAGE.w)}" w:h="${tw(PAGE.h)}" w:orient="landscape"/>` +
  `<w:pgMar w:top="${tw(PAGE.m)}" w:right="${tw(PAGE.m)}" w:bottom="${tw(bottom)}" w:left="${tw(PAGE.m)}" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>`;

// Paragraf pemisah sekecil mungkin (1 pt) agar tidak mendorong tabel ke halaman berikutnya.
const tiny = (content = '', sect = '') =>
  `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/></w:rPr>${sect}</w:pPr>${content}</w:p>`;

export async function exportDocx(doc) {
  drawingId = 0;
  const pages = layoutDocument(doc);
  const media = new Media();
  const nums = [];
  const numbering = { add: () => (nums.push(nums.length + 1), nums.length) };

  const body = [identityTable(doc, pages[0].identity, media, numbering)];
  // Bagian identitas: margin bawah normal; bagian diagram: margin bawah kecil karena tinggi tabel sudah pas satu halaman.
  body.push(tiny('', sectPr(PAGE.m)));

  const flowPages = pages.filter((p) => p.flow);
  for (let q = 0; q < flowPages.length; q++) {
    const page = flowPages[q];
    body.push(flowTable(doc, page.flow));
    const shapes = diagramShapes(page.items.slice(page.diagram));
    body.push(tiny(shapes + (q < flowPages.length - 1 ? '<w:r><w:br w:type="page"/></w:r>' : '')));
  }

  const document = `${XML}<w:document ${NS}><w:body>${body.join('')}${sectPr(4)}</w:body></w:document>`;

  const styles =
    `${XML}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults>` +
    `<w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/>` +
    `<w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="id-ID"/></w:rPr></w:rPrDefault>` +
    `<w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
    `<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/>` +
    `<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>` +
    `</w:styles>`;

  const ind = tw(5);
  const numberingXml =
    `${XML}<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/>` +
    `<w:lvlText w:val="%1"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="${ind}"/></w:tabs><w:ind w:left="${ind}" w:hanging="${ind}"/></w:pPr></w:lvl></w:abstractNum>` +
    nums.map((id) => `<w:num w:numId="${id}"><w:abstractNumId w:val="0"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`).join('') +
    `</w:numbering>`;

  const settings =
    `${XML}<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="720"/>` +
    `<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;

  const title = `SOP ${doc.header.namaSop || ''}`.trim();
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const files = {
    '[Content_Types].xml': strToU8(
      `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>` +
      `<Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="svg" ContentType="image/svg+xml"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
      `<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>` +
      `<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>` +
      `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`
    ),
    '_rels/.rels': strToU8(
      `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`
    ),
    'docProps/core.xml': strToU8(
      `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" ` +
      `xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title>` +
      `<dc:creator>SOP Editor</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`
    ),
    'word/_rels/document.xml.rels': strToU8(
      `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `<Relationship Id="rIdNum" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>` +
      `<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>` +
      `${media.rels.join('')}</Relationships>`
    ),
    'word/document.xml': strToU8(document),
    'word/styles.xml': strToU8(styles),
    'word/numbering.xml': strToU8(numberingXml),
    'word/settings.xml': strToU8(settings),
    ...media.files
  };
  const zip = zipSync(files, { level: 6 });
  return new Blob([zip], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
