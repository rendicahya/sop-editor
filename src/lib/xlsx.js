// Ekspor XLSX berdasarkan template SOP (src/assets/template-sop.xlsx): gaya, tema, logo, dan nama sheet
// diambil dari template. Sheet "Cover" berisi identitas; sheet "Flowchart" berisi tabel langkah dengan
// simbol dan garis alur sebagai shape Excel yang bisa diedit. Geometri diagram diambil dari tata letak
// PDF (layout.js) yang diperbesar K kali (teks 9 pt menjadi 11 pt), dan pemisah halaman cetak mengikuti PDF.
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import { layoutDocument, countLines, PT, PAGE } from './layout.js';
import { formatTanggal } from './model.js';
import { parseRich, plainText, lineText } from './richtext.js';
import templateUrl from '../assets/template-sop.xlsx?url';

const K = 11 / 9;
const FS = 11; // ukuran font sel (pt)
const LINE = FS * 1.32; // tinggi satu baris teks Excel (pt)
const PX_MM = 96 / 25.4;
const EMU_PX = 9525;
const EMU_PT = 12700;
const EMU_MM = 36000;
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_MAIN = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const NS_DRAW = 'xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const xesc = (s) => esc(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const ptRound = (pt) => Math.min(409, Math.ceil(pt / 0.75 - 1e-6) * 0.75);
const colName = (i) => {
  let s = '';
  for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
};
const ref = (r, c) => colName(c) + r;

/** Tinggi (pt) yang dibutuhkan teks pada sel selebar `px` piksel. */
const need = (text, px, bold = false) => Math.max(1, countLines(text, FS, px / PX_MM - 2, bold)) * LINE + 3;

// ---------------------------------------------------------------------------
// Gaya sel: ditambahkan ke styles.xml template (font, garis tepi, dan xf baru).
// ---------------------------------------------------------------------------

class Styles {
  constructor(xml) {
    this.xml = xml;
    this.parts = { fonts: [], borders: [], cellXfs: [] };
    this.base = {};
    for (const k of Object.keys(this.parts)) this.base[k] = +new RegExp(`<${k} count="(\\d+)"`).exec(xml)[1];
    this.cache = new Map();
  }
  add(part, xml) {
    const list = this.parts[part];
    let i = list.indexOf(xml);
    if (i < 0) i = list.push(xml) - 1;
    return this.base[part] + i;
  }
  /** bd: sisi bergaris ('l', 'r', 't', 'b'); h/v: perataan. */
  get({ b = false, i = false, bd = 'lrtb', h = 'left', v = 'top', wrap = true } = {}) {
    const key = [b, i, bd, h, v, wrap].join();
    if (this.cache.has(key)) return this.cache.get(key);
    const font = this.add('fonts', `<font>${b ? '<b/>' : ''}${i ? '<i/>' : ''}<sz val="${FS}"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>`);
    const side = (s) => (bd.includes(s[0]) ? `<${s} style="thin"><color indexed="64"/></${s}>` : `<${s}/>`);
    const border = this.add('borders', `<border>${['left', 'right', 'top', 'bottom'].map(side).join('')}<diagonal/></border>`);
    const xf = this.add('cellXfs',
      `<xf numFmtId="0" fontId="${font}" fillId="0" borderId="${border}" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">` +
      `<alignment horizontal="${h}" vertical="${v}"${wrap ? ' wrapText="1"' : ''}/></xf>`);
    this.cache.set(key, xf);
    return xf;
  }
  toXml() {
    let out = this.xml;
    for (const [k, list] of Object.entries(this.parts)) {
      if (!list.length) continue;
      out = out.replace(new RegExp(`<${k} count="\\d+"`), `<${k} count="${this.base[k] + list.length}"`).replace(`</${k}>`, list.join('') + `</${k}>`);
    }
    return out;
  }
}

/** Tabel string bersama; isian berformat (<b>, <i>, <u>) menjadi rich text. */
class Strings {
  constructor() {
    this.list = [];
    this.map = new Map();
  }
  add(text, base = {}) {
    const key = JSON.stringify([text, base.b, base.i]);
    if (this.map.has(key)) return this.map.get(key);
    const runs = parseRich(text);
    const t = (s) => `<t xml:space="preserve">${xesc(s)}</t>`;
    const si = runs.length > 1 || runs.some((r) => r.b || r.i || r.u)
      ? runs.map((r) =>
        `<r><rPr>${r.b || base.b ? '<b/>' : ''}${r.i || base.i ? '<i/>' : ''}${r.u ? '<u/>' : ''}<sz val="${FS}"/><color theme="1"/>` +
        `<rFont val="Calibri"/><family val="2"/><scheme val="minor"/></rPr>${t(r.text)}</r>`).join('')
      : t(plainText(text));
    this.list.push(`<si>${si}</si>`);
    this.map.set(key, this.list.length - 1);
    return this.list.length - 1;
  }
  toXml() {
    return `${XML}<sst ${NS_MAIN.split(' ')[0]} count="${this.list.length}" uniqueCount="${this.list.length}">${this.list.join('')}</sst>`;
  }
}

class Sheet {
  constructor(strings, styles) {
    this.strings = strings;
    this.styles = styles;
    this.rows = new Map();
    this.merges = [];
  }
  row(r) {
    if (!this.rows.has(r)) this.rows.set(r, { ht: null, cells: new Map() });
    return this.rows.get(r);
  }
  height(r, pt) {
    this.row(r).ht = ptRound(pt);
  }
  /** Isi satu sel; `st` = spesifikasi gaya (lihat Styles.get). */
  set(r, c, value, st = {}) {
    const s = this.styles.get(st);
    let x = `<c r="${ref(r, c)}" s="${s}"`;
    if (typeof value === 'number') x += `><v>${value}</v></c>`;
    else if (value != null && value !== '') x += ` t="s"><v>${this.strings.add(value, st)}</v></c>`;
    else x += '/>';
    this.row(r).cells.set(c, x);
  }
  /** Rentang sel tergabung: semua sel diberi gaya yang sama agar garis tepinya utuh. */
  merge(r0, c0, r1, c1, value, st = {}) {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.set(r, c, r === r0 && c === c0 ? value : null, st);
    if (r1 > r0 || c1 > c0) this.merges.push(`${ref(r0, c0)}:${ref(r1, c1)}`);
  }
  toXml({ cols, view = '', pr = '', setup, breaks = [], last }) {
    const rows = [...this.rows.entries()].sort((a, b) => a[0] - b[0]).map(([r, { ht, cells }]) =>
      `<row r="${r}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>${[...cells.entries()].sort((a, b) => a[0] - b[0]).map(([, x]) => x).join('')}</row>`);
    const merges = this.merges.length ? `<mergeCells count="${this.merges.length}">${this.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
    const brk = breaks.length
      ? `<rowBreaks count="${breaks.length}" manualBreakCount="${breaks.length}">${breaks.map((r) => `<brk id="${r}" max="16383" man="1"/>`).join('')}</rowBreaks>`
      : '';
    return (
      `${XML}<worksheet ${NS_MAIN}><sheetPr>${pr}<pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${last}"/>` +
      `<sheetViews><sheetView ${view}workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/>` +
      `<cols>${cols.map((px, i) => `<col min="${i + 1}" max="${i + 1}" width="${(px / 7).toFixed(4)}" customWidth="1"/>`).join('')}</cols>` +
      `<sheetData>${rows.join('')}</sheetData>${merges}` +
      `<pageMargins left="0.3937" right="0.3937" top="0.3937" bottom="0.3937" header="0" footer="0"/>` +
      `<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="${setup?.fitH ?? 0}"/>${brk}<drawing r:id="rId1"/></worksheet>`
    );
  }
}

// ---------------------------------------------------------------------------
// Gambar (DrawingML): koordinat absolut EMU diubah menjadi jangkar sel.
// ---------------------------------------------------------------------------

class Grid {
  /** cols dalam piksel, rows dalam pt (indeks 0 = kolom A / baris 1). */
  constructor(cols, rows) {
    this.cx = [0];
    for (const px of cols) this.cx.push(this.cx.at(-1) + px * EMU_PX);
    this.ry = [0];
    for (const pt of rows) this.ry.push(this.ry.at(-1) + pt * EMU_PT);
  }
  from(X, Y) {
    const find = (a, v) => {
      let i = 0;
      while (i < a.length - 2 && a[i + 1] <= v) i++;
      return i;
    };
    const c = find(this.cx, X);
    const r = find(this.ry, Y);
    return `<xdr:from><xdr:col>${c}</xdr:col><xdr:colOff>${Math.round(X - this.cx[c])}</xdr:colOff><xdr:row>${r}</xdr:row><xdr:rowOff>${Math.round(Y - this.ry[r])}</xdr:rowOff></xdr:from>`;
  }
}

class Drawing {
  constructor(grid) {
    this.grid = grid;
    this.items = [];
    this.id = 1;
  }
  anchor(X, Y, W, H, body) {
    const [x, y, w, h] = [X, Y, Math.max(1, W), Math.max(1, H)].map(Math.round);
    this.items.push(`<xdr:oneCellAnchor>${this.grid.from(x, y)}<xdr:ext cx="${w}" cy="${h}"/>${body(`<a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>`)}<xdr:clientData/></xdr:oneCellAnchor>`);
  }
  pic(rid, X, Y, W, H, name) {
    const id = ++this.id;
    this.anchor(X, Y, W, H, (xfrm) =>
      `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${id}" name="${name}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>` +
      `<xdr:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>` +
      `<xdr:spPr>${xfrm}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>`);
  }
  sp(X, Y, W, H, name, geom, { fill, line, lw = 0, txBox, txBody, arrow } = {}) {
    const id = ++this.id;
    const fillX = fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : '<a:noFill/>';
    const lnX = line
      ? `<a:ln w="${Math.round(lw * K * EMU_MM)}"><a:solidFill><a:srgbClr val="${line}"/></a:solidFill><a:round/>${arrow ? '<a:tailEnd type="triangle" w="med" len="med"/>' : ''}</a:ln>`
      : '<a:ln><a:noFill/></a:ln>';
    const body = txBody ?? '<xdr:txBody><a:bodyPr vertOverflow="clip" rtlCol="0" anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:endParaRPr lang="id-ID" sz="1100"/></a:p></xdr:txBody>';
    this.anchor(X, Y, W, H, (xfrm) =>
      `<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="${id}" name="${name} ${id}"/><xdr:cNvSpPr${txBox ? ' txBox="1"' : ''}/></xdr:nvSpPr>` +
      `<xdr:spPr>${xfrm}${geom}${fillX}${lnX}</xdr:spPr>${body}</xdr:sp>`);
  }
  toXml() {
    return `${XML}<xdr:wsDr ${NS_DRAW}>${this.items.join('')}</xdr:wsDr>`;
  }
}

const prst = (p) => `<a:prstGeom prst="${p}"><a:avLst/></a:prstGeom>`;

// ---------------------------------------------------------------------------
// Sheet Cover (identitas)
// ---------------------------------------------------------------------------

const COVER_COLS = [24, 402, 26, 136, 292]; // lebar kolom template (piksel)
const LOGO = { w: 1578864, h: 1600200 }; // ukuran logo pada template (EMU)
const SECTION_PAIRS = [
  ['dasarHukum', 'DASAR HUKUM', 'kualifikasi', 'KUALIFIKASI PELAKSANA'],
  ['keterkaitan', 'KETERKAITAN', 'peralatan', 'PERALATAN/PERLENGKAPAN'],
  ['peringatan', 'PERINGATAN', 'pencatatan', 'PENCATATAN DAN PENDATAAN']
];

function buildCover(doc, sh, rels) {
  const hd = doc.header;
  const [, wB, , wD, wE] = COVER_COLS;
  const label = { b: true };
  const heights = [];
  const put = (r, lab, val, st = {}) => {
    sh.merge(r, 2, r, 3, lab, label);
    sh.set(r, 4, val, st);
    heights[r] = Math.max(need(lab, wD + 26, true), need(val, wE, st.b));
  };
  put(1, 'NOMOR SOP', hd.nomor);
  put(2, 'TGL PEMBUATAN', formatTanggal(hd.tglPembuatan));
  put(3, 'TGL REVISI', formatTanggal(hd.tglRevisi));
  put(4, 'TGL EFEKTIF', formatTanggal(hd.tglEfektif));
  // Pengesahan: jabatan, area tanda tangan (baris 6–10), nama, NIP.
  sh.merge(5, 2, 12, 3, 'DISAHKAN OLEH', label);
  const c = { h: 'center' };
  sh.set(5, 4, hd.disahkanJabatan, { ...c, bd: 'lrt' });
  for (let r = 6; r <= 10; r++) sh.set(r, 4, null, { ...c, bd: 'lr' }), (heights[r] = 15);
  sh.set(11, 4, hd.disahkanNama, { ...c, bd: 'lr' });
  sh.set(12, 4, hd.disahkanNip, { ...c, bd: 'lrb' });
  heights[5] = need(hd.disahkanJabatan, wE);
  heights[11] = need(hd.disahkanNama, wE);
  heights[12] = need(hd.disahkanNip, wE);
  put(13, 'NAMA SOP', hd.namaSop, { b: true });

  // Blok kiri: logo di atas, nama instansi rata bawah. Bila kurang tinggi, area tanda tangan dipertinggi.
  sh.merge(1, 0, 13, 1, hd.institution, { b: true, h: 'center', v: 'bottom' });
  const leftNeed = 10 + LOGO.h / EMU_PT + 8 + need(hd.institution, wB + 24, true);
  const sum = () => heights.slice(1, 14).reduce((a, h) => a + ptRound(h), 0);
  const lack = leftNeed - sum();
  if (lack > 0) for (let r = 6; r <= 10; r++) heights[r] += lack / 5;

  let r = 14;
  for (const [lk, lt, rk, rt] of SECTION_PAIRS) {
    sh.merge(r, 0, r, 1, lt, label);
    sh.merge(r, 2, r, 4, rt, label);
    heights[r++] = 15;
    const L = doc.sections[lk];
    const R = doc.sections[rk];
    const n = Math.max(1, L.items.length, R.items.length);
    for (let j = 0; j < n; j++) {
      const b = j === n - 1 ? 'b' : '';
      const num = (sec) => (sec.numbered && j < sec.items.length ? j + 1 : null);
      sh.set(r, 0, num(L), { bd: 'l' + b, h: 'right' });
      sh.set(r, 1, L.items[j] ?? null, { bd: 'r' + b });
      sh.set(r, 2, num(R), { bd: 'l' + b, h: 'right' });
      sh.merge(r, 3, r, 4, R.items[j] ?? null, { bd: 'r' + b });
      heights[r++] = Math.max(15, need(L.items[j] ?? '', wB), need(R.items[j] ?? '', wD + wE));
    }
  }
  const last = r - 1;
  heights.forEach((h, i) => h && sh.height(i, h));

  // Gambar: logo template dan tanda tangan/stempel.
  const grid = new Grid(COVER_COLS, heights.slice(1).map(ptRound));
  const dr = new Drawing(grid);
  const leftW = (COVER_COLS[0] + COVER_COLS[1]) * EMU_PX;
  dr.pic('rId1', (leftW - LOGO.w) / 2, 10 * EMU_PT, LOGO.w, LOGO.h, 'Logo');
  if (hd.signature) {
    const x0 = grid.cx[4];
    const y0 = grid.ry[5];
    const W = COVER_COLS[4] * EMU_PX - 20 * EMU_PX;
    const H = grid.ry[10] - y0 - 4 * EMU_PT;
    const s = Math.min(W / hd.signature.width, H / hd.signature.height);
    const w = hd.signature.width * s;
    const h = hd.signature.height * s;
    const rid = rels.image(hd.signature.src);
    dr.pic(rid, x0 + (COVER_COLS[4] * EMU_PX - w) / 2, y0 + (grid.ry[10] - y0 - h) / 2, w, h, 'Tanda tangan');
  }
  return {
    xml: sh.toXml({ cols: COVER_COLS, setup: { fitH: 1 }, pr: '<tabColor rgb="FF0000FF"/>', view: 'tabSelected="1" view="pageBreakPreview" zoomScale="70" zoomScaleSheetLayoutView="70" ', last: ref(last, 4) }),
    drawing: dr.toXml(),
    printArea: `Cover!$A$1:$E$${last}`
  };
}

// ---------------------------------------------------------------------------
// Sheet Flowchart
// ---------------------------------------------------------------------------

function buildFlow(doc, pages, sh) {
  const flowPages = pages.filter((p) => p.flow);
  const f0 = flowPages[0].flow;
  const w = f0.widths;
  const n = w.length - 6;
  const cols = w.map((mm) => Math.max(8, Math.round(mm * K * PX_MM)));
  const hdr = { b: true, h: 'center', v: 'center' };
  const heights = [15];

  // Header (baris 2–3), sama seperti template; diulang di tiap halaman cetak.
  sh.merge(2, 0, 3, 0, 'No', hdr);
  sh.merge(2, 1, 3, 1, 'Kegiatan', hdr);
  sh.merge(2, 2, 2, 1 + n, 'Pelaksana', hdr);
  doc.actors.forEach((a, i) => sh.set(3, 2 + i, a.name, hdr));
  sh.merge(2, 2 + n, 2, 4 + n, 'Mutu Baku', hdr);
  sh.set(3, 2 + n, 'Kelengkapan', hdr);
  sh.set(3, 3 + n, 'Waktu', hdr);
  sh.set(3, 4 + n, 'Output', { ...hdr, i: true });
  sh.merge(2, 5 + n, 3, 5 + n, 'Keterangan', hdr);
  heights.push(Math.max(f0.H1 * K / PT, 15));
  heights.push(Math.max(f0.H2 * K / PT, ...doc.actors.map((a, i) => need(a.name, cols[2 + i], true))));

  // Baris isi per halaman PDF; `segs` memetakan koordinat tata letak (mm) ke baris sheet.
  const breaks = [];
  const segs = [];
  let r = 4;
  const bodyTop = PAGE.m + f0.H1 + f0.H2;
  const cell = {};
  flowPages.forEach((page, q) => {
    const f = page.flow;
    const list = [];
    let y = bodyTop;
    const band = () => {
      for (let c = 0; c < w.length; c++) sh.set(r, c, null, cell);
      list.push({ y0: y, h: f.band, row: r });
      heights.push(f.band * K / PT);
      y += f.band;
      r++;
    };
    if (f.top) band();
    for (const fr of f.rows) {
      const s = doc.steps[fr.index];
      const texts = [s.kegiatan, s.kelengkapan, s.waktu, s.output, s.keterangan];
      const at = [1, 2 + n, 3 + n, 4 + n, 5 + n];
      sh.set(r, 0, fr.index + 1, { h: 'center' });
      for (let c = 2; c < 2 + n; c++) sh.set(r, c, null, cell);
      at.forEach((c, k) => sh.set(r, c, texts[k], cell));
      list.push({ y0: y, h: fr.h, row: r });
      heights.push(Math.max(fr.h * K / PT, ...at.map((c, k) => need(texts[k], cols[c]))));
      y += fr.h;
      r++;
    }
    if (f.bot) band();
    segs.push(list);
    if (q < flowPages.length - 1) breaks.push(r - 1);
  });
  const last = Math.max(r - 1, 3);
  heights.forEach((h, i) => sh.height(i + 1, h));

  const grid = new Grid(cols, heights.map(ptRound));
  const colX = [PAGE.m];
  for (const mm of w) colX.push(colX.at(-1) + mm);
  const mapX = (x) => {
    let c = 0;
    while (c < w.length - 1 && colX[c + 1] <= x) c++;
    return grid.cx[c] + ((x - colX[c]) / w[c]) * cols[c] * EMU_PX;
  };
  // Baris yang dipertinggi (teks Excel lebih tinggi): isi diagram tetap berskala K, berpusat di baris.
  const mapY = (q, y) => {
    const list = segs[q];
    const s = list.find((g) => y < g.y0 + g.h) ?? list.at(-1);
    if (!s) return grid.ry[3];
    const top = grid.ry[s.row - 1];
    const H = grid.ry[s.row] - top;
    return top + H / 2 + (y - (s.y0 + s.h / 2)) * K * EMU_MM;
  };

  const dr = new Drawing(grid);
  flowPages.forEach((page, q) => {
    const items = page.items.slice(page.diagram);
    const box = (x, y, bw, bh) => [mapX(x), mapY(q, y), mapX(x + bw) - mapX(x), mapY(q, y + bh) - mapY(q, y)];
    for (let k = 0; k < items.length; k++) {
      const it = items[k];
      const style = { fill: it.fill?.replace('#', '').toUpperCase(), line: it.stroke?.replace('#', '').toUpperCase(), lw: it.lw };
      if (it.t === 'poly' && !it.closed) {
        // Batang garis + mata panah (segitiga berikutnya) menjadi satu garis bebas dengan ujung panah.
        let pts = it.pts;
        const head = items[k + 1];
        const arrow = head?.t === 'poly' && head.closed && head.pts.length === 3;
        if (arrow) (pts = [...pts.slice(0, -1), head.pts[0]]), k++;
        const P = pts.map(([x, y]) => [mapX(x), mapY(q, y)]);
        const xs = P.map((p) => p[0]);
        const ys = P.map((p) => p[1]);
        const X = Math.min(...xs);
        const Y = Math.min(...ys);
        const W = Math.max(1, Math.max(...xs) - X);
        const H = Math.max(1, Math.max(...ys) - Y);
        const path = P.map(([x, y], j) => `<a:${j ? 'lnTo' : 'moveTo'}><a:pt x="${Math.round(x - X)}" y="${Math.round(y - Y)}"/></a:${j ? 'lnTo' : 'moveTo'}>`).join('');
        const geom = `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${Math.round(W)}" h="${Math.round(H)}" fill="none">${path}</a:path></a:pathLst></a:custGeom>`;
        dr.sp(X, Y, W, H, 'Garis alur', geom, { ...style, fill: null, arrow, txBody: '' });
      } else if (it.t === 'rect' && it.bg) {
        // Latar putih label cabang: menjadi isian kotak teks label sesudahnya.
        const next = items[k + 1];
        if (next?.t === 'text') dr.sp(...textBox(next, mapX, (y) => mapY(q, y), it)), k++;
      } else if (it.t === 'rect') {
        dr.sp(...box(it.x, it.y, it.w, it.h), it.r ? 'Mulai/Selesai' : 'Proses', prst(it.r ? 'flowChartTerminator' : 'flowChartProcess'), style);
      } else if (it.t === 'poly' && it.closed && (it.pts.length === 4 || it.pts.length === 5)) {
        const xs = it.pts.map((p) => p[0]);
        const ys = it.pts.map((p) => p[1]);
        const x = Math.min(...xs);
        const y = Math.min(...ys);
        const dec = it.pts.length === 4;
        dr.sp(...box(x, y, Math.max(...xs) - x, Math.max(...ys) - y), dec ? 'Keputusan' : 'Penghubung', prst(dec ? 'flowChartDecision' : 'flowChartOffpageConnector'), style);
      } else if (it.t === 'text') {
        dr.sp(...textBox(it, mapX, (y) => mapY(q, y)));
      }
    }
  });

  const view = 'zoomScale="70" zoomScaleNormal="70" ';
  const pane = '<pane xSplit="2" ySplit="3" topLeftCell="C4" activePane="bottomRight" state="frozen"/><selection pane="bottomRight" activeCell="C4" sqref="C4"/>';
  return {
    xml: sh.toXml({ cols, view, breaks, last: ref(last, w.length - 1) }).replace('workbookViewId="0"/>', `workbookViewId="0">${pane}</sheetView>`),
    drawing: dr.toXml(),
    printArea: `Flowchart!$A$2:$${colName(w.length - 1)}$${last}`
  };
}

/**
 * Label diagram (Ya/Tidak, huruf penghubung) sebagai kotak teks tanpa garis. Dengan `bg` (latar putih
 * label cabang), kotak berisi putih seukuran latar itu dan teksnya di tengah.
 */
function textBox(it, mapX, mapY, bg = null) {
  const sz = Math.round(it.size * K * 100);
  const chars = Math.max(1, ...it.lines.map((l) => lineText(l).length));
  const wmm = bg ? bg.w : chars * it.size * PT * 0.62 + 2;
  const hmm = it.lines.length * it.size * PT * 1.25;
  const x0 = bg ? bg.x : it.align === 'center' ? it.x - wmm / 2 : it.align === 'right' ? it.x - wmm : it.x;
  const algn = bg ? 'ctr' : { left: 'l', center: 'ctr', right: 'r' }[it.align];
  const fill = bg ? 'FFFFFF' : null;
  const color = (it.color ?? '#000000').replace('#', '').toUpperCase();
  const paras = it.lines.map((l) =>
    `<a:p><a:pPr algn="${algn}"/><a:r><a:rPr lang="id-ID" sz="${sz}"${it.bold ? ' b="1"' : ''}><a:solidFill><a:srgbClr val="${color}"/></a:solidFill>` +
    `<a:latin typeface="Calibri"/></a:rPr><a:t>${xesc(lineText(l))}</a:t></a:r></a:p>`).join('');
  const txBody = `<xdr:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="t"/><a:lstStyle/>${paras}</xdr:txBody>`;
  const X = mapX(x0);
  const Y = mapY(it.y);
  return [X, Y, wmm * K * EMU_MM, hmm * K * EMU_MM, 'Label', prst('rect'), { txBox: true, txBody, fill }];
}

// ---------------------------------------------------------------------------
// Paket XLSX
// ---------------------------------------------------------------------------

function dataUrlBytes(src) {
  const [head, data] = src.split(',');
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, ext: head.includes('jpeg') || head.includes('jpg') ? 'jpeg' : 'png' };
}

let template = null;
async function loadTemplate() {
  if (!template) {
    const res = await fetch(templateUrl);
    if (!res.ok) throw new Error('Template XLSX tidak bisa dimuat.');
    template = unzipSync(new Uint8Array(await res.arrayBuffer()));
  }
  return template;
}

export async function exportXlsx(doc) {
  const tpl = await loadTemplate();
  const pages = layoutDocument(doc);
  const styles = new Styles(strFromU8(tpl['xl/styles.xml']));
  const strings = new Strings();

  const media = {};
  const coverRels = [`<Relationship Id="rId1" Type="${REL}/image" Target="../media/image1.png"/>`];
  const rels = {
    image(src) {
      const { bytes, ext } = dataUrlBytes(src);
      const n = coverRels.length + 1;
      media[`xl/media/image${n}.${ext}`] = bytes;
      coverRels.push(`<Relationship Id="rId${n}" Type="${REL}/image" Target="../media/image${n}.${ext}"/>`);
      return 'rId' + n;
    }
  };
  const cover = buildCover(doc, new Sheet(strings, styles), rels);
  const flow = buildFlow(doc, pages, new Sheet(strings, styles));

  const relsXml = (list) => `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.join('')}</Relationships>`;
  const drawingRel = (n) => relsXml([`<Relationship Id="rId1" Type="${REL}/drawing" Target="../drawings/drawing${n}.xml"/>`]);
  const workbook =
    `${XML}<workbook ${NS_MAIN}><workbookPr defaultThemeVersion="124226"/><bookViews><workbookView activeTab="0"/></bookViews>` +
    `<sheets><sheet name="Cover" sheetId="1" r:id="rId1"/><sheet name="Flowchart" sheetId="2" r:id="rId2"/></sheets><definedNames>` +
    `<definedName name="_xlnm.Print_Area" localSheetId="0">${cover.printArea}</definedName>` +
    `<definedName name="_xlnm.Print_Area" localSheetId="1">${flow.printArea}</definedName>` +
    `<definedName name="_xlnm.Print_Titles" localSheetId="1">Flowchart!$2:$3</definedName></definedNames><calcPr calcId="191029"/></workbook>`;
  const title = `SOP ${doc.header.namaSop || ''}`.trim();
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const ct = 'application/vnd.openxmlformats-officedocument';
  const types =
    `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/>` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="${ct}.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="${ct}.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet2.xml" ContentType="${ct}.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/theme/theme1.xml" ContentType="${ct}.theme+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="${ct}.spreadsheetml.styles+xml"/>` +
    `<Override PartName="/xl/sharedStrings.xml" ContentType="${ct}.spreadsheetml.sharedStrings+xml"/>` +
    `<Override PartName="/xl/drawings/drawing1.xml" ContentType="${ct}.drawing+xml"/>` +
    `<Override PartName="/xl/drawings/drawing2.xml" ContentType="${ct}.drawing+xml"/>` +
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
    `<Override PartName="/docProps/app.xml" ContentType="${ct}.extended-properties+xml"/></Types>`;

  const files = {
    '[Content_Types].xml': strToU8(types),
    '_rels/.rels': tpl['_rels/.rels'],
    'docProps/app.xml': tpl['docProps/app.xml'],
    'docProps/core.xml': strToU8(
      `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" ` +
      `xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title>` +
      `<dc:creator>SOP Editor</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`
    ),
    'xl/workbook.xml': strToU8(workbook),
    'xl/_rels/workbook.xml.rels': tpl['xl/_rels/workbook.xml.rels'],
    'xl/theme/theme1.xml': tpl['xl/theme/theme1.xml'],
    'xl/styles.xml': strToU8(styles.toXml()),
    'xl/sharedStrings.xml': strToU8(strings.toXml()),
    'xl/worksheets/sheet1.xml': strToU8(cover.xml),
    'xl/worksheets/sheet2.xml': strToU8(flow.xml),
    'xl/worksheets/_rels/sheet1.xml.rels': strToU8(drawingRel(1)),
    'xl/worksheets/_rels/sheet2.xml.rels': strToU8(drawingRel(2)),
    'xl/drawings/drawing1.xml': strToU8(cover.drawing),
    'xl/drawings/drawing2.xml': strToU8(flow.drawing),
    'xl/drawings/_rels/drawing1.xml.rels': strToU8(relsXml(coverRels)),
    'xl/media/image1.png': tpl['xl/media/image1.png'],
    ...media
  };
  return new Blob([zipSync(files, { level: 6 })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
