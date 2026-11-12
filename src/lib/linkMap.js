// Peta keterkaitan: graf SOP yang saling tertaut lewat butir Keterkaitan, beserta tata letaknya (gaya pegas sederhana,
// deterministik: hasilnya sama untuk data yang sama).

export const NODE_W = 190;
export const NODE_H = 50;
const GAP = 36;
const MARGIN = 24;
const ASPECT = 2.2; // kotak simpul melebar, jadi jarak mendatar dihitung lebih rapat
const K = 120;
const ITER = 300;
const LINE_CHARS = 26;

/** sops: baris pustaka dengan `links` ([{ sop }]). Hasil: { nodes: sops yang punya tautan, edges, hidden }. */
export function linkGraph(sops) {
  const ids = new Set(sops.map((s) => s.id));
  const pairs = new Map();
  let hidden = 0;
  for (const s of sops) {
    for (const l of s.links ?? []) {
      if (!l?.sop || l.sop === s.id) continue;
      if (!ids.has(l.sop)) hidden++;
      else pairs.set(`${s.id}>${l.sop}`, [s.id, l.sop]);
    }
  }
  const edges = [];
  const done = new Set();
  for (const [key, [from, to]] of pairs) {
    if (done.has(key)) continue;
    const back = `${to}>${from}`;
    const both = pairs.has(back);
    done.add(key);
    if (both) done.add(back);
    edges.push({ key, from, to, both });
  }
  const linked = new Set(edges.flatMap((e) => [e.from, e.to]));
  return { nodes: sops.filter((s) => linked.has(s.id)), edges, hidden };
}

/** Membungkus judul menjadi paling banyak `max` baris. */
function wrap(text, max = 2) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= LINE_CHARS) cur += ' ' + w;
    else {
      lines.push(cur);
      cur = w;
      if (lines.length === max - 1) {
        cur = words.slice(i).join(' ');
        break;
      }
    }
  }
  if (cur) lines.push(cur);
  return lines.map((l) => (l.length > LINE_CHARS ? l.slice(0, LINE_CHARS - 1).trimEnd() + '…' : l));
}

/** Posisi simpul satu komponen terhubung (indeks `list`), titik tengah di sekitar (0, 0). */
function forceLayout(list, adj) {
  const n = list.length;
  if (n === 1) return [[0, 0]];
  const local = new Map(list.map((g, i) => [g, i]));
  const r = Math.max(K, (n * K) / (2 * Math.PI));
  const pos = list.map((_, i) => [r * Math.cos((2 * Math.PI * i) / n), r * Math.sin((2 * Math.PI * i) / n)]);
  const links = [];
  list.forEach((g, i) => adj[g].forEach((h) => i < local.get(h) && links.push([i, local.get(h)])));
  for (let it = 0; it < ITER; it++) {
    const t = K * 1.5 * (1 - it / ITER) + 1;
    const disp = pos.map(() => [0, 0]);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = pos[i][0] - pos[j][0];
        let dy = pos[i][1] - pos[j][1];
        let d = Math.hypot(dx, dy);
        if (d < 0.01) (dx = 0.01 * (i - j)), (dy = 0.01), (d = Math.hypot(dx, dy));
        const f = (K * K) / d;
        disp[i][0] += (dx / d) * f;
        disp[i][1] += (dy / d) * f;
        disp[j][0] -= (dx / d) * f;
        disp[j][1] -= (dy / d) * f;
      }
    }
    for (const [i, j] of links) {
      const dx = pos[i][0] - pos[j][0];
      const dy = pos[i][1] - pos[j][1];
      const d = Math.max(0.01, Math.hypot(dx, dy));
      const f = (d * d) / K;
      disp[i][0] -= (dx / d) * f;
      disp[i][1] -= (dy / d) * f;
      disp[j][0] += (dx / d) * f;
      disp[j][1] += (dy / d) * f;
    }
    for (let i = 0; i < n; i++) {
      disp[i][0] -= pos[i][0] * 0.05;
      disp[i][1] -= pos[i][1] * 0.05;
      const d = Math.max(0.01, Math.hypot(disp[i][0], disp[i][1]));
      const s = Math.min(d, t) / d;
      pos[i][0] += disp[i][0] * s;
      pos[i][1] += disp[i][1] * s;
    }
  }
  const out = pos.map(([x, y]) => [x * ASPECT, y]);
  // Kotak yang masih bertumpuk digeser menjauh pada sumbu yang tumpangnya lebih kecil.
  for (let it = 0; it < 80; it++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = out[j][0] - out[i][0];
        const dy = out[j][1] - out[i][1];
        const ox = NODE_W + GAP - Math.abs(dx);
        const oy = NODE_H + GAP - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        if (ox / NODE_W < oy / NODE_H) {
          const s = (dx >= 0 ? 1 : -1) * (ox / 2 + 0.5);
          out[i][0] -= s;
          out[j][0] += s;
        } else {
          const s = (dy >= 0 ? 1 : -1) * (oy / 2 + 0.5);
          out[i][1] -= s;
          out[j][1] += s;
        }
      }
    }
    if (!moved) break;
  }
  return out;
}

/**
 * Tata letak graf: tiap komponen terhubung ditata sendiri, lalu disusun berderet dari yang terbesar.
 * Hasil: { nodes: [{ id, sop, title, lines, search, x, y }], w, h } (x, y = titik tengah simpul).
 */
export function layoutGraph({ nodes, edges }, titleOf) {
  const idx = new Map(nodes.map((s, i) => [s.id, i]));
  const adj = nodes.map(() => []);
  for (const e of edges) {
    const [a, b] = [idx.get(e.from), idx.get(e.to)];
    adj[a].push(b);
    adj[b].push(a);
  }
  const comp = new Array(nodes.length).fill(-1);
  const comps = [];
  nodes.forEach((_, i) => {
    if (comp[i] >= 0) return;
    const list = [i];
    comp[i] = comps.length;
    for (let k = 0; k < list.length; k++) {
      for (const h of adj[list[k]]) if (comp[h] < 0) (comp[h] = comps.length), list.push(h);
    }
    comps.push(list);
  });

  const blocks = comps
    .map((list) => {
      const pos = forceLayout(list, adj);
      const xs = pos.map((p) => p[0]);
      const ys = pos.map((p) => p[1]);
      const [x0, y0] = [Math.min(...xs) - NODE_W / 2, Math.min(...ys) - NODE_H / 2];
      return { list, pos: pos.map(([x, y]) => [x - x0, y - y0]), w: Math.max(...xs) - x0 + NODE_W / 2, h: Math.max(...ys) - y0 + NODE_H / 2 };
    })
    .sort((a, b) => b.list.length - a.list.length || b.w - a.w);

  // Penyusunan berderet (rak): baris baru bila lebar melebihi batas.
  const maxW = Math.max(1200, ...blocks.map((b) => b.w));
  const placed = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  let w = 0;
  for (const b of blocks) {
    if (x > 0 && x + b.w > maxW) {
      x = 0;
      y += rowH + GAP * 2;
      rowH = 0;
    }
    b.list.forEach((g, k) => (placed[g] = [MARGIN + x + b.pos[k][0], MARGIN + y + b.pos[k][1]]));
    x += b.w + GAP * 2;
    w = Math.max(w, x - GAP * 2);
    rowH = Math.max(rowH, b.h);
  }

  return {
    nodes: nodes.map((s, i) => {
      const title = titleOf(s);
      return { id: s.id, sop: s, title, lines: wrap(title), search: `${title} ${s.nomor ?? ''}`.toLowerCase(), x: placed[i][0], y: placed[i][1] };
    }),
    w: w + MARGIN * 2,
    h: y + rowH + MARGIN * 2
  };
}
