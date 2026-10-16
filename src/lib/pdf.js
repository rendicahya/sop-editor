import { jsPDF } from 'jspdf';
import { layoutDocument, baseline, PAGE } from './layout.js';
import { FONT, registerFonts } from './fonts.js';

export function exportPdf(doc) {
  const pages = layoutDocument(doc);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape', compress: true });
  pdf.setProperties({ title: `SOP ${doc.header.namaSop || ''}`.trim(), creator: 'SOP Editor' });
  pdf.setLineJoin('miter');
  registerFonts(pdf);

  pages.forEach((page, i) => {
    if (i > 0) pdf.addPage('a4', 'landscape');
    for (const it of page.items) drawItem(pdf, it);
  });
  return pdf;
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
      pdf.setFont(FONT, it.bold ? 'bold' : 'normal');
      pdf.setFontSize(it.size);
      pdf.setTextColor(it.color ?? '#000000');
      it.lines.forEach((line, i) => pdf.text(line, it.x, baseline(it, i), { align: it.align ?? 'left' }));
      break;
    case 'image': {
      const fmt = it.src.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
      pdf.addImage(it.src, fmt, it.x, it.y, it.w, it.h, undefined, 'FAST');
      break;
    }
    // 'placeholder' hanya untuk pratinjau
  }
}

export { PAGE };
