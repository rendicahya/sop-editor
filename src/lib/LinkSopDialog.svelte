<script>
  import { tick } from 'svelte';
  import * as Faculty from './faculty.svelte.js';
  import { faculty } from './faculty.svelte.js';
  import Icon from './Icon.svelte';

  /** req: { current, exclude, resolve } selama dialog terbuka, selain itu null. */
  let { req = $bindable(null) } = $props();

  let dialog;
  let search = $state();
  let query = $state('');
  let sops = $state([]);
  let folders = $state(new Map());
  let status = $state('idle'); // idle | loading | ready | error
  let error = $state('');
  let chosen = $state(null);

  $effect(() => {
    if (req && !dialog.open) {
      query = '';
      chosen = req.current;
      dialog.showModal();
      load();
      tick().then(() => search?.focus());
    } else if (!req && dialog.open) dialog.close();
  });

  async function load() {
    if (faculty.status !== 'in') {
      status = 'error';
      error = 'Pustaka Daring tidak bisa dihubungi. Periksa koneksi internet, lalu coba lagi.';
      return;
    }
    status = 'loading';
    try {
      const [{ live }, fs] = await Promise.all([Faculty.listSops(), Faculty.listFolders()]);
      sops = live.filter((s) => s.id !== req?.exclude);
      folders = new Map(fs.map((f) => [f.id, f.name]));
      status = 'ready';
    } catch (e) {
      status = 'error';
      error = e.message;
    }
  }

  const norm = (s) => String(s ?? '').toLowerCase();
  const shown = $derived.by(() => {
    const words = norm(query).split(/\s+/).filter(Boolean);
    return sops
      .filter((s) => words.every((w) => norm(`${s.title} ${s.nomor}`).includes(w)))
      .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'id'));
  });

  function finish(sop) {
    const r = req;
    req = null;
    r?.resolve(sop);
  }
  const confirm = () => finish(sops.find((s) => s.id === chosen) ?? null);

  function onKey(e) {
    if (!['ArrowDown', 'ArrowUp'].includes(e.key) || !shown.length) return;
    e.preventDefault();
    const i = shown.findIndex((s) => s.id === chosen);
    const j = Math.max(0, Math.min(shown.length - 1, i < 0 ? 0 : i + (e.key === 'ArrowDown' ? 1 : -1)));
    chosen = shown[j].id;
    tick().then(() => dialog.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }));
  }
</script>

<dialog bind:this={dialog} class="dialog" oncancel={(e) => (e.preventDefault(), finish(null))}>
  {#if req}
    <form onsubmit={(e) => (e.preventDefault(), confirm())}>
      <h2>Tautkan ke SOP lain</h2>
      <p class="hint">Pilih SOP di Pustaka Daring yang terkait. Tautan hanya berlaku di aplikasi ini; hasil cetak tetap berisi teks butirnya saja.</p>
      <input bind:this={search} bind:value={query} type="search" placeholder="Cari nama atau nomor SOP…" onkeydown={onKey} aria-label="Cari SOP" />
      <div class="list" role="listbox" aria-label="SOP di Pustaka Daring">
        {#if status === 'loading'}
          <p class="note">Memuat daftar SOP…</p>
        {:else if status === 'error'}
          <p class="note err">{error}</p>
        {:else if !shown.length}
          <p class="note">{sops.length ? 'Tidak ada SOP yang cocok.' : 'Belum ada SOP lain yang bisa Anda lihat di Pustaka Daring.'}</p>
        {:else}
          {#each shown as s (s.id)}
            <button
              type="button"
              role="option"
              aria-selected={chosen === s.id}
              onclick={() => (chosen = s.id)}
              ondblclick={() => finish(s)}
            >
              <Icon name="file" size={15} />
              <span class="t">
                <b>{s.title || 'SOP tanpa judul'}</b>
                <small>{[s.nomor, s.folder ? folders.get(s.folder) : '', s.createdByName].filter(Boolean).join(' · ')}</small>
              </span>
              {#if req.current === s.id}<span class="tag">Tertaut</span>{/if}
            </button>
          {/each}
        {/if}
      </div>
      <footer>
        <button type="button" class="btn" onclick={() => finish(null)}>Batal</button>
        <button class="btn primary" disabled={!chosen || !sops.some((s) => s.id === chosen)}><Icon name="link" size={15} />Tautkan</button>
      </footer>
    </form>
  {/if}
</dialog>

<style>
  .dialog {
    width: min(560px, calc(100vw - 2rem));
    border: 0;
    border-radius: 14px;
    padding: 1.1rem 1.2rem;
    box-shadow: 0 20px 50px rgb(0 0 0 / 0.25);
    background: var(--surface);
    color: var(--text);
  }
  .dialog::backdrop {
    background: rgb(15 23 42 / 0.45);
  }
  h2 {
    margin: 0 0 0.35rem;
    font-size: 1.05rem;
  }
  .hint {
    margin: 0 0 0.75rem;
    font-size: 0.83rem;
    line-height: 1.45;
    color: var(--muted);
  }
  input {
    width: 100%;
    box-sizing: border-box;
  }
  .list {
    margin: 0.6rem 0 0.9rem;
    height: min(340px, 50vh);
    overflow: auto;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 0.25rem;
  }
  [role='option'] {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    width: 100%;
    border: 0;
    border-radius: 7px;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    padding: 0.4rem 0.55rem;
    cursor: pointer;
  }
  [role='option']:hover {
    background: var(--surface-2);
  }
  [role='option'][aria-selected='true'] {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .t {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .t b {
    font-weight: 600;
    font-size: 0.88rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .t small {
    color: var(--muted);
    font-size: 0.76rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tag {
    font-size: 0.72rem;
    font-weight: 600;
    padding: 0.05rem 0.45rem;
    border-radius: 99px;
    background: var(--accent);
    color: var(--surface);
  }
  .note {
    margin: 1rem;
    color: var(--muted);
    font-size: 0.85rem;
    text-align: center;
  }
  .note.err {
    color: var(--danger);
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.4rem;
  }
</style>
