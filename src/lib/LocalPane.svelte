<script>
  import { newTabId } from './store.svelte.js';
  import * as ui from './ask.svelte.js';
  import Icon from './Icon.svelte';
  import { listEntries, putEntry, patchEntry, deleteEntry, cleanTags, haystack } from './library.js';
  import { librarySort, sorted } from './librarySort.svelte.js';
  import SortSelect from './SortSelect.svelte';
  import { readSopFiles } from './sopFiles.js';
  import { sopZip, sopText, safeName } from './sopZip.js';
  import { registerXlsx } from './register.js';
  import { downloadBlob } from './files.js';
  import { formatTanggal, todayIso } from './model.js';
  import { review, reviewSince, reviewDue, isReviewDue } from './review.svelte.js';

  /**
   * openIds: id tab yang sedang terbuka (= id entri pustaka), current: id tab aktif.
   * Panel di dialog Pustaka: open = dialognya terbuka, active = tab Lokal yang tampil, tabs = pemilih tab di kepala panel,
   * onclose() menutup dialog. onbook(entries, title): menggabungkan entri menjadi satu PDF.
   */
  let { open = false, active = false, tabs, onclose, openIds = [], current, onopen, onsave, cansave = true, onnotify, onbook } = $props();

  let entries = $state([]);
  let query = $state('');
  let tag = $state(null); // saringan label: null = semua, '' = tanpa label
  let tagEdit = $state(null); // id entri yang labelnya sedang diatur
  let newTag = $state('');
  let picked = $state([]); // id entri yang dicentang untuk tindakan sekaligus
  let due = $state(false); // hanya yang perlu ditinjau

  // Tiap kali dialog dibuka, pencarian dan pilihan dikosongkan.
  let wasOpen = false;
  $effect(() => {
    if (open && !wasOpen) {
      query = '';
      tagEdit = null;
      picked = [];
      due = false;
    }
    wasOpen = open;
  });
  // Dibaca ulang tiap kali tab Lokal tampil: isinya di browser ini, murah dibaca, dan bisa berubah dari tab Daring.
  $effect(() => {
    if (open && active) refresh();
  });

  async function refresh() {
    try {
      entries = (await listEntries()).map((e) => {
        let header = {};
        try {
          header = JSON.parse(e.json).header ?? {};
        } catch {}
        const dates = { tglPembuatan: header.tglPembuatan ?? '', tglRevisi: header.tglRevisi ?? '', tglEfektif: header.tglEfektif ?? '' };
        return { ...e, tags: e.tags ?? [], text: haystack(e), since: reviewSince(header), dates };
      });
    } catch {
      entries = [];
      ui.alert('Pustaka Lokal tidak bisa dibaca di browser ini (mode privat atau penyimpanan diblokir).');
    }
  }

  const shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const byTag = (e) => tag === null || (tag === '' ? !e.tags.length : e.tags.includes(tag));
    const found = entries.filter((e) => byTag(e) && (!due || isDue(e)) && (!q || q.split(/\s+/).every((w) => e.text.includes(w))));
    return sorted(found, librarySort.by, titleOf, (e) => e.updated ?? 0);
  });
  const isDue = (e) => isReviewDue(e.since, review.years);
  const dueCount = $derived(entries.filter(isDue).length);
  // Pilihan: entri yang tampil. Yang sedang terbuka di tab boleh dipilih (untuk PDF/ZIP), tetapi tidak ikut dihapus.
  const chosen = $derived(shown.filter((e) => picked.includes(e.id)));
  const deletable = $derived(chosen.filter((e) => !openIds.includes(e.id)));
  const allChosen = $derived(shown.length > 0 && chosen.length === shown.length);
  function togglePick(id) {
    picked = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
  }
  function pickAll() {
    picked = allChosen ? [] : shown.map((e) => e.id);
  }
  async function removePicked() {
    const n = deletable.length;
    const skipped = chosen.length - n;
    const note = skipped ? ` ${skipped} dokumen yang terbuka di tab tidak ikut dihapus.` : '';
    if (!n || !(await ui.confirm(`Hapus ${n} dokumen terpilih dari pustaka? Tindakan ini tidak bisa dibatalkan.${note}`, { ok: 'Hapus', danger: true }))) return;
    for (const e of deletable) await deleteEntry(e.id);
    picked = [];
    await refresh();
    onnotify(`${n} dokumen dihapus`);
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
  function downloadZip(list, name) {
    if (!list.length) return ui.alert('Tidak ada SOP untuk diunduh.', { title: 'Unduh ZIP' });
    try {
      downloadBlob(sopZip(list.map((e) => ({ dirs: [], name: titleOf(e), json: e.json, mtime: e.updated }))), `${name}-${todayIso()}.zip`);
      onnotify(`${list.length} SOP diunduh dalam berkas ZIP`);
    } catch (err) {
      ui.alert('ZIP gagal dibuat: ' + err.message, { title: 'Unduh ZIP' });
    }
  }
  const downloadSop = (e) => downloadBlob(new Blob([sopText(e.json)], { type: 'application/json' }), `${safeName(e.fileName?.replace(/\.(sop|json)$/i, '') || titleOf(e))}.sop`);
  const filtered = $derived(!!query.trim() || tag !== null || due);
  function exportRegister() {
    const list = sorted(shown, 'name-asc', titleOf, (e) => e.updated ?? 0);
    if (!list.length) return ui.alert('Tidak ada SOP untuk dimasukkan ke daftar induk.', { title: 'Daftar induk SOP' });
    const date = (v) => (v ? formatTanggal(v) : '');
    const stamp = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
    const columns = [
      { label: 'No.', width: 5 },
      { label: 'Nama SOP', width: 42 },
      { label: 'Nomor SOP', width: 26 },
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
      e.tags.join(', '),
      date(e.dates.tglPembuatan),
      date(e.dates.tglRevisi),
      date(e.dates.tglEfektif),
      date(reviewDue(e.since)),
      !e.since ? 'Tanggal belum diisi' : isDue(e) ? 'Perlu ditinjau' : 'Berlaku',
      new Date(e.updated).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }),
      e.fileName ?? ''
    ]);
    const blob = registerXlsx({
      title: 'Daftar Induk SOP',
      note: `${filtered ? 'Hasil pencarian atau saringan' : 'Seluruh Pustaka Lokal'} · ${list.length} SOP · diunduh ${stamp}`,
      columns,
      rows
    });
    downloadBlob(blob, `Daftar-Induk-SOP-${todayIso()}.xlsx`);
    onnotify(`Daftar induk ${list.length} SOP diunduh`);
  }

  // ---- Impor berkas .sop/.zip dari komputer (tombol atau seret-lepas) ----
  let importing = $state(false);
  let dropping = $state(false);
  let picker;
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
    const msg = [
      `Masukkan ${items.length} SOP ke Pustaka Lokal?`,
      tag && `SOP yang diimpor diberi label "${tag}".`,
      items.some((i) => i.dirs.length) && 'Nama folder di dalam ZIP dijadikan label.',
      bad.length && `${bad.length} berkas dilewati karena bukan dokumen SOP yang valid.`,
      other && `${other} berkas lain (bukan .sop) diabaikan.`
    ].filter(Boolean).join('\n\n');
    if (!(await ui.confirm(msg, { title: 'Impor ke Pustaka Lokal', ok: 'Impor' }))) return;
    importing = true;
    let n = 0;
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
          tags: cleanTags([...(tag ? [tag] : []), ...it.dirs])
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
    if (!hasFiles(ev)) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.dataTransfer.dropEffect = importing ? 'none' : 'copy';
    dropping = !importing;
  }
  function dragLeave(ev) {
    if (!ev.currentTarget.contains(ev.relatedTarget)) dropping = false;
  }
  function drop(ev) {
    if (!hasFiles(ev)) return;
    ev.preventDefault();
    ev.stopPropagation();
    dropping = false;
    if (!importing) importFiles([...ev.dataTransfer.files]);
  }
  // Label beserta jumlah entrinya; allTags untuk pengaturan label entri.
  const tagList = $derived.by(() => {
    const n = new Map();
    for (const e of entries) for (const t of e.tags) n.set(t, (n.get(t) ?? 0) + 1);
    return [...n].sort((a, b) => a[0].localeCompare(b[0], 'id'));
  });
  const untagged = $derived(entries.filter((e) => !e.tags.length).length);
  const allTags = $derived(cleanTags(entries.flatMap((e) => e.tags)));

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
    await putEntry({ id: newTabId(), title: d.header.namaSop, nomor: d.header.nomor, fileName: null, created: now, updated: now, json: JSON.stringify(d), tags: [...e.tags] });
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
    const n = entries.filter((e) => e.tags.includes(old)).length;
    if (!(await ui.confirm(`Hapus label "${old}" dari ${n} entri? Dokumennya tidak ikut terhapus.`, { ok: 'Hapus label', danger: true }))) return;
    await mapTag(old, () => null);
    tag = null;
  }

  async function saveCurrent() {
    await onsave();
    tag = null;
    tagEdit = null;
    query = '';
    await refresh();
  }

  async function remove(e) {
    if (!(await ui.confirm(`Hapus "${titleOf(e)}" dari pustaka? Tindakan ini tidak bisa dibatalkan.`, { ok: 'Hapus', danger: true }))) return;
    await deleteEntry(e.id);
    await refresh();
  }
</script>

  <header>
    {@render tabs()}
    <input class="search" type="search" bind:value={query} placeholder="Cari nama, nomor, label, pelaksana, atau kegiatan…" />
    <button class="ib x" onclick={onclose} aria-label="Tutup" data-tip="Tutup"><Icon name="x" /></button>
  </header>
  <p class="hint">
    SOP di Pustaka Lokal tersimpan di browser ini. Tekan Ctrl+S untuk menyimpan perubahannya. Data hilang bila data situs
    browser dihapus, jadi sesekali unduh cadangannya (tombol unduh ZIP di bawah).
  </p>

  {#if tagList.length || tag !== null || dueCount || due}
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

  <div class="selbar" class:some={chosen.length > 0}>
    {#if shown.length}
      <label title={allChosen ? 'Batal pilih' : 'Pilih semua'}>
        <input type="checkbox" class="pick" checked={allChosen} indeterminate={chosen.length > 0 && !allChosen} onchange={pickAll} />
        {#if chosen.length}<strong>{chosen.length} dipilih</strong>{:else}Pilih semua{/if}
      </label>
    {/if}
    {#if chosen.length}
      <button class="btn small" onclick={() => makeBook(chosen)} title="Gabungkan SOP yang dipilih menjadi satu PDF berdaftar isi"><Icon name="book" size={14} />Gabung PDF</button>
      <button class="btn small" onclick={() => downloadZip(chosen, 'SOP-terpilih')} title="Unduh SOP yang dipilih sebagai berkas .sop dalam ZIP"><Icon name="download" size={14} />Unduh ZIP</button>
      <button
        class="btn small danger"
        onclick={removePicked}
        disabled={!deletable.length}
        title={deletable.length < chosen.length ? 'SOP yang terbuka di tab tidak ikut dihapus' : 'Hapus dari pustaka'}><Icon name="trash" size={14} />Hapus{deletable.length < chosen.length ? ` (${deletable.length})` : ''}</button
      >
    {/if}
    <span class="grow"></span>
    <button class="ib" onclick={() => ((picker.value = ''), picker.click())} disabled={importing} aria-label="Impor berkas .sop atau .zip" data-tip="Impor berkas .sop atau .zip (bisa juga dilepas di daftar)"><Icon name="upload" size={16} /></button>
    <button class="ib" onclick={exportRegister} disabled={!shown.length} aria-label="Unduh daftar induk SOP (XLSX)" data-tip={filtered ? 'Unduh daftar induk SOP (XLSX) dari hasil yang tampil' : 'Unduh daftar induk SOP (XLSX)'}><Icon name="table" size={16} /></button>
    <button class="ib" onclick={() => downloadZip(shown, filtered ? 'Hasil-pencarian-SOP' : 'Pustaka-Lokal')} disabled={!shown.length} aria-label="Unduh cadangan (ZIP)" data-tip={filtered ? 'Unduh cadangan (ZIP) hasil yang tampil' : 'Unduh cadangan (ZIP) seluruh Pustaka Lokal'}><Icon name="download" size={16} /></button>
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
    {#each shown as e (e.id)}
      {@const isOpen = openIds.includes(e.id)}
      <li class:current={e.id === current}>
        <input type="checkbox" class="pick" checked={picked.includes(e.id)} onchange={() => togglePick(e.id)} aria-label={`Pilih ${titleOf(e)}`} />
        <button class="main" onclick={() => pick(e)}>
          <strong>
            {titleOf(e)}
            {#if e.id === current}<em>sedang dibuka</em>{:else if isOpen}<em>terbuka di tab</em>{/if}
            {#if isDue(e)}<em class="due" title={`Berlaku sejak ${formatTanggal(e.since)}, lebih dari ${review.years} tahun`}>Perlu ditinjau</em>{/if}
          </strong>
          <small>
            {[e.nomor, e.fileName, 'diubah ' + ago(e.updated)].filter(Boolean).join(' · ')}
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
          <button class="btn small" onclick={() => duplicate(e)} title="Buat salinan di pustaka"><Icon name="copy" size={14} />Duplikat</button>
          <button class="btn small" onclick={() => downloadSop(e)} title="Unduh sebagai berkas .sop" aria-label={`Unduh ${titleOf(e)} sebagai berkas .sop`}><Icon name="download" size={14} /></button>
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
              <button class="btn small" disabled={!newTag.trim()}><Icon name="plus" size={14} />Tambah</button>
            </form>
          </div>
        {/if}
      </li>
    {:else}
      <li class="empty">
        {query.trim() || due || tag !== null
          ? 'Tidak ada yang cocok.'
          : 'Belum ada dokumen. SOP yang disimpan ke Pustaka Lokal akan muncul di sini, atau lepaskan berkas .sop/.zip di sini untuk mengimpornya.'}
      </li>
    {/each}
  </ul>

  <footer>
    <button class="btn" onclick={saveCurrent} disabled={!cansave}><Icon name="save" size={15} />Simpan dokumen ini ke pustaka</button>
  </footer>

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
  .hint {
    margin: 0 0 0.6rem;
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
  .selbar {
    flex-wrap: wrap;
    gap: 0.4rem;
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
</style>
