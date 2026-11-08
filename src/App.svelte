<script>
  import { onMount, tick, untrack } from 'svelte';
  import { useRegisterSW } from 'virtual:pwa-register/svelte';
  import { app, persist, tabs, stash, newTabId, saveSession, loadSession } from './lib/store.svelte.js';
  import { emptyDocument, parseDocumentText } from './lib/model.js';
  import { layoutDocument } from './lib/layout.js';
  import { exportPdf, sopFromPdf } from './lib/pdf.js';
  import { fontSource, useSystemCalibri, useCalibriFiles } from './lib/fonts.js';
  import { saveJson, openJsonFile, slug, sopName, downloadBlob } from './lib/files.js';
  import Preview from './lib/Preview.svelte';
  import AiDialog from './lib/AiDialog.svelte';
  import FormatBar from './lib/FormatBar.svelte';
  import PdfPreviewDialog from './lib/PdfPreviewDialog.svelte';
  import FindPanel from './lib/FindPanel.svelte';
  import CheckPanel from './lib/CheckPanel.svelte';
  import { estimateDuration } from './lib/duration.js';
  import { checkDocument } from './lib/validate.js';
  import { connectHistory } from './lib/history.js';
  import LibraryDialog from './lib/LibraryDialog.svelte';
  import { saveDoc, isBlank, getEntry } from './lib/library.js';
  import FacultyDialog from './lib/FacultyDialog.svelte';
  import FacultyConflict from './lib/FacultyConflict.svelte';
  import CloseConfirm from './lib/CloseConfirm.svelte';
  import * as Faculty from './lib/faculty.svelte.js';
  import { faculty } from './lib/faculty.svelte.js';

  let toast = $state('');
  let toastTimer;

  const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW();

  // Preferensi tampilan (per browser).
  const setPref = (key, value) => {
    try {
      localStorage.setItem('sop-editor:' + key, value);
    } catch {}
  };
  const getPref = (key) => {
    try {
      return localStorage.getItem('sop-editor:' + key);
    } catch {
      return null;
    }
  };

  // Zoom pratinjau; Ctrl+roda mouse mengubah zoom pratinjau (bukan zoom browser), berpusat di posisi kursor.
  const ZOOM_MIN = 50;
  const ZOOM_MAX = 200;
  const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z)));
  let zoom = $state(clampZoom(Number(getPref('zoom')) || 100));
  $effect(() => setPref('zoom', zoom));
  let previewScroll;
  async function zoomAt(next, clientX, clientY) {
    next = clampZoom(next);
    if (next === zoom) return;
    const el = previewScroll;
    const r = el.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top;
    const ratio = next / zoom;
    const left = (el.scrollLeft + x) * ratio - x;
    const top = (el.scrollTop + y) * ratio - y;
    zoom = next;
    await tick();
    el.scrollLeft = left;
    el.scrollTop = top;
  }
  function onCtrlWheel(e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    if (!previewScroll || !e.deltaY) return;
    // Roda mouse: ±10% per takik; trackpad (pinch) mengirim delta kecil sehingga zoom berubah halus.
    const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    const step = Math.abs(delta) >= 50 ? Math.sign(delta) * 10 : delta / 5;
    const inside = previewScroll.contains(e.target);
    const r = previewScroll.getBoundingClientRect();
    zoomAt(zoom - step, inside ? e.clientX : r.left + r.width / 2, inside ? e.clientY : r.top + r.height / 2);
  }
  const zoomStep = (dir) => {
    const r = previewScroll.getBoundingClientRect();
    zoomAt(dir > 0 ? Math.floor(zoom / 10) * 10 + 10 : Math.ceil(zoom / 10) * 10 - 10, r.left + r.width / 2, r.top + r.height / 2);
  };

  // Menu ekspor (PDF / DOCX).
  let exportOpen = $state(false);

  let theme = $state(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    setPref('theme', theme);
  }

  let fullscreen = $state(false);
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => alert('Browser ini tidak mengizinkan layar penuh.'));
  }

  let findOpen = $state(false);
  let checkOpen = $state(false);
  $effect(() => {
    if (findOpen) checkOpen = false;
  });
  $effect(() => {
    if (checkOpen) findOpen = false;
    if (empty) checkOpen = false;
  });
  const issues = $derived(empty ? [] : checkDocument(app.doc));
  const issueErrors = $derived(issues.filter((i) => i.level === 'error').length);
  const issueWarns = $derived(issues.filter((i) => i.level === 'warn').length);
  const duration = $derived(estimateDuration(app.doc));

  /** Tampilkan isian `ref` (data-field) di halaman; isian simbol dibuka menunya. */
  async function jumpTo(ref) {
    await tick();
    const el = document.querySelector(`[data-field="${ref}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el?.focus({ preventScroll: true });
    if (ref.startsWith('sy:') && el?.getAttribute('aria-expanded') !== 'true') el?.click();
  }

  // Font dokumen wajib Calibri; Carlito hanya pengganti sementara bila Calibri belum diambil dari perangkat.
  let docFont = $state(fontSource());
  let fontFiles;
  const canQueryFonts = 'queryLocalFonts' in window;
  async function setCalibri(load) {
    try {
      await load();
      docFont = fontSource();
      notify('Dokumen sekarang memakai Calibri.');
    } catch (e) {
      alert('Gagal memakai Calibri: ' + e.message);
    }
  }

  // Pratinjau: tata letak dihitung ulang setiap dokumen (atau font) berubah.
  const pages = $derived((docFont, layoutDocument(app.doc)));

  // Riwayat undo/redo + simpan otomatis ke localStorage.
  let past = [];
  let future = [];
  let current = JSON.stringify(app.doc);
  let canUndo = $state(false);
  let canRedo = $state(false);
  let timer;

  $effect(() => {
    const json = JSON.stringify(app.doc);
    if (json === current) return;
    clearTimeout(timer);
    timer = setTimeout(() => commit(json), 350);
  });

  function commit(json) {
    clearTimeout(timer);
    past.push(current);
    if (past.length > 100) past.shift();
    future = [];
    current = json;
    persist(json);
    syncFlags();
    syncEditing();
  }

  /** Simpan perubahan yang belum masuk riwayat sebagai langkah tersendiri. */
  function checkpoint() {
    const json = JSON.stringify(app.doc);
    if (json !== current) commit(json);
  }
  connectHistory({ checkpoint, undo: () => undo(), redo: () => redo() });

  // Isi tab aktif saat terakhir disimpan (null: belum pernah, mis. hasil AI). Tab lain menyimpannya di stash,
  // dan tanda belum tersimpannya ada di t.dirty karena stash tidak reaktif.
  let clean = $state(current);
  const activeDirty = $derived(!empty && JSON.stringify(app.doc) !== clean);
  const isDirty = (t) => (t.id === tabs.active ? activeDirty : t.dirty);

  /** Tab `id` tersimpan dengan isi `json`. */
  function markClean(id, json) {
    if (id === tabs.active) clean = json;
    else if (stash.has(id)) {
      const s = stash.get(id);
      s.clean = json;
      const tab = tabs.list.find((t) => t.id === id);
      if (tab) tab.dirty = s.json !== json;
    }
  }

  /** Dipanggil sebelum menyimpan; fungsi hasilnya menandai isi saat ini tersimpan setelah penyimpanan berhasil. */
  function saveMark() {
    const id = tabs.active;
    const json = JSON.stringify(app.doc);
    return () => markClean(id, json);
  }

  /**
   * Seperti saveMark, untuk berkas dan ekspor: tab dari pustaka tetap belum tersimpan,
   * karena isi di pustakanya belum berubah.
   */
  function fileMark() {
    const { id, remote } = activeTab;
    const mark = saveMark();
    return async () => {
      if (!remote && !(await getEntry(id).catch(() => null))) mark();
    };
  }

  function hasUnsaved() {
    if (!empty && JSON.stringify(app.doc) !== clean) return true;
    return tabs.list.some((t) => {
      const s = t.id !== tabs.active && stash.get(t.id);
      return s && s.json !== s.clean;
    });
  }

  function onBeforeUnload(e) {
    if (!hasUnsaved()) return;
    checkpoint(); // ketikan terakhir ikut tersimpan bila pengguna tetap memuat ulang
    e.preventDefault();
    e.returnValue = '';
  }

  /** Halaman benar-benar ditinggalkan: catat semua tab agar kembali bila ini muat ulang. */
  function onPageHide() {
    const json = JSON.stringify(app.doc);
    if (json !== current) commit(json);
    saveSession({
      active: tabs.active,
      empty,
      tabs: tabs.list.map((t) => {
        if (t.id === tabs.active) return { id: t.id, fileName: app.fileName, remote: t.remote, json: current, dirty: current !== clean };
        const s = stash.get(t.id);
        return { id: t.id, fileName: t.fileName, remote: t.remote, json: s.json, dirty: s.json !== s.clean };
      })
    });
  }

  /** Mengembalikan tab setelah muat ulang. Riwayat undo dan handle berkas tidak ikut (tidak tersimpan). */
  function resumeSession(s) {
    stash.clear();
    for (const t of s.tabs) {
      if (t.id !== s.active) stash.set(t.id, { json: t.json, handle: null, past: [], future: [], clean: t.dirty ? null : t.json });
    }
    tabs.list.splice(0, tabs.list.length, ...s.tabs.map((t) => ({ id: t.id, title: t.doc.header.namaSop, fileName: t.fileName, remote: t.remote ?? null, dirty: t.dirty })));
    tabs.active = s.active;
    const a = s.tabs.find((t) => t.id === s.active);
    app.fileName = a.fileName;
    app.fileHandle = null;
    past = [];
    future = [];
    restore(a.json);
    clean = a.dirty ? null : a.json;
    setEmpty(s.empty);
  }

  function syncFlags() {
    canUndo = past.length > 0;
    canRedo = future.length > 0;
  }

  function restore(json) {
    clearTimeout(timer);
    current = json;
    app.doc = JSON.parse(json);
    persist(json);
    syncFlags();
  }

  function undo() {
    checkpoint(); // ketikan yang belum tercatat dibatalkan lebih dulu, bukan hilang
    if (!past.length) return;
    future.push(current);
    restore(past.pop());
  }

  function redo() {
    checkpoint();
    if (!future.length) return;
    past.push(current);
    restore(future.pop());
  }

  function replaceDocument(doc, name = null, handle = null) {
    const json = JSON.stringify(doc);
    clearTimeout(timer);
    past.push(current);
    future = [];
    app.fileName = name;
    app.fileHandle = handle;
    restore(json);
  }

  // Tidak ada SOP terbuka (tab terakhir ditutup); diingat agar tetap kosong setelah muat ulang.
  let empty = $state((() => {
    try {
      return localStorage.getItem('sop-empty') === '1';
    } catch {
      return false;
    }
  })());
  function setEmpty(v) {
    empty = v;
    try {
      if (v) localStorage.setItem('sop-empty', '1');
      else localStorage.removeItem('sop-empty');
    } catch {}
  }

  // Tab: beberapa SOP terbuka sekaligus. Tab aktif ada di app.doc; tab lain (beserta riwayat undo-nya) di stash.
  const activeTab = $derived(tabs.list.find((t) => t.id === tabs.active));
  const tabTitle = (t) => (t.id === tabs.active ? app.doc.header.namaSop : t.title) || 'SOP tanpa judul';

  function stashActive() {
    clearTimeout(timer);
    const json = JSON.stringify(app.doc);
    if (json !== current) {
      past.push(current);
      future = [];
      current = json;
    }
    stash.set(tabs.active, { json, handle: app.fileHandle, past, future, clean });
    Object.assign(activeTab, { title: app.doc.header.namaSop, fileName: app.fileName, dirty: json !== clean });
  }

  /** Tab aktif mendapat id (= entri pustaka) baru, mis. saat isinya diganti dokumen lain. */
  function rekey(id = newTabId()) {
    if (activeTab.remote) Faculty.setEditing(activeTab.remote.id, false);
    activeTab.remote = null; // isi tab berganti: tidak lagi tertaut ke SOP di Pustaka Daring
    activeTab.id = id;
    tabs.active = id;
  }

  function activate(id) {
    const s = stash.get(id);
    tabs.active = id;
    past = s.past;
    future = s.future;
    clean = s.clean;
    app.fileHandle = s.handle;
    app.fileName = activeTab.fileName;
    restore(s.json);
  }

  function switchTab(id) {
    if (id === tabs.active) return;
    stashActive();
    activate(id);
  }

  // Tab aktif yang masih kosong (dokumen baru tanpa isi) dipakai ulang, bukan ditambah tab baru.
  const pristine = () =>
    !app.fileName &&
    !past.length &&
    !app.doc.header.namaSop &&
    app.doc.steps.length <= 2 &&
    Object.values(app.doc.sections).every((s) => !s.items.length);

  /**
   * Membuka dokumen di tab baru.
   * `id`: entri pustaka yang dibuka; tanpa id, dokumen menjadi entri baru.
   */
  function openInTab(doc, name = null, handle = null, id = newTabId()) {
    setEmpty(false);
    if (pristine()) {
      rekey(id);
      replaceDocument(doc, name, handle);
      clean = current;
      return;
    }
    addTab(doc, name, handle, id);
  }

  function addTab(doc, name = null, handle = null, id = newTabId()) {
    if (empty) return openInTab(doc, name, handle, id);
    stashActive();
    tabs.list.splice(tabs.list.indexOf(activeTab) + 1, 0, { id, title: doc.header.namaSop, fileName: name });
    const json = JSON.stringify(doc);
    stash.set(id, { json, handle, past: [], future: [], clean: json });
    activate(id);
  }

  // Pertanyaan saat menutup tab yang belum tersimpan.
  let closeAsk = $state(null);
  let closeChosen;
  const askClose = (title, where, isNew = false) =>
    new Promise((resolve) => {
      closeChosen = resolve;
      closeAsk = { title, where, isNew };
    });
  function chooseClose(choice) {
    closeAsk = null;
    closeChosen?.(choice);
  }

  async function closeTab(id) {
    const tab = tabs.list.find((t) => t.id === id);
    if (id === tabs.active) checkpoint();
    const json = id === tabs.active ? current : stash.get(id).json;
    const dirty = json !== (id === tabs.active ? clean : stash.get(id).clean);
    if (tab.remote) {
      // Salinan SOP dari Pustaka Daring: tempat simpannya di sana, bukan di pustaka browser ini.
      if (dirty) {
        const choice = await askClose(tabTitle(tab), 'Pustaka Daring');
        if (choice === 'cancel') return;
        if (choice === 'save') {
          switchTab(id);
          if (!(await saveToFaculty())) return;
        }
      }
      Faculty.setEditing(tab.remote.id, false);
    } else {
      // Sudah di Pustaka Lokal: ditanya bila ada perubahan. Belum: ditawari masuk pustaka bila ada isinya.
      const inLib = await getEntry(id).catch(() => null);
      const ask = inLib ? dirty : !isBlank(JSON.parse(json));
      const choice = ask ? await askClose(tabTitle(tab), 'Pustaka Lokal', !inLib) : inLib ? 'save' : 'discard';
      if (choice === 'cancel') return;
      if (choice === 'save') {
        try {
          await saveDoc(id, json, tab.fileName);
        } catch (e) {
          // Tab tetap terbuka agar isinya tidak hilang.
          return alert('Gagal menyimpan ke Pustaka Lokal: ' + e.message);
        }
        notify(`"${tabTitle(tab)}" ditutup — buka lagi dari Pustaka Lokal`);
      }
    }
    if (!tabs.list.includes(tab)) return;
    if (tabs.list.length === 1) {
      // Tab terakhir ditutup: tampilan dikosongkan sampai pengguna membuat atau membuka SOP.
      rekey();
      replaceDocument(emptyDocument());
      past = [];
      future = [];
      setEmpty(true);
      return syncFlags();
    }
    const i = tabs.list.indexOf(tab);
    if (id === tabs.active) {
      tabs.list.splice(i, 1);
      stash.delete(id);
      activate(tabs.list[Math.min(i, tabs.list.length - 1)].id);
    } else {
      tabs.list.splice(i, 1);
      stash.delete(id);
      persist(current);
    }
  }

  // Urutan tab bisa diubah dengan diseret; posisi berpindah langsung saat melewati tengah tab lain.
  let draggedTab = $state(null);
  function moveTab(id, overId, e) {
    if (id === overId) return;
    const from = tabs.list.findIndex((t) => t.id === id);
    const over = tabs.list.findIndex((t) => t.id === overId);
    const r = e.currentTarget.getBoundingClientRect();
    const after = e.clientX > r.left + r.width / 2;
    // Tunggu sampai kursor melewati tengah tab tujuan agar tidak bolak-balik.
    if ((from < over && !after) || (from > over && after)) return;
    const [tab] = tabs.list.splice(from, 1);
    tabs.list.splice(over, 0, tab);
  }
  function endTabDrag() {
    draggedTab = null;
    persist(current);
  }

  function notify(msg) {
    toast = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = ''), 3000);
  }

  // Pustaka dokumen.
  let libraryOpen = $state(false);
  const openIds = $derived(tabs.list.map((t) => t.id));

  function openEntry(entry) {
    if (tabs.list.some((t) => t.id === entry.id)) return switchTab(entry.id);
    try {
      openInTab(parseDocumentText(entry.json), entry.fileName, null, entry.id);
    } catch {
      alert('Entri pustaka ini rusak dan tidak bisa dibuka.');
    }
  }

  function newDoc() {
    openInTab(emptyDocument());
  }

  /** Membuka berkas .sop/.json, atau PDF hasil ekspor app ini (data SOP tersimpan sebagai lampiran). */
  async function loadFile(file, handle) {
    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
      const text = sopFromPdf(new Uint8Array(await file.arrayBuffer()));
      if (!text) return alert('PDF ini tidak berisi data SOP (bukan hasil ekspor SOP Editor).'), false;
      return loadText(text, sopName(file.name.replace(/\.pdf$/i, '')), null);
    }
    return loadText(await file.text(), file.name, handle);
  }

  function loadText(text, name, handle) {
    try {
      openInTab(parseDocumentText(text), name, handle);
      notify(`Dibuka: ${name}`);
      return true;
    } catch (e) {
      alert(e instanceof SyntaxError ? 'Berkas bukan dokumen SOP yang valid.' : e.message);
      return false;
    }
  }

  // Jawaban AI yang ditempel: dokumen baru tanpa berkas.
  let aiOpen = $state(false);
  // `revise`: jawaban menggantikan dokumen aktif (bisa di-Undo); jalur manual dipulihkan.
  function loadPasted(text, revise = false) {
    try {
      const doc = parseDocumentText(text);
      if (revise) {
        const old = $state.snapshot(app.doc);
        const routes = new Map(old.steps.filter((s) => s.route).map((s) => [s.id, s.route]));
        for (const s of doc.steps) if (routes.has(s.id)) s.route = routes.get(s.id);
        replaceDocument(doc, app.fileName, app.fileHandle);
        notify('Revisi dari AI diterapkan — periksa kembali isinya (Ctrl+Z untuk membatalkan)');
        return true;
      }
      openInTab(doc);
      clean = null; // hasil AI belum ada salinannya di mana pun
      notify('Dokumen dari AI dibuka — periksa kembali isinya sebelum diekspor');
      return true;
    } catch (e) {
      alert(
        e instanceof SyntaxError
          ? 'Jawaban AI bukan JSON yang valid (mungkin terpotong). Minta AI mengulang dan menampilkan JSON secara lengkap.'
          : e.message
      );
      return false;
    }
  }

  async function open() {
    try {
      const f = await openJsonFile();
      if (f) await loadFile(f.file, f.handle);
    } catch (e) {
      alert('Gagal membuka berkas: ' + e.message);
    }
  }

  async function save(saveAs = false) {
    const name = sopName(app.fileName || `SOP-${slug(app.doc.header.namaSop)}`);
    const saved = fileMark();
    try {
      const handle = await saveJson(JSON.stringify(app.doc, null, 2), name, app.fileHandle, saveAs);
      if (handle === undefined) return;
      await saved();
      if (handle) {
        app.fileHandle = handle;
        app.fileName = handle.name;
        persist(current);
      }
      notify('Tersimpan sebagai berkas ' + (handle?.name ?? name));
    } catch (e) {
      alert('Gagal menyimpan: ' + e.message);
    }
  }

  // Menu Pustaka ada di toolbar dan di layar kosong, yang tampil bersamaan: dicatat menu mana yang terbuka.
  let libraryMenu = $state(null); // null | 'toolbar' | 'empty'
  function toggleLibraryMenu(where) {
    exportOpen = saveOpen = false;
    libraryMenu = libraryMenu === where ? null : where;
  }

  // Menu Simpan: ke Pustaka (browser ini) atau ke berkas .sop.
  let saveOpen = $state(false);
  let inLibrary = $state(false);
  async function toggleSaveMenu() {
    exportOpen = false;
    libraryMenu = null;
    if (saveOpen) return (saveOpen = false);
    inLibrary = !!(await getEntry(tabs.active).catch(() => null));
    saveOpen = true;
  }

  async function saveToLibrary() {
    checkpoint();
    const { id, remote } = activeTab;
    const saved = saveMark();
    try {
      await saveDoc(id, JSON.stringify(app.doc), app.fileName);
      if (!(await getEntry(id))) return notify('Dokumen masih kosong, belum ada yang disimpan');
      if (!remote) saved(); // SOP daring: perubahannya tetap belum masuk ke Pustaka Daring
      notify('Tersimpan di Pustaka Lokal');
    } catch (e) {
      alert('Gagal menyimpan ke Pustaka Lokal: ' + e.message);
    }
  }

  // Ctrl+S menyimpan ke tempat asal SOP: Pustaka Daring, Pustaka Lokal, atau berkas.
  let quickSaving = false;
  async function quickSave() {
    if (quickSaving || document.querySelector('dialog:modal')) return;
    quickSaving = true;
    try {
      if (activeTab.remote) await saveToFaculty();
      else if (await getEntry(tabs.active).catch(() => null)) await saveToLibrary();
      else await save(false);
    } finally {
      quickSaving = false;
    }
  }

  // Pustaka Daring. Tab yang tertaut menyimpan tab.remote: lihat Faculty.remoteOf.
  let facultyOpen = $state(false);
  let conflict = $state(null);
  let conflictChosen;
  const openRemoteIds = $derived(tabs.list.filter((t) => t.remote).map((t) => t.remote.id));
  const activeEditors = $derived(activeTab?.remote ? (faculty.editing[activeTab.remote.id] ?? []).map((m) => m.name).join(', ') : '');

  $effect(() => {
    app.nameLocked = !!activeTab?.remote && !activeTab.remote.canRename;
  });
  $effect(() => {
    if (faculty.status === 'in' && (facultyOpen || openRemoteIds.length)) return Faculty.watchEditing();
  });
  $effect(() => {
    if (faculty.status === 'in') untrack(syncEditing);
  });

  /** Tanda "sedang diedit" mengikuti tab yang punya perubahan belum tersimpan (SOP bersama yang boleh diedit saja). */
  function syncEditing() {
    for (const t of tabs.list) {
      if (!t.remote) continue;
      const dirty = t.id === tabs.active ? current !== clean : stash.get(t.id)?.json !== stash.get(t.id)?.clean;
      Faculty.setEditing(t.remote.id, t.remote.shared && t.remote.canEdit && dirty);
    }
  }

  function openFacultySop(sop) {
    const opened = tabs.list.find((t) => t.remote?.id === sop.id);
    if (opened) return switchTab(opened.id);
    try {
      openInTab(parseDocumentText(sop.json));
    } catch {
      return alert('SOP ini rusak dan tidak bisa dibuka.');
    }
    activeTab.remote = Faculty.remoteOf(sop);
  }

  /** Daftar pustaka baru dimuat: tab yang terbuka mengikuti hak akses terbaru. */
  function onFacultyLoaded(live) {
    for (const t of tabs.list) {
      const sop = t.remote && live.find((s) => s.id === t.remote.id);
      if (sop) Object.assign(t.remote, { ...Faculty.remoteOf(sop), rev: t.remote.rev, title: t.remote.title });
    }
    syncEditing();
  }

  /** SOP diganti namanya dari dialog: tab yang membukanya ikut, perubahan lain di tab itu tetap belum tersimpan. */
  function onFacultyRenamed(id, { from, rev, title }) {
    const t = tabs.list.find((x) => x.remote?.id === id);
    if (!t) return;
    t.remote.title = title;
    // Tab yang tertinggal dari revisi `from` tetap harus melihat konflik saat menyimpan.
    if (t.remote.rev === from) t.remote.rev = rev;
    const renamed = (json) => {
      if (json == null) return json;
      const d = JSON.parse(json);
      d.header.namaSop = title;
      return JSON.stringify(d);
    };
    if (t.id === tabs.active) {
      checkpoint();
      app.doc.header.namaSop = title;
      checkpoint();
      clean = renamed(clean);
    } else {
      const s = stash.get(t.id);
      s.past.push(s.json);
      s.future = [];
      s.json = renamed(s.json);
      s.clean = renamed(s.clean);
      t.title = title;
    }
  }

  /** SOP dipindahkan ke Recycle bin dari dialog. Hasil: true bila tabnya dipertahankan karena belum tersimpan. */
  function onFacultyBinned(id) {
    const t = tabs.list.find((x) => x.remote?.id === id);
    if (!t) return false;
    if (t.id === tabs.active) checkpoint();
    const dirty = t.id === tabs.active ? current !== clean : stash.get(t.id).json !== stash.get(t.id).clean;
    if (!dirty) {
      closeTab(t.id);
      return false;
    }
    Faculty.setEditing(id, false);
    t.remote = null;
    return true;
  }

  /** Tab tertaut ke `remote`, dan isi yang baru tersimpan tidak lagi dianggap perubahan. */
  function linkTab(tab, doc, remote) {
    const json = JSON.stringify(doc);
    tab.remote = remote;
    if (tab.id === tabs.active) {
      const untouched = JSON.stringify(app.doc) === json;
      clean = json;
      // Nama di pustaka yang menang, mis. pembuatnya mengganti nama selagi tab ini terbuka.
      if (untouched && doc.header.namaSop !== remote.title) {
        app.doc.header.namaSop = remote.title;
        commit(JSON.stringify(app.doc));
        clean = current;
      }
    } else markClean(tab.id, json);
    syncEditing();
  }

  /** Mengunggah tab aktif ke `folder`, atau menyimpan perubahannya bila sudah tertaut. Hasil: berhasil atau tidak. */
  async function saveToFaculty(folder = null) {
    await Faculty.start();
    if (faculty.status !== 'in') {
      facultyOpen = true;
      return false;
    }
    checkpoint();
    const tab = activeTab;
    const doc = $state.snapshot(app.doc);
    try {
      if (!tab.remote) {
        if (isBlank(doc)) return notify('Dokumen masih kosong, belum ada yang diunggah'), false;
        linkTab(tab, doc, await Faculty.uploadSop(doc, undefined, folder));
        notify('Diunggah ke Pustaka Daring.');
        return true;
      }
      const { id, rev } = tab.remote;
      let r;
      try {
        if (!tab.remote.canEdit) throw new Faculty.FacultyError('denied', 'Anda hanya punya hak lihat pada SOP ini.');
        r = await Faculty.saveSop(id, doc, rev);
      } catch (e) {
        if (!['conflict', 'gone', 'denied'].includes(e.code)) throw e;
        const canOverwrite = e.code === 'conflict';
        const choice = await new Promise((resolve) => {
          conflictChosen = resolve;
          conflict = { canOverwrite, by: e.by, at: e.at, message: e.message };
        });
        if (choice === 'cancel') return false;
        if (choice === 'overwrite') r = await Faculty.saveSop(id, doc, rev, { overwrite: true });
        else {
          const title = `Salinan dari ${doc.header.namaSop || 'SOP tanpa judul'}`.slice(0, 300);
          const copy = await Faculty.uploadSop(doc, title, tab.remote.folder);
          Faculty.setEditing(id, false);
          linkTab(tab, doc, copy);
          notify('Disimpan sebagai salinan milik Anda.');
          return true;
        }
      }
      linkTab(tab, doc, { ...$state.snapshot(tab.remote), rev: r.rev, title: r.title });
      notify(r.unchanged ? 'Tidak ada perubahan untuk disimpan.' : 'Tersimpan di Pustaka Daring.');
      return true;
    } catch (e) {
      alert(e.message);
      return false;
    }
  }

  function chooseConflict(choice) {
    conflict = null;
    conflictChosen?.(choice);
  }

  // Ekspor PDF selalu lewat pratinjau dulu; unduhan dilakukan dari dialog.
  let pdfDoc = $state(null);
  let pdfSaved;
  function pdf() {
    try {
      pdfSaved = fileMark();
      pdfDoc = exportPdf(app.doc);
    } catch (e) {
      alert('Gagal membuat PDF: ' + e.message);
    }
  }

  // Ekspor DOCX/XLSX dimuat terpisah agar tidak memperbesar muatan awal.
  let exportBusy = $state('');
  async function exportFile(kind) {
    exportBusy = kind.toUpperCase();
    const saved = fileMark();
    try {
      const blob =
        kind === 'docx' ? await (await import('./lib/docx.js')).exportDocx(app.doc)
        : kind === 'xlsx' ? await (await import('./lib/xlsx.js')).exportXlsx(app.doc)
        : await (await import('./lib/png.js')).exportPngZip(app.doc, `SOP-${slug(app.doc.header.namaSop)}`);
      downloadBlob(blob, `SOP-${slug(app.doc.header.namaSop)}.${kind === 'png' ? 'zip' : kind}`);
      saved();
    } catch (e) {
      alert(`Gagal membuat ${kind.toUpperCase()}: ` + e.message);
    } finally {
      exportBusy = '';
    }
  }

  function onKey(e) {
    // Tutup tab dokumen: Alt+W. Ctrl+W dicadangkan browser dan hanya sampai ke sini di aplikasi terpasang.
    // altKey !== ctrlKey menyingkirkan AltGr (Ctrl+Alt) yang dipakai mengetik di sebagian papan ketik.
    if (e.code === 'KeyW' && !e.shiftKey && !e.metaKey && e.altKey !== e.ctrlKey) {
      if (empty) return;
      e.preventDefault();
      if (!e.repeat && !document.querySelector('dialog[open]')) closeTab(tabs.active);
      return;
    }
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (empty && (k === 's' || k === 'p' || k === 'f' || k === 'h')) return e.preventDefault();
    if (k === 's') {
      e.preventDefault();
      if (e.shiftKey) save(true);
      else if (!e.repeat) quickSave();
    } else if (k === 'o') {
      e.preventDefault();
      open();
    } else if (k === 'p' && e.shiftKey) {
      e.preventDefault();
      pdf();
    } else if (k === 'f' || k === 'h') {
      e.preventDefault();
      findOpen = true;
    } else if ((k === 'z' || k === 'y') && !e.target.closest?.('input, textarea, [contenteditable]')) {
      e.preventDefault();
      if (k === 'y' || e.shiftKey) redo();
      else undo();
    }
  }

  // Buka JSON lewat seret-lepas atau "Buka dengan" (PWA file handler).
  let dragging = $state(false);
  async function onDrop(e) {
    e.preventDefault();
    dragging = false;
    for (const file of e.dataTransfer?.files ?? []) await loadFile(file, null);
  }

  /** Perubahan yang belum disimpan pada entri pustaka menjadi entri tersendiri, agar versi tersimpannya tidak tertimpa. */
  async function keepOldTab(id, json, name) {
    const old = await getEntry(id);
    if (!old || JSON.stringify(parseDocumentText(old.json)) === json) return saveDoc(id, json, name);
    const doc = JSON.parse(json);
    doc.header.namaSop = `${doc.header.namaSop || 'SOP tanpa judul'} (perubahan belum disimpan)`;
    await saveDoc(newTabId(), JSON.stringify(doc), name);
  }

  // Aplikasi hanya bisa dipakai setelah masuk dengan akun Google (lihat .signin-gate).
  const signedIn = $derived(!!faculty.user);
  $effect(() => {
    if (!signedIn) untrack(() => (facultyOpen = libraryOpen = false));
  });

  onMount(() => {
    Faculty.start();
    const session = loadSession();
    if (session) {
      resumeSession(session);
    } else {
      // Aplikasi dibuka kosong: tab dari sesi sebelumnya disimpan ke Pustaka (bisa dibuka lagi dari sana).
      for (const t of tabs.list) {
        const [json, name] = t.id === tabs.active ? [current, app.fileName] : [stash.get(t.id)?.json, t.fileName];
        if (json) keepOldTab(t.id, json, name).catch(() => {});
      }
      const blank = JSON.stringify(emptyDocument());
      const id = newTabId();
      stash.clear();
      tabs.list.splice(0, tabs.list.length, { id, title: '', fileName: null });
      tabs.active = id;
      app.fileName = null;
      app.fileHandle = null;
      past = [];
      future = [];
      restore(blank);
      clean = blank;
      setEmpty(true);
    }
    const onFs = () => (fullscreen = !!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    window.addEventListener('wheel', onCtrlWheel, { passive: false });
    if ('launchQueue' in window) {
      window.launchQueue.setConsumer(async (params) => {
        for (const handle of params.files ?? []) {
          await loadFile(await handle.getFile(), handle);
        }
      });
    }
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      window.removeEventListener('wheel', onCtrlWheel);
    };
  });
</script>

<svelte:window
  onbeforeunload={onBeforeUnload}
  onpagehide={onPageHide}
  onkeydown={(e) => {
    if (!signedIn) return;
    if (e.key === 'Escape') {
      exportOpen = saveOpen = false;
      libraryMenu = null;
    }
    onKey(e);
  }}
  onpointerdown={(e) => {
    if (e.target.closest?.('.export')) return;
    exportOpen = false;
    saveOpen = false;
    libraryMenu = null;
  }}
/>

{#snippet libraryButton(where, cls)}
  <div class="export">
    <button class={cls} onclick={() => toggleLibraryMenu(where)} aria-haspopup="menu" aria-expanded={libraryMenu === where} title="Buka SOP dari Pustaka Lokal atau Pustaka Daring">
      Pustaka
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    {#if libraryMenu === where}
      <div class="export-menu left" role="menu">
        <button role="menuitem" onclick={() => ((libraryMenu = null), (libraryOpen = true))}>
          <strong>Lokal</strong><small>SOP yang disimpan di browser ini</small>
        </button>
        <button role="menuitem" onclick={() => ((libraryMenu = null), (facultyOpen = true))}>
          <strong>Daring</strong><small>SOP bersama secara daring, untuk anggota fakultas</small>
        </button>
      </div>
    {/if}
  </div>
{/snippet}

<div
  class="app"
  class:dragging
  inert={!signedIn}
  role="application"
  ondragover={(e) => {
    if (e.dataTransfer?.types.includes('Files')) {
      e.preventDefault();
      dragging = true;
    }
  }}
  ondragleave={(e) => {
    if (!e.relatedTarget) dragging = false;
  }}
  ondrop={onDrop}
>
  <header class="topbar">
    <div class="brand">
      <img src="./favicon.svg" alt="" width="26" height="26" />
      <div>
        <strong>SOP Editor</strong>
        <small>{app.fileName ?? 'Belum disimpan ke berkas'}</small>
      </div>
    </div>
    <nav class="toolbar">
      <button class="btn ghost" onclick={newDoc} title="Dokumen baru">Baru</button>
      <button class="btn ghost" onclick={open} title="Buka berkas .sop (Ctrl+O)">Buka</button>
      {@render libraryButton('toolbar', 'btn ghost')}
      <div class="export">
        <button class="btn ghost" onclick={toggleSaveMenu} disabled={empty} aria-haspopup="menu" aria-expanded={saveOpen} title="Simpan ke Pustaka Lokal, Pustaka Daring, atau sebagai berkas .sop">
          Simpan
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </button>
        {#if saveOpen}
          <div class="export-menu left" role="menu">
            <button role="menuitem" onclick={() => ((saveOpen = false), saveToLibrary())}>
              <strong>Ke Pustaka Lokal{inLibrary ? ' ✓' : ''}</strong>
              <small>{inLibrary ? `Simpan perubahan ke SOP ini${activeTab?.remote ? '' : ' · Ctrl+S'}` : 'Disimpan di browser ini, buka lagi dari Pustaka Lokal'}</small>
            </button>
            <button role="menuitem" onclick={() => ((saveOpen = false), saveToFaculty())}>
              <strong>Ke Pustaka Daring{activeTab?.remote ? ' ✓' : ''}</strong>
              <small>{activeTab?.remote ? 'Simpan perubahan ke SOP daring ini · Ctrl+S' : 'Unggah sebagai SOP daring baru (private)'}</small>
            </button>
            <button role="menuitem" onclick={() => ((saveOpen = false), save(false))}>
              <strong>Sebagai berkas .sop</strong><small>{app.fileHandle ? `Timpa ${app.fileName}` : 'Pilih lokasi di perangkat'}{activeTab?.remote || inLibrary ? '' : ' · Ctrl+S'}</small>
            </button>
            <button role="menuitem" onclick={() => ((saveOpen = false), save(true))}>
              <strong>Simpan berkas sebagai…</strong><small>Berkas .sop baru · Ctrl+Shift+S</small>
            </button>
          </div>
        {/if}
      </div>
      <button class="btn ghost" onclick={() => (aiOpen = true)} title="Susun SOP baru, impor SOP lama (PDF/Word), atau revisi SOP ini dengan bantuan asisten AI">🪄 Asisten AI</button>
      <span class="sep"></span>
      <button class="icon" onclick={undo} disabled={!canUndo} title="Urungkan (Ctrl+Z)">↶</button>
      <button class="icon" onclick={redo} disabled={!canRedo} title="Ulangi (Ctrl+Y)">↷</button>
      <button class="icon" class:on={findOpen} onclick={() => (findOpen = !findOpen)} title="Cari & ganti (Ctrl+F)" aria-label="Cari dan ganti">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
      </button>
      <button class="icon" onclick={toggleFullscreen} title={fullscreen ? 'Keluar dari layar penuh' : 'Layar penuh'} aria-label="Layar penuh">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          {#if fullscreen}<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />{:else}<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />{/if}
        </svg>
      </button>
      <button class="icon" onclick={toggleTheme} title={theme === 'dark' ? 'Mode terang' : 'Mode gelap'} aria-label="Ganti tema">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          {#if theme === 'dark'}<circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />{:else}<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" />{/if}
        </svg>
      </button>
      <span class="sep"></span>
      <button
        class="btn ghost check-btn"
        class:on={checkOpen}
        disabled={empty}
        onclick={() => (checkOpen = !checkOpen)}
        title={issueErrors + issueWarns ? `${issueErrors} salah, ${issueWarns} peringatan pada alur dan isian` : 'Alur dan isian penting sudah lengkap'}
      >
        Periksa
        {#if issueErrors + issueWarns}
          <span class="badge" class:err={issueErrors}>{issueErrors + issueWarns}</span>
        {:else}
          <span class="badge ok">✓</span>
        {/if}
      </button>
      <div class="export">
        <button class="btn primary" onclick={() => ((saveOpen = false), (libraryMenu = null), (exportOpen = !exportOpen))} aria-haspopup="menu" aria-expanded={exportOpen} disabled={!!exportBusy || empty}>
          {exportBusy ? `Membuat ${exportBusy}…` : 'Ekspor'}
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </button>
        {#if exportOpen}
          <div class="export-menu" role="menu">
            <button role="menuitem" onclick={() => ((exportOpen = false), pdf())}>
              <strong>PDF</strong><small>Pratinjau lalu unduh · Ctrl+Shift+P</small>
            </button>
            <button role="menuitem" onclick={() => ((exportOpen = false), exportFile('docx'))}>
              <strong>Word (.docx)</strong><small>Teks dan simbol diagram bisa diedit</small>
            </button>
            <button role="menuitem" onclick={() => ((exportOpen = false), exportFile('xlsx'))}>
              <strong>Excel (.xlsx)</strong><small>Sesuai template SOP, simbol bisa diedit</small>
            </button>
            <button role="menuitem" onclick={() => ((exportOpen = false), exportFile('png'))}>
              <strong>Gambar PNG (.zip)</strong><small>Satu gambar per halaman, 200 dpi</small>
            </button>
          </div>
        {/if}
      </div>
    </nav>
  </header>

  <div class="tabbar">
    <div
      class="tabs"
      role="tablist"
      aria-label="Dokumen terbuka"
      onwheel={(e) => {
        // Roda vertikal menggeser deretan tab ke samping.
        if (!e.deltaY || e.ctrlKey || e.metaKey || e.currentTarget.scrollWidth <= e.currentTarget.clientWidth) return;
        e.preventDefault();
        e.currentTarget.scrollLeft += e.deltaY;
      }}
    >
      {#each empty ? [] : tabs.list as t (t.id)}
        <div
          class="doc-tab"
          class:active={t.id === tabs.active}
          class:dragged={t.id === draggedTab}
          title={(t.id === tabs.active ? app.fileName : t.fileName) ?? 'Belum disimpan ke berkas'}
          role="presentation"
          draggable="true"
          ondragstart={(e) => {
            draggedTab = t.id;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', tabTitle(t));
          }}
          ondragover={(e) => {
            if (!draggedTab) return;
            e.preventDefault();
            moveTab(draggedTab, t.id, e);
          }}
          ondrop={(e) => {
            if (!draggedTab) return;
            e.preventDefault();
            e.stopPropagation();
          }}
          ondragend={endTabDrag}
          onmousedown={(e) => e.button === 1 && e.preventDefault()}
          onauxclick={(e) => {
            if (e.button === 1) {
              e.preventDefault();
              closeTab(t.id);
            }
          }}
        >
          <button role="tab" aria-selected={t.id === tabs.active} onclick={() => switchTab(t.id)}>
            {#if isDirty(t)}<span class="unsaved" role="img" aria-label="Belum disimpan" title="Ada perubahan yang belum disimpan. Tekan Ctrl+S untuk menyimpan."></span>{/if}
            {tabTitle(t)}
          </button>
          <button class="close" onclick={() => closeTab(t.id)} title="Tutup tab (Alt+W)" aria-label="Tutup {tabTitle(t)}">×</button>
        </div>
      {/each}
      <button class="add" onclick={() => addTab(emptyDocument())} title="Tab baru" aria-label="Tab baru">+</button>
    </div>
    <FormatBar />
    {#if duration.text || duration.unread.length}
      <span class="tab-sep"></span>
      <button
        class="dur"
        onclick={() => (checkOpen = true)}
        title={`Estimasi total waktu jalur utama (${duration.counted} dari ${duration.steps} langkah berisi waktu)` +
          (duration.unread.length ? `; ${duration.unread.length} isian waktu tidak terbaca` : '') + '. Klik untuk rinciannya.'}
      >
        <span class="lbl">Total waktu</span>
        <strong>{duration.text || '—'}</strong>
        {#if duration.unread.length}<span class="warn">!</span>{/if}
      </button>
    {/if}
    <span class="tab-sep"></span>
    <div class="zoom" title="Zoom pratinjau">
      <span class="zoom-label">Zoom</span>
      <button class="zoom-step" onclick={() => zoomStep(-1)} disabled={zoom <= ZOOM_MIN} title="Perkecil (Ctrl+roda mouse)" aria-label="Perkecil">−</button>
      <input type="range" min={ZOOM_MIN} max={ZOOM_MAX} step="1" bind:value={zoom} aria-label="Zoom pratinjau" />
      <button class="zoom-step" onclick={() => zoomStep(1)} disabled={zoom >= ZOOM_MAX} title="Perbesar (Ctrl+roda mouse)" aria-label="Perbesar">+</button>
      <span class="zoom-val">{zoom}%</span>
    </div>
  </div>

  <main class="workspace">
    <section class="preview">
      {#if activeTab?.remote && !activeTab.remote.canEdit}
        <div class="waiting" role="status">
          <span><strong>Anda hanya punya hak lihat pada SOP ini.</strong> Perubahan hanya bisa disimpan sebagai salinan milik Anda.</span>
        </div>
      {/if}
      {#if activeEditors && !empty}
        <div class="waiting" role="status">
          <span><strong>Sedang diedit juga oleh {activeEditors}.</strong> Yang menyimpan belakangan akan mendapat pilihan untuk menimpa atau membuat salinan.</span>
        </div>
      {/if}
      {#if docFont !== 'calibri'}
        <div class="font-warn">
          <span>
            <strong>Dokumen SOP wajib memakai Calibri.</strong> Calibri belum tersedia di browser ini, jadi sementara dipakai
            Carlito (ukuran identik).
            {#if canQueryFonts}Ambil Calibri yang terpasang di perangkat,{/if} atau pilih file <code>calibri.ttf</code> dan
            <code>calibrib.ttf</code> (di Windows: <code>C:\Windows\Fonts</code>). Cukup sekali; font disimpan di browser ini.
          </span>
          <span class="actions">
            {#if canQueryFonts}<button class="btn small primary" onclick={() => setCalibri(useSystemCalibri)}>Pakai Calibri perangkat</button>{/if}
            <button class="btn small" onclick={() => fontFiles.click()}>Pilih file Calibri…</button>
          </span>
          <input
            bind:this={fontFiles}
            type="file"
            accept=".ttf,.otf,font/ttf,font/otf"
            multiple
            hidden
            onchange={(e) => {
              const files = [...e.currentTarget.files];
              e.currentTarget.value = '';
              if (files.length) setCalibri(() => useCalibriFiles(files));
            }}
          />
        </div>
      {/if}
      {#if empty}
        <div class="no-doc">
          <strong>Tidak ada SOP yang terbuka</strong>
          <span>Buat SOP baru, buka berkas, atau pilih dari Pustaka Lokal atau Daring.</span>
          <span class="actions">
            <button class="btn primary" onclick={newDoc}>Baru</button>
            <button class="btn" onclick={open}>Buka</button>
            {@render libraryButton('empty', 'btn')}
          </span>
        </div>
      {:else}
        <div class="preview-scroll" bind:this={previewScroll}>
          <Preview {pages} {zoom} />
        </div>
      {/if}
    </section>
  </main>

  {#if $needRefresh}
    <div class="banner">
      Versi baru tersedia.
      <button class="btn small primary" onclick={() => updateServiceWorker(true)}>Muat ulang</button>
      <button class="btn small ghost" onclick={() => needRefresh.set(false)}>Nanti</button>
    </div>
  {:else if $offlineReady}
    <div class="banner">
      Aplikasi siap dipakai secara offline.
      <button class="btn small ghost" onclick={() => offlineReady.set(false)}>Tutup</button>
    </div>
  {/if}

  <AiDialog bind:open={aiOpen} docKey={tabs.active} onpaste={loadPasted} />
  <PdfPreviewDialog
    bind:pdf={pdfDoc}
    ondownload={() => pdfSaved?.()}
    {pages}
    filename={`SOP-${slug(app.doc.header.namaSop)}.pdf`}
    fontNote={docFont === 'calibri' ? '' : 'Calibri belum tersedia, PDF memakai Carlito (ukuran identik)'}
  />
  <FindPanel
    bind:open={findOpen}
    onnotify={notify}
    onjump={(f) => jumpTo(f.ref)}
  />
  <CheckPanel bind:open={checkOpen} {issues} {duration} steps={app.doc.steps} onjump={jumpTo} />
  <LibraryDialog
    bind:open={libraryOpen}
    {openIds}
    active={tabs.active}
    onopen={openEntry}
    onsave={saveToLibrary}
    cansave={!empty}
    onnotify={notify}
  />
  <FacultyDialog
    bind:open={facultyOpen}
    openIds={openRemoteIds}
    cansave={!empty && !activeTab?.remote}
    onopen={openFacultySop}
    onupload={async (folder) => {
      if (await saveToFaculty(folder)) facultyOpen = false;
    }}
    onloaded={onFacultyLoaded}
    onrenamed={onFacultyRenamed}
    onbinned={onFacultyBinned}
    onnotify={notify}
  />
  <FacultyConflict info={conflict} onchoice={chooseConflict} />
  <CloseConfirm info={closeAsk} onchoice={chooseClose} />

  {#if toast}<div class="toast" role="status">{toast}</div>{/if}
  {#if dragging}<div class="dropzone">Lepaskan berkas .sop untuk membuka</div>{/if}
</div>

{#if !signedIn}
  <div class="signin-gate">
    <img src="./favicon.svg" alt="" width="56" height="56" />
    <strong>SOP Editor</strong>
    {#if faculty.status === 'out'}
      <p>Masuk dengan akun Google Anda untuk memakai aplikasi ini.</p>
      <button class="btn primary" onclick={() => Faculty.signIn().catch((e) => alert(e.message))}>Masuk dengan Google</button>
    {:else if faculty.status === 'error'}
      <p class="error">{faculty.error}</p>
      <button class="btn" onclick={() => Faculty.start()}>Coba lagi</button>
    {:else}
      <p>Memuat…</p>
    {/if}
  </div>
{/if}

<!-- Ditampilkan (lewat CSS) menggantikan aplikasi di layar HP. -->
<div class="mobile-block">
  <img src="./favicon.svg" alt="" width="56" height="56" />
  <strong>SOP Editor hanya bisa dibuka di laptop/PC</strong>
  <p>Aplikasi ini dirancang untuk layar lebar dengan mouse dan keyboard. Silakan buka alamat ini dari laptop atau PC.</p>
</div>
