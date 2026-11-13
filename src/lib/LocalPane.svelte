<script>
  import { newTabId } from './store.svelte.js';
  import * as ui from './ask.svelte.js';
  import Icon from './Icon.svelte';
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
  import { review, reviewSince, reviewDue, isReviewDue } from './review.svelte.js';

  /**
   * openIds: id tab yang sedang terbuka (= id entri pustaka), current: id tab aktif.
   * Panel di dialog Pustaka: open = dialognya terbuka, active = tab Lokal yang tampil, tabs = pemilih tab di kepala panel,
   * onclose() menutup dialog. onbook(entries, title): menggabungkan entri menjadi satu PDF.
   * tabjson(id): isi tab entri `id` (boleh belum tersimpan) atau null; onrestoretab(id, json): memuat versi lama ke tab itu.
   */
  let { open = false, active = false, tabs, onclose, openIds = [], current, onopen, onsave, cansave = true, onnotify, onbook, tabjson, onrestoretab } = $props();

  let entries = $state([]); // semua entri, termasuk yang ada di "Baru dihapus"
  let folders = $state([]);
  let here = $state(null); // folder yang sedang dibuka; null = Utama
  let bin = $state(false); // tampilan "Baru dihapus"
  let query = $state('');
  let tag = $state(null); // saringan label: null = semua, '' = tanpa label
  let tagEdit = $state(null); // id entri yang labelnya sedang diatur
  let newTag = $state('');
  let picked = $state([]); // id entri yang dicentang untuk tindakan sekaligus
  let due = $state(false); // hanya yang perlu ditinjau
  let previewOf = $state(null); // entri yang sedang dipratinjau
  let history = $state(null); // { id, versions } riwayat yang sedang dibuka
  let compare = $state(null); // dialog Bandingkan versi

  // Tiap kali dialog dibuka, pencarian, pilihan, dan tampilan "Baru dihapus" dikosongkan; folder yang dibuka diingat.
  let wasOpen = false;
  $effect(() => {
    if (open && !wasOpen) {
      query = '';
      tagEdit = null;
      picked = [];
      due = false;
      bin = false;
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
  const searching = $derived(!!query.trim() || tag !== null || due);
  const inFolder = (e, set) => set.has(folderOf(e));
  function folderInfo(f) {
    const tree = subtree(f.id);
    const n = live.filter((e) => inFolder(e, tree)).length;
    const sub = childrenOf(f.id).length;
    return [n ? `${n} SOP` : 'Kosong', sub && `${sub} folder`].filter(Boolean).join(' · ');
  }

  const shownFolders = $derived(bin || searching ? [] : childrenOf(at));
  const words = $derived(query.trim().toLowerCase().split(/\s+/).filter(Boolean));
  const shown = $derived.by(() => {
    const match = (e) => words.every((w) => e.text.includes(w));
    if (bin) return binned.filter(match);
    const byTag = (e) => tag === null || (tag === '' ? !e.tags.length : e.tags.includes(tag));
    const found = searching ? live.filter((e) => byTag(e) && (!due || isDue(e)) && match(e)) : live.filter((e) => folderOf(e) === at);
    return sorted(found, librarySort.by, titleOf, (e) => e.updated ?? 0);
  });
  const isDue = (e) => isReviewDue(e.since, review.years);
  const dueCount = $derived(live.filter(isDue).length);
  // Pilihan: entri yang tampil. Yang sedang terbuka di tab boleh dipilih (untuk PDF/ZIP/pindah), tetapi tidak ikut dihapus.
  const chosen = $derived(shown.filter((e) => picked.includes(e.id)));
  const deletable = $derived(chosen.filter((e) => !openIds.includes(e.id)));
  const allChosen = $derived(shown.length > 0 && chosen.length === shown.length);
  function togglePick(id) {
    picked = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
  }
  function pickAll() {
    picked = allChosen ? [] : shown.map((e) => e.id);
  }
  function go(id) {
    here = id;
    picked = [];
    tagEdit = null;
  }
  function showBin(on) {
    bin = on;
    picked = [];
    tagEdit = null;
    query = '';
  }

  async function newFolder() {
    const name = cleanFolderName(await ui.prompt(`Nama folder baru di ${pathText(at)}`, '', { title: 'Folder baru', ok: 'Buat', maxlength: 120 }));
    if (!name) return;
    if (childrenOf(at).some((f) => f.name.toLowerCase() === name.toLowerCase())) return ui.alert(`Folder "${name}" sudah ada di sini.`, { title: 'Folder baru' });
    await putFolder({ id: 'f-' + uid() + uid(), name, parent: at, created: Date.now() });
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
  async function removeFolder(f) {
    const tree = subtree(f.id);
    const inside = live.filter((e) => inFolder(e, tree));
    const busy = inside.filter((e) => openIds.includes(e.id));
    if (busy.length) return ui.alert(`Tutup dulu tab berikut sebelum menghapus folder "${f.name}":\n\n${busy.map(titleOf).join('\n')}`, { title: 'Hapus folder' });
    const sub = tree.size - 1;
    const parts = [
      inside.length ? `${inside.length} SOP di dalamnya dipindahkan ke Baru dihapus dan bisa dipulihkan selama ${BIN_DAYS} hari.` : 'Folder ini kosong.',
      sub && `${sub} subfolder ikut dihapus.`
    ].filter(Boolean);
    if (!(await ui.confirm(`Hapus folder "${f.name}"? ${parts.join(' ')}`, { title: 'Hapus folder', ok: 'Hapus', danger: true }))) return;
    const now = Date.now();
    for (const e of inside) await patchEntry(e.id, { deleted: now, fromPath: pathText(folderOf(e)) });
    await deleteFolders([...tree]);
    if (tree.has(at)) here = parentOf(f);
    await refresh();
    onnotify(inside.length ? `Folder dihapus, ${inside.length} SOP dipindahkan ke Baru dihapus` : 'Folder dihapus');
  }

  // ---- Pindah: lewat dialog atau seret ke folder / jalur di atas daftar ----
  let moving = $state(null); // { ids, fids, target }
  let moveDialog;
  $effect(() => {
    if (moving && !moveDialog.open) moveDialog.showModal();
    else if (!moving && moveDialog?.open) moveDialog.close();
  });
  const blocked = (fids) => new Set(fids.flatMap((id) => [...subtree(id)]));
  const moveTargets = $derived(moving ? flatTree.filter((t) => !blocked(moving.fids).has(t.id)) : []);
  const startMove = (ids, fids = []) => (ids.length || fids.length) && (moving = { ids, fids, target: at });
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
    picked = [];
    await refresh();
    if (n) onnotify(`${n} item dipindahkan ke ${pathText(target)}`);
  }
  function submitMove(ev) {
    ev.preventDefault();
    const { ids, fids, target } = moving;
    moving = null;
    moveTo(ids, fids, target);
  }

  const DRAG = 'application/x-sop-local';
  let dropAt = $state(undefined); // folder tujuan seret yang sedang disorot (null = Utama)
  function dragStart(ev, e, isFolder) {
    const ids = isFolder ? [] : picked.includes(e.id) ? chosen.map((x) => x.id) : [e.id];
    ev.dataTransfer.setData(DRAG, JSON.stringify({ ids, fids: isFolder ? [e.id] : [] }));
    ev.dataTransfer.effectAllowed = 'move';
  }
  function dropzone(id) {
    const ok = (ev) => ev.dataTransfer?.types.includes(DRAG);
    return {
      ondragover: (ev) => {
        if (!ok(ev)) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'move';
        dropAt = id;
      },
      ondragleave: (ev) => {
        if (!ev.currentTarget.contains(ev.relatedTarget) && dropAt === id) dropAt = undefined;
      },
      ondrop: (ev) => {
        if (!ok(ev)) return;
        ev.preventDefault();
        ev.stopPropagation();
        dropAt = undefined;
        try {
          const { ids, fids } = JSON.parse(ev.dataTransfer.getData(DRAG));
          if (!fids.includes(id)) moveTo(ids, fids, id);
        } catch {}
      }
    };
  }

  // ---- Baru dihapus ----
  async function trash(list, note = '') {
    const now = Date.now();
    for (const e of list) await patchEntry(e.id, { deleted: now, fromPath: pathText(folderOf(e)) });
    picked = [];
    await refresh();
    onnotify((list.length === 1 ? `"${titleOf(list[0])}" dipindahkan ke Baru dihapus` : `${list.length} SOP dipindahkan ke Baru dihapus`) + note);
  }
  function removePicked() {
    const skipped = chosen.length - deletable.length;
    if (deletable.length) trash(deletable, skipped ? `; ${skipped} yang terbuka di tab tidak ikut` : '');
  }
  async function restore(list) {
    let lost = 0;
    for (const e of list) {
      if (e.folder && !byId.has(e.folder)) lost++;
      await patchEntry(e.id, { deleted: undefined, fromPath: undefined, folder: byId.has(e.folder) ? e.folder : null });
    }
    picked = [];
    await refresh();
    onnotify(`${list.length} SOP dipulihkan${lost ? `; ${lost} di antaranya ke Utama karena foldernya sudah dihapus` : ''}`);
  }
  async function purge(list) {
    if (!list.length) return;
    const what = list.length === 1 ? `"${titleOf(list[0])}"` : `${list.length} SOP`;
    if (!(await ui.confirm(`Hapus permanen ${what}? Tindakan ini tidak bisa dibatalkan.`, { title: 'Hapus permanen', ok: 'Hapus permanen', danger: true }))) return;
    for (const e of list) await deleteEntry(e.id);
    picked = [];
    await refresh();
    onnotify(`${list.length} SOP dihapus permanen`);
  }

  // ---- Gabung PDF, cadangan ZIP, daftar induk ----
  async function makeBook(list) {
    if (!list.length) return;
    const raw = await ui.prompt(`${list.length} SOP digabung menjadi satu PDF, diawali halaman daftar isi yang bisa diklik. Judul halaman depan:`, tag ? `Kumpulan SOP ${tag}` : 'Kumpulan SOP', {
      title: 'Gabung jadi satu PDF',
      ok: 'Buat PDF',
      maxlength: 200
    });
    const title = raw?.trim().replace(/\s+/g, ' ');
    if (!title) return;
    onclose();
    onbook(list.map((e) => ({ json: e.json, title: titleOf(e) })), title);
  }
  /** Isi ZIP: tiap entri di bawah jalur foldernya, mulai dari folder `base` (null = Utama, jalur lengkap). */
  const zipFiles = (list, base = null) => {
    const skip = base ? pathOf(base).length - 1 : 0;
    return list.map((e) => ({ dirs: pathOf(folderOf(e)).slice(skip).map((f) => f.name), name: titleOf(e), json: e.json, mtime: e.updated }));
  };
  function downloadZip(files, name) {
    if (!files.length) return ui.alert('Tidak ada SOP untuk diunduh.', { title: 'Unduh ZIP' });
    try {
      downloadBlob(sopZip(files), `${safeName(name)}-${todayIso()}.zip`);
      onnotify(`${files.length} SOP diunduh dalam berkas ZIP`);
    } catch (err) {
      ui.alert('ZIP gagal dibuat: ' + err.message, { title: 'Unduh ZIP' });
    }
  }
  const folderZip = (f) => downloadZip(zipFiles(live.filter((e) => inFolder(e, subtree(f.id))), f.id), f.name);
  /** Cakupan tombol cadangan dan daftar induk: hasil pencarian, folder yang dibuka beserta isinya, atau seluruh pustaka. */
  const scope = $derived(searching ? shown : at ? live.filter((e) => inFolder(e, subtree(at))) : live);
  const scopeText = $derived(searching ? 'hasil yang tampil' : at ? `folder ${byId.get(at).name} beserta isinya` : 'seluruh Pustaka Lokal');
  function backup() {
    if (searching) downloadZip(zipFiles(shown), 'Hasil-pencarian-SOP');
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
    const label = searching ? 'Hasil pencarian atau saringan' : at ? `Folder ${pathText(at)}` : 'Seluruh Pustaka Lokal';
    const blob = registerXlsx({ title: 'Daftar Induk SOP', note: `${label} · ${list.length} SOP · diunduh ${stamp}`, columns, rows });
    downloadBlob(blob, `Daftar-Induk-SOP-${todayIso()}.xlsx`);
    onnotify(`Daftar induk ${list.length} SOP diunduh`);
  }

  // ---- Impor berkas .sop/.zip dari komputer (tombol atau seret-lepas) ----
  let importing = $state(false);
  let dropping = $state(false);
  let picker;
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
  async function importFiles(files) {
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
    const base = searching ? null : at;
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
      await refresh();
    }
    if (n) onnotify(`${n} SOP dimasukkan ke Pustaka Lokal`);
  }
  const hasFiles = (ev) => ev.dataTransfer?.types.includes('Files');
  function dragOver(ev) {
    if (!hasFiles(ev) || bin) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.dataTransfer.dropEffect = importing ? 'none' : 'copy';
    dropping = !importing;
  }
  function dragLeave(ev) {
    if (!ev.currentTarget.contains(ev.relatedTarget)) dropping = false;
  }
  function drop(ev) {
    if (!hasFiles(ev) || bin) return;
    ev.preventDefault();
    ev.stopPropagation();
    dropping = false;
    if (!importing) importFiles([...ev.dataTransfer.files]);
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

  const titleOf = (e) => e.title || 'SOP tanpa judul';

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
    tag = allTags.find((t) => t.toLowerCase() === name.toLowerCase()) ?? null;
  }
  async function removeTag(old) {
    const n = live.filter((e) => e.tags.includes(old)).length;
    if (!(await ui.confirm(`Hapus label "${old}" dari ${n} entri? Dokumennya tidak ikut terhapus.`, { ok: 'Hapus label', danger: true }))) return;
    await mapTag(old, () => null);
    tag = null;
  }

  /** Menyimpan dokumen aktif; dokumen yang baru masuk pustaka ditaruh di folder yang sedang dibuka. */
  async function saveCurrent() {
    const fresh = !live.some((e) => e.id === current);
    await onsave();
    if (fresh && at) await patchEntry(current, { folder: at });
    tag = null;
    tagEdit = null;
    query = '';
    bin = false;
    await refresh();
  }

  // ---- Riwayat versi: isi yang tertimpa setiap kali disimpan (KEEP_VERSIONS terbaru) ----
  const when = (ms) => new Date(ms).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  async function toggleHistory(e) {
    if (history?.id === e.id) return (history = null);
    history = { id: e.id, versions: await listVersions(e.id) };
  }
  function compareVersions(e, v = null) {
    const versions = history?.id === e.id ? history.versions : [];
    if (!versions.length) return;
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
  async function startCopy(ids, fids = []) {
    if (!copyList(ids, fids).length) return ui.alert('Tidak ada SOP untuk disalin.', { title: 'Salin ke Pustaka Daring' });
    await F.start();
    if (faculty.status !== 'in') return ui.alert('Masuk ke Pustaka Daring dulu untuk menyalin SOP ke sana.', { title: 'Salin ke Pustaka Daring' });
    let list;
    try {
      list = await F.listFolders();
    } catch (err) {
      return ui.alert(err.message, { title: 'Salin ke Pustaka Daring' });
    }
    cloud = { folders: list, parents: F.resolveParents(list) };
    const targets = list
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
    picked = [];
    onnotify(`${c.done} SOP disalin ke Pustaka Daring (${where})${made.length ? `, ${made.length} folder dibuat` : ''}`);
  }
</script>

  <header>
    {@render tabs()}
    <input class="search" type="search" bind:value={query} placeholder={bin ? 'Cari di Baru dihapus…' : 'Cari nama, nomor, label, atau isi SOP…'} />
    <button class="ib x" onclick={onclose} aria-label="Tutup" data-tip="Tutup"><Icon name="x" /></button>
  </header>
  <p class="hint">
    {#if bin}
      SOP yang dihapus disimpan di sini selama {BIN_DAYS} hari, lalu dihapus permanen.
    {:else}
      SOP di Pustaka Lokal tersimpan di browser ini. Tekan Ctrl+S untuk menyimpan perubahannya. Data hilang bila data situs
      browser dihapus, jadi sesekali unduh cadangannya (tombol unduh ZIP di bawah).
    {/if}
  </p>

  {#if !bin && (tagList.length || tag !== null || dueCount || due)}
    <div class="tagbar" role="group" aria-label="Saring menurut label">
      {#if dueCount || due}
        <button
          class="due"
          class:on={due}
          aria-pressed={due}
          onclick={() => (due = !due)}
          title={`Tanggal efektif atau revisi terakhir sudah lewat ${review.years} tahun`}>Perlu ditinjau <span>{dueCount}</span></button
        >
      {/if}
      <button class:on={tag === null && !due} aria-pressed={tag === null && !due} onclick={() => ((tag = null), (due = false))}>Semua</button>
      {#each tagList as [t, n] (t)}
        <button class:on={tag === t} aria-pressed={tag === t} onclick={() => (tag = tag === t ? null : t)}>{t} <span>{n}</span></button>
      {/each}
      {#if untagged}
        <button class:on={tag === ''} aria-pressed={tag === ''} onclick={() => (tag = tag === '' ? null : '')}>Tanpa label <span>{untagged}</span></button>
      {/if}
      {#if tag}
        <span class="grow"></span>
        <button class="link" onclick={() => renameTag(tag)}>Ubah nama label</button>
        <button class="link danger" onclick={() => removeTag(tag)}>Hapus label</button>
      {/if}
    </div>
  {/if}

  <nav class="crumbs" aria-label="Lokasi">
    {#if bin}
      <button class="crumb" onclick={() => showBin(false)}><Icon name="arrowLeft" size={14} />Kembali ke pustaka</button>
      <span class="sep">›</span><strong><Icon name="trash" size={14} /> Baru dihapus</strong>
    {:else if searching}
      <span class="muted">Hasil dari semua folder</span>
    {:else}
      <button class="crumb" class:drop={dropAt === null} onclick={() => go(null)} aria-current={at === null ? 'location' : undefined} {...dropzone(null)}>Utama</button>
      {#each pathOf(at) as f (f.id)}
        <span class="sep">›</span>
        <button class="crumb" class:drop={dropAt === f.id} onclick={() => go(f.id)} aria-current={f.id === at ? 'location' : undefined} {...dropzone(f.id)}>{f.name}</button>
      {/each}
    {/if}
  </nav>

  <div class="selbar" class:some={chosen.length > 0}>
    {#if shown.length}
      <label title={allChosen ? 'Batal pilih' : 'Pilih semua'}>
        <input type="checkbox" class="pick" checked={allChosen} indeterminate={chosen.length > 0 && !allChosen} onchange={pickAll} />
        {#if chosen.length}<strong>{chosen.length} dipilih</strong>{:else}Pilih semua{/if}
      </label>
    {/if}
    {#if chosen.length && bin}
      <button class="btn small" onclick={() => restore(chosen)}><Icon name="restore" size={14} />Pulihkan</button>
      <button class="btn small danger" onclick={() => purge(chosen)}><Icon name="trash" size={14} />Hapus permanen</button>
    {:else if chosen.length}
      <button class="btn small" onclick={() => makeBook(chosen)} title="Gabungkan SOP yang dipilih menjadi satu PDF berdaftar isi"><Icon name="book" size={14} />Gabung PDF</button>
      <button class="btn small" onclick={() => downloadZip(zipFiles(chosen), 'SOP-terpilih')} title="Unduh SOP yang dipilih sebagai berkas .sop dalam ZIP"><Icon name="download" size={14} />Unduh ZIP</button>
      <button class="btn small" onclick={() => startMove(chosen.map((e) => e.id))} title="Pindahkan ke folder lain"><Icon name="move" size={14} />Pindahkan</button>
      <button class="btn small" onclick={() => startCopy(chosen.map((e) => e.id))} title="Salin SOP yang dipilih ke Pustaka Daring"><Icon name="cloud" size={14} />Salin ke Daring</button>
      <button
        class="btn small danger"
        onclick={removePicked}
        disabled={!deletable.length}
        title={deletable.length < chosen.length ? 'SOP yang terbuka di tab tidak ikut dihapus' : 'Pindahkan ke Baru dihapus'}><Icon name="trash" size={14} />Hapus{deletable.length < chosen.length ? ` (${deletable.length})` : ''}</button
      >
    {/if}
    <span class="grow"></span>
    {#if bin}
      <button class="btn small danger" onclick={() => purge(binned)} disabled={!binned.length}>Kosongkan</button>
    {:else}
      <button class="ib" onclick={newFolder} disabled={searching} aria-label="Folder baru" data-tip={searching ? 'Hapus pencarian atau saringan dulu' : `Folder baru di ${pathText(at)}`}><Icon name="folderPlus" size={16} /></button>
      <button class="ib" onclick={() => ((picker.value = ''), picker.click())} disabled={importing} aria-label="Impor berkas .sop atau .zip" data-tip="Impor berkas .sop atau .zip (bisa juga dilepas di daftar)"><Icon name="upload" size={16} /></button>
      <button class="ib" onclick={exportRegister} disabled={!scope.length} aria-label="Unduh daftar induk SOP (XLSX)" data-tip={`Unduh daftar induk SOP (XLSX): ${scopeText}`}><Icon name="table" size={16} /></button>
      <button class="ib" onclick={backup} disabled={!scope.length} aria-label="Unduh cadangan (ZIP)" data-tip={`Unduh cadangan (ZIP): ${scopeText}`}><Icon name="download" size={16} /></button>
      <button class="ib bin" onclick={() => showBin(true)} aria-label="Baru dihapus" data-tip={`Baru dihapus (${binned.length})`}><Icon name="trash" size={16} />{#if binned.length}<span>{binned.length}</span>{/if}</button>
    {/if}
    <SortSelect />
  </div>
  <input
    bind:this={picker}
    type="file"
    hidden
    multiple
    accept=".sop,.json,.zip,application/json,application/zip"
    onchange={(ev) => ev.currentTarget.files.length && importFiles([...ev.currentTarget.files])}
  />

  <ul class="list" class:dropping ondragover={dragOver} ondragleave={dragLeave} ondrop={drop}>
    {#each shownFolders as f (f.id)}
      <li class="folder" class:drop={dropAt === f.id} draggable="true" ondragstart={(ev) => dragStart(ev, f, true)} {...dropzone(f.id)}>
        <span class="pick-gap"></span>
        <button class="main" onclick={() => go(f.id)}>
          <strong><Icon name="folder" size={17} /> {f.name}</strong>
          <small>{folderInfo(f)}</small>
        </button>
        <span class="acts">
          <button class="btn small" onclick={() => renameFolder(f)} title="Ubah nama folder" aria-label={`Ubah nama folder ${f.name}`}><Icon name="pencil" size={14} /></button>
          <button class="btn small" onclick={() => startMove([], [f.id])} title="Pindahkan folder" aria-label={`Pindahkan folder ${f.name}`}><Icon name="move" size={14} /></button>
          <button class="btn small" onclick={() => folderZip(f)} title="Unduh isinya sebagai ZIP" aria-label={`Unduh isi folder ${f.name} sebagai ZIP`}><Icon name="download" size={14} /></button>
          <button class="btn small" onclick={() => startCopy([], [f.id])} title="Salin folder ini beserta isinya ke Pustaka Daring" aria-label={`Salin folder ${f.name} ke Pustaka Daring`}><Icon name="cloud" size={14} /></button>
          <button class="btn small danger" onclick={() => removeFolder(f)} title="Hapus folder" aria-label={`Hapus folder ${f.name}`}><Icon name="trash" size={14} /></button>
        </span>
      </li>
    {/each}
    {#each shown as e (e.id)}
      {@const isOpen = openIds.includes(e.id)}
      <li class:current={e.id === current} draggable={!bin} ondragstart={(ev) => dragStart(ev, e, false)}>
        <input type="checkbox" class="pick" checked={picked.includes(e.id)} onchange={() => togglePick(e.id)} aria-label={`Pilih ${titleOf(e)}`} />
        {#if bin}
          <button class="main" onclick={() => (previewOf = e)} title="Pratinjau">
            <strong>{titleOf(e)}</strong>
            <small>{[e.nomor, `dari ${e.fromPath || 'Utama'}`, `dihapus ${ago(e.deleted)}`, `terhapus permanen dalam ${binDaysLeft(e)} hari`].filter(Boolean).join(' · ')}</small>
          </button>
          <span class="acts">
            <button class="btn small" onclick={() => (previewOf = e)} title="Pratinjau" aria-label={`Pratinjau ${titleOf(e)}`}><Icon name="eye" size={14} /></button>
            <button class="btn small" onclick={() => restore([e])} title="Pulihkan ke folder asalnya"><Icon name="restore" size={14} />Pulihkan</button>
            <button class="btn small danger" onclick={() => purge([e])} title="Hapus permanen">Hapus permanen</button>
          </span>
        {:else}
          <button class="main" onclick={() => pick(e)}>
            <strong>
              {titleOf(e)}
              {#if e.id === current}<em>sedang dibuka</em>{:else if isOpen}<em>terbuka di tab</em>{/if}
              {#if isDue(e)}<em class="due" title={`Berlaku sejak ${formatTanggal(e.since)}, lebih dari ${review.years} tahun`}>Perlu ditinjau</em>{/if}
            </strong>
            <small>
              {[searching && `di ${pathText(folderOf(e))}`, e.nomor, e.fileName, 'diubah ' + ago(e.updated)].filter(Boolean).join(' · ')}
            </small>
            {#if words.length}<MatchSnippet parts={e.parts} {words} />{/if}
            {#if e.tags.length}
              <span class="tags">{#each e.tags as t (t)}<i>{t}</i>{/each}</span>
            {/if}
          </button>
          <span class="acts">
            <button class="btn small" onclick={() => (previewOf = e)} title="Pratinjau tanpa membuka" aria-label={`Pratinjau ${titleOf(e)}`}><Icon name="eye" size={14} /></button>
            <button
              class="btn small"
              class:on={history?.id === e.id}
              aria-expanded={history?.id === e.id}
              onclick={() => toggleHistory(e)}
              title="Riwayat versi"
              aria-label={`Riwayat ${titleOf(e)}`}><Icon name="history" size={14} /></button
            >
            <button
              class="btn small"
              class:on={tagEdit === e.id}
              aria-expanded={tagEdit === e.id}
              onclick={() => ((tagEdit = tagEdit === e.id ? null : e.id), (newTag = ''))}
              title="Atur label untuk mengelompokkan">Label</button
            >
            <button class="btn small" onclick={() => duplicate(e)} title="Buat salinan di pustaka"><Icon name="copy" size={14} />Duplikat</button>
            <button class="btn small" onclick={() => startMove([e.id])} title="Pindahkan ke folder lain" aria-label={`Pindahkan ${titleOf(e)}`}><Icon name="move" size={14} /></button>
            <button class="btn small" onclick={() => downloadSop(e)} title="Unduh sebagai berkas .sop" aria-label={`Unduh ${titleOf(e)} sebagai berkas .sop`}><Icon name="download" size={14} /></button>
            <button
              class="btn small danger"
              onclick={() => trash([e])}
              disabled={isOpen}
              title={isOpen ? 'Tutup tabnya dulu untuk menghapus' : 'Pindahkan ke Baru dihapus'}
            >Hapus</button>
          </span>
        {/if}
        {#if history?.id === e.id && !bin}
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
                  <button class="btn small" onclick={() => (previewOf = { ...e, json: v.json, versionAt: v.at })} title="Pratinjau versi ini" aria-label={`Pratinjau versi ${when(v.at)}`}><Icon name="eye" size={14} /></button>
                  <button class="btn small" onclick={() => compareVersions(e, v)} title="Bandingkan dengan isi tersimpan" aria-label={`Bandingkan versi ${when(v.at)}`}><Icon name="compare" size={14} /></button>
                  <button
                    class="btn small"
                    onclick={() => restoreVersion(e, v)}
                    title={openIds.includes(e.id) ? 'Muat versi ini ke tab yang terbuka (simpan untuk menerapkannya)' : 'Kembalikan versi ini'}
                    aria-label={`Kembalikan versi ${when(v.at)}`}><Icon name="restore" size={14} /></button
                  >
                  <button class="btn small danger" onclick={() => dropVersions(e, [v])} title="Hapus versi ini dari riwayat" aria-label={`Hapus versi ${when(v.at)}`}><Icon name="trash" size={14} /></button>
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
    {#if !shown.length && !shownFolders.length}
      <li class="empty">
        {#if bin}
          {query.trim() ? 'Tidak ada yang cocok.' : 'Tidak ada SOP yang baru dihapus.'}
        {:else if searching}
          Tidak ada yang cocok.
        {:else if at}
          Folder ini kosong. Pindahkan SOP ke sini, atau lepaskan berkas .sop/.zip di sini untuk mengimpornya.
        {:else}
          Belum ada dokumen. SOP yang disimpan ke Pustaka Lokal akan muncul di sini, atau lepaskan berkas .sop/.zip di sini untuk mengimpornya.
        {/if}
      </li>
    {/if}
  </ul>

  <footer>
    <button class="btn" onclick={saveCurrent} disabled={!cansave}><Icon name="save" size={15} />Simpan dokumen ini ke pustaka</button>
  </footer>

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
            <option value={t.id}>{'   '.repeat(t.depth + 1)}{t.name}</option>
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
    margin-bottom: 0.5rem;
  }
  .search {
    flex: 1;
    min-width: 0;
    margin: 0 0.5rem;
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
  .ib:hover {
    background: var(--surface-2);
    color: var(--text);
  }
  .ib.bin {
    width: auto;
    min-width: 1.85rem;
    gap: 0.2rem;
    padding: 0 0.3rem;
  }
  .ib.bin span {
    font-size: 0.72rem;
  }
  .hint {
    margin: 0 0 0.6rem;
  }
  .crumbs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.15rem;
    font-size: 0.85rem;
    margin-bottom: 0.3rem;
    min-height: 1.6rem;
  }
  .crumbs strong {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }
  .crumb {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    border: 1px solid transparent;
    border-radius: 6px;
    background: none;
    color: var(--accent);
    padding: 0.1rem 0.35rem;
    font: inherit;
    cursor: pointer;
  }
  .crumb[aria-current] {
    color: var(--text);
    font-weight: 600;
  }
  .crumb:hover {
    background: var(--surface-2);
  }
  .crumb.drop {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .sep,
  .muted {
    color: var(--muted);
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow: auto;
    flex: 1;
    min-height: 8rem;
    border: 1px solid var(--line);
    border-radius: 10px;
  }
  .list li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding: 0.45rem 0.6rem;
    border-bottom: 1px solid var(--line);
  }
  .list li:last-child {
    border-bottom: 0;
  }
  .list li.current {
    background: var(--surface-2);
  }
  .list li.drop {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
    background: var(--accent-soft);
  }
  .pick-gap {
    flex: none;
    width: 13px;
  }
  .folder strong {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .folder strong :global(svg) {
    color: var(--accent);
    flex: none;
  }
  .main {
    flex: 1;
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
  }
  .main strong,
  .main small {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .main:hover strong {
    color: var(--accent);
  }
  .main small {
    color: var(--muted);
    font-size: 0.78rem;
  }
  em {
    font-style: normal;
    font-size: 0.72rem;
    font-weight: 500;
    color: var(--accent);
    background: var(--accent-soft);
    border-radius: 99px;
    padding: 0.05rem 0.45rem;
    margin-left: 0.3rem;
  }
  .selbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.4rem;
    font-size: 0.82rem;
    color: var(--muted);
    min-height: 1.9rem;
    margin-bottom: 0.35rem;
    padding: 0.2rem 0.3rem 0.2rem 0;
    border-radius: 8px;
  }
  .selbar.some {
    background: var(--accent-soft);
  }
  .selbar label {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding-left: 0.6rem;
    margin-right: 0.3rem;
    cursor: pointer;
  }
  .selbar strong {
    color: var(--accent);
  }
  .ib:disabled {
    opacity: 0.4;
    cursor: default;
    background: none;
  }
  .list.dropping {
    outline: 2px dashed var(--accent);
    outline-offset: -2px;
    background: var(--accent-soft);
  }
  em.due {
    color: #92400e;
    background: var(--warn-bg, #fef3c7);
  }
  .tagbar button.due {
    border-color: var(--warn-line, #f59e0b);
    color: #92400e;
  }
  .tagbar button.due.on {
    background: var(--warn-bg, #fef3c7);
  }
  .pick {
    flex: none;
    margin: 0;
  }
  .acts {
    display: flex;
    gap: 0.3rem;
    flex: none;
  }
  .acts .on {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .tagbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem;
    margin-bottom: 0.6rem;
  }
  .tagbar button {
    border: 1px solid var(--line);
    border-radius: 99px;
    background: none;
    color: var(--muted);
    padding: 0.15rem 0.6rem;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
  }
  .tagbar button span {
    font-size: 0.72rem;
    opacity: 0.75;
  }
  .tagbar button.on {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
  }
  .tagbar button.link {
    border: 0;
    padding: 0.15rem 0.3rem;
    text-decoration: underline;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-top: 0.15rem;
  }
  .tags i {
    font-style: normal;
    font-size: 0.7rem;
    font-weight: 500;
    color: var(--muted);
    border: 1px solid var(--line);
    border-radius: 99px;
    padding: 0 0.45rem;
  }
  .tag-edit {
    flex-basis: 100%;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
    padding: 0.4rem 0.5rem;
    border-radius: 8px;
    background: var(--surface-2);
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
  .danger {
    color: var(--danger);
  }
  .btn:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .empty {
    justify-content: center;
    color: var(--muted);
    padding: 1.5rem !important;
    font-size: 0.9rem;
  }
  footer {
    display: flex;
    gap: 0.4rem;
    margin-top: 0.8rem;
  }
  .grow {
    flex: 1;
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
    justify-content: flex-end;
  }
  .move-dialog progress {
    width: 100%;
    margin-top: 0.8rem;
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
    gap: 0.25rem;
  }
  .history .hhead .hacts {
    gap: 0.9rem;
  }
  .history .link {
    border: 0;
    background: none;
    padding: 0;
    color: var(--danger);
    font: inherit;
    cursor: pointer;
  }
  .history .link.cmp {
    color: var(--accent);
  }
  .history .link:hover {
    text-decoration: underline;
  }
</style>
