<script>
  import { onMount, tick } from 'svelte';
  import { useRegisterSW } from 'virtual:pwa-register/svelte';
  import { app, persist, tabs, stash, newTabId } from './lib/store.svelte.js';
  import { emptyDocument, sampleDocument, parseDocumentText } from './lib/model.js';
  import { layoutDocument } from './lib/layout.js';
  import { exportPdf } from './lib/pdf.js';
  import { fontSource, useSystemCalibri, useCalibriFiles } from './lib/fonts.js';
  import { saveJson, openJsonFile, slug } from './lib/files.js';
  import Preview from './lib/Preview.svelte';
  import ActorsEditor from './lib/editors/ActorsEditor.svelte';
  import StepsEditor from './lib/editors/StepsEditor.svelte';
  import CollabDialog from './lib/CollabDialog.svelte';
  import AiDialog from './lib/AiDialog.svelte';
  import PdfPreviewDialog from './lib/PdfPreviewDialog.svelte';
  import FindPanel from './lib/FindPanel.svelte';
  import * as Collab from './lib/collab.svelte.js';
  import { collab, inviteFromUrl } from './lib/collab.svelte.js';

  let mobileView = $state('edit');
  let zoom = $state(100);
  let toast = $state('');
  let toastTimer;

  const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW();

  // Preferensi tampilan (per browser).
  const pref = (key, fallback) => {
    try {
      return localStorage.getItem('sop-editor:' + key) ?? fallback;
    } catch {
      return fallback;
    }
  };
  const setPref = (key, value) => {
    try {
      localStorage.setItem('sop-editor:' + key, value);
    } catch {}
  };

  let sidebar = $state(pref('sidebar', 'open') === 'open');
  function toggleSidebar() {
    sidebar = !sidebar;
    setPref('sidebar', sidebar ? 'open' : 'closed');
  }

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
    timer = setTimeout(() => {
      // Di ruang kolaborasi, undo/redo ditangani Yjs (hanya perubahan sendiri yang dibatalkan).
      if (collab.status !== 'off') {
        past = [];
        future = [];
        current = json;
        persist(json);
        syncFlags();
        return;
      }
      past.push(current);
      if (past.length > 100) past.shift();
      future = [];
      current = json;
      persist(json);
      syncFlags();
    }, 350);
  });

  // Setiap perubahan lokal langsung dikirim ke ruang kolaborasi.
  $effect(() => {
    const doc = JSON.parse(JSON.stringify(app.doc));
    if (collab.status === 'ready') Collab.pushLocal(doc);
  });

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

  const undoable = $derived(collab.status === 'off' ? canUndo : collab.canUndo);
  const redoable = $derived(collab.status === 'off' ? canRedo : collab.canRedo);

  function undo() {
    if (collab.status !== 'off') return Collab.undo();
    if (!past.length) return;
    future.push(current);
    restore(past.pop());
  }

  function redo() {
    if (collab.status !== 'off') return Collab.redo();
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
    stash.set(tabs.active, { json, handle: app.fileHandle, past, future });
    Object.assign(activeTab, { title: app.doc.header.namaSop, fileName: app.fileName });
  }

  function activate(id) {
    const s = stash.get(id);
    tabs.active = id;
    past = s.past;
    future = s.future;
    app.fileHandle = s.handle;
    app.fileName = activeTab.fileName;
    restore(s.json);
  }

  // Ruang kolaborasi terikat pada tab yang sedang aktif.
  function canLeaveTab() {
    if (collab.status === 'off') return true;
    if (!confirm('Dokumen ini sedang dibuka di ruang kolaborasi. Keluar dari ruang untuk berpindah tab?')) return false;
    Collab.leaveRoom();
    return true;
  }

  function switchTab(id) {
    if (id === tabs.active || !canLeaveTab()) return;
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

  /** Membuka dokumen di tab baru (atau, di ruang kolaborasi, mengganti dokumen ruang). */
  function openInTab(doc, name = null, handle = null) {
    if (collab.status !== 'off' || pristine()) return replaceDocument(doc, name, handle);
    addTab(doc, name, handle);
  }

  function addTab(doc, name = null, handle = null) {
    stashActive();
    const id = newTabId();
    tabs.list.splice(tabs.list.indexOf(activeTab) + 1, 0, { id, title: doc.header.namaSop, fileName: name });
    stash.set(id, { json: JSON.stringify(doc), handle, past: [], future: [] });
    activate(id);
  }

  function closeTab(id) {
    const tab = tabs.list.find((t) => t.id === id);
    if (!confirm(`Tutup "${tabTitle(tab)}"? Perubahan yang belum disimpan ke JSON akan hilang.`)) return;
    if (tabs.list.length === 1) {
      if (!canLeaveTab()) return;
      past = [];
      future = [];
      return replaceDocument(emptyDocument());
    }
    const i = tabs.list.indexOf(tab);
    if (id === tabs.active) {
      if (!canLeaveTab()) return;
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

  // Kolaborasi: undangan lewat tautan, status fokus untuk peserta lain.
  let collabOpen = $state(false);
  let invite = $state(null);
  let focusStep = $state(null);
  const shared = $derived(collab.status !== 'off' ? ' untuk semua peserta ruang' : '');

  function checkInvite() {
    const inv = inviteFromUrl();
    if (!inv || inv.room === collab.room?.id) return;
    if (inv.known && collab.me.name) Collab.joinRoom(inv);
    else {
      invite = inv;
      collabOpen = true;
    }
  }

  $effect(() => {
    if (collab.status === 'ready') Collab.setFocus({ step: focusStep });
  });

  function onFocusIn(e) {
    focusStep = e.target.closest?.('[data-step]')?.dataset.step ?? null;
  }

  function newDoc() {
    if (shared && !confirm(`Ganti dokumen${shared} dengan dokumen baru? (bisa di-Undo)`)) return;
    openInTab(emptyDocument());
  }

  function loadSample() {
    if (shared && !confirm(`Ganti dokumen${shared} dengan contoh SOP Skripsi? (bisa di-Undo)`)) return;
    openInTab(sampleDocument());
  }

  function loadText(text, name, handle) {
    try {
      const doc = parseDocumentText(text);
      if (shared && !confirm(`Ganti dokumen${shared} dengan ${name}? (bisa di-Undo)`)) return false;
      openInTab(doc, name, handle);
      notify(`Dibuka: ${name}`);
      return true;
    } catch (e) {
      alert(e instanceof SyntaxError ? 'Berkas bukan JSON yang valid.' : e.message);
      return false;
    }
  }

  // Jawaban AI yang ditempel: dokumen baru tanpa berkas.
  let aiOpen = $state(false);
  function loadPasted(text) {
    if (shared && !confirm(`Ganti dokumen${shared} dengan jawaban AI ini?`)) return false;
    try {
      openInTab(parseDocumentText(text));
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
      if (f) loadText(f.text, f.name, f.handle);
    } catch (e) {
      alert('Gagal membuka berkas: ' + e.message);
    }
  }

  async function save(saveAs = false) {
    const name = app.fileName || `SOP-${slug(app.doc.header.namaSop)}.json`;
    try {
      const handle = await saveJson(JSON.stringify(app.doc, null, 2), name, app.fileHandle, saveAs);
      if (handle === undefined) return;
      if (handle) {
        app.fileHandle = handle;
        app.fileName = handle.name;
        persist(current);
      }
      notify('Tersimpan sebagai ' + (handle?.name ?? name));
    } catch (e) {
      alert('Gagal menyimpan: ' + e.message);
    }
  }

  // Ekspor PDF selalu lewat pratinjau dulu; unduhan dilakukan dari dialog.
  let pdfDoc = $state(null);
  function pdf() {
    try {
      pdfDoc = exportPdf(app.doc);
    } catch (e) {
      alert('Gagal membuat PDF: ' + e.message);
    }
  }

  function onKey(e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 's') {
      e.preventDefault();
      save(e.shiftKey);
    } else if (k === 'o') {
      e.preventDefault();
      open();
    } else if (k === 'p' && e.shiftKey) {
      e.preventDefault();
      pdf();
    } else if (k === 'f' || k === 'h') {
      e.preventDefault();
      findOpen = true;
    } else if (k === 'b') {
      e.preventDefault();
      toggleSidebar();
    } else if ((k === 'z' || k === 'y') && !e.target.closest?.('input, textarea')) {
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
    for (const file of e.dataTransfer?.files ?? []) loadText(await file.text(), file.name, null);
  }

  onMount(() => {
    checkInvite();
    window.addEventListener('hashchange', checkInvite);
    const onFs = () => (fullscreen = !!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    if ('launchQueue' in window) {
      window.launchQueue.setConsumer(async (params) => {
        for (const handle of params.files ?? []) {
          const file = await handle.getFile();
          loadText(await file.text(), file.name, handle);
        }
      });
    }
    return () => {
      window.removeEventListener('hashchange', checkInvite);
      document.removeEventListener('fullscreenchange', onFs);
    };
  });
</script>

<svelte:window onkeydown={onKey} />

<div
  class="app"
  class:dragging
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
      <button class="btn ghost" onclick={open} title="Buka JSON (Ctrl+O)">Buka</button>
      <button class="btn ghost" onclick={() => save(false)} title="Simpan JSON (Ctrl+S)">Simpan JSON</button>
      <button class="btn ghost" onclick={() => (aiOpen = true)} title="Susun SOP dengan ChatGPT, Gemini, atau Claude">Buat dengan AI</button>
      <span class="sep"></span>
      <button class="icon" onclick={undo} disabled={!undoable} title="Urungkan (Ctrl+Z)">↶</button>
      <button class="icon" onclick={redo} disabled={!redoable} title="Ulangi (Ctrl+Y)">↷</button>
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
      {#if collab.status !== 'off'}
        <button class="btn ghost collab-btn" onclick={() => (collabOpen = true)} title="Ruang kolaborasi">
          <span class="avatars">
            <span class="avatar" style:background={collab.me.color}>{collab.me.name[0]?.toUpperCase()}</span>
            {#each collab.peers.slice(0, 4) as p (p.id)}
              <span class="avatar" style:background={p.color} title={p.name}>{p.name[0]?.toUpperCase()}</span>
            {/each}
            {#if collab.peers.length > 4}<span class="avatar more">+{collab.peers.length - 4}</span>{/if}
          </span>
          <span class="live" class:on={collab.online && collab.status === 'ready'}></span>
        </button>
      {:else}
        <button class="btn ghost" onclick={() => (collabOpen = true)} title="Edit bersama secara real-time">Kolaborasi</button>
      {/if}
      <button class="btn ghost" onclick={loadSample} title="Muat contoh SOP Skripsi">Contoh</button>
      <button class="btn primary" onclick={pdf} title="Pratinjau lalu ekspor PDF (Ctrl+Shift+P)">Ekspor PDF</button>
    </nav>
  </header>

  <div class="tabbar">
    <div
      class="tabs"
      role="tablist"
      aria-label="Dokumen terbuka"
      onwheel={(e) => {
        // Roda vertikal menggeser deretan tab ke samping.
        if (!e.deltaY || e.currentTarget.scrollWidth <= e.currentTarget.clientWidth) return;
        e.preventDefault();
        e.currentTarget.scrollLeft += e.deltaY;
      }}
    >
      {#each tabs.list as t (t.id)}
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
            {tabTitle(t)}
          </button>
          <button class="close" onclick={() => closeTab(t.id)} title="Tutup tab" aria-label="Tutup {tabTitle(t)}">×</button>
        </div>
      {/each}
      <button class="add" onclick={() => addTab(emptyDocument())} disabled={collab.status !== 'off'} title={collab.status !== 'off' ? 'Keluar dari ruang kolaborasi untuk membuka tab baru' : 'Tab baru'} aria-label="Tab baru">+</button>
    </div>
    <div class="zoom" title="Zoom pratinjau">
      <span class="zoom-label">Zoom</span>
      <button class="zoom-step" onclick={() => (zoom = Math.max(50, zoom - 10))} disabled={zoom <= 50} title="Perkecil" aria-label="Perkecil">−</button>
      <input type="range" min="50" max="200" step="10" bind:value={zoom} aria-label="Zoom pratinjau" />
      <button class="zoom-step" onclick={() => (zoom = Math.min(200, zoom + 10))} disabled={zoom >= 200} title="Perbesar" aria-label="Perbesar">+</button>
      <span class="zoom-val">{zoom}%</span>
    </div>
  </div>

  <div class="mobile-switch">
    <button class:active={mobileView === 'edit'} onclick={() => (mobileView = 'edit')}>Edit</button>
    <button class:active={mobileView === 'preview'} onclick={() => (mobileView = 'preview')}>Pratinjau</button>
  </div>

  <main class="workspace" class:collapsed={!sidebar} data-view={mobileView}>
    <aside class="editor">
      {#if collab.status === 'connecting'}
        <div class="waiting">
          <strong>Menunggu dokumen ruang…</strong>
          <p>Dokumen akan muncul begitu tersambung dengan peserta lain yang sedang membuka ruang ini.</p>
          <button class="btn small" onclick={() => confirm('Isi ruang dengan dokumen yang sedang terbuka di sini?') && Collab.useLocalDocument()}>
            Gunakan dokumen saya sebagai isi ruang
          </button>
        </div>
      {/if}
      <div class="editor-body" inert={collab.status === 'connecting'} onfocusin={onFocusIn}>
        <ActorsEditor />
        <StepsEditor />
      </div>
    </aside>

    <section class="preview">
      <!-- Pegangan di tepi panel editor untuk membuka/menutupnya. -->
      <button class="sidebar-toggle" onclick={toggleSidebar} title={sidebar ? 'Tutup panel editor (Ctrl+B)' : 'Buka panel editor (Ctrl+B)'} aria-label="Panel editor" aria-expanded={sidebar}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d={sidebar ? 'm15 6-6 6 6 6' : 'm9 6 6 6-6 6'} /></svg>
      </button>
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
      <div class="preview-scroll">
        <Preview {pages} {zoom} editable={collab.status !== 'connecting'} />
      </div>
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

  <CollabDialog bind:open={collabOpen} bind:invite onsave={() => save(true)} />
  <AiDialog bind:open={aiOpen} onpaste={loadPasted} onopen={open} />
  <PdfPreviewDialog
    bind:pdf={pdfDoc}
    {pages}
    filename={`SOP-${slug(app.doc.header.namaSop)}.pdf`}
    fontNote={docFont === 'calibri' ? '' : 'Calibri belum tersedia, PDF memakai Carlito (ukuran identik)'}
  />
  <FindPanel
    bind:open={findOpen}
    onnotify={notify}
    onjump={async (f) => {
      if (f.tab) {
        if (!sidebar) toggleSidebar();
        mobileView = 'edit';
        await tick();
        const el = document.querySelector(f.tab === 'langkah' ? `[data-step="${f.obj.id}"]` : '[data-actors]');
        el?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        return;
      }
      mobileView = 'preview';
      await tick();
      const el = document.querySelector(`[data-field="${f.ref}"]`);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el?.focus({ preventScroll: true });
    }}
  />

  {#if toast}<div class="toast" role="status">{toast}</div>{/if}
  {#if dragging}<div class="dropzone">Lepaskan berkas JSON untuk membuka</div>{/if}
</div>
