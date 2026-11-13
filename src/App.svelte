<script>
  import { onMount, tick, untrack } from 'svelte';
  import { useRegisterSW } from 'virtual:pwa-register/svelte';
  import { app, persist, tabs, stash, newTabId, saveSession, loadSession } from './lib/store.svelte.js';
  import { emptyDocument, parseDocumentText, normalizeDocument, setMeta } from './lib/model.js';
  import { layoutDocument, pagesOf, PDF_PARTS } from './lib/layout.js';
  import { exportPdf, exportPdfBook, sopFromPdf, PDF_PROTECT } from './lib/pdf.js';
  import { fontSource, useSystemCalibri, useCalibriFiles } from './lib/fonts.js';
  import { saveJson, openJsonFile, slug, sopName, downloadBlob } from './lib/files.js';
  import Preview from './lib/Preview.svelte';
  import FormatBar from './lib/FormatBar.svelte';
  import PdfPreviewDialog from './lib/PdfPreviewDialog.svelte';
  import FindPanel from './lib/FindPanel.svelte';
  import CheckPanel from './lib/CheckPanel.svelte';
  import CommentPanel from './lib/CommentPanel.svelte';
  import Icon from './lib/Icon.svelte';
  import { notes, currentRef, copyLink, unseenMentions } from './lib/comments.svelte.js';
  import ContextMenu from './lib/ContextMenu.svelte';
  import { estimateDuration } from './lib/duration.js';
  import { checkDocument } from './lib/validate.js';
  import { review } from './lib/review.svelte.js';
  import { connectHistory } from './lib/history.js';
  import { saveDoc, isBlank, getEntry } from './lib/library.js';
  import FacultyConflict from './lib/FacultyConflict.svelte';
  import CloseConfirm from './lib/CloseConfirm.svelte';
  import AskDialog from './lib/AskDialog.svelte';
  import * as ui from './lib/ask.svelte.js';
  import * as Faculty from './lib/faculty.svelte.js';
  import { faculty } from './lib/faculty.svelte.js';
  import { applyDefaults } from './lib/appDefaults.svelte.js';
  import LinkSopDialog from './lib/LinkSopDialog.svelte';
  import DocMetaDialog from './lib/DocMetaDialog.svelte';
  import { connectLinks } from './lib/sopLinks.js';

  let toast = $state(null); // { msg, action, n }
  let toastTimer;

  // Versi baru dicari bukan hanya saat halaman dimuat: juga tiap 10 menit dan setiap kali tab/jendela aplikasi kembali
  // dibuka, sehingga tombol "Muat ulang" muncul tanpa perlu memuat ulang halaman lebih dulu.
  const UPDATE_EVERY = 10 * 60 * 1000;
  const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW({
    onRegisteredSW(swUrl, reg) {
      if (!reg) return;
      let last = 0;
      const check = async () => {
        if (reg.installing || !navigator.onLine || Date.now() - last < 60000) return;
        last = Date.now();
        try {
          // Hanya bila server terjangkau; reg.update() sendiri melempar galat bila luring.
          const res = await fetch(swUrl, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } });
          if (res.ok) await reg.update();
        } catch {}
      };
      setInterval(check, UPDATE_EVERY);
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
      window.addEventListener('online', check);
    }
  });

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
    else document.documentElement.requestFullscreen?.().catch(() => ui.alert('Browser ini tidak mengizinkan layar penuh.'));
  }

  let findOpen = $state(false);
  let checkOpen = $state(false);
  let notesOpen = $state(false);
  // Cari, Periksa, dan Komentar memakai tempat yang sama: hanya satu yang terbuka.
  $effect(() => {
    if (findOpen) untrack(() => (checkOpen = notesOpen = false));
  });
  $effect(() => {
    if (checkOpen) untrack(() => (findOpen = notesOpen = false));
    if (empty) checkOpen = false;
  });
  $effect(() => {
    if (notesOpen) untrack(() => (findOpen = checkOpen = false));
    if (empty) notesOpen = false;
  });
  const issues = $derived(empty ? [] : checkDocument(app.doc, { reviewYears: review.years }));
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
      ui.alert('Gagal memakai Calibri: ' + e.message);
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
    // Kunci edit dilepas agar orang lain tidak menunggu kedaluwarsa; dipasang lagi bila halaman ini kembali.
    Faculty.releaseEditing();
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
          return ui.alert('Gagal menyimpan ke Pustaka Lokal: ' + e.message);
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

  // ---- Menu klik kanan tab ----
  let tabMenu = $state(null); // { x, y, items }
  const tabJson = (id) => (id === tabs.active ? JSON.stringify(app.doc) : stash.get(id).json);

  /** Menutup beberapa tab satu per satu; berhenti bila pengguna membatalkan salah satunya. */
  async function closeTabs(ids) {
    for (const id of ids) {
      const tab = tabs.list.find((t) => t.id === id);
      if (!tab) continue;
      await closeTab(id);
      if (tabs.list.includes(tab) && !empty) return;
    }
  }

  function duplicateTab(id) {
    const doc = parseDocumentText(tabJson(id));
    switchTab(id);
    addTab(doc);
    notify('Tab diduplikat sebagai SOP baru');
  }

  function openTabMenu(e, t) {
    e.preventDefault();
    const i = tabs.list.indexOf(t);
    const ids = tabs.list.map((x) => x.id);
    const others = ids.filter((id) => id !== t.id);
    const right = ids.slice(i + 1);
    const inActive = (run) => () => {
      switchTab(t.id);
      run();
    };
    tabMenu = {
      x: e.clientX,
      y: e.clientY,
      items: [
        { head: tabTitle(t) },
        { label: 'Simpan', icon: 'save', hint: 'Ctrl+S', run: inActive(quickSave) },
        { label: 'Simpan sebagai berkas…', icon: 'download', hint: 'Ctrl+Shift+S', run: inActive(() => save(true)) },
        { label: 'Duplikat tab', icon: 'copy', run: () => duplicateTab(t.id) },
        ...(t.remote ? [{ label: 'Salin tautan SOP daring', icon: 'link', run: async () => notify(await copyLink(t.remote.id)) }] : []),
        { label: 'Tab baru', icon: 'filePlus', run: () => addTab(emptyDocument()) },
        { sep: true },
        { label: 'Tutup', icon: 'x', hint: 'Alt+W', run: () => closeTab(t.id) },
        { label: 'Tutup tab lain', disabled: !others.length, run: () => closeTabs(others) },
        { label: 'Tutup tab di sebelah kanan', disabled: !right.length, run: () => closeTabs(right) },
        { label: 'Tutup semua tab', run: () => closeTabs([...others, t.id]) }
      ]
    };
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

  /** Pesan singkat di bawah layar. `action` ({ label, run }) memberi tombol, mis. Urungkan; pesannya bertahan lebih lama. */
  function notify(msg, action = null) {
    toast = msg ? { msg, action, n: (toast?.n ?? 0) + 1 } : null;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = null), action ? 8000 : 3000);
  }
  function toastAct() {
    const run = toast?.action?.run;
    notify('');
    run?.();
  }
  /** Saat dialog modal terbuka, isi di luarnya tidak bisa diklik: pesan ditempel di dialog teratas, kembali ke <body> bila dialog itu ditutup. */
  function overTop(node) {
    const host = [...document.querySelectorAll('dialog[open]')].filter((d) => d.matches(':modal')).at(-1);
    if (!host) return;
    const back = () => document.body.appendChild(node);
    host.appendChild(node);
    host.addEventListener('close', back);
    return { destroy: () => (host.removeEventListener('close', back), node.remove()) };
  }

  // Dialog Pustaka, bertab Lokal dan Daring. Tab terakhir diingat di browser ini.
  let libraryOpen = $state(false);
  let adminOpen = $state(false);
  const isAdmin = $derived(faculty.status === 'in' && faculty.role === 'admin');
  let libraryTab = $state(
    (() => {
      try {
        return localStorage.getItem('sop-editor.libraryTab') === 'faculty' ? 'faculty' : 'local';
      } catch {
        return 'local';
      }
    })()
  );
  /** Membuka dialog Pustaka di tab `t` (bawaan: tab terakhir). */
  function openLibrary(t = libraryTab) {
    exportOpen = saveOpen = false;
    libraryTab = t;
    libraryOpen = true;
  }
  const openIds = $derived(tabs.list.map((t) => t.id));

  function openEntry(entry) {
    if (tabs.list.some((t) => t.id === entry.id)) return switchTab(entry.id);
    try {
      openInTab(parseDocumentText(entry.json), entry.fileName, null, entry.id);
    } catch {
      ui.alert('Entri pustaka ini rusak dan tidak bisa dibuka.');
    }
  }

  function newDoc() {
    openInTab(emptyDocument());
  }

  /** Membuka berkas .sop/.json, atau PDF hasil ekspor app ini (data SOP tersimpan sebagai lampiran). */
  async function loadFile(file, handle) {
    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
      const text = sopFromPdf(new Uint8Array(await file.arrayBuffer()));
      if (!text) return ui.alert('PDF ini tidak berisi data SOP (bukan hasil ekspor SOP Editor).'), false;
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
      ui.alert(e instanceof SyntaxError ? 'Berkas bukan dokumen SOP yang valid.' : e.message);
      return false;
    }
  }

  // Jawaban AI yang ditempel: dokumen baru tanpa berkas.
  let aiOpen = $state(false);

  // Dialog besar (Pustaka, Admin, AI) baru dimuat saat pertama kali dibuka agar aplikasi lebih cepat tampil.
  // Setelah dimuat dialog tetap terpasang, jadi isiannya (folder, filter, dsb.) tidak hilang saat ditutup.
  let LibraryDialog = $state(null);
  let AdminDialog = $state(null);
  let AiDialog = $state(null);
  function loadDialog(load, set, close) {
    load().then((m) => set(m.default)).catch(() => {
      close();
      notify('Bagian aplikasi ini gagal dimuat. Periksa koneksi internet, lalu coba lagi.');
    });
  }
  $effect(() => {
    if (libraryOpen && !LibraryDialog) loadDialog(() => import('./lib/LibraryDialog.svelte'), (c) => (LibraryDialog = c), () => (libraryOpen = false));
  });
  $effect(() => {
    if (adminOpen && !AdminDialog) loadDialog(() => import('./lib/AdminDialog.svelte'), (c) => (AdminDialog = c), () => (adminOpen = false));
  });
  $effect(() => {
    if (aiOpen && !AiDialog) loadDialog(() => import('./lib/AiDialog.svelte'), (c) => (AiDialog = c), () => (aiOpen = false));
  });
  // `revise`: jawaban menggantikan dokumen aktif (bisa di-Undo); jalur manual dipulihkan.
  function loadPasted(text, revise = false) {
    try {
      const doc = parseDocumentText(text);
      if (revise) {
        const old = $state.snapshot(app.doc);
        const routes = new Map(old.steps.filter((s) => s.route).map((s) => [s.id, s.route]));
        for (const s of doc.steps) if (routes.has(s.id)) s.route = routes.get(s.id);
        // Tautan Keterkaitan tidak dikenal AI: dipertahankan untuk butir yang teksnya tetap.
        if (!doc.links && old.links) {
          const kept = normalizeDocument({ ...doc, links: old.links }).links;
          if (kept) doc.links = kept;
        }
        if (!doc.meta && old.meta) doc.meta = old.meta;
        replaceDocument(doc, app.fileName, app.fileHandle);
        notify('Revisi dari AI diterapkan — periksa kembali isinya (Ctrl+Z untuk membatalkan)');
        return true;
      }
      openInTab(doc);
      clean = null; // hasil AI belum ada salinannya di mana pun
      notify('Dokumen dari AI dibuka — periksa kembali isinya sebelum diekspor');
      return true;
    } catch (e) {
      ui.alert(
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
      ui.alert('Gagal membuka berkas: ' + e.message);
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
      ui.alert('Gagal menyimpan: ' + e.message);
    }
  }

  // Menu Simpan: ke Pustaka (browser ini) atau ke berkas .sop.
  let saveOpen = $state(false);
  let inLibrary = $state(false);
  async function toggleSaveMenu() {
    exportOpen = false;
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
      ui.alert('Gagal menyimpan ke Pustaka Lokal: ' + e.message);
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
  const facultyOpen = $derived(libraryOpen && libraryTab === 'faculty');
  let conflict = $state(null);
  let conflictChosen;
  const openRemoteIds = $derived(tabs.list.filter((t) => t.remote).map((t) => t.remote.id));
  // Komentar SOP daring di tab aktif, diikuti langsung selama tabnya aktif.
  const noteSop = $derived(faculty.status === 'in' && activeTab?.remote ? activeTab.remote.id : null);
  $effect(() => {
    const id = noteSop;
    untrack(() => Object.assign(notes, { sopId: id, list: [], error: '', focus: null, status: id ? 'loading' : 'idle' }));
    if (!id) return;
    return Faculty.watchComments(
      id,
      (list) => Object.assign(notes, { list, status: 'ready', error: '' }),
      (error) => Object.assign(notes, { status: 'error', error })
    );
  });
  /** Isian yang dipilih pengguna (klik atau Tab) menjadi tujuan komentar baru; fokus otomatis tidak dihitung. */
  function pickField(el) {
    const f = el?.closest?.('[data-field]')?.dataset.field;
    if (f && !f.startsWith('ln:')) notes.focus = f;
  }
  const openNotes = $derived(noteSop ? notes.list.filter((c) => !c.parent && !c.resolved).length : 0);
  // Isian yang punya komentar terbuka diberi penanda di halaman.
  $effect(() => {
    notes.marked = new Set(notes.list.filter((c) => !c.parent && !c.resolved).map((c) => currentRef(app.doc, c)).filter(Boolean));
  });
  $effect(() => {
    app.nameLocked = !!activeTab?.remote && !activeTab.remote.canRename;
  });
  $effect(() => {
    if (faculty.status === 'in' && (facultyOpen || openRemoteIds.length)) return Faculty.watchEditing();
  });
  $effect(() => {
    if (faculty.status !== 'in') return;
    untrack(() => {
      syncEditing();
      closeLockedViews();
    });
  });

  /**
   * Kunci edit: setiap SOP daring yang terbuka di tab dan boleh diedit dikunci atas nama akun ini, sehingga tidak bisa
   * dibuka orang lain sampai tabnya ditutup (atau kuncinya kedaluwarsa, lihat faculty.svelte.js).
   */
  function syncEditing() {
    Faculty.syncLocks(tabs.list.filter((t) => t.remote?.canEdit).map((t) => t.remote.id));
  }
  const tabDirty = (t) => (t.id === tabs.active ? JSON.stringify(app.doc) !== clean : stash.get(t.id)?.json !== stash.get(t.id)?.clean);

  /** SOP di tab `t` sedang dipegang orang lain: tab ditutup, atau dilepas dari Pustaka Daring bila ada perubahan. */
  function lockedOut(t, holder) {
    const who = holder?.name || 'orang lain';
    const title = tabTitle(t);
    if (!tabDirty(t)) {
      closeTab(t.id);
      ui.alert(`SOP "${title}" sedang diedit oleh ${who}, jadi tabnya ditutup. Buka lagi setelah ${who} selesai dan menutupnya.`, { title: 'SOP terkunci' });
    } else {
      Faculty.setEditing(t.remote.id, false);
      t.remote = null;
      ui.alert(
        `SOP "${title}" sedang diedit oleh ${who}. Perubahan Anda tetap ada di tab ini, tetapi tidak lagi tertaut ke Pustaka Daring: simpan sebagai berkas, atau unggah sebagai SOP baru.`,
        { title: 'SOP terkunci' }
      );
    }
  }
  Faculty.onLockLost((id, holder) => {
    const t = tabs.list.find((x) => x.remote?.id === id);
    if (t) lockedOut(t, holder);
  });

  /** Tab hanya-lihat dari sesi sebelumnya yang SOP-nya kini sedang diedit orang lain ikut ditutup. */
  async function closeLockedViews() {
    for (const t of tabs.list.filter((x) => x.remote && !x.remote.canEdit)) {
      const holder = await Faculty.lockedBy(t.remote.id);
      if (holder && tabs.list.includes(t)) lockedOut(t, holder);
    }
  }

  /** Membuka SOP daring di tab; ditolak bila sedang diedit orang lain. Hasilnya true bila terbuka. */
  async function openFacultySop(sop) {
    const opened = tabs.list.find((t) => t.remote?.id === sop.id);
    if (opened) {
      switchTab(opened.id);
      return true;
    }
    const holder = await Faculty.lockedBy(sop.id);
    if (holder) {
      ui.alert(`SOP "${sop.title || 'tanpa judul'}" sedang diedit oleh ${holder.name}, jadi belum bisa dibuka. Coba lagi setelah ${holder.name} selesai dan menutupnya.`, { title: 'SOP terkunci' });
      return false;
    }
    let doc;
    try {
      doc = parseDocumentText(sop.json);
    } catch {
      ui.alert('SOP ini rusak dan tidak bisa dibuka.');
      return false;
    }
    openInTab(doc);
    activeTab.remote = Faculty.remoteOf(sop);
    syncEditing();
    return true;
  }

  // Tautan Keterkaitan ke SOP lain di Pustaka Daring.
  let linkPick = $state(null);
  /** Membuka SOP daring `id` di tab (atau pindah ke tabnya). Hasilnya true bila berhasil. */
  async function openLinkedSop(id) {
    const opened = tabs.list.find((t) => t.remote?.id === id);
    if (opened) {
      switchTab(opened.id);
      return true;
    }
    if (faculty.status !== 'in') return void ui.alert('Pustaka Daring tidak bisa dihubungi. Periksa koneksi internet, lalu coba lagi.'), false;
    let sop;
    try {
      sop = await Faculty.getSop(id);
    } catch (e) {
      return void ui.alert(e.message), false;
    }
    if (!sop) return void ui.alert('SOP yang ditautkan tidak ditemukan. Mungkin sudah dihapus, atau Anda tidak punya hak untuk melihatnya.'), false;
    if (!(await openFacultySop(sop))) return false;
    notify(`Dibuka: ${sop.title || 'SOP tanpa judul'}`);
    return true;
  }

  /** Membuka SOP daring `id`; bila `cid` diberikan, panel komentar dibuka dan komentar itu disorot. */
  async function openComment(id, cid = null) {
    if (!(await openLinkedSop(id)) || !cid) return;
    notes.highlight = { sop: id, cid };
    notesOpen = true;
  }

  // Tautan langsung: ?sop=ID (&komentar=ID) dibuka setelah akun dikenali, lalu dibersihkan dari alamat.
  let pendingLink = (() => {
    const q = new URLSearchParams(location.search);
    return q.get('sop') ? { id: q.get('sop'), cid: q.get('komentar') } : null;
  })();
  $effect(() => {
    if (faculty.status !== 'in' || !pendingLink) return;
    const l = pendingLink;
    pendingLink = null;
    history.replaceState(history.state, '', location.pathname);
    untrack(() => openComment(l.id, l.cid));
  });

  // Komentar dari SOP mana pun yang menyebut akun ini.
  $effect(() => {
    if (faculty.status !== 'in') return void (notes.mine = []);
    return Faculty.watchMentions((list) => (notes.mine = list));
  });
  // Bawaan SOP baru (kop, nomor, pengesah) yang diatur admin; tetap memakai salinan di browser saat luring.
  $effect(() => {
    if (faculty.status === 'in') return Faculty.watchDefaults(applyDefaults);
  });
  connectLinks({
    open: openLinkedSop,
    pick: (current) => new Promise((resolve) => (linkPick = { current, exclude: activeTab?.remote?.id ?? null, resolve }))
  });

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
    const remote = t.remote;
    Faculty.setEditing(id, false);
    t.remote = null;
    // Urungkan: tab yang dipertahankan tertaut lagi ke SOP-nya.
    return () => {
      if (tabs.list.includes(t) && !t.remote) {
        t.remote = remote;
        syncEditing();
      }
    };
  }

  /** Isi tab yang membuka SOP daring `id` (termasuk perubahan yang belum tersimpan), atau null. */
  function facultyTabJson(id) {
    const t = tabs.list.find((x) => x.remote?.id === id);
    return t ? tabJson(t.id) : null;
  }

  /**
   * Versi lama dari Riwayat dimuat ke tab yang membuka SOP `id` sebagai satu langkah suntingan: bisa di-Undo, dan baru
   * menjadi isi terkini di Pustaka Daring setelah disimpan. Nama SOP tidak ikut mundur, sama seperti Kembalikan biasa.
   */
  function restoreIntoTab(id, json) {
    const t = tabs.list.find((x) => x.remote?.id === id);
    if (!t) return;
    let doc;
    try {
      doc = parseDocumentText(json);
    } catch {
      return ui.alert('Versi ini rusak dan tidak bisa dimuat.');
    }
    switchTab(t.id);
    checkpoint();
    doc.header.namaSop = app.doc.header.namaSop;
    app.doc = doc;
    checkpoint();
    notify('Versi lama dimuat. Simpan ke Pustaka Daring untuk menerapkannya, atau Urungkan (Ctrl+Z).');
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
      openLibrary('faculty');
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
      ui.alert(e.message);
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
  // Perlindungan isi PDF (lihat PDF_PROTECT), diingat per browser.
  let pdfProtect = $state(PDF_PROTECT.includes(getPref('pdfProtect')) ? getPref('pdfProtect') : 'none');
  // Teks watermark (kosong: tanpa watermark), juga diingat per browser.
  let pdfWatermark = $state(getPref('pdfWatermark') ?? '');
  // Halaman yang diekspor (lihat PDF_PARTS): keduanya, bagian depan saja, atau diagram saja; diingat per browser.
  let pdfPart = $state(PDF_PARTS.includes(getPref('pdfPart')) ? getPref('pdfPart') : 'all');
  let pdfBusy = $state(false);
  let pdfRun = 0;
  // PDF gabungan beberapa SOP: { docs, title }; null = PDF dari dokumen aktif.
  let pdfBook = $state(null);
  async function buildPdf() {
    const run = ++pdfRun;
    pdfBusy = true;
    try {
      const opts = { protect: pdfProtect, watermark: pdfWatermark, part: pdfPart };
      const out = pdfBook ? await exportPdfBook(pdfBook.docs, pdfBook.title, opts) : await exportPdf(app.doc, opts);
      if (run === pdfRun) pdfDoc = out; // pilihan diganti lagi selagi dibuat: hasil lama dibuang
    } catch (e) {
      ui.alert('Gagal membuat PDF: ' + e.message);
    } finally {
      if (run === pdfRun) pdfBusy = false;
    }
  }
  /** Sebelum ekspor: ingatkan bila SOP daring ini masih punya komentar terbuka. false = batal, panel komentar dibuka. */
  async function reviewDone() {
    const n = openNotes;
    if (!n) return true;
    const go = await ui.confirm(`Masih ada ${n} komentar yang belum ditandai selesai pada SOP ini. Komentar tidak ikut diekspor.`, {
      title: 'Komentar belum selesai',
      ok: 'Tetap ekspor',
      cancel: 'Lihat komentar'
    });
    if (!go) notesOpen = true;
    return go;
  }

  async function pdf() {
    if (pdfBusy || !(await reviewDone())) return;
    pdfBook = null;
    pdfSaved = fileMark();
    buildPdf();
  }

  /** Cetak: pratinjau PDF dibuka, lalu dialog cetak browser langsung muncul. */
  let pdfPrint = $state(false);
  async function printPdf() {
    if (pdfBusy || !(await reviewDone())) return;
    pdfPrint = true;
    pdfBook = null;
    pdfSaved = null;
    buildPdf();
  }

  /** Menggabungkan beberapa SOP ({ json, title }) menjadi satu PDF berdaftar isi, lalu menampilkan pratinjaunya. */
  function makeBook(items, title) {
    if (pdfBusy) return;
    const docs = [];
    const bad = [];
    for (const it of items) {
      try {
        docs.push(parseDocumentText(it.json));
      } catch {
        bad.push(it.title || 'SOP tanpa judul');
      }
    }
    if (!docs.length) return ui.alert('Tidak ada SOP yang bisa digabung.');
    if (bad.length) notify(`${bad.length} SOP rusak dilewati: ${bad.join(', ')}`);
    pdfBook = { docs, title };
    buildPdf();
  }

  /** Semua tab yang terbuka digabung menjadi satu PDF, urut seperti tabnya. */
  async function bookFromTabs() {
    const items = tabs.list.map((t) => ({ json: tabJson(t.id), title: tabTitle(t) }));
    const raw = await ui.prompt(`${items.length} SOP dari tab yang terbuka digabung menjadi satu PDF, diawali halaman daftar isi. Judul halaman depan:`, 'Kumpulan SOP', {
      title: 'Gabung tab jadi satu PDF',
      ok: 'Buat PDF',
      maxlength: 200
    });
    const title = raw?.trim().replace(/\s+/g, ' ');
    if (title) makeBook(items, title);
  }
  /** Pilihan di dialog pratinjau berubah: diingat, lalu PDF dibuat ulang. */
  function setPdfOptions({ protect = pdfProtect, watermark = pdfWatermark, part = pdfPart }) {
    pdfProtect = protect;
    pdfPart = part;
    setPref('pdfPart', pdfPart);
    pdfWatermark = watermark.trim().slice(0, 60);
    setPref('pdfProtect', pdfProtect);
    setPref('pdfWatermark', pdfWatermark);
    if (pdfDoc) buildPdf();
  }

  // Properti dokumen (metadata berkas ekspor), disimpan di dokumen sehingga ikut tersimpan dan bisa di-Undo.
  let metaOpen = $state(false);
  function saveMeta(values) {
    const before = JSON.stringify(app.doc.meta ?? null);
    setMeta(app.doc, values);
    if (JSON.stringify(app.doc.meta ?? null) !== before && pdfDoc) buildPdf();
  }

  // Ekspor DOCX/XLSX dimuat terpisah agar tidak memperbesar muatan awal.
  let exportBusy = $state('');
  async function exportFile(kind) {
    if (!(await reviewDone())) return;
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
      ui.alert(`Gagal membuat ${kind.toUpperCase()}: ` + e.message);
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
    } else if (k === 'p') {
      // Cetak lewat PDF agar hasilnya sama dengan ekspor; saat pratinjau terbuka, dialognya sendiri yang mencetak.
      e.preventDefault();
      if (!pdfDoc) printPdf();
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

  // Aplikasi hanya untuk akun yang didaftarkan admin (lihat .signin-gate dan Faculty.canUseApp).
  const signedIn = $derived(Faculty.canUseApp());
  $effect(() => {
    if (!signedIn) untrack(() => (libraryOpen = false));
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
  onpageshow={(e) => e.persisted && faculty.status === 'in' && syncEditing()}
  onpointerdowncapture={Faculty.touch}
  onkeydowncapture={Faculty.touch}
  onkeydown={(e) => {
    if (!signedIn) return;
    if (e.key === 'Escape') {
      exportOpen = saveOpen = false;
    }
    onKey(e);
  }}
  onpointerdown={(e) => {
    if (e.target.closest?.('.export')) return;
    exportOpen = false;
    saveOpen = false;
  }}
/>

{#snippet libraryButton(cls)}
  {@const fresh = unseenMentions(faculty.user?.uid)}
  <button
    class="{cls} lib-btn"
    onclick={() => {
      if (fresh) notes.wantMentions = true; // langsung ke daftar "Menyebut saya"
      openLibrary(fresh ? 'faculty' : undefined);
    }}
    aria-haspopup="dialog"
    title={fresh ? `${fresh} komentar baru menyebut Anda` : 'Buka SOP dari Pustaka Lokal atau Pustaka Daring'}
  >
    <Icon name="book" size={15} />Pustaka{#if fresh}<span class="mention-dot" aria-label="{fresh} sebutan baru">{fresh}</span>{/if}
  </button>
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
      <button class="btn ghost" onclick={newDoc} title="Dokumen baru"><Icon name="filePlus" size={15} />Baru</button>
      <button class="btn ghost" onclick={open} title="Buka berkas .sop (Ctrl+O)"><Icon name="folder" size={15} />Buka</button>
      {@render libraryButton('btn ghost')}
      <div class="export">
        <button class="btn ghost" onclick={toggleSaveMenu} disabled={empty} aria-haspopup="menu" aria-expanded={saveOpen} title="Simpan ke Pustaka Lokal, Pustaka Daring, atau sebagai berkas .sop">
          <Icon name="save" size={15} />
          Simpan
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </button>
        {#if saveOpen}
          <div class="export-menu left" role="menu">
            <button role="menuitem" onclick={() => ((saveOpen = false), saveToLibrary())}>
              <Icon name="laptop" />
              <strong>Ke Pustaka Lokal{inLibrary ? ' ✓' : ''}</strong>
              <small>{inLibrary ? `Simpan perubahan ke SOP ini${activeTab?.remote ? '' : ' · Ctrl+S'}` : 'Disimpan di browser ini, buka lagi dari Pustaka Lokal'}</small>
            </button>
            <button role="menuitem" onclick={() => ((saveOpen = false), saveToFaculty())}>
              <Icon name="cloud" />
              <strong>Ke Pustaka Daring{activeTab?.remote ? ' ✓' : ''}</strong>
              <small>{activeTab?.remote ? 'Simpan perubahan ke SOP daring ini · Ctrl+S' : 'Unggah sebagai SOP daring baru (private)'}</small>
            </button>
            <button role="menuitem" onclick={() => ((saveOpen = false), save(false))}>
              <Icon name="save" />
              <strong>Sebagai berkas .sop</strong><small>{app.fileHandle ? `Timpa ${app.fileName}` : 'Pilih lokasi di perangkat'}{activeTab?.remote || inLibrary ? '' : ' · Ctrl+S'}</small>
            </button>
            <button role="menuitem" onclick={() => ((saveOpen = false), save(true))}>
              <Icon name="filePlus" />
              <strong>Simpan berkas sebagai…</strong><small>Berkas .sop baru · Ctrl+Shift+S</small>
            </button>
          </div>
        {/if}
      </div>
      <button class="btn ghost" onclick={() => (aiOpen = true)} title="Susun SOP baru, impor SOP lama (PDF/Word), atau revisi SOP ini dengan bantuan asisten AI"><Icon name="sparkle" size={15} />Asisten AI</button>
      {#if isAdmin}<button class="btn ghost adm-btn" onclick={() => (adminOpen = true)} aria-haspopup="dialog" aria-label="Admin" title="Admin: bawaan SOP baru, anggota, grup, dan penyimpanan"><Icon name="settings" size={15} /><span class="lbl">Admin</span></button>{/if}
      <span class="sep"></span>
      <button class="icon" onclick={undo} disabled={!canUndo} title="Urungkan (Ctrl+Z)" aria-label="Urungkan"><Icon name="undo" /></button>
      <button class="icon" onclick={redo} disabled={!canRedo} title="Ulangi (Ctrl+Y)" aria-label="Ulangi"><Icon name="redo" /></button>
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
        <Icon name="checklist" size={15} />
        Periksa
        {#if issueErrors + issueWarns}
          <span class="badge" class:err={issueErrors}>{issueErrors + issueWarns}</span>
        {:else}
          <span class="badge ok">✓</span>
        {/if}
      </button>
      <button
        class="btn ghost notes-btn"
        class:on={notesOpen}
        disabled={empty}
        onclick={() => (notesOpen = !notesOpen)}
        title={activeTab?.remote ? (openNotes ? `${openNotes} komentar belum selesai` : 'Komentar dan balasan dari peninjau') : 'Komentar untuk SOP di Pustaka Daring'}
      >
        <Icon name="comment" size={15} />
        Komentar
        {#if openNotes}<span class="badge note">{openNotes}</span>{/if}
      </button>
      <div class="export">
        <button class="btn primary" onclick={() => ((saveOpen = false), (exportOpen = !exportOpen))} aria-haspopup="menu" aria-expanded={exportOpen} disabled={!!exportBusy || empty}>
          <Icon name="export" size={15} />
          {exportBusy ? `Membuat ${exportBusy}…` : 'Ekspor'}
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </button>
        {#if exportOpen}
          <div class="export-menu" role="menu">
            <button role="menuitem" onclick={() => ((exportOpen = false), pdf())}>
              <Icon name="file" />
              <strong>PDF</strong><small>Pratinjau lalu unduh · Ctrl+Shift+P</small>
            </button>
            <button role="menuitem" onclick={() => ((exportOpen = false), printPdf())}>
              <Icon name="print" />
              <strong>Cetak</strong><small>Langsung ke printer, sama dengan PDF · Ctrl+P</small>
            </button>
            <button role="menuitem" onclick={() => ((exportOpen = false), exportFile('docx'))}>
              <Icon name="fileText" />
              <strong>Word (.docx)</strong><small>Teks dan simbol diagram bisa diedit</small>
            </button>
            <button role="menuitem" onclick={() => ((exportOpen = false), exportFile('xlsx'))}>
              <Icon name="table" />
              <strong>Excel (.xlsx)</strong><small>Sesuai template SOP, simbol bisa diedit</small>
            </button>
            <button role="menuitem" onclick={() => ((exportOpen = false), exportFile('png'))}>
              <Icon name="image" />
              <strong>Gambar PNG (.zip)</strong><small>Satu gambar per halaman, 200 dpi</small>
            </button>
            {#if tabs.list.length > 1}
              <button role="menuitem" onclick={() => ((exportOpen = false), bookFromTabs())}>
                <Icon name="book" />
                <strong>PDF gabungan semua tab…</strong><small>{tabs.list.length} SOP dalam satu PDF berdaftar isi</small>
              </button>
            {/if}
            <button role="menuitem" class="sep" onclick={() => ((exportOpen = false), (metaOpen = true))}>
              <Icon name="info" />
              <strong>Properti dokumen…</strong><small>Judul, penulis, subjek, dan kata kunci berkas</small>
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
          oncontextmenu={(e) => openTabMenu(e, t)}
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
      <button class="add" onclick={() => addTab(emptyDocument())} title="Tab baru (dokumen kosong)"><Icon name="plus" size={14} /><span>Tab baru</span></button>
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

  <main class="workspace" class:with-notes={notesOpen}>
    <section
      class="preview"
      onpointerdown={(e) => pickField(e.target)}
      onkeyup={(e) => e.key === 'Tab' && pickField(document.activeElement)}
    >
      {#if activeTab?.remote && !activeTab.remote.canEdit}
        <div class="waiting" role="status">
          <span><strong>Anda hanya punya hak lihat pada SOP ini.</strong> Perubahan hanya bisa disimpan sebagai salinan milik Anda.</span>
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
            <button class="btn small" onclick={() => fontFiles.click()}><Icon name="upload" size={14} />Pilih file Calibri…</button>
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
            <button class="btn primary" onclick={newDoc}><Icon name="filePlus" size={15} />Baru</button>
            <button class="btn" onclick={open}><Icon name="folder" size={15} />Buka</button>
            {@render libraryButton('btn')}
          </span>
        </div>
      {:else}
        <div class="preview-scroll" bind:this={previewScroll}>
          <Preview {pages} {zoom} />
        </div>
      {/if}
    </section>
    <CommentPanel
      bind:open={notesOpen}
      doc={app.doc}
      remote={activeTab?.remote ?? null}
      onjump={jumpTo}
      onnotify={notify}
      onupload={async () => {
        if (await saveToFaculty()) notesOpen = true;
      }}
    />
  </main>

  {#if $needRefresh}
    <div class="banner">
      Versi baru tersedia.
      <button class="btn small primary" onclick={() => updateServiceWorker(true)}><Icon name="refresh" size={14} />Muat ulang</button>
      <button class="btn small ghost" onclick={() => needRefresh.set(false)}>Nanti</button>
    </div>
  {:else if $offlineReady}
    <div class="banner">
      Aplikasi siap dipakai secara offline.
      <button class="btn small ghost" onclick={() => offlineReady.set(false)}>Tutup</button>
    </div>
  {/if}

  {#if AiDialog}<AiDialog bind:open={aiOpen} docKey={tabs.active} onpaste={loadPasted} />{/if}
  <PdfPreviewDialog
    bind:pdf={pdfDoc}
    bind:printNow={pdfPrint}
    ondownload={() => !pdfBook && pdfSaved?.()}
    protect={pdfProtect}
    watermark={pdfWatermark}
    part={pdfPart}
    busy={pdfBusy}
    onoptions={setPdfOptions}
    onmeta={pdfBook ? null : () => (metaOpen = true)}
    title={pdfBook ? `Pratinjau PDF gabungan · ${pdfBook.docs.length} SOP` : 'Pratinjau PDF'}
    pages={pdfBook ? [] : pagesOf(pages, pdfPart)}
    filename={pdfBook ? `${slug(pdfBook.title) || 'Kumpulan-SOP'}.pdf` : `SOP-${slug(app.doc.header.namaSop)}.pdf`}
    fontNote={docFont === 'calibri' ? '' : 'Calibri belum tersedia, PDF memakai Carlito (ukuran identik)'}
  />
  <FindPanel
    bind:open={findOpen}
    onnotify={notify}
    onjump={(f) => jumpTo(f.ref)}
  />
  {#if tabMenu}<ContextMenu x={tabMenu.x} y={tabMenu.y} items={tabMenu.items} onclose={() => (tabMenu = null)} />{/if}
  <CheckPanel bind:open={checkOpen} {issues} {duration} steps={app.doc.steps} onjump={jumpTo} />

  {#if AdminDialog}<AdminDialog bind:open={adminOpen} onnotify={notify} />{/if}
  {#if LibraryDialog}<LibraryDialog
    bind:open={libraryOpen}
    bind:tab={libraryTab}
    local={{
      openIds,
      current: tabs.active,
      onopen: openEntry,
      onsave: saveToLibrary,
      cansave: !empty,
      onnotify: notify,
      onbook: makeBook
    }}
    faculty={{
      openIds: openRemoteIds,
      cansave: !empty && !activeTab?.remote,
      onopen: openFacultySop,
      onupload: async (folder) => {
        if (await saveToFaculty(folder)) libraryOpen = false;
      },
      oncreate: async (name, folder) => {
        const doc = emptyDocument();
        doc.header.namaSop = name;
        const remote = await Faculty.uploadSop(doc, name, folder);
        openInTab(doc);
        activeTab.remote = remote;
        syncEditing();
      },
      onloaded: onFacultyLoaded,
      onrenamed: onFacultyRenamed,
      onbinned: onFacultyBinned,
      onnotify: notify,
      tabjson: facultyTabJson,
      onrestoretab: restoreIntoTab,
      onbook: (sops, title) => makeBook(sops.map((s) => ({ json: s.json, title: s.title })), title),
      onopencomment: (sopId, cid) => {
        libraryOpen = false;
        openComment(sopId, cid);
      }
    }}
  />{/if}
  <FacultyConflict info={conflict} onchoice={chooseConflict} />
  <CloseConfirm info={closeAsk} onchoice={chooseClose} />
  <LinkSopDialog bind:req={linkPick} />
  <DocMetaDialog doc={app.doc} bind:open={metaOpen} onsave={saveMeta} />

  {#if toast}
    {#key toast.n}
      <div class="toast" role="status" use:overTop>
        {toast.msg}
        {#if toast.action}<button class="toast-act" onclick={toastAct}>{toast.action.label}</button>{/if}
      </div>
    {/key}
  {/if}
  {#if dragging}<div class="dropzone">Lepaskan berkas .sop untuk membuka</div>{/if}
</div>

{#if !signedIn}
  <div class="signin-gate">
    <img src="./favicon.svg" alt="" width="56" height="56" />
    <strong>SOP Editor</strong>
    {#if faculty.status === 'out'}
      <p>Aplikasi ini hanya untuk akun yang sudah didaftarkan admin. Masuk dengan akun Google Anda.</p>
      <button class="btn primary" onclick={() => Faculty.signIn().catch((e) => ui.alert(e.message))}><Icon name="login" size={15} />Masuk dengan Google</button>
    {:else if faculty.status === 'domain' || faculty.status === 'notMember'}
      <p>
        Akun <b>{faculty.user?.email}</b> belum terdaftar.
        {faculty.status === 'domain' ? 'Hanya akun @ub.ac.id atau @gmail.com yang bisa didaftarkan.' : 'Hubungi admin untuk didaftarkan.'}
      </p>
      <div class="gate-actions">
        <button class="btn primary" onclick={() => Faculty.signOut().then(() => Faculty.signIn()).catch((e) => ui.alert(e.message))}><Icon name="users" size={15} />Ganti akun</button>
        <button class="btn" onclick={() => Faculty.signOut()}><Icon name="logout" size={15} />Keluar</button>
      </div>
    {:else if faculty.status === 'error'}
      <p class="error">{faculty.error}</p>
      <div class="gate-actions">
        <button class="btn primary" onclick={() => (faculty.user ? Faculty.recheck() : Faculty.start())}><Icon name="refresh" size={15} />Coba lagi</button>
        {#if faculty.user}<button class="btn" onclick={() => Faculty.signOut()}><Icon name="logout" size={15} />Keluar</button>{/if}
      </div>
    {:else}
      <p>Memuat…</p>
    {/if}
  </div>
{/if}

<AskDialog />

<!-- Ditampilkan (lewat CSS) menggantikan aplikasi di layar HP. -->
<div class="mobile-block">
  <img src="./favicon.svg" alt="" width="56" height="56" />
  <strong>SOP Editor hanya bisa dibuka di laptop/PC</strong>
  <p>Aplikasi ini dirancang untuk layar lebar dengan mouse dan keyboard. Silakan buka alamat ini dari laptop atau PC.</p>
</div>
