<script>
  import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
  import { app, newTabId } from './store.svelte.js';
  import { emptyDocument, sampleDocument, parseDocumentText } from './model.js';
  import { plainText } from './richtext.js';
  import { listEntries, putEntry, deleteEntry, flushAll } from './library.js';
  import { slug, downloadBlob } from './files.js';

  /** openIds: id tab yang sedang terbuka (= id entri pustaka). */
  let { open = $bindable(false), openIds = [], active, onopen, ontemplate, onnotify } = $props();

  let dialog;
  let restoreInput;
  let entries = $state([]);
  let kind = $state('doc');
  let query = $state('');

  // Templat bawaan, selalu tersedia dan tidak bisa dihapus.
  const BUILTIN = [
    { id: 'builtin-empty', title: 'Dokumen kosong', note: 'Kop, pengesah, dan bagian baku FILKOM', make: emptyDocument },
    { id: 'builtin-sample', title: 'SOP Skripsi', note: 'Contoh lengkap dengan keputusan dan beberapa pelaksana', make: sampleDocument }
  ];

  $effect(() => {
    if (open && !dialog.open) {
      query = '';
      dialog.showModal();
      refresh();
    } else if (!open && dialog.open) dialog.close();
  });

  async function refresh() {
    try {
      await flushAll();
      entries = (await listEntries()).map((e) => ({ ...e, text: haystack(e) }));
    } catch {
      entries = [];
      alert('Pustaka tidak bisa dibaca di browser ini (mode privat atau penyimpanan diblokir).');
    }
  }

  /** Teks yang dicari: nama, nomor, berkas, pelaksana, kegiatan, dan butir ketentuan. */
  function haystack(e) {
    const parts = [e.title, e.nomor, e.fileName];
    try {
      const d = JSON.parse(e.json);
      parts.push(...d.actors.map((a) => a.name), ...d.steps.map((s) => plainText(s.kegiatan)));
      for (const s of Object.values(d.sections)) parts.push(...s.items.map((i) => plainText(i.text ?? i)));
    } catch {}
    return parts.filter((p) => typeof p === 'string').join('\n').toLowerCase();
  }

  const shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => e.kind === kind && (!q || q.split(/\s+/).every((w) => e.text.includes(w))));
  });
  const counts = $derived({
    doc: entries.filter((e) => e.kind === 'doc').length,
    template: entries.filter((e) => e.kind === 'template').length + BUILTIN.length
  });
  const builtins = $derived(
    kind === 'template' ? BUILTIN.filter((b) => !query.trim() || b.title.toLowerCase().includes(query.trim().toLowerCase())) : []
  );

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

  const titleOf = (e) => e.title || (e.kind === 'template' ? 'Templat tanpa nama' : 'SOP tanpa judul');

  function pick(e) {
    open = false;
    onopen(e);
  }

  function useTpl(make) {
    open = false;
    ontemplate(make());
  }

  async function add(entry) {
    const now = Date.now();
    await putEntry({ fileName: null, created: now, updated: now, ...entry, id: newTabId() });
    await refresh();
  }

  async function duplicate(e) {
    const d = JSON.parse(e.json);
    d.header.namaSop = (d.header.namaSop || 'SOP tanpa judul') + ' (salinan)';
    await add({ kind: 'doc', title: d.header.namaSop, nomor: d.header.nomor, json: JSON.stringify(d) });
    onnotify('Salinan dibuat');
  }

  async function makeTemplate(json, suggested) {
    const name = prompt('Nama templat:', suggested || 'Templat SOP');
    if (!name?.trim()) return;
    const d = JSON.parse(json);
    await add({ kind: 'template', title: name.trim(), nomor: d.header.nomor, json });
    kind = 'template';
    onnotify(`Templat "${name.trim()}" disimpan`);
  }

  async function rename(e) {
    const name = prompt('Nama templat:', e.title);
    if (!name?.trim() || name.trim() === e.title) return;
    const { text, ...rest } = e;
    await putEntry({ ...rest, title: name.trim(), updated: Date.now() });
    await refresh();
  }

  async function remove(e) {
    if (!confirm(`Hapus "${titleOf(e)}" dari pustaka? Tindakan ini tidak bisa dibatalkan.`)) return;
    await deleteEntry(e.id);
    await refresh();
  }

  /** Cadangan semua entri sebagai berkas .sop di dalam satu .zip. */
  function backup() {
    const files = {};
    const used = new Set();
    for (const e of entries) {
      const dir = e.kind === 'template' ? 'Templat' : 'Dokumen';
      let name = `${dir}/${slug(titleOf(e))}`;
      for (let n = 2; used.has(name); n++) name = `${dir}/${slug(titleOf(e))}-${n}`;
      used.add(name);
      files[name + '.sop'] = strToU8(JSON.stringify(JSON.parse(e.json), null, 2));
    }
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    downloadBlob(new Blob([zipSync(files)], { type: 'application/zip' }), `Pustaka-SOP-${stamp}.zip`);
  }

  /** Memulihkan cadangan .zip (atau berkas .sop lepas) sebagai entri baru. */
  async function restore(files) {
    let ok = 0;
    let bad = 0;
    let same = 0;
    const known = new Set(entries.map((e) => e.kind + e.json));
    const take = async (path, text, loose) => {
      try {
        const doc = parseDocumentText(text);
        const json = JSON.stringify(doc);
        const template = /^templat\//i.test(path);
        if (known.has((template ? 'template' : 'doc') + json)) return same++;
        known.add((template ? 'template' : 'doc') + json);
        const base = path.split('/').pop().replace(/\.(sop|json)$/i, '');
        await add({
          kind: template ? 'template' : 'doc',
          title: template ? base.replace(/-/g, ' ') : doc.header.namaSop,
          nomor: doc.header.nomor,
          fileName: loose ? path : null,
          json
        });
        ok++;
      } catch {
        bad++;
      }
    };
    for (const f of files) {
      if (/\.zip$/i.test(f.name)) {
        try {
          const zip = unzipSync(new Uint8Array(await f.arrayBuffer()));
          for (const [path, data] of Object.entries(zip)) if (/\.(sop|json)$/i.test(path)) await take(path, strFromU8(data), false);
        } catch {
          bad++;
        }
      } else await take(f.name, await f.text(), true);
    }
    onnotify(
      `${ok} dokumen ditambahkan` + (same ? `, ${same} sudah ada` : '') + (bad ? `, ${bad} berkas tidak valid` : '')
    );
  }
</script>

<dialog bind:this={dialog} class="dialog" onclose={() => (open = false)}>
  <header>
    <h2>Pustaka</h2>
    <button class="x" onclick={() => (open = false)} aria-label="Tutup">×</button>
  </header>
  <p class="hint">
    Semua SOP yang diedit tersimpan otomatis di browser ini. Cadangkan secara berkala; data hilang bila data situs browser
    dihapus.
  </p>

  <div class="bar">
    <div class="seg" role="tablist">
      <button role="tab" aria-selected={kind === 'doc'} class:on={kind === 'doc'} onclick={() => (kind = 'doc')}>
        Dokumen <span>{counts.doc}</span>
      </button>
      <button role="tab" aria-selected={kind === 'template'} class:on={kind === 'template'} onclick={() => (kind = 'template')}>
        Templat <span>{counts.template}</span>
      </button>
    </div>
    <!-- svelte-ignore a11y_autofocus -->
    <input type="search" bind:value={query} placeholder="Cari nama, nomor, pelaksana, atau kegiatan…" autofocus />
  </div>

  <ul class="list">
    {#each builtins as b (b.id)}
      <li>
        <button class="main" onclick={() => useTpl(b.make)}>
          <strong>{b.title}</strong>
          <small>Bawaan · {b.note}</small>
        </button>
        <span class="acts"><button class="btn small primary" onclick={() => useTpl(b.make)}>Pakai</button></span>
      </li>
    {/each}
    {#each shown as e (e.id)}
      {@const isOpen = openIds.includes(e.id)}
      <li class:current={e.id === active}>
        <button class="main" onclick={() => (e.kind === 'doc' ? pick(e) : useTpl(() => parseDocumentText(e.json)))}>
          <strong>
            {titleOf(e)}
            {#if e.id === active}<em>sedang dibuka</em>{:else if isOpen}<em>terbuka di tab</em>{/if}
          </strong>
          <small>
            {[e.kind === 'doc' && e.nomor, e.fileName, 'diubah ' + ago(e.updated)].filter(Boolean).join(' · ')}
          </small>
        </button>
        <span class="acts">
          {#if e.kind === 'doc'}
            <button class="btn small" onclick={() => duplicate(e)} title="Buat salinan di pustaka">Duplikat</button>
            <button class="btn small" onclick={() => makeTemplate(e.json, e.title)} title="Simpan sebagai titik awal SOP baru">Jadikan templat</button>
          {:else}
            <button class="btn small primary" onclick={() => useTpl(() => parseDocumentText(e.json))}>Pakai</button>
            <button class="btn small" onclick={() => rename(e)}>Ubah nama</button>
          {/if}
          <button
            class="btn small danger"
            onclick={() => remove(e)}
            disabled={isOpen}
            title={isOpen ? 'Tutup tabnya dulu untuk menghapus' : 'Hapus dari pustaka'}
          >Hapus</button>
        </span>
      </li>
    {:else}
      {#if !builtins.length}
        <li class="empty">
          {query.trim() ? 'Tidak ada yang cocok.' : kind === 'doc' ? 'Belum ada dokumen. SOP yang Anda edit akan muncul di sini.' : 'Belum ada templat buatan sendiri.'}
        </li>
      {/if}
    {/each}
  </ul>

  <footer>
    <button class="btn" onclick={() => makeTemplate(JSON.stringify(app.doc), app.doc.header.namaSop)}>
      Jadikan dokumen ini templat
    </button>
    <span class="grow"></span>
    <button class="btn" onclick={backup} disabled={!entries.length} title="Unduh semua dokumen dan templat sebagai .zip">Cadangkan (.zip)</button>
    <button class="btn" onclick={() => restoreInput.click()} title="Tambahkan isi cadangan .zip atau berkas .sop ke pustaka">Pulihkan…</button>
    <input
      bind:this={restoreInput}
      type="file"
      accept=".zip,.sop,.json"
      multiple
      hidden
      onchange={async (ev) => {
        const files = [...ev.currentTarget.files];
        ev.currentTarget.value = '';
        if (files.length) await restore(files);
      }}
    />
  </footer>
</dialog>

<style>
  .dialog {
    width: min(760px, calc(100vw - 2rem));
    max-height: min(680px, calc(100vh - 3rem));
    border: 0;
    border-radius: 14px;
    padding: 1.1rem 1.2rem;
    box-shadow: 0 20px 50px rgb(0 0 0 / 0.25);
    background: var(--surface);
    color: var(--text);
    flex-direction: column;
  }
  .dialog[open] {
    display: flex;
  }
  .dialog::backdrop {
    background: rgb(15 23 42 / 0.45);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h2 {
    margin: 0;
    font-size: 1.1rem;
  }
  .x {
    border: 0;
    background: none;
    font-size: 1.4rem;
    line-height: 1;
    color: var(--muted);
    cursor: pointer;
  }
  .hint {
    margin: 0.3rem 0 0.8rem;
  }
  .bar {
    display: flex;
    gap: 0.6rem;
    margin-bottom: 0.6rem;
  }
  .seg {
    display: flex;
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
    flex: none;
  }
  .seg button {
    border: 0;
    background: none;
    padding: 0.35rem 0.75rem;
    cursor: pointer;
    font-weight: 500;
    color: var(--muted);
  }
  .seg button.on {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .seg span {
    font-size: 0.75rem;
    opacity: 0.8;
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
  .acts {
    display: flex;
    gap: 0.3rem;
    flex: none;
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
</style>
