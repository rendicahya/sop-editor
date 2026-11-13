<script>
  import { tick, untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { newTabId } from './store.svelte.js';
  import * as ui from './ask.svelte.js';
  import Icon from './Icon.svelte';
  import ContextMenu from './ContextMenu.svelte';
  import SopPreviewDialog from './SopPreviewDialog.svelte';
  import { dismiss } from './dismiss.js';
  import {
    listEntries,
    putEntry,
    patchEntry,
    deleteEntry,
    cleanTags,
    searchParts,
    listFolders,
    putFolder,
    deleteFolders,
    cleanFolderName,
    binDaysLeft,
    BIN_DAYS,
    KEEP_VERSIONS,
    listVersions,
    deleteVersion,
    restoreVersion as restoreLocalVersion
  } from './library.js';
  import MatchSnippet from './MatchSnippet.svelte';
  import VersionDiffDialog from './VersionDiffDialog.svelte';
  import * as F from './faculty.svelte.js';
  import { faculty } from './faculty.svelte.js';
  import { librarySort, sorted } from './librarySort.svelte.js';
  import SortSelect from './SortSelect.svelte';
  import { readSopFiles } from './sopFiles.js';
  import { sopZip, sopText, safeName } from './sopZip.js';
  import { registerXlsx } from './register.js';
  import { downloadBlob } from './files.js';
  import { formatTanggal, todayIso, uid, parseDocumentText } from './model.js';
  import { review, setReviewYears, REVIEW_CHOICES, reviewSince, reviewDue, isReviewDue } from './review.svelte.js';

  /**
   * Tampilannya mengikuti panel Pustaka Daring (pohon folder, daftar, menu klik kanan, pilihan, keyboard); yang tidak
   * ada di sini: hak akses, komentar, kunci edit. Yang khusus Lokal: label, Baru dihapus (30 hari), salin ke Daring.
   * openIds: id tab yang sedang terbuka (= id entri pustaka), current: id tab aktif.
   * Panel di dialog Pustaka: open = dialognya terbuka, active = tab Lokal yang tampil, host = elemen <dialog>,
   * tabs = pemilih tab di kepala panel, onclose() menutup dialog. onbook(entries, title): menggabungkan entri menjadi satu PDF.
   * tabjson(id): isi tab entri `id` (boleh belum tersimpan) atau null; onrestoretab(id, json): memuat versi lama ke tab itu.
   */
  let { open = false, active = false, host, tabs, onclose, openIds = [], current, onopen, onsave, cansave = true, onnotify, onbook, tabjson, onrestoretab } = $props();

  let entries = $state([]); // semua entri, termasuk yang ada di "Baru dihapus"
  let folders = $state([]);
  let here = $state(null); // folder yang sedang dibuka; null = Utama
  let view = $state('sops'); // sops | bin ("Baru dihapus")
  let only = $state(''); // '' | 'due' (perlu ditinjau, dari semua folder)
  let query = $state('');
  let tagEdit = $state(null); // id entri yang labelnya sedang diatur
  let newTag = $state('');
  let previewOf = $state(null); // entri yang sedang dipratinjau
  let history = $state(null); // { id, versions } riwayat yang sedang dibuka
  let compare = $state(null); // dialog Bandingkan versi
  let menu = $state(null); // { x, y, items }
  const expanded = new SvelteSet();
  // Filter (berlaku di semua folder, bersama pencarian). tag: null = semua, '' = tanpa label.
  const NO_FILTER = { tag: null, changed: '' };
  let filt = $state({ ...NO_FILTER });
  let filterOpen = $state(false);
  const filtering = $derived(filt.tag !== null || !!filt.changed);
  const resetFilters = () => Object.assign(filt, NO_FILTER);
  const CHANGED = [
    ['7', 'dalam 7 hari terakhir'],
    ['30', 'dalam 30 hari terakhir'],
    ['90', 'dalam 3 bulan terakhir'],
    ['365', 'dalam 1 tahun terakhir'],
    ['old', 'lebih dari 1 tahun lalu']
  ];
  const DAY = 86400000;

  // Tiap kali dialog dibuka, pencarian, filter, pilihan, dan tampilan "Baru dihapus" dikosongkan; folder yang dibuka diingat.
  let wasOpen = false;
  $effect(() => {
    if (open && !wasOpen) {
      query = '';
      tagEdit = null;
      only = '';
      resetFilters();
      filterOpen = false;
      view = 'sops';
      history = null;
    }
    wasOpen = open;
  });
  // Dibaca ulang tiap kali tab Lokal tampil: isinya di browser ini, murah dibaca, dan bisa berubah dari tab Daring.
  $effect(() => {
    if (open && active) refresh();
  });

  async function refresh() {
    try {
      const [list, dirs] = await Promise.all([listEntries(), listFolders()]);
      folders = dirs;
      entries = list.map((e) => {
        let header = {};
        try {
          header = JSON.parse(e.json).header ?? {};
        } catch {}
        const dates = { tglPembuatan: header.tglPembuatan ?? '', tglRevisi: header.tglRevisi ?? '', tglEfektif: header.tglEfektif ?? '' };
        const parts = searchParts(e);
        return { ...e, tags: e.tags ?? [], parts, text: parts.map((p) => p.text).join('\n').toLowerCase(), since: reviewSince(header), dates };
      });
      if (history) history = { id: history.id, versions: await listVersions(history.id) };
    } catch {
      entries = [];
      folders = [];
      ui.alert('Pustaka Lokal tidak bisa dibaca di browser ini (mode privat atau penyimpanan diblokir).');
    }
  }

  // ---- Folder ----
  const byId = $derived(new Map(folders.map((f) => [f.id, f])));
  const at = $derived(byId.has(here) ? here : null); // folder yang dibuka masih ada?
  /** Folder entri; folder yang sudah tidak ada dianggap Utama. */
  const folderOf = (e) => (byId.has(e.folder) ? e.folder : null);
  const parentOf = (f) => (byId.has(f.parent) ? f.parent : null);
  function pathOf(id) {
    const out = [];
    for (let f = byId.get(id); f && out.length < 50; f = byId.get(parentOf(f))) out.unshift(f);
    return out;
  }
  const pathText = (id) => (id ? pathOf(id).map((f) => f.name).join(' / ') : 'Utama');
  const crumbs = $derived(pathOf(at));
  const byName = (a, b) => a.name.localeCompare(b.name, 'id', { numeric: true });
  const childrenOf = (id) => folders.filter((f) => parentOf(f) === id).sort(byName);
  /** Folder `id` beserta semua subfoldernya. */
  function subtree(id) {
    const out = new Set([id]);
    for (const x of out) for (const f of folders) if (parentOf(f) === x) out.add(f.id);
    return out;
  }
  const flatTree = $derived.by(() => {
    const out = [];
    const walk = (id, depth) => {
      for (const f of childrenOf(id)) out.push({ ...f, depth }), walk(f.id, depth + 1);
    };
    walk(null, 0);
    return out;
  });

  const live = $derived(entries.filter((e) => !e.deleted));
  const binned = $derived(entries.filter((e) => e.deleted).sort((a, b) => b.deleted - a.deleted));
  const inFolder = (e, set) => set.has(folderOf(e));
  /** Banyaknya SOP langsung di tiap folder (untuk pohon). */
  const counts = $derived.by(() => {
    const out = new Map();
    for (const e of live) out.set(folderOf(e), (out.get(folderOf(e)) ?? 0) + 1);
    return out;
  });
  function folderInfo(f) {
    const tree = subtree(f.id);
    const n = live.filter((e) => inFolder(e, tree)).length;
    const sub = childrenOf(f.id).length;
    return [n ? `${n} SOP` : 'Kosong', sub && `${sub} folder`].filter(Boolean).join(' · ');
  }

  const words = $derived(query.trim().toLowerCase().split(/\s+/).filter(Boolean));
  const isDue = (e) => isReviewDue(e.since, review.years);
  const dueCount = $derived(live.filter(isDue).length);
  function passFilter(e) {
    const t = filt.tag;
    if (t !== null && (t === '' ? e.tags.length : !e.tags.includes(t))) return false;
    if (filt.changed) {
      const age = Date.now() - (e.updated ?? 0);
      if (filt.changed === 'old' ? age <= 365 * DAY : age > Number(filt.changed) * DAY) return false;
    }
    return true;
  }
  const matchText = (e) => words.every((w) => e.text.includes(w));
  const searching = $derived(words.length > 0 || !!only || filtering);
  /** Waktu perubahan terakhir di dalam folder (termasuk subfolder), untuk urutan menurut tanggal. */
  const activity = $derived.by(() => {
    const out = new Map(folders.map((f) => [f.id, f.created ?? 0]));
    for (const e of live) {
      for (let id = folderOf(e), n = 0; id && n < 100; id = parentOf(byId.get(id)), n++) {
        if ((e.updated ?? 0) > (out.get(id) ?? 0)) out.set(id, e.updated);
      }
    }
    return out;
  });
  const shownFolders = $derived(
    view !== 'sops'
      ? []
      : sorted(
          only || filtering ? [] : searching ? folders.filter((f) => words.every((w) => f.name.toLowerCase().includes(w))) : childrenOf(at),
          librarySort.by,
          (f) => f.name,
          (f) => activity.get(f.id) ?? 0
        )
  );
  const shownLive = $derived(
    view !== 'sops'
      ? []
      : sorted(
          live.filter((e) => (searching ? matchText(e) && (!only || isDue(e)) && passFilter(e) : folderOf(e) === at)),
          librarySort.by,
          titleOf,
          (e) => e.updated ?? 0
        )
  );
  const shownBin = $derived(view === 'bin' ? binned.filter(matchText) : []);

  // ---- Lebar pohon folder (sama dengan Pustaka Daring, diingat per browser) ----
  const TREE_KEY = 'sop-editor.treeWidth';
  const TREE_MIN = 160;
  const TREE_DEFAULT = 250;
  let panes = $state();
  let treeW = $state(TREE_DEFAULT);
  try {
    const saved = Number(localStorage.getItem(TREE_KEY));
    if (saved >= TREE_MIN) treeW = saved;
  } catch {}
  const treeMax = () => Math.max(TREE_MIN, Math.min(600, (panes?.clientWidth ?? 900) - 360));
  function setTree(w) {
    treeW = Math.round(Math.min(treeMax(), Math.max(TREE_MIN, w)));
    try {
      localStorage.setItem(TREE_KEY, String(treeW));
    } catch {}
  }
  function splitDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    const left = panes.getBoundingClientRect().left;
    el.setPointerCapture(e.pointerId);
    const move = (ev) => setTree(ev.clientX - left);
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }
  function splitKey(e) {
    const step = e.shiftKey ? 50 : 16;
    if (e.key === 'ArrowLeft') setTree(treeW - step);
    else if (e.key === 'ArrowRight') setTree(treeW + step);
    else if (e.key === 'Home') setTree(TREE_MIN);
    else if (e.key === 'End') setTree(treeMax());
    else return;
    e.preventDefault();
  }

  // ---- Pilihan dan navigasi keyboard di daftar (sama dengan Pustaka Daring) ----
  const entryOf = (item, isFolder) => ({ key: (isFolder ? 'f:' : 's:') + item.id, item, isFolder });
  const nameOf = (d) => (d.isFolder ? d.item.name : titleOf(d.item));
  const countText = (list) => (list.length === 1 ? `"${nameOf(list[0])}"` : `${list.length} item`);
  const selected = new SvelteSet();
  let anchor = null;
  let cursor = $state(null);
  let clip = $state(null); // entri yang dipotong (Ctrl+X), menunggu Ctrl+V
  let listEl = $state();
  let treeEl = $state();
  let search = $state();
  const rows = $derived(view === 'bin' ? shownBin.map((e) => entryOf(e, false)) : [...shownFolders.map((f) => entryOf(f, true)), ...shownLive.map((e) => entryOf(e, false))]);
  const selRows = $derived(rows.filter((r) => selected.has(r.key)));
  // Pilihan dikosongkan setiap pindah folder, tampilan, pencarian, atau filter.
  $effect(() => {
    view, at, query, only, filt.tag, filt.changed;
    untrack(() => {
      selected.clear();
      anchor = null;
    });
  });

  function selectRange(from, to) {
    const keys = rows.map((r) => r.key);
    let a = keys.indexOf(from);
    const b = keys.indexOf(to);
    if (b < 0) return;
    if (a < 0) a = b;
    selected.clear();
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) selected.add(keys[i]);
  }
  function toggleSel(key) {
    if (!selected.delete(key)) selected.add(key);
    anchor = key;
  }
  /** Klik baris: Ctrl/Cmd menandai satu, Shift menandai rentang, klik biasa membuka. */
  function rowClick(e, row, run) {
    const prev = cursor;
    cursor = row.key;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      toggleSel(row.key);
    } else if (e.shiftKey) {
      e.preventDefault();
      if (!selected.size || !anchor) anchor = prev ?? row.key;
      selectRange(anchor, row.key);
    } else run();
  }
  function pickClick(e, row) {
    e.stopPropagation();
    const prev = cursor;
    cursor = row.key;
    if (e.shiftKey && (selected.size ? anchor : prev)) {
      if (!selected.size || !anchor) anchor = prev;
      selectRange(anchor, row.key);
    } else toggleSel(row.key);
  }
  /** Sasaran tindakan: pilihan, atau baris kursor bila tidak ada yang dipilih. */
  const targets = () => (selRows.length ? selRows : rows.filter((r) => r.key === cursor));

  async function focusRow(key) {
    await tick();
    const el = key && listEl?.querySelector(`[data-key="${CSS.escape(key)}"] .main`);
    if (el) {
      cursor = key;
      el.focus();
      el.scrollIntoView({ block: 'nearest' });
    } else listEl?.focus();
  }
  async function enterFolder(id, key) {
    select(id);
    await tick();
    focusRow(key ?? rows[0]?.key);
  }
  function openRow(row) {
    if (view === 'bin') return (previewOf = row.item);
    if (row.isFolder) enterFolder(row.item.id);
    else pick(row.item);
  }
  function cut(list) {
    if (!list.length) return;
    clip = list;
    onnotify(`${countText(list)} dipotong. Buka folder tujuan, lalu tekan Ctrl+V.`);
  }
  function paste(target = at) {
    if (!clip || view !== 'sops') return;
    const list = clip;
    clip = null;
    moveRows(list, target);
  }
  function removeRows(list) {
    if (view === 'bin') purge(list.map((d) => d.item));
    else removeMany(list);
  }

  function listKey(e) {
    const t = e.target;
    if (t.matches('input:not(.pick), textarea, select')) return;
    const onRow = t === listEl || !!t.closest('.main') || t.matches('.pick');
    const i = rows.findIndex((r) => r.key === cursor);
    const row = rows[i];
    const ctrl = e.ctrlKey || e.metaKey;
    const go = (j) => {
      const next = rows[Math.max(0, Math.min(rows.length - 1, j))];
      if (!next) return;
      if (e.shiftKey) {
        if (!selected.size || !anchor) anchor = cursor ?? next.key;
        selectRange(anchor, next.key);
      }
      focusRow(next.key);
    };
    const k = e.key;
    const up = () => at && !searching && view === 'sops' && enterFolder(parentOf(byId.get(at)), 'f:' + at);
    if (k === 'ArrowDown') go(i < 0 ? 0 : i + 1);
    else if (k === 'ArrowUp' && e.altKey) up();
    else if (k === 'ArrowUp') go(i < 0 ? 0 : i - 1);
    else if (k === 'Home') go(0);
    else if (k === 'End') go(rows.length - 1);
    else if (k === 'PageDown') go(i + 10);
    else if (k === 'PageUp') go(i - 10);
    else if (!onRow) return;
    else if (k === 'Enter' && row && !ctrl) openRow(row);
    else if (k === ' ' && row && !t.matches('.pick')) {
      if (e.shiftKey && anchor) selectRange(anchor, row.key);
      else toggleSel(row.key);
    } else if (k === 'a' && ctrl) rows.forEach((r) => selected.add(r.key));
    else if (k === 'Escape' && (selected.size || clip)) {
      if (selected.size) selected.clear();
      else clip = null;
    } else if (k === 'Delete' && targets().length) removeRows(targets());
    else if (k === 'F2' && row?.isFolder && view === 'sops') renameFolder(row.item);
    else if (k === 'Backspace') up();
    else if (k === 'x' && ctrl && view === 'sops' && targets().length) cut(targets());
    else if ((k === 'ContextMenu' || (k === 'F10' && e.shiftKey)) && row) {
      const r = listEl.querySelector(`[data-key="${CSS.escape(row.key)}"] .main`).getBoundingClientRect();
      showRowMenu(r.left + 24, r.bottom - 4, row);
    } else return;
    e.preventDefault();
    e.stopPropagation();
  }

  /** Pohon folder: ↑/↓ berpindah folder, → membuka cabang atau masuk ke subfolder, ← menutup cabang atau naik ke induk. */
  function treeKey(e) {
    const btns = [...treeEl.querySelectorAll('.tname')];
    const i = btns.indexOf(document.activeElement);
    if (i < 0) return;
    const idOf = (b) => b.closest('[data-id]').dataset.id || null;
    const id = idOf(btns[i]);
    const go = (b) => {
      if (!b) return;
      b.focus();
      select(idOf(b));
    };
    const kids = id ? childrenOf(id).length : 1;
    if (e.key === 'ArrowDown') go(btns[i + 1]);
    else if (e.key === 'ArrowUp') go(btns[i - 1]);
    else if (e.key === 'Home') go(btns[0]);
    else if (e.key === 'End') go(btns.at(-1));
    else if (e.key === 'ArrowRight') {
      if (id && kids && !expanded.has(id)) expanded.add(id);
      else if (kids) go(btns[i + 1]);
    } else if (e.key === 'ArrowLeft') {
      if (id && kids && expanded.has(id)) expanded.delete(id);
      else if (id) go(treeEl.querySelector(`[data-id="${CSS.escape(parentOf(byId.get(id)) ?? '')}"] .tname`));
    } else if (e.key === 'F2' && id) renameFolder(byId.get(id));
    else if (e.key === 'Delete' && id) removeFolder(byId.get(id));
    else return;
    e.preventDefault();
  }

  /** Pintasan yang berlaku di seluruh panel (bukan saat mengetik). */
  function panelKey(e) {
    if (!open || !active || moving || copying || menu) return;
    // Hanya bila dialog Pustaka yang teratas (bukan saat ada dialog lain di atasnya).
    if ([...document.querySelectorAll('dialog[open]')].filter((d) => d.matches(':modal')).at(-1) !== host) return;
    const t = e.target;
    const typing = t.matches?.('input:not(.pick), textarea, select, [contenteditable]');
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key === 'f') {
      search?.focus();
      search?.select();
    } else if (typing) return;
    else if (ctrl && e.key === 'v' && clip && view === 'sops' && !searching) paste();
    else return;
    e.preventDefault();
  }

  function select(id) {
    view = 'sops';
    here = id;
    query = '';
    only = '';
    resetFilters();
    history = null;
    tagEdit = null;
    for (const f of pathOf(id)) expanded.add(f.id);
  }
  function toggle(id) {
    if (!expanded.delete(id)) expanded.add(id);
  }
  function showBin() {
    view = 'bin';
    query = '';
    only = '';
    history = null;
    tagEdit = null;
  }

  async function newFolder(parent = at) {
    const name = cleanFolderName(await ui.prompt(`Nama folder baru di ${pathText(parent)}`, '', { title: 'Folder baru', ok: 'Buat', maxlength: 120 }));
    if (!name) return;
    if (childrenOf(parent).some((f) => f.name.toLowerCase() === name.toLowerCase())) return ui.alert(`Folder "${name}" sudah ada di sini.`, { title: 'Folder baru' });
    await putFolder({ id: 'f-' + uid() + uid(), name, parent, created: Date.now() });
    if (parent) expanded.add(parent);
    await refresh();
  }
  async function renameFolder(f) {
    const name = cleanFolderName(await ui.prompt('Nama folder', f.name, { title: 'Ubah nama folder', ok: 'Simpan', maxlength: 120 }));
    if (!name || name === f.name) return;
    if (childrenOf(parentOf(f)).some((x) => x.id !== f.id && x.name.toLowerCase() === name.toLowerCase()))
      return ui.alert(`Folder "${name}" sudah ada di tempat yang sama.`, { title: 'Ubah nama folder' });
    await putFolder({ ...$state.snapshot(f), name });
    await refresh();
  }
  const removeFolder = (f) => removeMany([entryOf(f, true)]);
  /** Menghapus folder (beserta subfolder) dan SOP: SOP-nya masuk Baru dihapus. SOP yang terbuka di tab tidak ikut. */
  async function removeMany(list) {
    const fs = list.filter((d) => d.isFolder).map((d) => d.item);
    const es = list.filter((d) => !d.isFolder).map((d) => d.item);
    if (!fs.length) {
      const ok = es.filter((e) => !openIds.includes(e.id));
      if (!ok.length) return ui.alert('Tutup dulu tab SOP yang akan dihapus.', { title: 'Hapus' });
      const skipped = es.length - ok.length;
      return trash(ok, skipped ? `; ${skipped} yang terbuka di tab tidak ikut` : '');
    }
    const tree = new Set(fs.flatMap((f) => [...subtree(f.id)]));
    const inside = live.filter((e) => inFolder(e, tree) || es.some((x) => x.id === e.id));
    const busy = inside.filter((e) => openIds.includes(e.id));
    const what = fs.length === 1 && !es.length ? `folder "${fs[0].name}"` : `${fs.length} folder${es.length ? ` dan ${es.length} SOP` : ''}`;
    if (busy.length) return ui.alert(`Tutup dulu tab berikut sebelum menghapus ${what}:\n\n${busy.map(titleOf).join('\n')}`, { title: 'Hapus folder' });
    const sub = tree.size - fs.length;
    const parts = [
      inside.length ? `${inside.length} SOP di dalamnya dipindahkan ke Baru dihapus dan bisa dipulihkan selama ${BIN_DAYS} hari.` : 'Folder ini kosong.',
      sub && `${sub} subfolder ikut dihapus.`
    ].filter(Boolean);
    if (!(await ui.confirm(`Hapus ${what}? ${parts.join(' ')}`, { title: 'Hapus folder', ok: 'Hapus', danger: true }))) return;
    const now = Date.now();
    for (const e of inside) await patchEntry(e.id, { deleted: now, fromPath: pathText(folderOf(e)) });
    await deleteFolders([...tree]);
    if (tree.has(at)) here = parentOf(fs.find((f) => subtree(f.id).has(at)));
    await refresh();
    onnotify(inside.length ? `Folder dihapus, ${inside.length} SOP dipindahkan ke Baru dihapus` : 'Folder dihapus');
  }

  // ---- Pindah: lewat dialog, potong-tempel, atau seret ke folder (pohon, jalur, atau baris folder) ----
  let moving = $state(null); // { ids, fids, target }
  let moveDialog;
  $effect(() => {
    if (moving && !moveDialog.open) moveDialog.showModal();
    else if (!moving && moveDialog?.open) moveDialog.close();
  });
  const blocked = (fids) => new Set(fids.flatMap((id) => [...subtree(id)]));
  const moveTargets = $derived(moving ? flatTree.filter((t) => !blocked(moving.fids).has(t.id)) : []);
  const idsOf = (list) => ({ ids: list.filter((d) => !d.isFolder).map((d) => d.item.id), fids: list.filter((d) => d.isFolder).map((d) => d.item.id) });
  const startMove = (list) => {
    const { ids, fids } = idsOf(list);
    if (ids.length || fids.length) moving = { ids, fids, target: at };
  };
  const moveRows = (list, target) => {
    const { ids, fids } = idsOf(list);
    return moveTo(ids, fids, target);
  };
  async function moveTo(ids, fids, target) {
    target = byId.has(target) ? target : null;
    if (fids.some((id) => subtree(id).has(target))) return ui.alert('Folder tidak bisa dipindahkan ke dalam dirinya sendiri.', { title: 'Pindahkan' });
    let n = 0;
    for (const id of ids) {
      const e = entries.find((x) => x.id === id);
      if (e && folderOf(e) !== target) await patchEntry(id, { folder: target }), n++;
    }
    for (const id of fids) {
      const f = byId.get(id);
      if (f && parentOf(f) !== target) await putFolder({ ...$state.snapshot(f), parent: target }), n++;
    }
    selected.clear();
    if (target) expanded.add(target);
    await refresh();
    if (n) onnotify(`${n} item dipindahkan ke ${pathText(target)}`);
  }
  function submitMove(ev) {
    ev.preventDefault();
    const { ids, fids, target } = moving;
    moving = null;
    moveTo(ids, fids, target);
  }

  let drag = $state(null); // { ids, fids }
  let dropAt = $state(undefined); // folder tujuan yang sedang disorot (null = Utama)
  let hoverTimer;
  const dragged = (id) => !!drag?.ids.includes(id) || !!drag?.fids.includes(id) || !!clip?.some((d) => d.item.id === id);
  function dragStart(ev, item, isFolder) {
    const own = entryOf(item, isFolder);
    const list = selected.has(own.key) ? selRows : [own];
    ev.stopPropagation();
    menu = null;
    drag = idsOf(list);
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', list.map(nameOf).join('\n'));
    if (list.length > 1) {
      // Gambar seret berisi jumlah item. Ditempel di dialog karena isi di bawah dialog modal tidak digambar.
      const ghost = document.createElement('div');
      ghost.textContent = `${list.length} item`;
      ghost.style.cssText = 'position:fixed;top:-100px;left:0;padding:4px 10px;border-radius:6px;background:#1f4e8c;color:#fff;font:600 13px system-ui';
      (host ?? document.body).appendChild(ghost);
      ev.dataTransfer.setDragImage(ghost, -8, -8);
      setTimeout(() => ghost.remove());
    }
  }
  function canDrop(target) {
    if (!drag || drag.fids.some((id) => subtree(id).has(target))) return false;
    return drag.ids.some((id) => folderOf(entries.find((e) => e.id === id) ?? {}) !== target) || drag.fids.some((id) => parentOf(byId.get(id)) !== target);
  }
  // Berkas dari komputer (.sop, .json, .zip) bisa dilepas di folder mana pun untuk diimpor ke sana.
  const fromComputer = (ev) => !drag && ev.dataTransfer?.types.includes('Files');
  function dragOver(ev, target) {
    const files = fromComputer(ev);
    if (!drag && !files) return;
    ev.stopPropagation();
    if (files ? importing : !canDrop(target)) {
      ev.dataTransfer.dropEffect = 'none';
      if (dropAt === target) dropAt = undefined;
      return;
    }
    ev.preventDefault();
    ev.dataTransfer.dropEffect = files ? 'copy' : 'move';
    if (dropAt !== target) {
      dropAt = target;
      clearTimeout(hoverTimer);
      // Folder tertutup terbuka sendiri bila disorot sebentar, agar subfoldernya bisa dituju.
      if (target && !expanded.has(target)) hoverTimer = setTimeout(() => dropAt === target && expanded.add(target), 700);
    }
  }
  function dragLeave(ev, target) {
    if (dropAt === target && !ev.currentTarget.contains(ev.relatedTarget)) dropAt = undefined;
  }
  function dropOn(ev, target) {
    ev.preventDefault();
    ev.stopPropagation();
    const d = drag;
    const ok = canDrop(target);
    const files = fromComputer(ev) && !importing ? [...ev.dataTransfer.files] : null;
    dragEnd();
    if (d && ok) moveTo(d.ids, d.fids, target);
    else if (files?.length) importFiles(files, target);
  }
  function dragEnd() {
    clearTimeout(hoverTimer);
    drag = null;
    dropAt = undefined;
  }
  /** Atribut tempat lepas untuk folder `target` (null = Utama). */
  const dropzone = (target) => ({
    ondragover: (ev) => dragOver(ev, target),
    ondragenter: (ev) => dragOver(ev, target),
    ondragleave: (ev) => dragLeave(ev, target),
    ondrop: (ev) => dropOn(ev, target)
  });

  // ---- Baru dihapus ----
  async function trash(list, note = '') {
    const now = Date.now();
    for (const e of list) await patchEntry(e.id, { deleted: now, fromPath: pathText(folderOf(e)) });
    selected.clear();
    await refresh();
    onnotify((list.length === 1 ? `"${titleOf(list[0])}" dipindahkan ke Baru dihapus` : `${list.length} SOP dipindahkan ke Baru dihapus`) + note);
  }
  async function restore(list) {
    let lost = 0;
    for (const e of list) {
      if (e.folder && !byId.has(e.folder)) lost++;
      await patchEntry(e.id, { deleted: undefined, fromPath: undefined, folder: byId.has(e.folder) ? e.folder : null });
    }
    selected.clear();
    await refresh();
    onnotify(`${list.length} SOP dipulihkan${lost ? `; ${lost} di antaranya ke Utama karena foldernya sudah dihapus` : ''}`);
  }
  async function purge(list) {
    if (!list.length) return;
    const what = list.length === 1 ? `"${titleOf(list[0])}"` : `${list.length} SOP`;
    if (!(await ui.confirm(`Hapus permanen ${what}? Tindakan ini tidak bisa dibatalkan.`, { title: 'Hapus permanen', ok: 'Hapus permanen', danger: true }))) return;
    for (const e of list) await deleteEntry(e.id);
    selected.clear();
    await refresh();
    onnotify(`${list.length} SOP dihapus permanen`);
  }

  // ---- Gabung PDF, cadangan ZIP, daftar induk ----
  /** SOP di `list` (baris), termasuk isi folder beserta subfoldernya, tanpa duplikat. */
  function sopsOf(list) {
    const out = [];
    const seen = new Set();
    const put = (e) => !seen.has(e.id) && (seen.add(e.id), out.push(e));
    const walk = (id, depth = 0) => {
      if (depth > 50) return;
      for (const e of sorted(live.filter((x) => folderOf(x) === id), librarySort.by, titleOf, (x) => x.updated ?? 0)) put(e);
      for (const f of childrenOf(id)) walk(f.id, depth + 1);
    };
    for (const d of list) (d.isFolder ? walk(d.item.id) : put(d.item));
    return out;
  }
  async function makeBook(list) {
    const sops = sopsOf(list);
    if (!sops.length) return ui.alert('Tidak ada SOP di pilihan ini.');
    const folder = list.length === 1 && list[0].isFolder ? list[0].item.name : filt.tag || '';
    const raw = await ui.prompt(`${sops.length} SOP digabung menjadi satu PDF, diawali halaman daftar isi yang bisa diklik. Judul halaman depan:`, folder ? `Kumpulan SOP ${folder}` : 'Kumpulan SOP', {
      title: 'Gabung jadi satu PDF',
      ok: 'Buat PDF',
      maxlength: 200
    });
    const title = raw?.trim().replace(/\s+/g, ' ');
    if (!title) return;
    onclose();
    onbook(sops.map((e) => ({ json: e.json, title: titleOf(e) })), title);
  }
  /** Isi ZIP: tiap entri di bawah jalur foldernya, tanpa `skip` folder teratas jalur itu. */
  const zipFiles = (list, skip = 0) => list.map((e) => ({ dirs: pathOf(folderOf(e)).slice(skip).map((f) => f.name), name: titleOf(e), json: e.json, mtime: e.updated }));
  function downloadZip(files, name) {
    if (!files.length) return ui.alert('Tidak ada SOP untuk diunduh.', { title: 'Unduh ZIP' });
    try {
      downloadBlob(sopZip(files), `${safeName(name)}-${todayIso()}.zip`);
      onnotify(`${files.length} SOP diunduh dalam berkas ZIP`);
    } catch (err) {
      ui.alert('ZIP gagal dibuat: ' + err.message, { title: 'Unduh ZIP' });
    }
  }
  const folderZip = (f) => downloadZip(zipFiles(live.filter((e) => inFolder(e, subtree(f.id))), pathOf(f.id).length - 1), f.name);
  /** Baris terpilih (beserta isi folder) sebagai ZIP; jalurnya mulai dari folder yang sedang dibuka. */
  const rowsZip = (list) => downloadZip(zipFiles(sopsOf(list), searching ? 0 : pathOf(at).length), 'SOP-terpilih');
  /** Cakupan tombol cadangan dan daftar induk: hasil pencarian, folder yang dibuka beserta isinya, atau seluruh pustaka. */
  const scope = $derived(searching ? shownLive : at ? live.filter((e) => inFolder(e, subtree(at))) : live);
  const scopeText = $derived(searching ? 'hasil yang tampil' : at ? 'folder ini beserta subfoldernya' : 'seluruh Pustaka Lokal');
  function backup() {
    if (searching) downloadZip(zipFiles(shownLive), 'Hasil-pencarian-SOP');
    else if (at) folderZip(byId.get(at));
    else downloadZip(zipFiles(live), 'Pustaka-Lokal');
  }
  const downloadSop = (e) => downloadBlob(new Blob([sopText(e.json)], { type: 'application/json' }), `${safeName(e.fileName?.replace(/\.(sop|json)$/i, '') || titleOf(e))}.sop`);
  function exportRegister() {
    const list = sorted(scope, 'name-asc', titleOf, (e) => e.updated ?? 0);
    if (!list.length) return ui.alert('Tidak ada SOP untuk dimasukkan ke daftar induk.', { title: 'Daftar induk SOP' });
    const date = (v) => (v ? formatTanggal(v) : '');
    const stamp = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
    const columns = [
      { label: 'No.', width: 5 },
      { label: 'Nama SOP', width: 42 },
      { label: 'Nomor SOP', width: 26 },
      { label: 'Folder', width: 26 },
      { label: 'Label', width: 22 },
      { label: 'Tanggal pembuatan', width: 16 },
      { label: 'Tanggal revisi', width: 16 },
      { label: 'Tanggal efektif', width: 16 },
      { label: `Jatuh tempo tinjauan (${review.years} tahun)`, width: 18 },
      { label: 'Status tinjauan', width: 15 },
      { label: 'Terakhir diubah', width: 19 },
      { label: 'Berkas', width: 24 }
    ];
    const rows = list.map((e, i) => [
      i + 1,
      titleOf(e),
      e.nomor ?? '',
      pathText(folderOf(e)),
      e.tags.join(', '),
      date(e.dates.tglPembuatan),
      date(e.dates.tglRevisi),
      date(e.dates.tglEfektif),
      date(reviewDue(e.since)),
      !e.since ? 'Tanggal belum diisi' : isDue(e) ? 'Perlu ditinjau' : 'Berlaku',
      new Date(e.updated).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }),
      e.fileName ?? ''
    ]);
    const label = searching ? 'Hasil pencarian atau filter' : at ? `Folder ${pathText(at)}` : 'Seluruh Pustaka Lokal';
    const blob = registerXlsx({ title: 'Daftar Induk SOP', note: `${label} · ${list.length} SOP · diunduh ${stamp}`, columns, rows });
    downloadBlob(blob, `Daftar-Induk-SOP-${todayIso()}.xlsx`);
    onnotify(`Daftar induk ${list.length} SOP diunduh`);
  }

  // ---- Impor berkas .sop/.zip dari komputer (tombol, menu, atau seret-lepas ke folder) ----
  let importing = $state(false);
  let picker;
  let pickTarget = null;
  function pickFiles(target = searching ? null : at) {
    pickTarget = target;
    picker.value = '';
    picker.click();
  }
  /** Folder untuk jalur `dirs` di bawah `base`; yang belum ada dibuat (nama sama dipakai ulang). */
  async function folderFor(base, dirs, made) {
    let parent = base;
    for (const raw of dirs) {
      const name = cleanFolderName(raw);
      if (!name) continue;
      const key = `${parent}/${name.toLowerCase()}`;
      let id = made.get(key) ?? folders.find((f) => parentOf(f) === parent && f.name.toLowerCase() === name.toLowerCase())?.id;
      if (!id) {
        id = 'f-' + uid() + uid();
        await putFolder({ id, name, parent, created: Date.now() });
      }
      made.set(key, id);
      parent = id;
    }
    return parent;
  }
  async function importFiles(files, base = null) {
    if (importing) return;
    let found;
    try {
      found = await readSopFiles(files);
    } catch (err) {
      return ui.alert(err.message);
    }
    const { items, bad, other } = found;
    if (!items.length) {
      return ui.alert(bad.length ? `${bad.length} berkas SOP tidak bisa dibaca (bukan dokumen SOP yang valid).` : 'Tidak ada berkas .sop. Pilih berkas .sop, atau berkas .zip berisi berkas .sop.', { title: 'Tidak ada yang diimpor' });
    }
    base = byId.has(base) ? base : null;
    const tag = filt.tag || '';
    const msg = [
      `Masukkan ${items.length} SOP ke ${base ? `folder ${byId.get(base).name}` : 'Pustaka Lokal'}?`,
      tag && `SOP yang diimpor diberi label "${tag}".`,
      items.some((i) => i.dirs.length) && 'Folder di dalam ZIP ikut dibuat.',
      bad.length && `${bad.length} berkas dilewati karena bukan dokumen SOP yang valid.`,
      other && `${other} berkas lain (bukan .sop) diabaikan.`
    ].filter(Boolean).join('\n\n');
    if (!(await ui.confirm(msg, { title: 'Impor ke Pustaka Lokal', ok: 'Impor' }))) return;
    importing = true;
    let n = 0;
    const made = new Map();
    try {
      for (const it of items) {
        const doc = it.doc;
        if (it.title) doc.header.namaSop = it.title;
        const now = Date.now();
        const file = it.name.split('/').pop();
        await putEntry({
          id: newTabId(),
          title: doc.header.namaSop,
          nomor: doc.header.nomor,
          fileName: /\.sop$/i.test(file) ? file : null,
          created: now,
          updated: now,
          json: JSON.stringify(doc),
          tags: tag ? [tag] : [],
          folder: await folderFor(base, it.dirs, made)
        });
        n++;
      }
    } catch (err) {
      ui.alert(`Impor berhenti setelah ${n} SOP: ${err.message}`, { title: 'Gagal mengimpor' });
    } finally {
      importing = false;
      if (base) expanded.add(base);
      await refresh();
    }
    if (n) onnotify(`${n} SOP dimasukkan ke Pustaka Lokal`);
  }
  // Label beserta jumlah entrinya; allTags untuk pengaturan label entri.
  const tagList = $derived.by(() => {
    const n = new Map();
    for (const e of live) for (const t of e.tags) n.set(t, (n.get(t) ?? 0) + 1);
    return [...n].sort((a, b) => a[0].localeCompare(b[0], 'id'));
  });
  const untagged = $derived(live.filter((e) => !e.tags.length).length);
  const allTags = $derived(cleanTags(live.flatMap((e) => e.tags)));

  const rtf = new Intl.RelativeTimeFormat('id', { numeric: 'auto' });
  function ago(ms) {
    const s = (ms - Date.now()) / 1000;
    if (s > -60) return 'baru saja';
    for (const [unit, n] of [['minute', 60], ['hour', 3600], ['day', 86400]]) {
      const v = Math.round(s / n);
      if (unit === 'day' ? v > -7 : Math.abs(v) < (unit === 'minute' ? 60 : 24)) return rtf.format(v, unit);
    }
    return new Date(ms).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function titleOf(e) {
    return e.title || 'SOP tanpa judul';
  }

  function pick(e) {
    onclose();
    onopen(e);
  }

  async function duplicate(e) {
    const d = JSON.parse(e.json);
    d.header.namaSop = (d.header.namaSop || 'SOP tanpa judul') + ' (salinan)';
    const now = Date.now();
    await putEntry({ id: newTabId(), title: d.header.namaSop, nomor: d.header.nomor, fileName: null, created: now, updated: now, json: JSON.stringify(d), tags: [...e.tags], folder: folderOf(e) });
    await refresh();
    onnotify('Salinan dibuat');
  }

  // Label: pengelompokan bebas (mis. Akademik, Keuangan); satu SOP boleh berlabel lebih dari satu.
  async function setTags(e, tags) {
    await patchEntry(e.id, { tags: cleanTags(tags) });
    await refresh();
  }
  const toggleTag = (e, t) => setTags(e, e.tags.includes(t) ? e.tags.filter((x) => x !== t) : [...e.tags, t]);
  async function addTag(e) {
    const v = newTag.trim();
    if (!v) return;
    newTag = '';
    await setTags(e, [...e.tags, v]);
  }
  function editTags(e) {
    newTag = '';
    tagEdit = tagEdit === e.id ? null : e.id;
  }
  /** Mengganti (fn = t => nama baru) atau menghapus (fn = () => null) satu label di semua entri. */
  async function mapTag(old, fn) {
    for (const e of entries) {
      if (e.tags.includes(old)) await patchEntry(e.id, { tags: cleanTags(e.tags.map((t) => (t === old ? fn(t) : t)).filter(Boolean)) });
    }
    await refresh();
  }
  async function renameTag(old) {
    const name = (await ui.prompt('Nama label', old, { title: 'Ubah nama label', ok: 'Simpan' }))?.trim().replace(/\s+/g, ' ');
    if (!name || name === old) return;
    await mapTag(old, () => name);
    filt.tag = allTags.find((t) => t.toLowerCase() === name.toLowerCase()) ?? null;
  }
  async function removeTag(old) {
    const n = live.filter((e) => e.tags.includes(old)).length;
    if (!(await ui.confirm(`Hapus label "${old}" dari ${n} entri? Dokumennya tidak ikut terhapus.`, { ok: 'Hapus label', danger: true }))) return;
    await mapTag(old, () => null);
    filt.tag = null;
  }

  /** Menyimpan dokumen aktif; dokumen yang baru masuk pustaka ditaruh di folder `target`. */
  async function saveCurrent(target = at) {
    const fresh = !live.some((e) => e.id === current);
    await onsave();
    if (fresh && target) await patchEntry(current, { folder: target });
    resetFilters();
    tagEdit = null;
    query = '';
    only = '';
    view = 'sops';
    await refresh();
  }

  // ---- Riwayat versi: isi yang tertimpa setiap kali disimpan (KEEP_VERSIONS terbaru) ----
  const when = (ms) => new Date(ms).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  async function toggleHistory(e) {
    if (history?.id === e.id) return (history = null);
    history = { id: e.id, versions: await listVersions(e.id) };
  }
  async function compareVersions(e, v = null) {
    const versions = history?.id === e.id ? history.versions : await listVersions(e.id);
    if (!versions.length) return ui.alert(`"${titleOf(e)}" belum punya versi lama. Setiap kali disimpan, isi sebelumnya dicatat di riwayat.`, { title: 'Bandingkan versi' });
    const tab = openIds.includes(e.id) ? tabjson?.(e.id) : null;
    const sources = [
      ...(tab && tab !== e.json ? [{ key: 'tab', label: 'Isi di tab (belum disimpan)', json: tab }] : []),
      { key: 'cur', label: `Isi tersimpan · ${when(e.updated)}`, json: e.json },
      ...versions.map((x) => ({ key: x.key, label: when(x.at), json: x.json }))
    ];
    compare = { title: titleOf(e), sources, left: (v ?? versions[0]).key, right: 'cur' };
  }
  async function restoreVersion(e, v) {
    if (openIds.includes(e.id)) {
      const msg = `Muat isi versi ${when(v.at)} ke tab "${titleOf(e)}" yang sedang terbuka?\n\nIsi tab diganti, tetapi bisa dibatalkan dengan Urungkan (Ctrl+Z). Simpan (Ctrl+S) untuk menjadikannya isi terkini.`;
      if (!(await ui.confirm(msg, { title: 'Kembalikan versi', ok: 'Muat ke tab' }))) return;
      history = null;
      onclose();
      onrestoretab(e.id, v.json);
      return;
    }
    if (!(await ui.confirm(`Kembalikan isi "${titleOf(e)}" ke versi ${when(v.at)}? Isi saat ini tetap tersimpan di riwayat.`, { title: 'Kembalikan versi', ok: 'Kembalikan' }))) return;
    try {
      await restoreLocalVersion(e.id, v);
    } catch (err) {
      return ui.alert(err.message);
    }
    await refresh();
    onnotify('Versi lama dikembalikan');
  }
  async function dropVersions(e, list) {
    const what = list.length === 1 ? `versi ${when(list[0].at)}` : `${list.length} versi lama`;
    if (!(await ui.confirm(`Hapus ${what} dari riwayat "${titleOf(e)}"? Isi saat ini tetap utuh. Tindakan ini tidak bisa dibatalkan.`, { title: 'Hapus riwayat', ok: 'Hapus', danger: true }))) return;
    for (const v of list) await deleteVersion(v.key);
    await refresh();
  }

  // ---- Salin ke Pustaka Daring: SOP dan folder (beserta subfoldernya) dengan susunan yang sama ----
  let copying = $state(null); // { ids, fids, target, targets, busy, done, total }
  let copyDialog;
  $effect(() => {
    if (copying && !copyDialog.open) copyDialog.showModal();
    else if (!copying && copyDialog?.open) copyDialog.close();
  });
  /** Banyaknya SOP yang akan disalin: entri terpilih ditambah isi folder (dan subfoldernya). */
  const copyList = (ids, fids) => {
    const set = new Set(ids);
    for (const fid of fids) for (const e of live) if (inFolder(e, subtree(fid))) set.add(e.id);
    return live.filter((e) => set.has(e.id));
  };
  let cloud = { folders: [], parents: new Map() };
  const cloudPath = (id) => {
    const out = [];
    for (let f = cloud.folders.find((x) => x.id === id); f && out.length < 50; f = cloud.folders.find((x) => x.id === cloud.parents.get(f.id))) out.unshift(f.name);
    return out.join(' / ');
  };
  async function startCopy(list) {
    const { ids, fids } = idsOf(list);
    if (!copyList(ids, fids).length) return ui.alert('Tidak ada SOP untuk disalin.', { title: 'Salin ke Pustaka Daring' });
    await F.start();
    if (faculty.status !== 'in') return ui.alert('Masuk ke Pustaka Daring dulu untuk menyalin SOP ke sana.', { title: 'Salin ke Pustaka Daring' });
    let cl;
    try {
      cl = await F.listFolders();
    } catch (err) {
      return ui.alert(err.message, { title: 'Salin ke Pustaka Daring' });
    }
    cloud = { folders: cl, parents: F.resolveParents(cl) };
    const targets = cl
      .filter((f) => F.canManage(f))
      .map((f) => ({ id: f.id, label: cloudPath(f.id) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'id', { numeric: true }));
    copying = { ids, fids, target: '', targets, busy: false, done: 0, total: copyList(ids, fids).length };
  }
  async function submitCopy(ev) {
    ev.preventDefault();
    const c = copying;
    c.busy = true;
    const me = faculty.user.uid;
    const made = [];
    // Folder Daring bernama sama di tempat yang sama (dan bisa diisi akun ini) dipakai lagi.
    const folderIn = async (name, parent) => {
      const same = [...cloud.folders, ...made].find((f) => (cloud.parents.has(f.id) ? cloud.parents.get(f.id) : f.parent) === parent && f.name.toLowerCase() === name.toLowerCase() && (f.createdBy === me || F.canManage(f)));
      if (same) return same.id;
      const id = await F.createFolder(name, parent);
      made.push({ id, name, parent, createdBy: me });
      return id;
    };
    const put = async (e, folder) => {
      await F.uploadSop(parseDocumentText(e.json), undefined, folder);
      c.done++;
    };
    const walk = async (fid, parent) => {
      const f = byId.get(fid);
      const id = await folderIn(f.name, parent);
      for (const e of sorted(live.filter((x) => folderOf(x) === fid), 'name-asc', titleOf, (x) => x.updated ?? 0)) await put(e, id);
      for (const sub of childrenOf(fid)) await walk(sub.id, id);
    };
    const target = c.target || null;
    const where = target ? `folder ${cloudPath(target)}` : 'tingkat utama';
    try {
      for (const id of c.ids) {
        const e = live.find((x) => x.id === id);
        if (e) await put(e, target);
      }
      for (const fid of c.fids) await walk(fid, target);
    } catch (err) {
      faculty.stale = true;
      copying = null;
      return ui.alert(`Penyalinan berhenti setelah ${c.done} dari ${c.total} SOP: ${err.message}`, { title: 'Salin ke Pustaka Daring' });
    }
    faculty.stale = true;
    copying = null;
    selected.clear();
    onnotify(`${c.done} SOP disalin ke Pustaka Daring (${where})${made.length ? `, ${made.length} folder dibuat` : ''}`);
  }

  // ---- Menu klik kanan ----
  function openMenu(e, items) {
    e.preventDefault();
    e.stopPropagation();
    menu = { x: e.clientX, y: e.clientY, items };
  }
  /** Menu baris: bila baris itu termasuk pilihan beberapa item, menu berlaku untuk semua yang dipilih. */
  function showRowMenu(x, y, row) {
    cursor = row.key;
    const many = selected.has(row.key) && selRows.length > 1;
    const items = view === 'bin' ? (many ? binBatchMenu(selRows) : binMenu(row.item)) : many ? batchMenu(selRows) : row.isFolder ? folderMenu(row.item) : sopMenu(row.item);
    menu = { x, y, items };
  }
  function rowMenu(e, row) {
    e.preventDefault();
    e.stopPropagation();
    showRowMenu(e.clientX, e.clientY, row);
  }
  const batchMenu = (list) => [
    { head: `${list.length} item dipilih` },
    { label: 'Gabung jadi satu PDF…', icon: 'book', run: () => makeBook(list) },
    { label: 'Unduh sebagai ZIP', icon: 'download', run: () => rowsZip(list) },
    { label: 'Salin ke Pustaka Daring…', icon: 'cloud', run: () => startCopy(list) },
    { sep: true },
    { label: `Pindahkan ${list.length} item…`, icon: 'move', run: () => startMove(list) },
    { label: 'Potong', icon: 'cut', hint: 'Ctrl+X', run: () => cut(list) },
    { sep: true },
    { label: `Hapus ${list.length} item`, icon: 'trash', hint: 'Del', run: () => removeMany(list), danger: true },
    { sep: true },
    { label: 'Batal pilih', icon: 'x', hint: 'Esc', run: () => selected.clear() }
  ];
  const binBatchMenu = (list) => [
    { head: `${list.length} SOP dipilih` },
    { label: `Pulihkan ${list.length} SOP`, icon: 'restore', run: () => restore(list.map((d) => d.item)) },
    { sep: true },
    { label: `Hapus permanen ${list.length} SOP`, icon: 'trash', hint: 'Del', run: () => purge(list.map((d) => d.item)), danger: true },
    { sep: true },
    { label: 'Batal pilih', icon: 'x', hint: 'Esc', run: () => selected.clear() }
  ];
  const binMenu = (e) => [
    { label: 'Pratinjau', icon: 'eye', hint: 'Enter', run: () => (previewOf = e) },
    { label: 'Pulihkan', icon: 'restore', run: () => restore([e]) },
    { sep: true },
    { label: 'Hapus permanen', icon: 'trash', hint: 'Del', run: () => purge([e]), danger: true }
  ];
  function hereItems(id) {
    return [
      ...(clip ? [{ label: `Tempel ${countText(clip)} di sini`, icon: 'paste', hint: 'Ctrl+V', run: () => paste(id) }, { sep: true }] : []),
      { label: 'Folder baru di sini', icon: 'folderPlus', run: () => newFolder(id) },
      { label: 'Simpan dokumen ini ke sini', icon: 'save', run: () => saveCurrent(id), disabled: !cansave },
      { label: 'Impor berkas .sop atau .zip ke sini…', icon: 'upload', run: () => pickFiles(id), disabled: importing }
    ];
  }
  function folderMenu(f) {
    const row = entryOf(f, true);
    const empty = !sopsOf([row]).length;
    return [
      { label: 'Buka', icon: 'folder', hint: 'Enter', run: () => select(f.id) },
      { sep: true },
      ...hereItems(f.id),
      { sep: true },
      { label: 'Gabung isinya jadi satu PDF…', icon: 'book', run: () => makeBook([row]), disabled: empty },
      { label: 'Unduh isinya sebagai ZIP', icon: 'download', run: () => folderZip(f), disabled: empty },
      { label: 'Salin ke Pustaka Daring…', icon: 'cloud', run: () => startCopy([row]), disabled: empty },
      { label: 'Ubah nama', icon: 'pencil', hint: 'F2', run: () => renameFolder(f) },
      { label: 'Pindahkan', icon: 'move', run: () => startMove([row]) },
      { label: 'Potong', icon: 'cut', hint: 'Ctrl+X', run: () => cut([row]) },
      { sep: true },
      { label: 'Hapus', icon: 'trash', hint: 'Del', run: () => removeFolder(f), danger: true }
    ];
  }
  function sopMenu(e) {
    const row = entryOf(e, false);
    const isOpen = openIds.includes(e.id);
    return [
      { label: 'Buka', icon: 'open', hint: 'Enter', run: () => pick(e) },
      { label: 'Pratinjau', icon: 'eye', run: () => (previewOf = e) },
      { sep: true },
      { label: 'Duplikat', icon: 'copy', run: () => duplicate(e) },
      { label: 'Unduh berkas .sop', icon: 'download', run: () => downloadSop(e) },
      { label: 'Riwayat', icon: 'history', run: () => toggleHistory(e) },
      { label: 'Bandingkan versi…', icon: 'compare', run: () => compareVersions(e) },
      { label: 'Label…', icon: 'tag', run: () => editTags(e) },
      { label: 'Salin ke Pustaka Daring…', icon: 'cloud', run: () => startCopy([row]) },
      { label: 'Pindahkan', icon: 'move', run: () => startMove([row]) },
      { label: 'Potong', icon: 'cut', hint: 'Ctrl+X', run: () => cut([row]) },
      { sep: true },
      { label: 'Hapus', icon: 'trash', hint: 'Del', run: () => removeMany([row]), danger: true, disabled: isOpen, title: isOpen ? 'Tutup tabnya dulu untuk menghapus' : undefined }
    ];
  }
</script>

{#snippet ib(icon, tip, run, opts = {})}
  <button
    type="button"
    class="ib"
    class:danger={opts.danger}
    class:on={opts.on}
    aria-label={opts.label ?? tip}
    aria-disabled={opts.disabled ? 'true' : undefined}
    aria-expanded={opts.expanded}
    data-tip={tip}
    onclick={() => !opts.disabled && run()}
  >
    <Icon name={icon} />
  </button>
{/snippet}

{#snippet pickBox(row)}
  <input type="checkbox" class="pick" tabindex="-1" checked={selected.has(row.key)} aria-label={`Pilih ${nameOf(row)}`} onclick={(e) => pickClick(e, row)} />
{/snippet}

{#snippet selBar()}
  {#if selRows.length}
    {@const all = rows.every((r) => selected.has(r.key))}
    {@const list = selRows}
    <div class="selbar" role="toolbar" aria-label="Tindakan untuk yang dipilih">
      <label class="pickall" title={all ? 'Batal pilih (Esc)' : 'Pilih semua'}>
        <input
          type="checkbox"
          class="pick"
          checked={all}
          indeterminate={!all}
          onchange={() => (all ? selected.clear() : rows.forEach((r) => selected.add(r.key)))}
        />
        <strong>{list.length} dipilih</strong>
      </label>
      {#if view === 'bin'}
        <button type="button" class="btn" onclick={() => restore(list.map((d) => d.item))}><Icon name="restore" size={14} /> Pulihkan</button>
        <button type="button" class="btn danger" onclick={() => purge(list.map((d) => d.item))}><Icon name="trash" size={14} /> Hapus permanen</button>
      {:else}
        <button type="button" class="btn" onclick={() => makeBook(list)} title="Gabungkan SOP yang dipilih (termasuk isi folder) menjadi satu PDF berdaftar isi"><Icon name="book" size={14} /> Gabung PDF</button>
        <button type="button" class="btn" onclick={() => rowsZip(list)} title="Unduh SOP yang dipilih (termasuk isi folder) sebagai berkas .sop dalam ZIP"><Icon name="download" size={14} /> Unduh ZIP</button>
        <button type="button" class="btn" onclick={() => startMove(list)}><Icon name="move" size={14} /> Pindahkan</button>
        <button type="button" class="btn" onclick={() => startCopy(list)} title="Salin yang dipilih (termasuk isi folder) ke Pustaka Daring"><Icon name="cloud" size={14} /> Salin ke Daring</button>
        <button type="button" class="btn danger" onclick={() => removeMany(list)} title="Pindahkan ke Baru dihapus. SOP yang terbuka di tab tidak ikut."><Icon name="trash" size={14} /> Hapus</button>
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet node(f, depth)}
  {@const kids = childrenOf(f.id)}
  {@const opened = expanded.has(f.id)}
  <li role="treeitem" aria-selected={view === 'sops' && !only && at === f.id} aria-expanded={kids.length ? opened : undefined}>
    <div class="tn" data-id={f.id} class:sel={view === 'sops' && !only && at === f.id} class:drop={dropAt === f.id} class:dragging={dragged(f.id)} style:padding-left="{depth * 0.9 + 0.2}rem" role="presentation" draggable="true" ondragstart={(e) => dragStart(e, f, true)} ondragend={dragEnd} {...dropzone(f.id)} oncontextmenu={(e) => openMenu(e, folderMenu(f))}>
      {#if kids.length}
        <button type="button" class="chev" class:open={opened} aria-label={opened ? `Tutup ${f.name}` : `Buka ${f.name}`} onclick={() => toggle(f.id)}><Icon name="chevron" size={15} /></button>
      {:else}
        <span class="chev none"></span>
      {/if}
      <button type="button" class="tname" onclick={() => select(f.id)}>
        <Icon name="folder" size={18} />
        <span>{f.name}</span>
        {#if counts.get(f.id)}<small>{counts.get(f.id)}</small>{/if}
      </button>
    </div>
    {#if kids.length && opened}
      <ul role="group">
        {#each kids as k (k.id)}{@render node(k, depth + 1)}{/each}
      </ul>
    {/if}
  </li>
{/snippet}

  <header>
    {@render tabs()}
    <input
      class="search"
      type="search"
      bind:this={search}
      bind:value={query}
      onkeydown={(e) => e.key === 'ArrowDown' && rows.length && (e.preventDefault(), focusRow(rows[0].key))}
      placeholder={view === 'bin' ? 'Cari di Baru dihapus…' : 'Cari nama, nomor, label, atau isi SOP…'}
    />
    <button class="ib x" onclick={onclose} aria-label="Tutup" data-tip="Tutup"><Icon name="x" /></button>
  </header>
  <input
    bind:this={picker}
    type="file"
    hidden
    multiple
    accept=".sop,.json,.zip,application/json,application/zip"
    onchange={(ev) => ev.currentTarget.files.length && importFiles([...ev.currentTarget.files], pickTarget)}
  />

  <div class="panes" bind:this={panes} style:grid-template-columns="{treeW}px minmax(0, 1fr)">
    <aside>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <div class="split" role="separator" aria-orientation="vertical" aria-label="Lebar daftar folder" aria-valuenow={treeW} aria-valuemin={TREE_MIN} tabindex="0" title="Geser untuk mengubah lebar (klik dua kali: lebar awal)" onpointerdown={splitDown} onkeydown={splitKey} ondblclick={() => setTree(TREE_DEFAULT)}></div>
      <div class="tree" role="presentation" oncontextmenu={(e) => openMenu(e, hereItems(null))}>
        <ul role="tree" aria-label="Folder" bind:this={treeEl} onkeydown={treeKey}>
          <li role="treeitem" aria-selected={view === 'sops' && !only && !at}>
            <div class="tn" data-id="" class:sel={view === 'sops' && !only && !at} class:drop={dropAt === null} style:padding-left="0.2rem" role="presentation" {...dropzone(null)}>
              <span class="chev none"></span>
              <button type="button" class="tname" onclick={() => select(null)}>
                <Icon name="folder" size={18} />
                <span>Utama</span>
                {#if counts.get(null)}<small>{counts.get(null)}</small>{/if}
              </button>
            </div>
          </li>
          {#each childrenOf(null) as f (f.id)}{@render node(f, 1)}{/each}
        </ul>
      </div>
      <nav aria-label="Lainnya">
        <button
          type="button"
          class="tname nav"
          class:sel={view === 'sops' && only === 'due'}
          title={`SOP yang berlaku lebih dari ${review.years} tahun sejak tanggal efektif atau revisi terakhir`}
          onclick={() => {
            select(at);
            only = 'due';
          }}
        >
          <Icon name="alert" size={15} /><span>Perlu ditinjau</span>{#if dueCount}<small class="due">{dueCount}</small>{/if}
        </button>
        <button type="button" class="tname nav" class:sel={view === 'bin'} title={`SOP yang dihapus disimpan ${BIN_DAYS} hari, lalu dihapus permanen`} onclick={showBin}>
          <Icon name="trash" size={15} /><span>Baru dihapus</span>{#if binned.length}<small>{binned.length}</small>{/if}
        </button>
        <p class="note">Tersimpan di browser ini saja. Data hilang bila data situs browser dihapus, jadi sesekali unduh cadangannya (ZIP).</p>
      </nav>
    </aside>

    <section class="content">
      {#if view === 'sops'}
        <div class="crumbs">
          {#if only === 'due'}
            <span class="muted grow due-head">
              Perlu ditinjau: berlaku lebih dari
              <select value={review.years} onchange={(e) => setReviewYears(Number(e.currentTarget.value))} aria-label="Jangka tinjauan berkala">
                {#each REVIEW_CHOICES as y (y)}<option value={y}>{y} tahun</option>{/each}
              </select>
              sejak tanggal efektif atau revisi terakhir{words.length ? ', sesuai pencarian' : ''}
              <button type="button" class="link" onclick={() => (only = '')}>Tampilkan semua</button>
            </span>
          {:else if searching}
            <span class="muted grow">{words.length ? 'Hasil pencarian' : 'Hasil filter'} di semua folder · {shownLive.length} SOP</span>
          {:else}
            <nav class="grow" aria-label="Lokasi folder">
              <button class="crumb" class:drop={dropAt === null} aria-current={at ? undefined : 'location'} onclick={() => select(null)} {...dropzone(null)} oncontextmenu={(e) => openMenu(e, hereItems(null))}>Utama</button>
              {#each crumbs as c (c.id)}
                <span class="crumb-sep" aria-hidden="true">/</span>
                <button class="crumb" class:drop={dropAt === c.id} aria-current={c.id === at ? 'location' : undefined} onclick={() => select(c.id)} {...dropzone(c.id)} oncontextmenu={(e) => openMenu(e, folderMenu(c))}>{c.name}</button>
              {/each}
            </nav>
          {/if}
          {@render ib('filter', filtering ? 'Filter (aktif)' : 'Filter', () => (filterOpen = !filterOpen), { on: filterOpen || filtering, expanded: filterOpen || filtering })}
          <SortSelect />
          {@render ib('table', `Unduh daftar induk SOP (XLSX): ${scopeText}`, exportRegister, { label: 'Unduh daftar induk SOP (XLSX)', disabled: !scope.length })}
          {@render ib('download', `Unduh cadangan (ZIP): ${scopeText}`, backup, { label: 'Unduh cadangan (ZIP)', disabled: !scope.length })}
          {@render ib('folderPlus', searching ? 'Hapus pencarian atau filter dulu' : 'Folder baru di sini', () => newFolder(), { label: 'Folder baru', disabled: searching })}
          {@render ib('save', cansave ? 'Simpan dokumen yang sedang dibuka ke sini' : 'Tidak ada dokumen yang bisa disimpan', () => saveCurrent(searching ? null : at), { label: 'Simpan dokumen ini ke pustaka', disabled: !cansave })}
          {@render ib('upload', 'Impor berkas .sop atau .zip (bisa juga dilepas di daftar atau folder)', () => pickFiles(), { label: 'Impor berkas .sop atau .zip', disabled: importing })}
        </div>
        {#if filterOpen || filtering}
          <div class="filters" role="group" aria-label="Filter SOP">
            <label>
              <span>Label</span>
              <select bind:value={filt.tag}>
                <option value={null}>Semua</option>
                {#if untagged}<option value="">Tanpa label ({untagged})</option>{/if}
                {#each tagList as [t, n] (t)}<option value={t}>{t} ({n})</option>{/each}
              </select>
            </label>
            <label>
              <span>Diubah</span>
              <select bind:value={filt.changed}>
                <option value="">Kapan saja</option>
                {#each CHANGED as [v, label] (v)}<option value={v}>{label}</option>{/each}
              </select>
            </label>
            {#if filt.tag}
              <span class="tagacts">
                <button type="button" class="link plain" onclick={() => renameTag(filt.tag)}>Ubah nama label</button>
                <button type="button" class="link plain danger" onclick={() => removeTag(filt.tag)}>Hapus label</button>
              </span>
            {/if}
            {#if filtering}<button type="button" class="link" onclick={resetFilters}>Hapus filter</button>{/if}
          </div>
        {/if}
        {#if importing}<p class="progress" role="status">Mengimpor…</p>{/if}
        {#if !drag && dropAt !== undefined}
          <p class="filehint" aria-hidden="true">Lepaskan berkas .sop atau .zip untuk mengimpor ke {dropAt ? byId.get(dropAt)?.name : 'Utama'}</p>
        {/if}
        {@render selBar()}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
        <ul class="list" class:selecting={selected.size > 0} class:drop={!searching && dropAt === at} tabindex="-1" bind:this={listEl} onkeydown={listKey} oncontextmenu={(e) => openMenu(e, hereItems(searching ? null : at))} {...dropzone(searching ? null : at)}>
          {#each shownFolders as f (f.id)}
            {@const row = entryOf(f, true)}
            <li class="folder" data-key={row.key} class:sel={selected.has(row.key)} class:drop={dropAt === f.id} class:dragging={dragged(f.id)} draggable="true" ondragstart={(e) => dragStart(e, f, true)} ondragend={dragEnd} {...dropzone(f.id)} oncontextmenu={(e) => rowMenu(e, row)}>
              {@render pickBox(row)}
              <button class="main" onclick={(e) => rowClick(e, row, () => enterFolder(f.id))} onfocus={() => (cursor = row.key)}>
                <strong><Icon name="folder" size={18} /> {f.name}</strong>
                <small>{#if searching && parentOf(f)}<span>di {pathText(parentOf(f))}</span>{/if}<span>{folderInfo(f)}</span></small>
              </button>
              <span class="acts" role="group" aria-label="Tindakan folder">
                {@render ib('pencil', 'Ubah nama', () => renameFolder(f), { label: `Ubah nama folder ${f.name}` })}
                {@render ib('download', 'Unduh isinya sebagai ZIP', () => folderZip(f), { label: `Unduh isi folder ${f.name} sebagai ZIP` })}
                {@render ib('cloud', 'Salin beserta isinya ke Pustaka Daring', () => startCopy([row]), { label: `Salin folder ${f.name} ke Pustaka Daring` })}
                {@render ib('move', 'Pindahkan', () => startMove([row]), { label: `Pindahkan folder ${f.name}` })}
                {@render ib('trash', 'Hapus folder', () => removeFolder(f), { danger: true, label: `Hapus folder ${f.name}` })}
              </span>
            </li>
          {/each}
          {#each shownLive as e (e.id)}
            {@const row = entryOf(e, false)}
            {@const isOpen = openIds.includes(e.id)}
            <li data-key={row.key} class:sel={selected.has(row.key)} class:dragging={dragged(e.id)} draggable="true" ondragstart={(ev) => dragStart(ev, e, false)} ondragend={dragEnd} oncontextmenu={(ev) => rowMenu(ev, row)}>
              {@render pickBox(row)}
              <button class="main" onclick={(ev) => rowClick(ev, row, () => pick(e))} onfocus={() => (cursor = row.key)}>
                <strong>
                  <Icon name="file" size={15} />
                  {titleOf(e)}
                  {#each e.tags as t (t)}<em>{t}</em>{/each}
                  {#if e.id === current}<em class="shared">Sedang dibuka</em>{:else if isOpen}<em class="shared">Terbuka di tab</em>{/if}
                  {#if isDue(e)}<em class="due" title={`Berlaku sejak ${formatTanggal(e.since)}, lebih dari ${review.years} tahun`}>Perlu ditinjau</em>{/if}
                </strong>
                <small title={`Terakhir diubah ${when(e.updated)}`}>
                  {#if searching}<span>di {pathText(folderOf(e))}</span>{/if}{#if only === 'due'}<span>acuan {formatTanggal(e.since)}</span>{/if}{#if e.nomor}<span>{e.nomor}</span>{/if}{#if e.fileName}<span>{e.fileName}</span>{/if}<span>Diubah {ago(e.updated)}</span>
                </small>
                {#if words.length}<MatchSnippet parts={e.parts} {words} />{/if}
              </button>
              <span class="acts" role="group" aria-label="Tindakan SOP">
                {@render ib('eye', 'Pratinjau tanpa membuka', () => (previewOf = e), { label: `Pratinjau ${titleOf(e)}` })}
                {@render ib('copy', 'Duplikat', () => duplicate(e), { label: `Duplikat ${titleOf(e)}` })}
                {@render ib('history', 'Riwayat versi', () => toggleHistory(e), { on: history?.id === e.id, expanded: history?.id === e.id, label: `Riwayat ${titleOf(e)}` })}
                {@render ib('tag', 'Label', () => editTags(e), { on: tagEdit === e.id, expanded: tagEdit === e.id, label: `Label ${titleOf(e)}` })}
                {@render ib('download', 'Unduh berkas .sop', () => downloadSop(e), { label: `Unduh ${titleOf(e)} sebagai berkas .sop` })}
                {@render ib('cloud', 'Salin ke Pustaka Daring', () => startCopy([row]), { label: `Salin ${titleOf(e)} ke Pustaka Daring` })}
                {@render ib('move', 'Pindahkan', () => startMove([row]), { label: `Pindahkan ${titleOf(e)}` })}
                {@render ib('trash', isOpen ? 'Tutup tabnya dulu untuk menghapus' : 'Pindahkan ke Baru dihapus', () => trash([e]), { danger: true, disabled: isOpen, label: `Hapus ${titleOf(e)}` })}
              </span>
              {#if history?.id === e.id}
                <div class="history">
                  {#if history.versions.length}
                    <div class="hhead">
                      <span class="muted">{history.versions.length} versi lama · {KEEP_VERSIONS} terakhir disimpan</span>
                      <span class="hacts">
                        <button type="button" class="link cmp" onclick={() => compareVersions(e)}>Bandingkan versi…</button>
                        <button type="button" class="link" onclick={() => dropVersions(e, history.versions)}>Hapus semua riwayat…</button>
                      </span>
                    </div>
                  {/if}
                  {#each history.versions as v (v.key)}
                    <div>
                      <span>{when(v.at)}{v.title !== e.title ? ` · ${v.title || 'tanpa nama'}` : ''}</span>
                      <span class="hacts">
                        {@render ib('eye', 'Pratinjau versi ini', () => (previewOf = { ...e, json: v.json, versionAt: v.at }), { label: `Pratinjau versi ${when(v.at)}` })}
                        {@render ib('compare', 'Bandingkan dengan isi tersimpan', () => compareVersions(e, v), { label: `Bandingkan versi ${when(v.at)}` })}
                        {@render ib('restore', isOpen ? 'Muat versi ini ke tab yang terbuka (simpan untuk menerapkannya)' : 'Kembalikan versi ini', () => restoreVersion(e, v), { label: `Kembalikan versi ${when(v.at)}` })}
                        {@render ib('trash', 'Hapus versi ini dari riwayat', () => dropVersions(e, [v]), { danger: true, label: `Hapus versi ${when(v.at)}` })}
                      </span>
                    </div>
                  {:else}
                    <span class="muted">Belum ada versi lama. Setiap kali SOP ini disimpan, isi sebelumnya dicatat di sini.</span>
                  {/each}
                </div>
              {/if}
              {#if tagEdit === e.id}
                <div class="tag-edit">
                  {#each allTags as t (t)}
                    <label class:on={e.tags.includes(t)}>
                      <input type="checkbox" checked={e.tags.includes(t)} onchange={() => toggleTag(e, t)} />
                      {t}
                    </label>
                  {/each}
                  <form
                    onsubmit={(ev) => {
                      ev.preventDefault();
                      addTag(e);
                    }}
                  >
                    <!-- svelte-ignore a11y_autofocus -->
                    <input bind:value={newTag} placeholder={allTags.length ? 'Label baru…' : 'Label baru, mis. Akademik'} aria-label="Label baru" autofocus />
                    <button class="btn small" disabled={!newTag.trim()}><Icon name="plus" size={14} />Tambah</button>
                  </form>
                </div>
              {/if}
            </li>
          {/each}
          {#if !shownFolders.length && !shownLive.length}
            <li class="empty">
              {#if searching}
                Tidak ada yang cocok.
              {:else if at}
                Folder ini kosong. Pindahkan SOP ke sini, atau lepaskan berkas .sop/.zip di sini untuk mengimpornya.
              {:else}
                Belum ada dokumen. SOP yang disimpan ke Pustaka Lokal akan muncul di sini, atau lepaskan berkas .sop/.zip di sini untuk mengimpornya.
              {/if}
            </li>
          {/if}
        </ul>
      {:else}
        <div class="crumbs">
          <span class="muted grow">SOP yang dihapus disimpan di sini selama {BIN_DAYS} hari, lalu dihapus permanen.</span>
          <button type="button" class="btn small danger" onclick={() => purge(binned)} disabled={!binned.length}>Kosongkan</button>
        </div>
        {@render selBar()}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
        <ul class="list" class:selecting={selected.size > 0} tabindex="-1" bind:this={listEl} onkeydown={listKey}>
          {#each shownBin as e (e.id)}
            {@const row = entryOf(e, false)}
            <li data-key={row.key} class:sel={selected.has(row.key)} oncontextmenu={(ev) => rowMenu(ev, row)}>
              {@render pickBox(row)}
              <button class="main" onclick={(ev) => rowClick(ev, row, () => (previewOf = e))} onfocus={() => (cursor = row.key)} title="Pratinjau">
                <strong><Icon name="file" size={15} /> {titleOf(e)}</strong>
                <small>{#if e.nomor}<span>{e.nomor}</span>{/if}<span>dari {e.fromPath || 'Utama'}</span><span title={when(e.deleted)}>dihapus {ago(e.deleted)}</span><span>terhapus permanen dalam {binDaysLeft(e)} hari</span></small>
              </button>
              <span class="acts" role="group" aria-label="Tindakan SOP">
                {@render ib('eye', 'Pratinjau', () => (previewOf = e), { label: `Pratinjau ${titleOf(e)}` })}
                {@render ib('restore', 'Pulihkan ke folder asalnya', () => restore([e]), { label: 'Pulihkan' })}
                {@render ib('trash', 'Hapus permanen', () => purge([e]), { danger: true })}
              </span>
            </li>
          {:else}
            <li class="empty">{query.trim() ? 'Tidak ada yang cocok.' : 'Tidak ada SOP yang baru dihapus.'}</li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>
  <svelte:window onkeydown={panelKey} />
  {#if menu}<ContextMenu x={menu.x} y={menu.y} items={menu.items} {host} onclose={() => (menu = null)} />{/if}

<SopPreviewDialog
  item={previewOf && {
    title: titleOf(previewOf),
    json: previewOf.json,
    where: previewOf.versionAt ? `Versi ${when(previewOf.versionAt)}` : previewOf.deleted ? `Dihapus dari ${previewOf.fromPath || 'Utama'}` : `Folder ${pathText(folderOf(previewOf))}`
  }}
  onopen={previewOf && !previewOf.deleted && !previewOf.versionAt
    ? () => {
        const e = previewOf;
        previewOf = null;
        pick(e);
      }
    : undefined}
  onclose={() => (previewOf = null)}
/>

<dialog bind:this={moveDialog} class="move-dialog" use:dismiss onclose={() => (moving = null)} aria-labelledby="local-move-title">
  {#if moving}
    <form onsubmit={submitMove}>
      <h2 id="local-move-title">Pindahkan</h2>
      <p class="muted">
        {moving.ids.length + moving.fids.length === 1
          ? moving.fids.length
            ? `Folder ${byId.get(moving.fids[0])?.name}`
            : titleOf(entries.find((e) => e.id === moving.ids[0]) ?? {})
          : `${moving.ids.length + moving.fids.length} item`}
      </p>
      <label>
        <span>Ke folder</span>
        <select bind:value={moving.target}>
          <option value={null}>Utama</option>
          {#each moveTargets as t (t.id)}
            <option value={t.id}>{'   '.repeat(t.depth + 1)}{t.name}</option>
          {/each}
        </select>
      </label>
      <footer>
        <button type="button" class="btn" onclick={() => (moving = null)}>Batal</button>
        <button class="btn primary"><Icon name="move" size={15} />Pindahkan</button>
      </footer>
    </form>
  {/if}
</dialog>

<dialog
  bind:this={copyDialog}
  class="move-dialog"
  use:dismiss
  oncancel={(ev) => copying?.busy && ev.preventDefault()}
  onclose={() => !copying?.busy && (copying = null)}
  aria-labelledby="local-copy-title"
>
  {#if copying}
    <form onsubmit={submitCopy}>
      <h2 id="local-copy-title">Salin ke Pustaka Daring</h2>
      <p class="muted">
        {copying.total} SOP{copying.fids.length ? ` dari folder ${copying.fids.map((id) => byId.get(id)?.name).join(', ')} beserta subfoldernya` : ''} diunggah sebagai SOP baru milik Anda.
        {copying.fids.length ? 'Susunan foldernya ikut dibuat; folder Daring bernama sama di tempat tujuan dipakai lagi.' : ''}
        Isi Pustaka Lokal tidak berubah.
      </p>
      <label>
        <span>Ke folder Daring</span>
        <select bind:value={copying.target} disabled={copying.busy}>
          <option value="">Utama (tingkat teratas)</option>
          {#each copying.targets as t (t.id)}
            <option value={t.id}>{t.label}</option>
          {/each}
        </select>
      </label>
      {#if copying.busy}
        <progress max={copying.total} value={copying.done}></progress>
        <p class="muted">Mengunggah {copying.done} dari {copying.total} SOP…</p>
      {/if}
      <footer>
        <button type="button" class="btn" onclick={() => (copying = null)} disabled={copying.busy}>Batal</button>
        <button class="btn primary" disabled={copying.busy}><Icon name="cloud" size={15} />Salin</button>
      </footer>
    </form>
  {/if}
</dialog>

{#if compare}
  <VersionDiffDialog open={true} title={compare.title} sources={compare.sources} bind:left={compare.left} bind:right={compare.right} onclose={() => (compare = null)} />
{/if}

<style>
  header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.7rem;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .search {
    flex: 1;
    min-width: 0;
    margin: 0 0.5rem;
  }
  .muted {
    color: var(--muted);
    font-weight: 400;
  }
  .ib {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 1.85rem;
    height: 1.85rem;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 7px;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }
  .ib:hover:not([aria-disabled='true']):not(:disabled) {
    background: var(--surface-2);
    color: var(--text);
  }
  .ib.danger:hover:not([aria-disabled='true']):not(:disabled) {
    color: var(--danger);
  }
  .ib.on {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .ib[aria-disabled='true'],
  .ib:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .panes {
    flex: 1;
    min-height: 0;
    display: grid;
    border: 1px solid var(--line);
    border-radius: 10px;
    overflow: hidden;
  }
  aside {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    border-right: 1px solid var(--line);
    background: var(--surface-2);
  }
  .split {
    position: absolute;
    z-index: 2;
    top: 0;
    bottom: 0;
    right: -4px;
    width: 7px;
    cursor: col-resize;
    touch-action: none;
    outline: none;
  }
  .split::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 2px;
    width: 3px;
    background: transparent;
    transition: background 0.15s;
  }
  .split:hover::after,
  .split:active::after,
  .split:focus-visible::after {
    background: var(--accent);
  }
  .tree {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 0.35rem;
  }
  .tree ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .tn {
    display: flex;
    align-items: center;
    border-radius: 6px;
  }
  .tn:hover {
    background: var(--line);
  }
  .tn.drop,
  .crumb.drop,
  .list > li.drop {
    background: var(--accent-soft);
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .list.drop {
    outline: 2px dashed var(--accent);
    outline-offset: -2px;
    border-radius: 6px;
  }
  .dragging {
    opacity: 0.45;
  }
  .tn.sel,
  .tname.nav.sel {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .chev {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    border: 0;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }
  .chev.none {
    cursor: default;
  }
  .chev.open :global(svg) {
    transform: rotate(90deg);
  }
  .tname {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.42rem 0.4rem 0.42rem 0.1rem;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 0.95rem;
    text-align: left;
    cursor: pointer;
  }
  .tname :global(svg) {
    flex: none;
  }
  .tname span {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tname small {
    flex: none;
    color: var(--muted);
    font-size: 0.78rem;
  }
  aside nav {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.5rem 0.6rem 0.75rem;
    border-top: 1px solid var(--line);
  }
  .tname.nav {
    width: 100%;
    padding: 0.4rem 0.6rem;
    border-radius: 6px;
  }
  .tname.nav:hover:not(.sel) {
    background: var(--line);
  }
  .note {
    margin: 0.4rem 0.6rem 0;
    color: var(--muted);
    font-size: 0.75rem;
    line-height: 1.4;
  }
  .content {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    padding: 0.45rem 0.6rem;
  }
  .filehint {
    position: absolute;
    left: 50%;
    bottom: 1rem;
    transform: translateX(-50%);
    z-index: 2;
    margin: 0;
    padding: 0.45rem 0.9rem;
    border-radius: 999px;
    background: var(--accent);
    color: #fff;
    font-size: 0.85rem;
    font-weight: 600;
    white-space: nowrap;
    pointer-events: none;
    box-shadow: 0 4px 14px rgb(0 0 0 / 0.2);
  }
  .progress {
    margin: 0 0 0.4rem;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .crumbs {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    min-height: 2rem;
    margin-bottom: 0.35rem;
    font-size: 0.85rem;
  }
  .crumbs nav {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.15rem 0.3rem;
  }
  .crumb {
    border: 0;
    background: none;
    padding: 0.1rem 0.2rem;
    font: inherit;
    color: var(--accent);
    cursor: pointer;
    overflow-wrap: anywhere;
    text-align: left;
  }
  .crumb:hover {
    text-decoration: underline;
  }
  .crumb[aria-current] {
    color: var(--text);
    font-weight: 600;
  }
  .crumb-sep {
    color: var(--muted);
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 0.4rem 0.75rem;
    padding: 0.5rem 0.6rem;
    margin-bottom: 0.4rem;
    border-radius: 8px;
    background: var(--surface-2);
    font-size: 0.82rem;
  }
  .filters label {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    color: var(--muted);
  }
  .filters select {
    min-width: 9rem;
    max-width: 16rem;
    width: auto;
    padding: 0.25rem 0.35rem;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
  }
  .filters .link {
    align-self: center;
    margin-left: auto;
  }
  .filters .tagacts {
    align-self: center;
    display: inline-flex;
    gap: 0.6rem;
  }
  .filters .tagacts .link {
    margin-left: 0;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow: auto;
    flex: 1;
    min-height: 0;
  }
  .list > li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.45rem;
    border-bottom: 1px solid var(--line);
    border-radius: 6px;
  }
  .list > li:hover:not(.empty) {
    background: var(--surface-2);
  }
  .main {
    flex: 1 1 18rem;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.1rem;
    border: 0;
    background: none;
    text-align: left;
    padding: 0.15rem 0;
    cursor: pointer;
    color: inherit;
    font: inherit;
  }
  .main strong :global(svg) {
    vertical-align: -3px;
    color: var(--muted);
  }
  button.main:hover strong {
    color: var(--accent);
  }
  .main small {
    color: var(--muted);
    font-size: 0.78rem;
  }
  .main small > span + span::before {
    content: ' · ';
  }
  em {
    font-style: normal;
    font-size: 0.72rem;
    font-weight: 500;
    color: var(--muted);
    border: 1px solid var(--line);
    border-radius: 99px;
    padding: 0.03rem 0.45rem;
    margin-left: 0.2rem;
    white-space: nowrap;
  }
  em.shared {
    color: var(--accent);
    background: var(--accent-soft);
    border-color: transparent;
  }
  em.due {
    color: #92400e;
    background: var(--warn-bg, #fef3c7);
    border-color: var(--warn-line, #f59e0b);
  }
  small.due {
    color: #92400e !important;
    font-weight: 600;
  }
  .acts {
    display: inline-flex;
    flex: none;
  }
  /* Tombol tindakan hanya tampil pada baris yang disorot mouse atau difokuskan keyboard (sama dengan Pustaka Daring).
     Layar sentuh (tanpa hover) selalu menampilkannya. */
  @media (hover: hover) {
    .list > li .acts {
      opacity: 0;
      transition: opacity 0.12s;
    }
    .list > li:hover .acts,
    .list > li:focus-within .acts,
    .list > li .acts:has(.on) {
      opacity: 1;
    }
  }
  .btn:disabled {
    opacity: 0.45;
    cursor: default;
  }
  /* ---- Pilihan ---- */
  .list:focus {
    outline: none;
  }
  .list > li.sel,
  .list > li.sel:hover {
    background: var(--accent-soft);
  }
  .list > li:has(> .main:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .main:focus-visible {
    outline: none;
  }
  .pick {
    flex: none;
    width: 15px;
    height: 15px;
    margin: 0 0 0 0.1rem;
    accent-color: var(--accent);
    cursor: pointer;
  }
  @media (hover: hover) {
    .list:not(.selecting) > li:not(:hover) .pick {
      opacity: 0;
    }
  }
  .selbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.35rem;
    padding: 0.3rem 0.5rem;
    border-radius: 8px;
    background: var(--accent-soft);
    font-size: 0.84rem;
  }
  .selbar strong {
    color: var(--accent);
  }
  .pickall {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    margin-right: 0.3rem;
    cursor: pointer;
  }
  .selbar .btn {
    padding: 0.22rem 0.6rem;
    font-size: 0.82rem;
  }
  .selbar .btn.danger,
  .crumbs .btn.danger {
    color: var(--danger);
  }
  .history {
    flex-basis: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.4rem 0.5rem;
    border-radius: 8px;
    background: var(--surface);
    border: 1px solid var(--line);
    font-size: 0.82rem;
  }
  .history div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .history .hhead {
    padding-bottom: 0.25rem;
    border-bottom: 1px solid var(--line);
  }
  .history .hacts {
    display: flex;
    gap: 0.15rem;
  }
  .history .link {
    border: 0;
    background: none;
    padding: 0;
    color: var(--danger);
    font: inherit;
    cursor: pointer;
    text-decoration: none;
  }
  .history .link:hover {
    text-decoration: underline;
  }
  .history .hhead .hacts {
    gap: 0.9rem;
  }
  .history .link.cmp {
    color: var(--accent);
  }
  .tag-edit {
    flex-basis: 100%;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
    padding: 0.4rem 0.5rem;
    border-radius: 8px;
    background: var(--surface);
    border: 1px solid var(--line);
  }
  .tag-edit label {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.8rem;
    border: 1px solid var(--line);
    border-radius: 99px;
    padding: 0.1rem 0.55rem 0.1rem 0.35rem;
    background: var(--surface);
    cursor: pointer;
  }
  .tag-edit label.on {
    border-color: var(--accent);
    color: var(--accent);
  }
  .tag-edit input[type='checkbox'] {
    margin: 0;
  }
  .tag-edit form {
    display: flex;
    gap: 0.3rem;
  }
  .tag-edit form input {
    width: 12rem;
    font: inherit;
    font-size: 0.8rem;
    padding: 0.2rem 0.45rem;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text);
  }
  .due-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem;
  }
  .due-head select {
    width: auto;
    padding: 0.05rem 0.3rem;
    font-size: 0.8rem;
  }
  .empty {
    justify-content: center;
    color: var(--muted);
    padding: 1.5rem !important;
    font-size: 0.9rem;
    border-bottom: 0 !important;
  }
  .link {
    border: 0;
    background: none;
    color: var(--accent);
    cursor: pointer;
    text-decoration: underline;
  }
  .link.plain {
    padding: 0;
    font: inherit;
  }
  .link.danger {
    color: var(--danger);
  }
  .move-dialog {
    width: min(420px, calc(100vw - 2rem));
    border: 0;
    border-radius: 14px;
    padding: 1rem 1.1rem;
    box-shadow: 0 20px 50px rgb(0 0 0 / 0.25);
    background: var(--surface);
    color: var(--text);
  }
  .move-dialog::backdrop {
    background: rgb(15 23 42 / 0.45);
  }
  .move-dialog h2 {
    margin: 0 0 0.3rem;
    font-size: 1.05rem;
  }
  .move-dialog p {
    margin: 0 0 0.8rem;
    font-size: 0.85rem;
    overflow-wrap: anywhere;
  }
  .move-dialog label {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    font-size: 0.85rem;
  }
  .move-dialog select {
    font: inherit;
  }
  .move-dialog footer {
    display: flex;
    gap: 0.4rem;
    margin-top: 0.8rem;
    justify-content: flex-end;
  }
  .move-dialog progress {
    width: 100%;
    margin-top: 0.8rem;
  }
</style>
