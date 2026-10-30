<script>
  import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
  import { app, newTabId } from './store.svelte.js';
  import { emptyDocument, sampleDocument, parseDocumentText } from './model.js';
  import { plainText } from './richtext.js';
  import { listEntries, putEntry, patchEntry, deleteEntry, flushAll, cleanTags } from './library.js';
  import { slug, downloadBlob } from './files.js';

  /** openIds: id tab yang sedang terbuka (= id entri pustaka). */
  let { open = $bindable(false), openIds = [], active, onopen, ontemplate, onnotify } = $props();

  let dialog;
  let restoreInput;
  let entries = $state([]);
  let kind = $state('doc');
  let query = $state('');
  let tag = $state(null); // saringan label: null = semua, '' = tanpa label
  let tagEdit = $state(null); // id entri yang labelnya sedang diatur
  let newTag = $state('');

  // Templat bawaan, selalu tersedia dan tidak bisa dihapus.
  const BUILTIN = [
    { id: 'builtin-empty', title: 'Dokumen kosong', note: 'Kop, pengesah, dan bagian baku FILKOM', make: emptyDocument },
    { id: 'builtin-sample', title: 'SOP Skripsi', note: 'Contoh lengkap dengan keputusan dan beberapa pelaksana', make: sampleDocument }
  ];

  $effect(() => {
    if (open && !dialog.open) {
      query = '';
      tagEdit = null;
      dialog.showModal();
      refresh();
    } else if (!open && dialog.open) dialog.close();
  });

  async function refresh() {
    try {
      await flushAll();
      entries = (await listEntries()).map((e) => ({ ...e, tags: e.tags ?? [], text: haystack(e) }));
    } catch {
      entries = [];
      alert('Pustaka tidak bisa dibaca di browser ini (mode privat atau penyimpanan diblokir).');
    }
  }

  /** Teks yang dicari: nama, nomor, berkas, label, pelaksana, kegiatan, dan butir ketentuan. */
  function haystack(e) {
    const parts = [e.title, e.nomor, e.fileName, ...(e.tags ?? [])];
    try {
      const d = JSON.parse(e.json);
      parts.push(...d.actors.map((a) => a.name), ...d.steps.map((s) => plainText(s.kegiatan)));
      for (const s of Object.values(d.sections)) parts.push(...s.items.map((i) => plainText(i.text ?? i)));
    } catch {}
    return parts.filter((p) => typeof p === 'string').join('\n').toLowerCase();
  }

  const shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const byTag = (e) => tag === null || (tag === '' ? !e.tags.length : e.tags.includes(tag));
    return entries.filter((e) => e.kind === kind && byTag(e) && (!q || q.split(/\s+/).every((w) => e.text.includes(w))));
  });
  // Label pada jenis yang sedang ditampilkan beserta jumlahnya; daftar semua label untuk pengaturan label entri.
  const tagList = $derived.by(() => {
    const n = new Map();
    for (const e of entries) if (e.kind === kind) for (const t of e.tags) n.set(t, (n.get(t) ?? 0) + 1);
    return [...n].sort((a, b) => a[0].localeCompare(b[0], 'id'));
  });
  const untagged = $derived(entries.filter((e) => e.kind === kind && !e.tags.length).length);
  const allTags = $derived(cleanTags(entries.flatMap((e) => e.tags)));
  function setKind(k) {
    kind = k;
    tag = null;
    tagEdit = null;
  }
  const counts = $derived({
    doc: entries.filter((e) => e.kind === 'doc').length,
    template: entries.filter((e) => e.kind === 'template').length + BUILTIN.length
  });
  const builtins = $derived(
    kind === 'template' && tag === null ? BUILTIN.filter((b) => !query.trim() || b.title.toLowerCase().includes(query.trim().toLowerCase())) : []
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
    await putEntry({ fileName: null, created: now, updated: now, tags: [], ...entry, id: newTabId() });
    await refresh();
  }

  async function duplicate(e) {
    const d = JSON.parse(e.json);
    d.header.namaSop = (d.header.namaSop || 'SOP tanpa judul') + ' (salinan)';
    await add({ kind: 'doc', title: d.header.namaSop, nomor: d.header.nomor, json: JSON.stringify(d), tags: e.tags });
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
    const name = prompt('Nama label:', old)?.trim().replace(/\s+/g, ' ');
    if (!name || name === old) return;
    await mapTag(old, () => name);
    tag = allTags.find((t) => t.toLowerCase() === name.toLowerCase()) ?? null;
  }
  async function removeTag(old) {
    const n = entries.filter((e) => e.tags.includes(old)).length;
    if (!confirm(`Hapus label "${old}" dari ${n} entri? Dokumennya tidak ikut terhapus.`)) return;
    await mapTag(old, () => null);
    tag = null;
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

  // Label disimpan di pustaka.json dalam cadangan (berkas .sop sendiri tidak memuat label).
  const MANIFEST = 'pustaka.json';

  /** Cadangan semua entri sebagai berkas .sop di dalam satu .zip. */
  function backup() {
    const files = {};
    const used = new Set();
    const tags = {};
    for (const e of entries) {
      const dir = e.kind === 'template' ? 'Templat' : 'Dokumen';
      let name = `${dir}/${slug(titleOf(e))}`;
      for (let n = 2; used.has(name); n++) name = `${dir}/${slug(titleOf(e))}-${n}`;
      used.add(name);
      files[name + '.sop'] = strToU8(JSON.stringify(JSON.parse(e.json), null, 2));
      if (e.tags.length) tags[name + '.sop'] = e.tags;
    }
    if (Object.keys(tags).length) files[MANIFEST] = strToU8(JSON.stringify({ tags }, null, 2));
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    downloadBlob(new Blob([zipSync(files)], { type: 'application/zip' }), `Pustaka-SOP-${stamp}.zip`);
  }

  /** Memulihkan cadangan .zip (atau berkas .sop lepas) sebagai entri baru. */
  async function restore(files) {
    let ok = 0;
    let bad = 0;
    let same = 0;
    const known = new Map(entries.map((e) => [e.kind + e.json, e]));
    const take = async (path, text, loose, tags = []) => {
      try {
        const doc = parseDocumentText(text);
        const json = JSON.stringify(doc);
        const template = /^templat\//i.test(path);
        const key = (template ? 'template' : 'doc') + json;
        const old = known.get(key);
        if (old) {
          // Sudah ada: cukup gabungkan labelnya.
          if (old.id && tags.length) await patchEntry(old.id, { tags: cleanTags([...old.tags, ...tags]) });
          return same++;
        }
        known.set(key, {});
        const base = path.split('/').pop().replace(/\.(sop|json)$/i, '');
        await add({
          kind: template ? 'template' : 'doc',
          title: template ? base.replace(/-/g, ' ') : doc.header.namaSop,
          nomor: doc.header.nomor,
          fileName: loose ? path : null,
          json,
          tags: cleanTags(tags)
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
          let tags = {};
          try {
            if (zip[MANIFEST]) tags = JSON.parse(strFromU8(zip[MANIFEST])).tags ?? {};
          } catch {}
          for (const [path, data] of Object.entries(zip)) {
            if (path !== MANIFEST && /\.(sop|json)$/i.test(path)) await take(path, strFromU8(data), false, Array.isArray(tags[path]) ? tags[path] : []);
          }
        } catch {
          bad++;
        }
      } else await take(f.name, await f.text(), true);
    }
    await refresh();
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
      <button role="tab" aria-selected={kind === 'doc'} class:on={kind === 'doc'} onclick={() => setKind('doc')}>
        Dokumen <span>{counts.doc}</span>
      </button>
      <button role="tab" aria-selected={kind === 'template'} class:on={kind === 'template'} onclick={() => setKind('template')}>
        Templat <span>{counts.template}</span>
      </button>
    </div>
    <!-- svelte-ignore a11y_autofocus -->
    <input type="search" bind:value={query} placeholder="Cari nama, nomor, label, pelaksana, atau kegiatan…" autofocus />
  </div>

  {#if tagList.length || tag !== null}
    <div class="tagbar" role="group" aria-label="Saring menurut label">
      <button class:on={tag === null} aria-pressed={tag === null} onclick={() => (tag = null)}>Semua</button>
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
          {#if e.tags.length}
            <span class="tags">{#each e.tags as t (t)}<i>{t}</i>{/each}</span>
          {/if}
        </button>
        <span class="acts">
          <button
            class="btn small"
            class:on={tagEdit === e.id}
            aria-expanded={tagEdit === e.id}
            onclick={() => ((tagEdit = tagEdit === e.id ? null : e.id), (newTag = ''))}
            title="Atur label untuk mengelompokkan">Label</button
          >
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
              <button class="btn small" disabled={!newTag.trim()}>Tambah</button>
            </form>
          </div>
        {/if}
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
</style>
