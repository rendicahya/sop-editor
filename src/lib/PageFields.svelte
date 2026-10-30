<script module>
  // Garis alur yang sedang dipilih ({ step, branch, fid, mx, my }); dipakai bersama semua halaman
  // karena garis antarhalaman terdiri atas dua bagian.
  let edgeSel = $state(null);
  // Isian yang sedang diseret untuk diurutkan ({ kind, index }); bisa dilepas di halaman mana pun.
  let reorder = $state(null);
</script>

<script>
  import { tick } from 'svelte';
  import { asStep } from './history.js';
  import { app } from './store.svelte.js';
  import { readImage } from './files.js';
  import { PT } from './layout.js';
  import { newStep, removeStep, uid, SHAPES, SECTION_DEFS } from './model.js';
  import { collab } from './collab.svelte.js';
  import { plainText, sliceRich, getSelection, setSelection } from './richtext.js';
  import RichField from './RichField.svelte';
  import ContextMenu from './ContextMenu.svelte';

  // Lapisan isian di atas halaman (identitas dan diagram alir): teks diketik langsung pada posisinya di dokumen.
  // Teks isian dibuat transparan sehingga yang terlihat tetap hasil render SVG (sama dengan PDF);
  // hanya kursor dan seleksi yang berasal dari elemen isian.
  let { fields, editable = true } = $props();

  const h = $derived(app.doc.header);
  const items = (key) => app.doc.sections[key].items;

  /** Objek pemilik isian beserta kuncinya: langkah, pelaksana, butir bagian, atau kop. */
  function target(f) {
    if (f.step) return [app.doc.steps.find((s) => s.id === f.step), f.key];
    if (f.actor) return [app.doc.actors.find((a) => a.id === f.actor), f.key];
    if (f.kind === 'item') return [items(f.key), f.index];
    return [h, f.key];
  }
  const value = (f) => {
    const [o, k] = target(f);
    return o?.[k] ?? '';
  };
  function setValue(f, v) {
    const [o, k] = target(f);
    if (o) o[k] = v;
  }

  function moveStep(f) {
    const s = app.doc.steps.find((s) => s.id === f.step);
    if (!s) return;
    s.actor = f.actor;
    if (s.with?.includes(f.actor)) setWith(s, s.with.filter((id) => id !== f.actor));
  }

  /** Pelaksana lain pada kegiatan bersama; daftar kosong menghapus kuncinya. */
  function setWith(s, ids) {
    const list = actors.map((a) => a.id).filter((id) => ids.includes(id) && id !== s.actor);
    if (list.length) s.with = list;
    else delete s.with;
  }
  const toggleWith = (s, id) => setWith(s, s.with?.includes(id) ? s.with.filter((x) => x !== id) : [...(s.with ?? []), id]);

  // Kelompok isian yang sedang disorot/difokus (pelaksana atau baris langkah): alatnya ditampilkan.
  let hover = $state(null);
  let focused = $state(null);
  const groupOf = (e) => e.target.closest?.('[data-hot]')?.dataset.hot ?? null;
  const isHot = (f) => hover === f.hot || focused === f.hot;

  const actors = $derived(app.doc.actors);
  const steps = $derived(app.doc.steps);
  const usage = (id) => steps.filter((s) => s.actor === id).length;

  function moveActor(i, d) {
    const j = i + d;
    if (j < 0 || j >= actors.length) return;
    [actors[i], actors[j]] = [actors[j], actors[i]];
  }
  function addActor(i) {
    const a = { id: uid(), name: '' };
    actors.splice(i + 1, 0, a);
    focusField('a:' + a.id);
  }
  // Pelaksana hanya bisa dihapus bila tidak ada langkah di lajurnya (dan bukan satu-satunya).
  const actorLock = (a) =>
    !a ? 'Tidak ditemukan' : actors.length <= 1 ? 'Minimal harus ada satu pelaksana' : usage(a.id) ? `Tidak bisa dihapus: ${usage(a.id)} langkah dilakukan pelaksana ini` : '';
  function removeActor(i) {
    if (actorLock(actors[i])) return;
    const id = actors[i].id;
    asStep(() => {
      actors.splice(i, 1);
      for (const s of steps) if (s.with?.includes(id)) setWith(s, s.with);
    });
  }

  function addStep(i) {
    const s = newStep(steps[i]?.actor ?? actors[0].id);
    steps.splice(i + 1, 0, s);
    focusField(`st:${s.id}:kegiatan`);
  }
  function moveStepRow(i, d) {
    const j = i + d;
    if (j < 0 || j >= steps.length) return;
    [steps[i], steps[j]] = [steps[j], steps[i]];
  }
  function duplicateStep(i) {
    const { route: _, ...copy } = $state.snapshot(steps[i]);
    steps.splice(i + 1, 0, { ...copy, id: uid(), next: 'auto', alt: null });
  }
  // Peserta kolaborasi yang sedang mengedit langkah ini.
  const editors = (id) => collab.peers.filter((p) => p.focus?.step === id);

  // Menu simbol: id langkah yang menunya sedang terbuka.
  let menu = $state(null);
  const short = (s, i) => {
    const k = plainText(s.kegiatan);
    return `${i + 1}. ${k.length > 36 ? k.slice(0, 36) + '…' : k || '(tanpa nama)'}`;
  };
  function closeMenu(e) {
    if (menu && !e.target.closest?.('.f-shape')) menu = null;
    if (edgeSel && !e.target.closest?.('.e-hit, .e-handle, .edge-menu')) edgeSel = null;
  }

  // Jalur manual garis alur: pilih sisi keluar/masuk dan seret ruas garis (lihat layout.js).
  const SIDE_OUT = [['', 'Otomatis'], ['bottom', 'Bawah'], ['left', 'Kiri'], ['right', 'Kanan']];
  const SIDE_IN = [['', 'Otomatis'], ['top', 'Atas'], ['bottom', 'Bawah'], ['left', 'Kiri'], ['right', 'Kanan']];
  const routeOf = (f) => steps.find((s) => s.id === f.step)?.route?.[f.branch] ?? null;
  const isSel = (f) => edgeSel?.step === f.step && edgeSel?.branch === f.branch;
  const clamp01 = (v) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;

  /** Mengubah jalur manual satu cabang; nilai null menghapus kuncinya (semua kosong = otomatis). */
  function setRoute(f, patch) {
    const s = steps.find((s) => s.id === f.step);
    if (!s) return;
    asStep(() => {
      const all = $state.snapshot(s.route) ?? {};
      const r = { ...all[f.branch], ...patch };
      for (const k of Object.keys(r)) if (r[k] == null) delete r[k];
      if (Object.keys(r).length) all[f.branch] = r;
      else delete all[f.branch];
      if (Object.keys(all).length) s.route = all;
      else delete s.route;
    });
  }

  let root = $state();
  /** Posisi penunjuk dalam mm halaman. */
  function toMm(e) {
    const r = root.getBoundingClientRect();
    const k = 297 / r.width;
    return [(e.clientX - r.left) * k, (e.clientY - r.top) * k];
  }
  function pickEdge(e, f) {
    if (e.button !== 0) return;
    const [mx, my] = toMm(e);
    edgeSel = { step: f.step, branch: f.branch, fid: f.id, mx, my };
    menu = null;
  }

  // Seret ruas: ruas tegak bergeser mendatar (menjadi `x`), ruas mendatar bergeser tegak (menjadi `y`).
  let drag = $state(null);
  const segments = (pts) =>
    pts.slice(1).map((b, i) => ({ i, a: pts[i], b, vertical: Math.abs(pts[i][0] - b[0]) < 0.01 })).filter((s) => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) >= 3);
  function startDrag(e, f, seg) {
    e.preventDefault();
    const [mx, my] = toMm(e);
    drag = { fid: f.id, f, seg, start: seg.vertical ? mx : my, d: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function moveDrag(e) {
    if (!drag) return;
    const [mx, my] = toMm(e);
    drag.d = (drag.seg.vertical ? mx : my) - drag.start;
  }
  function endDrag() {
    if (!drag) return;
    const { f, seg, d } = drag;
    drag = null;
    if (Math.abs(d) < 0.5) return;
    if (seg.vertical) {
      const v = seg.a[0] + d;
      const lane = f.lanes.find((l) => v >= l.x && v < l.x + l.w) ?? (v < f.lanes[0].x ? f.lanes[0] : f.lanes.at(-1));
      setRoute(f, { x: { actor: lane.actor, f: clamp01((v - lane.x) / lane.w) } });
    } else if (f.rows.length) {
      const v = seg.a[1] + d;
      const dist = (r) => (v < r.y ? r.y - v : v > r.y + r.h ? v - r.y - r.h : 0);
      const row = f.rows.reduce((p, r) => (dist(r) < dist(p) ? r : p));
      setRoute(f, { y: { step: row.step, f: clamp01((v - row.y) / row.h) } });
    }
  }
  /** Titik garis, dengan ruas yang sedang diseret digeser (pratinjau). */
  function shown(f) {
    if (drag?.fid !== f.id) return f.pts;
    const { seg, d } = drag;
    const mv = (p) => (seg.vertical ? [p[0] + d, p[1]] : [p[0], p[1] + d]);
    return [...f.pts.slice(0, seg.i + 1), mv(seg.a), mv(seg.b), ...f.pts.slice(seg.i + 1)];
  }
  const ptsAttr = (pts) => pts.map((p) => p.join(',')).join(' ');

  // Seret-lepas untuk mengurutkan langkah (step), pelaksana (actor), dan butir ketentuan (item:<bagian>).
  // Sasaran lepas dicari di semua halaman; penanda posisinya digambar di atas viewport.
  const listOf = (kind) => (kind === 'step' ? steps : kind === 'actor' ? actors : items(kind.slice(5)));
  const isDragged = (kind, index) => reorder?.kind === kind && reorder.index === index;
  let rd = null; // { kind, index, x, y, moved, px, py, slot, scroller, raf }
  let mark = null;

  function startReorder(e, kind, index) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    rd = { kind, index, x: e.clientX, y: e.clientY, moved: false, slot: null, scroller: root.closest('.preview-scroll') };
  }
  function moveReorder(e) {
    if (!rd) return;
    if (!rd.moved) {
      if (Math.hypot(e.clientX - rd.x, e.clientY - rd.y) < 4) return;
      rd.moved = true;
      reorder = { kind: rd.kind, index: rd.index };
      menu = edgeSel = null;
      rd.raf = requestAnimationFrame(autoScroll);
    }
    rd.px = e.clientX;
    rd.py = e.clientY;
    locate();
  }
  // Menggulir sendiri saat penunjuk dekat tepi atas/bawah area halaman.
  function autoScroll() {
    if (!rd) return;
    const s = rd.scroller;
    if (s) {
      const r = s.getBoundingClientRect();
      const d = rd.py < r.top + 48 ? rd.py - r.top - 48 : rd.py > r.bottom - 48 ? rd.py - r.bottom + 48 : 0;
      if (d) {
        s.scrollTop += Math.max(-24, Math.min(24, d / 2));
        locate();
      }
    }
    rd.raf = requestAnimationFrame(autoScroll);
  }
  function locate() {
    const horiz = rd.kind === 'actor';
    let best = null;
    let bd = Infinity;
    for (const el of document.querySelectorAll(`.fields:not([inert]) [data-drop="${rd.kind}"]`)) {
      const r = el.getBoundingClientRect();
      const d = Math.max(r.left - rd.px, 0, rd.px - r.right) + Math.max(r.top - rd.py, 0, rd.py - r.bottom);
      if (d < bd) [bd, best] = [d, { el, r }];
    }
    if (!best) return;
    const { el, r } = best;
    const after = horiz ? rd.px > r.left + r.width / 2 : rd.py > r.top + r.height / 2;
    rd.slot = +el.dataset.index + (after ? 1 : 0);
    if (!mark) {
      mark = document.createElement('div');
      mark.className = 'drop-mark';
      document.body.append(mark);
    }
    Object.assign(
      mark.style,
      horiz
        ? { left: `${(after ? r.right : r.left) - 1.5}px`, top: `${r.top}px`, width: '3px', height: `${r.height}px` }
        : { left: `${r.left}px`, top: `${(after ? r.bottom : r.top) - 1.5}px`, width: `${r.width}px`, height: '3px' }
    );
  }
  function endReorder(drop = true) {
    if (!rd) return;
    const { kind, index, moved, slot, raf } = rd;
    rd = null;
    reorder = null;
    cancelAnimationFrame(raf);
    mark?.remove();
    mark = null;
    if (!drop || !moved || slot == null) return;
    const to = slot > index ? slot - 1 : slot;
    if (to === index) return;
    const list = listOf(kind);
    asStep(() => list.splice(to, 0, ...list.splice(index, 1)));
  }
  const grip = (kind, index, what) => ({
    tabindex: -1,
    title: `Seret untuk memindahkan ${what}`,
    'aria-label': `Seret untuk memindahkan ${what}`,
    onpointerdown: (e) => startReorder(e, kind, index),
    onpointermove: moveReorder,
    onpointerup: () => endReorder(),
    onpointercancel: () => endReorder(false),
    onlostpointercapture: () => endReorder(false)
  });

  /** Fokus ke isian `id` setelah tata letak diperbarui, dengan kursor di posisi `caret`. */
  async function focusField(id, caret = null) {
    await tick();
    const el = document.querySelector(`[data-field="${id}"]`);
    if (!el) return;
    el.focus();
    if (caret === null) return;
    if (el.isContentEditable) setSelection(el, caret);
    else el.setSelectionRange(caret, caret);
  }

  function onTextKey(e, f) {
    if (e.key === 'Enter' && !e.shiftKey && !f.multiline) e.preventDefault();
  }

  // Butir ketentuan berformat: posisi kursor dihitung pada teks polos, pemecahan butir mempertahankan format.
  function onItemKey(e, f) {
    const list = items(f.key);
    const i = f.index;
    const sel = getSelection(e.currentTarget) ?? { start: 0, end: 0 };
    const { start: a, end: b } = sel;
    const text = list[i];
    const len = plainText(text).length;
    const at = (j, caret) => focusField(`s:${f.key}:${j}`, caret);

    if (e.key === 'Enter' && !e.shiftKey) {
      // Enter memecah butir di posisi kursor.
      e.preventDefault();
      list[i] = sliceRich(text, 0, a);
      list.splice(i + 1, 0, sliceRich(text, b));
      at(i + 1, 0);
    } else if (e.key === 'Backspace' && a === 0 && b === 0) {
      if (i > 0) {
        e.preventDefault();
        const prev = list[i - 1];
        list[i - 1] = prev + text;
        list.splice(i, 1);
        at(i - 1, plainText(prev).length);
      } else if (!len) {
        e.preventDefault();
        list.splice(0, 1);
        if (list.length) at(0, 0);
      }
    } else if (e.key === 'Delete' && a === len && b === a && i + 1 < list.length) {
      e.preventDefault();
      list[i] = text + list[i + 1];
      list.splice(i + 1, 1);
      at(i, a);
    } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      // Alt+↑/↓ memindahkan butir.
      e.preventDefault();
      const j = i + (e.key === 'ArrowUp' ? -1 : 1);
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      at(j, a);
    } else if (e.key === 'ArrowUp' && a === 0 && b === 0 && i > 0) {
      e.preventDefault();
      at(i - 1, plainText(list[i - 1]).length);
    } else if (e.key === 'ArrowDown' && a === len && i + 1 < list.length) {
      e.preventDefault();
      at(i + 1, 0);
    }
  }

  function addItem(key) {
    items(key).push('');
    focusField(`s:${key}:${items(key).length - 1}`, 0);
  }

  function removeItem(f) {
    items(f.key).splice(f.index, 1);
  }

  function fromActors() {
    app.doc.sections.kualifikasi.items = app.doc.actors.map((a) => a.name);
  }

  let fileInput = $state();
  let imageError = $state('');
  async function pickImage(e) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    imageError = '';
    try {
      h.signature = await readImage(file);
    } catch (err) {
      imageError = err.message;
    }
  }

  // ---------------------------------------------------------------------------
  // Menu klik kanan: isinya sesuai isian yang diklik (Shift+klik kanan = menu bawaan browser).
  // ---------------------------------------------------------------------------
  let ctx = $state(null);
  const SEP = { sep: true };

  function insertStep(at, actor) {
    const s = newStep(actor ?? actors[0].id);
    steps.splice(at, 0, s);
    focusField(`st:${s.id}:kegiatan`);
  }
  function insertItem(key, at) {
    items(key).splice(at, 0, '');
    focusField(`s:${key}:${at}`, 0);
  }
  function moveItem(key, i, d) {
    const list = items(key);
    const j = i + d;
    if (j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]];
  }

  /** Potong/salin/tempel dan format untuk isian teks; fokus dan seleksinya tetap di isian. */
  function editItems(el) {
    const rich = !el.matches('textarea');
    const sel = document.getSelection();
    const hasSel = rich ? !!sel && !sel.isCollapsed && el.contains(sel.anchorNode) : el.selectionStart !== el.selectionEnd;
    const exec = (cmd) => () => {
      el.focus();
      asStep(() => document.execCommand(cmd));
    };
    async function paste() {
      let t;
      try {
        t = await navigator.clipboard.readText();
      } catch {
        alert('Browser tidak mengizinkan membaca clipboard dari menu. Gunakan Ctrl+V.');
        return;
      }
      el.focus();
      asStep(() => {
        if (!rich) return document.execCommand('insertText', false, t);
        // Isian berformat menangani tempel sendiri (teks polos, tanpa baris baru untuk isian satu baris).
        const data = new DataTransfer();
        data.setData('text/plain', t);
        el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
      });
    }
    const out = [
      { label: 'Potong', hint: 'Ctrl+X', disabled: !hasSel, run: exec('cut') },
      { label: 'Salin', hint: 'Ctrl+C', disabled: !hasSel, run: exec('copy') },
      { label: 'Tempel', hint: 'Ctrl+V', disabled: !navigator.clipboard?.readText, run: paste },
      { label: 'Pilih semua', hint: 'Ctrl+A', run: () => (el.focus(), rich ? document.execCommand('selectAll') : el.select()) }
    ];
    if (rich) {
      out.push(
        SEP,
        { label: 'Tebal', hint: 'Ctrl+B', checked: document.queryCommandState('bold'), run: exec('bold') },
        { label: 'Miring', hint: 'Ctrl+I', checked: document.queryCommandState('italic'), run: exec('italic') },
        { label: 'Garis bawah', hint: 'Ctrl+U', checked: document.queryCommandState('underline'), run: exec('underline') }
      );
    }
    return out;
  }

  function stepItems(f) {
    const i = steps.findIndex((s) => s.id === f.step);
    const s = steps[i];
    if (!s) return [];
    const out = [{ head: short(s, i) }];
    if (f.kind === 'lane') out.push({ label: `Pindahkan ke ${f.name || 'pelaksana ini'}`, run: () => asStep(() => moveStep(f)) }, SEP);
    out.push(
      ...SHAPES.map((sh) => ({ label: sh.label, checked: s.shape === sh.value, run: () => asStep(() => (s.shape = sh.value)) })),
      { label: 'Atur alur & kegiatan bersama…', run: () => ((edgeSel = null), (menu = s.id)) }
    );
    const others = actors.map((a, j) => [a, j]).filter(([a]) => a.id !== s.actor);
    if (others.length && f.kind !== 'lane') {
      out.push(SEP, { head: 'Pindahkan ke pelaksana' },
        ...others.map(([a, j]) => ({ label: a.name || `Pelaksana ${j + 1}`, run: () => asStep(() => moveStep({ step: s.id, actor: a.id })) })));
    }
    out.push(
      SEP,
      { label: 'Tambah kegiatan di atas', run: () => insertStep(i, s.actor) },
      { label: 'Tambah kegiatan di bawah', run: () => insertStep(i + 1, s.actor) },
      { label: 'Duplikat', run: () => asStep(() => duplicateStep(i)) },
      { label: 'Naikkan', disabled: i === 0, run: () => asStep(() => moveStepRow(i, -1)) },
      { label: 'Turunkan', disabled: i === steps.length - 1, run: () => asStep(() => moveStepRow(i, 1)) },
      SEP,
      { label: 'Hapus kegiatan', danger: true, run: () => asStep(() => removeStep(steps, i)) }
    );
    return out;
  }

  function actorItems(id) {
    const i = actors.findIndex((a) => a.id === id);
    const a = actors[i];
    if (!a) return [];
    const lock = actorLock(a);
    return [
      { head: a.name || `Pelaksana ${i + 1}` },
      { label: 'Tambah pelaksana di kiri', run: () => addActor(i - 1) },
      { label: 'Tambah pelaksana di kanan', run: () => addActor(i) },
      { label: 'Geser ke kiri', disabled: i === 0, run: () => asStep(() => moveActor(i, -1)) },
      { label: 'Geser ke kanan', disabled: i === actors.length - 1, run: () => asStep(() => moveActor(i, 1)) },
      SEP,
      { label: 'Hapus pelaksana', danger: true, disabled: !!lock, title: lock, run: () => removeActor(i) }
    ];
  }

  function sectionItems(key, add = true) {
    const sec = app.doc.sections[key];
    return [
      { head: SECTION_DEFS.find((d) => d.key === key)?.title ?? '' },
      { label: 'Bernomor', checked: sec.numbered, run: () => asStep(() => (sec.numbered = !sec.numbered)) },
      ...(key === 'kualifikasi' ? [{ label: 'Isi dari daftar pelaksana', run: () => asStep(fromActors) }] : []),
      ...(add ? [{ label: 'Tambah butir', run: () => addItem(key) }] : [])
    ];
  }

  function itemItems(f) {
    const n = items(f.key).length;
    const i = f.index;
    return [
      ...sectionItems(f.key, false),
      SEP,
      { label: 'Tambah butir di atas', run: () => insertItem(f.key, i) },
      { label: 'Tambah butir di bawah', run: () => insertItem(f.key, i + 1) },
      { label: 'Naikkan', hint: 'Alt+↑', disabled: i === 0, run: () => asStep(() => moveItem(f.key, i, -1)) },
      { label: 'Turunkan', hint: 'Alt+↓', disabled: i === n - 1, run: () => asStep(() => moveItem(f.key, i, 1)) },
      SEP,
      { label: 'Hapus butir', danger: true, run: () => asStep(() => removeItem(f)) }
    ];
  }

  function ctxItems(f, e) {
    const out = [];
    const el = e.target.closest?.('textarea, .f-rich');
    if (el) out.push(...editItems(el), SEP);
    if (f.kind === 'edge') {
      const [mx, my] = toMm(e);
      out.push(
        { head: 'Garis alur' },
        { label: 'Atur jalur garis…', run: () => ((menu = null), (edgeSel = { step: f.step, branch: f.branch, fid: f.id, mx, my })) },
        { label: 'Kembalikan jalur otomatis', disabled: !routeOf(f), run: () => setRoute(f, { from: null, to: null, x: null, y: null }) }
      );
    } else if (f.step) out.push(...stepItems(f));
    else if (f.actor) out.push(...actorItems(f.actor));
    else if (f.kind === 'item') out.push(...itemItems(f));
    else if (f.kind === 'section' || f.kind === 'empty') out.push(...sectionItems(f.key));
    else if (f.kind === 'add-step') out.push({ label: 'Tambah kegiatan', run: () => addStep(-1) });
    else if (f.kind === 'image') {
      out.push(
        { label: h.signature ? 'Ganti tanda tangan…' : 'Pilih tanda tangan / stempel…', run: () => fileInput.click() },
        { label: 'Hapus tanda tangan', danger: true, disabled: !h.signature, run: () => asStep(() => (h.signature = null)) }
      );
    }
    // Rapikan pemisah di awal, di akhir, dan yang berurutan.
    return out.filter((it, i, a) => !it.sep || (i > 0 && i < a.length - 1 && !a[i - 1].sep));
  }

  function openCtx(e) {
    if (e.shiftKey || !editable) return;
    const fid = e.target.closest?.('[data-fid]')?.dataset.fid;
    const f = fid && fields.find((x) => x.id === fid);
    const list = f ? ctxItems(f, e) : [];
    if (!list.length) return;
    e.preventDefault();
    let { clientX: x, clientY: y } = e;
    // Dibuka dari keyboard (tombol Menu / Shift+F10): letakkan di bawah elemen.
    if (!x && !y) {
      const r = e.target.getBoundingClientRect();
      x = r.left + 8;
      y = r.top + Math.min(r.height, 22);
    }
    ctx = { x, y, items: list };
  }

  const box = (f) =>
    `left:calc(${f.x} * var(--mm));top:calc(${f.y} * var(--mm));width:calc(${f.w} * var(--mm));height:calc(${f.h} * var(--mm));` +
    (f.size ? `font-size:calc(${f.size * PT} * var(--mm));` : '') +
    (f.pad ? `padding:calc(${f.pad} * var(--mm));` : '');
</script>

<svelte:window onpointerdown={closeMenu} onkeydown={(e) => e.key === 'Escape' && (endReorder(false), (menu = edgeSel = null))} /><div
  bind:this={root}
  class="fields"
  inert={!editable}
  onpointerover={(e) => (hover = groupOf(e))}
  onpointerleave={() => (hover = null)}
  onfocusin={(e) => (focused = groupOf(e))}
  onfocusout={() => (focused = null)}
  oncontextmenu={openCtx}
>
  {#each fields as f (f.id)}
    {#if f.kind === 'text' && f.rich}
      <RichField
        class="f-text"
        style={box(f)}
        data-field={f.id}
        data-fid={f.id}
        data-hot={f.hot}
        aria-label={f.label}
        placeholder={f.placeholder ?? ''}
        multiline={f.multiline}
        value={value(f)}
        oninput={(v) => setValue(f, v)}
      />
    {:else if f.kind === 'text'}
      <textarea
        class="f-text"
        class:bold={f.bold}
        class:center={f.align === 'center'}
        style={box(f)}
        data-field={f.id}
        data-fid={f.id}
        data-hot={f.hot}
        aria-label={f.label}
        placeholder={f.placeholder ?? ''}
        spellcheck="false"
        value={value(f)}
        oninput={(e) => setValue(f, e.currentTarget.value)}
        onkeydown={(e) => onTextKey(e, f)}
      ></textarea>
    {:else if f.kind === 'item'}
      <div class="f-item" class:dragged={isDragged('item:' + f.key, f.index)} style={box({ ...f, size: 0, pad: 0 })} data-fid={f.id} data-drop="item:{f.key}" data-index={f.index}>
        <button class="grip" {...grip('item:' + f.key, f.index, 'butir')}>⠿</button>
        <RichField
          class="f-text"
          style="position:absolute;inset:0;font-size:calc({f.size * PT} * var(--mm))"
          data-field={f.id}
          aria-label="Butir {f.index + 1}"
          placeholder="Ketik butir…"
          value={value(f)}
          oninput={(v) => setValue(f, v)}
          onkeydown={(e) => onItemKey(e, f)}
        />
        <button class="f-del" tabindex="-1" title="Hapus butir" aria-label="Hapus butir" onclick={() => removeItem(f)}>✕</button>
      </div>
    {:else if f.kind === 'date'}
      <!-- Input tanggal tak terlihat: hasilnya langsung tampil terformat di halaman. -->
      <span class="f-date" style={box({ ...f, pad: 0 })} title="Pilih tanggal">
        <input
          type="date"
          data-field={f.id}
          aria-label={f.label}
          bind:value={h[f.key]}
          onclick={(e) => e.currentTarget.showPicker?.()}
        />
      </span>
    {:else if f.kind === 'image'}
      <div class="f-image" class:has={!!h.signature} style={box(f)} data-fid={f.id}>
        {#if h.signature}
          <span class="tools">
            <button onclick={() => fileInput.click()}>Ganti tanda tangan</button>
            <button onclick={() => (h.signature = null)}>Hapus</button>
          </span>
        {:else}
          <button class="f-hint" onclick={() => fileInput.click()} title="PNG berlatar transparan akan tampak paling baik">
            + Tanda tangan / stempel (opsional)
          </button>
        {/if}
        {#if imageError}<span class="err">{imageError}</span>{/if}
      </div>
    {:else if f.kind === 'section'}
      <div class="f-head" style={box(f)} data-fid={f.id}>
        <span class="tools">
          <label title="Butir bernomor">
            <input type="checkbox" bind:checked={app.doc.sections[f.key].numbered} /> Bernomor
          </label>
          {#if f.key === 'kualifikasi'}
            <button onclick={fromActors} title="Isi dengan nama-nama pelaksana">Dari pelaksana</button>
          {/if}
          <button onclick={() => addItem(f.key)}>+ Butir</button>
        </span>
      </div>
    {:else if f.kind === 'lane'}
      <button
        class="f-lane"
        style={box(f)}
        data-field={f.id}
        data-fid={f.id}
        data-hot={f.hot}
        tabindex="-1"
        title="Pindahkan langkah ini ke {f.name || 'pelaksana ini'}"
        aria-label="Pindahkan langkah ke {f.name || 'pelaksana ini'}"
        onclick={() => moveStep(f)}
      ></button>
    {:else if f.kind === 'actor-tools'}
      {@const a = actors[f.index]}
      {@const lock = actorLock(a)}
      <div class="f-group" class:hot={isHot(f)} class:dragged={isDragged('actor', f.index)} style={box(f)} data-hot={f.hot} data-fid={f.id} data-drop="actor" data-index={f.index}>
        <span class="g-tools g-top">
          <button class="grip" {...grip('actor', f.index, 'pelaksana')}>⠿</button>
          <button tabindex="-1" title="Geser ke kiri" aria-label="Geser pelaksana ke kiri" aria-disabled={f.index === 0} onclick={() => moveActor(f.index, -1)}>◀</button>
          <button tabindex="-1" title="Tambah pelaksana di kanan" aria-label="Tambah pelaksana" onclick={() => addActor(f.index)}>＋</button>
          <button
            tabindex="-1"
            class="danger"
            title={lock || 'Hapus pelaksana'}
            aria-label="Hapus pelaksana"
            aria-disabled={!!lock}
            onclick={() => removeActor(f.index)}>✕</button
          >
          <button tabindex="-1" title="Geser ke kanan" aria-label="Geser pelaksana ke kanan" aria-disabled={f.index === actors.length - 1} onclick={() => moveActor(f.index, 1)}>▶</button>
        </span>
      </div>
    {:else if f.kind === 'step-tools'}
      {@const peers = editors(f.step)}
      <div
        class="f-group"
        class:hot={isHot(f)}
        class:shared={peers.length}
        class:dragged={isDragged('step', f.index)}
        style="{box(f)}--peer:{peers[0]?.color}"
        data-hot={f.hot}
        data-fid={f.id}
        data-drop="step"
        data-index={f.index}
      >
        <span class="g-tools g-left">
          <button class="grip" {...grip('step', f.index, 'kegiatan')}>⠿</button>
          <button tabindex="-1" title="Naikkan" aria-label="Naikkan kegiatan" aria-disabled={f.index === 0} onclick={() => moveStepRow(f.index, -1)}>▲</button>
          <button tabindex="-1" title="Turunkan" aria-label="Turunkan kegiatan" aria-disabled={f.index === steps.length - 1} onclick={() => moveStepRow(f.index, 1)}>▼</button>
          <button tabindex="-1" title="Duplikat" aria-label="Duplikat kegiatan" onclick={() => duplicateStep(f.index)}>⧉</button>
          <button tabindex="-1" title="Tambah kegiatan di bawah" aria-label="Tambah kegiatan di bawah" onclick={() => addStep(f.index)}>＋</button>
          <button tabindex="-1" class="danger" title="Hapus kegiatan" aria-label="Hapus kegiatan" onclick={() => removeStep(steps, f.index)}>✕</button>
        </span>
        {#if peers.length}
          <span class="peers">{#each peers as p (p.id)}<span style:background={p.color}>{p.name}</span>{/each}</span>
        {/if}
      </div>
    {:else if f.kind === 'shape'}
      {@const s = steps[f.index]}
      {@const open = menu === f.step && s}
      <div class="f-shape" class:open style={box(f)} data-hot={f.hot} data-fid={f.id}>
        <button
          class="f-shape-btn"
          tabindex="-1"
          data-field={f.id}
          title="Ubah simbol"
          aria-label="Ubah simbol langkah {f.index + 1}"
          aria-expanded={!!open}
          onclick={() => (menu = open ? null : f.step)}
        ></button>
        {#if open}
          {@const dec = s.shape === 'decision'}
          <div class="shape-menu" class:up={f.y > 115} role="dialog" aria-label="Simbol langkah {f.index + 1}">
            <div class="seg" role="group" aria-label="Simbol">
              {#each SHAPES as sh (sh.value)}
                <button class:on={s.shape === sh.value} aria-pressed={s.shape === sh.value} onclick={() => (s.shape = sh.value)}>{sh.label}</button>
              {/each}
            </div>
            <label>
              <span>{dec ? 'Jika ya, lanjut ke' : 'Lanjut ke'}</span>
              <select value={s.next} onchange={(e) => (s.next = e.currentTarget.value)}>
                <option value="auto">Langkah berikutnya{f.index + 1 < steps.length ? ` (${f.index + 2})` : ' (tidak ada)'}</option>
                <option value="none">Tidak ada (akhir alur)</option>
                {#each steps as t, j (t.id)}
                  {#if j !== f.index}<option value={t.id}>{short(t, j)}</option>{/if}
                {/each}
              </select>
            </label>
            {#if actors.length > 1}
              <div class="with" role="group" aria-label="Kegiatan bersama">
                <span title="Simbol membentang sampai lajur pelaksana yang dipilih">Dilakukan bersama</span>
                <span class="chips">
                  {#each actors as a, j (a.id)}
                    {#if a.id !== s.actor}
                      {@const on = !!s.with?.includes(a.id)}
                      <button class:on aria-pressed={on} onclick={() => asStep(() => toggleWith(s, a.id))}>{a.name || `Pelaksana ${j + 1}`}</button>
                    {/if}
                  {/each}
                </span>
              </div>
            {/if}
            {#if dec}
              <label>
                <span>Label ya</span>
                <input value={s.yesLabel} oninput={(e) => (s.yesLabel = e.currentTarget.value)} />
              </label>
              <label>
                <span>Jika tidak, ke</span>
                <select value={s.alt ?? ''} onchange={(e) => (s.alt = e.currentTarget.value || null)}>
                  <option value="">—</option>
                  {#each steps as t, j (t.id)}
                    {#if j !== f.index}<option value={t.id}>{short(t, j)}</option>{/if}
                  {/each}
                </select>
              </label>
              <label>
                <span>Label tidak</span>
                <input value={s.noLabel} oninput={(e) => (s.noLabel = e.currentTarget.value)} />
              </label>
            {/if}
          </div>
        {/if}
      </div>
    {:else if f.kind === 'edge'}
      {@const sel = isSel(f)}
      {@const pts = shown(f)}
      <svg class="f-edge" class:sel viewBox="0 0 297 210" aria-hidden={!sel}>
        <polyline
          class="e-hit"
          data-fid={f.id}
          points={ptsAttr(f.pts)}
          role="button"
          tabindex="-1"
          aria-label="Atur jalur garis"
          onpointerdown={(e) => pickEdge(e, f)}
        ><title>Klik untuk mengatur jalur garis</title></polyline>
        {#if sel}
          <polyline class="e-line" points={ptsAttr(pts)} />
          {#each segments(f.pts) as seg (seg.i)}
            <rect
              class="e-handle"
              class:v={seg.vertical}
              x={(seg.a[0] + seg.b[0]) / 2 - 1.1 + (drag?.fid === f.id && drag.seg.i === seg.i && seg.vertical ? drag.d : 0)}
              y={(seg.a[1] + seg.b[1]) / 2 - 1.1 + (drag?.fid === f.id && drag.seg.i === seg.i && !seg.vertical ? drag.d : 0)}
              width="2.2"
              height="2.2"
              rx="0.5"
              role="slider"
              tabindex="-1"
              aria-label="Geser ruas garis"
              aria-valuenow={seg.vertical ? seg.a[0] : seg.a[1]}
              onpointerdown={(e) => startDrag(e, f, seg)}
              onpointermove={moveDrag}
              onpointerup={endDrag}
              onpointercancel={() => (drag = null)}
            ><title>Seret untuk menggeser ruas</title></rect>
          {/each}
        {/if}
      </svg>
      {#if sel && edgeSel.fid === f.id}
        {@const r = routeOf(f)}
        <div
          class="edge-menu"
          class:up={edgeSel.my > 120}
          class:left={edgeSel.mx > 200}
          style="left:calc({edgeSel.mx} * var(--mm));top:calc({edgeSel.my} * var(--mm))"
          role="dialog"
          aria-label="Jalur garis"
        >
          <span class="lbl">Keluar dari</span>
          <div class="seg" role="group" aria-label="Sisi keluar">
            {#each SIDE_OUT as [v, label] (v)}
              <button class:on={(r?.from ?? '') === v} aria-pressed={(r?.from ?? '') === v} onclick={() => setRoute(f, { from: v || null })}>{label}</button>
            {/each}
          </div>
          <span class="lbl">Masuk ke</span>
          <div class="seg" role="group" aria-label="Sisi masuk">
            {#each SIDE_IN as [v, label] (v)}
              <button class:on={(r?.to ?? '') === v} aria-pressed={(r?.to ?? '') === v} onclick={() => setRoute(f, { to: v || null })}>{label}</button>
            {/each}
          </div>
          <p class="hint">Seret kotak kecil pada garis untuk menggeser ruasnya.</p>
          <button class="reset" disabled={!r} onclick={() => setRoute(f, { from: null, to: null, x: null, y: null })}>Kembalikan jalur otomatis</button>
        </div>
      {/if}
    {:else if f.kind === 'add-step'}
      <button class="f-empty f-hint" style={box(f)} data-fid={f.id} onclick={() => addStep(-1)}>+ Tambah kegiatan</button>
    {:else if f.kind === 'empty'}
      <button class="f-empty f-hint" style={box(f)} data-fid={f.id} onclick={() => addItem(f.key)}>+ Tambah butir {f.title.toLowerCase()}</button>
    {/if}
  {/each}
</div>
<input bind:this={fileInput} type="file" accept="image/*" hidden onchange={pickImage} />
{#if ctx}
  {#key ctx}<ContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onclose={() => (ctx = null)} />{/key}
{/if}

<style>
  .fields {
    position: absolute;
    inset: 0;
    --mm: calc(100cqw / 297);
    --edit: 47 102 176;
    font-family: SOPDoc, Calibri, Carlito, sans-serif;
  }
  .fields > * {
    position: absolute;
    box-sizing: border-box;
    margin: 0;
  }
  .f-text {
    border: 0;
    border-radius: 0;
    resize: none;
    overflow: hidden;
    background: transparent;
    color: transparent;
    caret-color: #000;
    font: inherit;
    line-height: 1.2;
    white-space: pre-wrap;
    overflow-wrap: break-word;
    outline: none;
    padding: 0;
    cursor: text;
  }
  /* Isian berformat (RichField) memakai gaya isian teks yang sama. */
  .fields > :global(.f-rich) {
    position: absolute;
    box-sizing: border-box;
    margin: 0;
  }
  .fields :global(.f-rich:hover) {
    background: rgb(var(--edit) / 0.06);
    box-shadow: inset 0 0 0 1px rgb(var(--edit) / 0.35);
  }
  .fields :global(.f-rich:focus) {
    background: rgb(var(--edit) / 0.08);
    box-shadow: inset 0 0 0 1.5px rgb(var(--edit));
  }
  .f-text.bold {
    font-weight: 700;
  }
  .f-text.center {
    text-align: center;
  }
  .f-text::selection {
    background: rgb(var(--edit) / 0.3);
    color: transparent;
  }
  .f-text::placeholder {
    color: #98a2b6;
    opacity: 0;
    font-style: italic;
  }
  :global(.page:hover) .f-text::placeholder,
  .f-text:focus::placeholder {
    opacity: 1;
  }
  .f-text:hover,
  .f-date:hover,
  .f-image:hover {
    background: rgb(var(--edit) / 0.06);
    box-shadow: inset 0 0 0 1px rgb(var(--edit) / 0.35);
  }
  .f-text:focus {
    background: rgb(var(--edit) / 0.08);
    box-shadow: inset 0 0 0 1.5px rgb(var(--edit));
  }

  .f-del {
    right: 0;
    top: 0;
    transform: translate(35%, -35%);
    box-shadow: 0 0 0 1.5px #fff;
    width: calc(4 * var(--mm));
    height: calc(4 * var(--mm));
    min-width: 14px;
    min-height: 14px;
    position: absolute;
    display: none;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: #c0392b;
    color: #fff;
    font-size: 9px;
    cursor: pointer;
  }
  .f-item:hover .f-del,
  .f-item:focus-within .f-del,
  .f-item:hover .grip,
  .f-item.dragged .grip {
    display: grid;
  }
  /* Pegangan seret butir: di kiri teks (di atas nomor butir), hanya saat disorot. */
  .f-item .grip {
    position: absolute;
    right: 100%;
    top: 0;
    display: none;
    place-items: center;
    width: 12px;
    height: 100%;
    min-height: 14px;
    padding: 0;
    border: 0;
    border-radius: 3px;
    background: rgb(var(--edit) / 0.12);
    color: rgb(var(--edit));
    font: 11px/1 var(--ui-font);
  }
  .grip {
    cursor: grab;
    touch-action: none;
  }
  .grip:active {
    cursor: grabbing;
  }
  .fields .dragged {
    background: rgb(var(--edit) / 0.14);
    box-shadow: inset 0 0 0 1px rgb(var(--edit) / 0.5);
  }
  :global(.drop-mark) {
    position: fixed;
    z-index: 2000;
    pointer-events: none;
    border-radius: 2px;
    background: rgb(47 102 176);
    box-shadow: 0 0 0 1px #fff;
  }

  .f-date input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    opacity: 0;
    cursor: pointer;
  }
  .f-date:focus-within {
    background: rgb(var(--edit) / 0.08);
    box-shadow: inset 0 0 0 1.5px rgb(var(--edit));
  }

  .f-image,
  .f-head {
    display: flex;
    align-items: flex-start;
    justify-content: flex-end;
    padding: 0 0.25rem;
  }
  .f-image.has {
    align-items: flex-end;
  }
  .f-image:not(.has) {
    justify-content: center;
    align-items: center;
  }
  .f-head {
    align-items: center;
  }
  .tools {
    display: flex;
    gap: 0.25rem;
    align-items: center;
    opacity: 0;
    transition: opacity 0.12s;
  }
  .f-image:hover .tools,
  .f-image:focus-within .tools,
  .f-head:hover .tools,
  .f-head:focus-within .tools {
    opacity: 1;
  }
  .tools button,
  .tools label {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    font: 600 11px/1 var(--ui-font);
    padding: 3px 7px;
    border: 1px solid rgb(var(--edit) / 0.5);
    border-radius: 5px;
    background: #fff;
    color: rgb(var(--edit));
    cursor: pointer;
    white-space: nowrap;
  }
  .tools input {
    margin: 0;
  }
  .f-hint {
    font: 11px/1.2 var(--ui-font);
    color: rgb(var(--edit));
    background: transparent;
    border: 1px dashed rgb(var(--edit) / 0.5);
    border-radius: 5px;
    padding: 4px 8px;
    cursor: pointer;
    opacity: 0;
  }
  :global(.page:hover) .f-hint,
  .f-hint:focus-visible {
    opacity: 1;
  }
  .f-empty {
    border-radius: 0;
    border: 0;
  }
  .f-empty:hover {
    background: rgb(var(--edit) / 0.06);
    box-shadow: inset 0 0 0 1px rgb(var(--edit) / 0.35);
  }
  .f-lane {
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    cursor: pointer;
  }
  .f-lane:hover {
    background: rgb(var(--edit) / 0.06);
    box-shadow: inset 0 0 0 1px rgb(var(--edit) / 0.35);
  }
  .f-lane:hover::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: calc(14 * var(--mm));
    height: calc(5.5 * var(--mm));
    transform: translate(-50%, -50%);
    border: 1.5px dashed rgb(var(--edit) / 0.6);
  }
  .f-group.hot {
    background: rgb(var(--edit) / 0.035);
  }
  .f-group.shared {
    box-shadow: inset 0 0 0 1.5px var(--peer);
  }
  .peers {
    position: absolute;
    right: 2px;
    top: 2px;
    display: flex;
    gap: 2px;
    pointer-events: none;
  }
  .peers span {
    font: 600 10px/1 var(--ui-font);
    color: #fff;
    padding: 2px 5px;
    border-radius: 3px;
    white-space: nowrap;
  }
  .g-tools {
    position: absolute;
    display: flex;
    gap: 2px;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.12s;
    z-index: 1;
  }
  .f-group.hot .g-tools {
    opacity: 1;
    pointer-events: auto;
  }
  .g-top {
    left: 50%;
    top: 0;
    transform: translate(-50%, -55%);
  }
  .g-left {
    right: 100%;
    top: 50%;
    flex-direction: column;
    padding-right: 3px;
    transform: translateY(-50%);
  }
  .g-tools button {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    padding: 0;
    font: 600 10px/1 var(--ui-font);
    border: 1px solid rgb(var(--edit) / 0.5);
    border-radius: 4px;
    background: #fff;
    color: rgb(var(--edit));
    cursor: pointer;
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
  }
  .g-tools button:hover {
    background: rgb(var(--edit));
    color: #fff;
  }
  .g-tools button.danger {
    border-color: rgb(192 57 43 / 0.5);
    color: #c0392b;
  }
  .g-tools button.danger:hover {
    background: #c0392b;
    color: #fff;
  }
  .g-tools button[aria-disabled='true'] {
    opacity: 0.35;
    cursor: not-allowed;
    background: #fff;
    color: #888;
    border-color: #bbb;
  }
  .f-shape.open {
    z-index: 5;
  }
  .f-shape-btn {
    position: absolute;
    inset: 0;
    padding: 0;
    border: 0;
    border-radius: 3px;
    background: transparent;
    cursor: pointer;
  }
  .f-shape-btn:hover,
  .f-shape.open .f-shape-btn {
    box-shadow: 0 0 0 1.5px rgb(var(--edit) / 0.7);
    background: rgb(var(--edit) / 0.06);
  }
  .shape-menu {
    position: absolute;
    left: 50%;
    top: calc(100% + 4px);
    transform: translateX(-50%);
    width: 250px;
    display: grid;
    gap: 6px;
    padding: 8px;
    font: 12px/1.2 var(--ui-font);
    color: #1f2633;
    background: #fff;
    border: 1px solid rgb(var(--edit) / 0.4);
    border-radius: 8px;
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.18);
  }
  .shape-menu.up {
    top: auto;
    bottom: calc(100% + 4px);
  }
  .seg {
    display: flex;
    border: 1px solid rgb(var(--edit) / 0.5);
    border-radius: 6px;
    overflow: hidden;
  }
  .seg button {
    flex: 1;
    padding: 5px 4px;
    border: 0;
    background: #fff;
    color: rgb(var(--edit));
    font: 600 11px/1.1 var(--ui-font);
    cursor: pointer;
  }
  .seg button + button {
    border-left: 1px solid rgb(var(--edit) / 0.5);
  }
  .seg button.on {
    background: rgb(var(--edit));
    color: #fff;
  }
  .shape-menu label {
    display: grid;
    gap: 2px;
  }
  .shape-menu label span {
    font-size: 11px;
    color: #5b6577;
  }
  .with {
    display: grid;
    gap: 3px;
  }
  .with > span:first-child {
    font-size: 11px;
    color: #5b6577;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }
  .chips button {
    padding: 3px 7px;
    border: 1px solid rgb(var(--edit) / 0.5);
    border-radius: 999px;
    background: #fff;
    color: rgb(var(--edit));
    font: 600 11px/1.1 var(--ui-font);
    cursor: pointer;
  }
  .chips button.on {
    background: rgb(var(--edit));
    color: #fff;
  }
  .shape-menu select,
  .shape-menu input {
    width: 100%;
    box-sizing: border-box;
    font: 12px var(--ui-font);
    padding: 3px 5px;
    border: 1px solid #c5cbd6;
    border-radius: 5px;
    background: #fff;
    color: #1f2633;
  }
  .f-edge {
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }
  .f-edge.sel {
    z-index: 4;
  }
  .e-hit {
    fill: none;
    stroke: transparent;
    stroke-width: 2.2;
    stroke-linejoin: round;
    pointer-events: stroke;
    cursor: pointer;
    outline: none;
  }
  .e-hit:hover {
    stroke: rgb(var(--edit) / 0.2);
  }
  .e-line {
    fill: none;
    stroke: rgb(var(--edit));
    stroke-width: 0.6;
    stroke-linejoin: round;
  }
  .e-handle {
    fill: #fff;
    stroke: rgb(var(--edit));
    stroke-width: 0.35;
    pointer-events: all;
    cursor: ns-resize;
    outline: none;
  }
  .e-handle.v {
    cursor: ew-resize;
  }
  .e-handle:hover {
    fill: rgb(var(--edit));
  }
  .edge-menu {
    z-index: 6;
    width: 260px;
    display: grid;
    gap: 5px;
    margin: 10px 0 0 -20px;
    padding: 8px;
    font: 12px/1.2 var(--ui-font);
    color: #1f2633;
    background: #fff;
    border: 1px solid rgb(var(--edit) / 0.4);
    border-radius: 8px;
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.18);
  }
  .edge-menu.up {
    transform: translateY(calc(-100% - 20px));
  }
  .edge-menu.left {
    margin-left: -240px;
  }
  .edge-menu .lbl {
    font-size: 11px;
    color: #5b6577;
  }
  .edge-menu .hint {
    margin: 2px 0 0;
    font-size: 11px;
    color: #5b6577;
  }
  .edge-menu .reset {
    padding: 5px 8px;
    font: 600 11px/1.1 var(--ui-font);
    border: 1px solid rgb(var(--edit) / 0.5);
    border-radius: 6px;
    background: #fff;
    color: rgb(var(--edit));
    cursor: pointer;
  }
  .edge-menu .reset:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .err {
    font: 11px var(--ui-font);
    color: #c0392b;
  }
</style>
