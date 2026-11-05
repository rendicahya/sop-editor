<script>
  import { newTabId } from './store.svelte.js';
  import { emptyDocument, sampleDocument, parseDocumentText } from './model.js';
  import { listEntries, putEntry, patchEntry, deleteEntry, cleanTags, haystack } from './library.js';

  /** openIds: id tab yang sedang terbuka (= id entri pustaka). */
  let { open = $bindable(false), openIds = [], active, onopen, ontemplate, onsave, cansave = true, onnotify } = $props();

  let dialog;
  let entries = $state([]);
  let kind = $state('doc');
  let query = $state('');
  let tag = $state(null); // saringan label: null = semua, '' = tanpa label
  let tagEdit = $state(null); // id entri yang labelnya sedang diatur
  let newTag = $state('');
  let picked = $state([]); // id entri yang dicentang untuk dihapus sekaligus

  // Templat bawaan, selalu tersedia dan tidak bisa dihapus.
  const BUILTIN = [
    { id: 'builtin-empty', title: 'Dokumen kosong', note: 'Kop, pengesah, dan bagian baku FILKOM', make: emptyDocument },
    { id: 'builtin-sample', title: 'SOP Skripsi', note: 'Contoh lengkap dengan keputusan dan beberapa pelaksana', make: sampleDocument }
  ];

  $effect(() => {
    if (open && !dialog.open) {
      query = '';
      tagEdit = null;
      picked = [];
      dialog.showModal();
      refresh();
    } else if (!open && dialog.open) dialog.close();
  });

  async function refresh() {
    try {
      entries = (await listEntries()).map((e) => ({ ...e, tags: e.tags ?? [], text: haystack(e) }));
    } catch {
      entries = [];
      alert('Pustaka Lokal tidak bisa dibaca di browser ini (mode privat atau penyimpanan diblokir).');
    }
  }

  const shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const byTag = (e) => tag === null || (tag === '' ? !e.tags.length : e.tags.includes(tag));
    return entries.filter((e) => e.kind === kind && byTag(e) && (!q || q.split(/\s+/).every((w) => e.text.includes(w))));
  });
  // Pilihan untuk hapus sekaligus: hanya entri yang tampil dan tidak sedang terbuka di tab.
  const deletable = $derived(shown.filter((e) => !openIds.includes(e.id)));
  const chosen = $derived(deletable.filter((e) => picked.includes(e.id)));
  const allChosen = $derived(deletable.length > 0 && chosen.length === deletable.length);
  function togglePick(id) {
    picked = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
  }
  function pickAll() {
    const ids = deletable.map((e) => e.id);
    picked = allChosen ? picked.filter((x) => !ids.includes(x)) : [...new Set([...picked, ...ids])];
  }
  async function removePicked() {
    const n = chosen.length;
    if (!n || !confirm(`Hapus ${n} ${kind === 'doc' ? 'dokumen' : 'templat'} terpilih dari pustaka? Tindakan ini tidak bisa dibatalkan.`)) return;
    for (const e of chosen) await deleteEntry(e.id);
    picked = [];
    await refresh();
    onnotify(`${n} ${kind === 'doc' ? 'dokumen' : 'templat'} dihapus`);
  }
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
    await add({ kind: 'doc', title: d.header.namaSop, nomor: d.header.nomor, json: JSON.stringify(d), tags: [...e.tags] });
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

  async function saveCurrent() {
    await onsave();
    setKind('doc');
    query = '';
    await refresh();
  }

  async function rename(e) {
    const name = prompt('Nama templat:', e.title);
    if (!name?.trim() || name.trim() === e.title) return;
    const { text, ...rest } = e;
    await putEntry({ ...$state.snapshot(rest), title: name.trim(), updated: Date.now() });
    await refresh();
  }

  async function remove(e) {
    if (!confirm(`Hapus "${titleOf(e)}" dari pustaka? Tindakan ini tidak bisa dibatalkan.`)) return;
    await deleteEntry(e.id);
    await refresh();
  }
</script>

<dialog bind:this={dialog} class="dialog" onclose={() => (open = false)}>
  <header>
    <h2>Pustaka Lokal</h2>
    <button class="x" onclick={() => (open = false)} aria-label="Tutup">×</button>
  </header>
  <p class="hint">
    SOP yang disimpan ke Pustaka Lokal berada di browser ini. Tekan Ctrl+S untuk menyimpan perubahannya. Data hilang bila data
    situs browser dihapus, jadi simpan juga SOP penting sebagai berkas .sop.
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

  {#if shown.length}
    <div class="selbar">
      <label>
        <input
          type="checkbox"
          checked={allChosen}
          indeterminate={chosen.length > 0 && !allChosen}
          disabled={!deletable.length}
          onchange={pickAll}
        />
        Pilih semua{deletable.length < shown.length ? ' (kecuali yang terbuka di tab)' : ''}
      </label>
      {#if chosen.length}
        <span>{chosen.length} dipilih</span>
        <button class="btn small danger" onclick={removePicked}>Hapus terpilih</button>
        <button class="link" onclick={() => (picked = [])}>Batal</button>
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
        <span class="acts"><button class="btn small primary" onclick={() => useTpl(b.make)}>Gunakan</button></span>
      </li>
    {/each}
    {#each shown as e (e.id)}
      {@const isOpen = openIds.includes(e.id)}
      <li class:current={e.id === active}>
        <input
          type="checkbox"
          class="pick"
          checked={!isOpen && picked.includes(e.id)}
          disabled={isOpen}
          onchange={() => togglePick(e.id)}
          aria-label={`Pilih ${titleOf(e)}`}
          title={isOpen ? 'Tutup tabnya dulu untuk menghapus' : 'Pilih untuk dihapus sekaligus'}
        />
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
            <button class="btn small primary" onclick={() => useTpl(() => parseDocumentText(e.json))}>Gunakan</button>
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
          {query.trim() ? 'Tidak ada yang cocok.' : kind === 'doc' ? 'Belum ada dokumen. SOP yang disimpan ke Pustaka Lokal akan muncul di sini.' : 'Belum ada templat buatan sendiri.'}
        </li>
      {/if}
    {/each}
  </ul>

  <footer>
    <button class="btn" onclick={saveCurrent} disabled={!cansave}>Simpan dokumen ini ke pustaka</button>
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
  .selbar {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-size: 0.82rem;
    color: var(--muted);
    min-height: 1.9rem;
  }
  .selbar label {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding-left: 0.6rem;
  }
  .selbar .link {
    border: 0;
    background: none;
    color: var(--accent);
    cursor: pointer;
    font-size: 0.8rem;
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
</style>
