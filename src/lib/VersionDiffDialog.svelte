<script>
  import { parseDocumentText } from './model.js';
  import { diffDocs } from './diff.js';
  import { dismiss } from './dismiss.js';

  /**
   * Membandingkan dua isi SOP. sources: [{ key, label, json }] dari yang terbaru; left/right: key awal
   * (lama dan baru). title: nama SOP untuk judul dialog.
   */
  let { open = $bindable(false), title = '', sources = [], left = $bindable(''), right = $bindable(''), onclose } = $props();

  let dialog;
  let showSame = $state(false);

  $effect(() => {
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });

  const parsed = new Map();
  function docOf(k) {
    const src = sources.find((s) => s.key === k);
    if (!src) return null;
    if (!parsed.has(src.json)) {
      try {
        parsed.set(src.json, parseDocumentText(src.json));
      } catch {
        parsed.set(src.json, null);
      }
    }
    return parsed.get(src.json);
  }

  const result = $derived.by(() => {
    if (!open) return null;
    const [a, b] = [docOf(left), docOf(right)];
    if (!a || !b) return { error: 'Salah satu versi rusak dan tidak bisa dibandingkan.' };
    return diffDocs(a, b);
  });
  const OP = { add: 'Ditambah', del: 'Dihapus', mod: 'Diubah' };
  const swap = () => ([left, right] = [right, left]);
</script>

{#snippet segs(list)}
  {#each list as s, i (i)}<span class={s.op}>{s.text}</span>{/each}
{/snippet}

<dialog bind:this={dialog} class="dialog" use:dismiss onclose={() => ((open = false), onclose?.())}>
  {#if open}
    <header>
      <div>
        <h2>Bandingkan versi</h2>
        <small>{title}</small>
      </div>
      <button type="button" class="btn" onclick={() => (open = false)}>Tutup</button>
    </header>
    <div class="pick">
      <label>
        <span>Lama</span>
        <select bind:value={left} aria-label="Versi lama">
          {#each sources as s (s.key)}<option value={s.key}>{s.label}</option>{/each}
        </select>
      </label>
      <button type="button" class="btn ghost" onclick={swap} title="Tukar kiri dan kanan">⇄</button>
      <label>
        <span>Baru</span>
        <select bind:value={right} aria-label="Versi baru">
          {#each sources as s (s.key)}<option value={s.key}>{s.label}</option>{/each}
        </select>
      </label>
      <label class="same"><input type="checkbox" bind:checked={showSame} /> Tampilkan yang tidak berubah</label>
    </div>
    <div class="body">
      {#if result?.error}
        <p class="empty">{result.error}</p>
      {:else if result}
        <p class="summary">
          {#if left === right}Kedua pilihan sama.{:else if !result.count}Tidak ada perbedaan isi.{:else}{result.count} perubahan.
            <span class="legend"><span class="add">teks baru</span> <span class="del">teks dihapus</span></span>{/if}
        </p>

        {#if result.header.length}
          <section>
            <h3>Identitas SOP</h3>
            <table>
              <tbody>
                {#each result.header as h (h.label)}
                  <tr>
                    <th>{h.label}</th>
                    <td>{#if h.segs}{@render segs(h.segs)}{:else}<span class="del">{h.old || '—'}</span> → <span class="add">{h.new || '—'}</span>{/if}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </section>
        {/if}

        {#each result.sections as sec (sec.title)}
          {#if sec.changes || (showSame && sec.items.length)}
            <section>
              <h3>{sec.title}{#if sec.changes}<em>{sec.changes} perubahan</em>{/if}</h3>
              <ul class="items">
                {#each sec.items as it, i (i)}
                  {#if showSame || it.op !== 'same'}
                    <li class={it.op}>
                      <span class="n">{it.n}.</span>
                      <span>{#if it.segs}{@render segs(it.segs)}{:else}{it.text || '(kosong)'}{/if}</span>
                      {#if it.op !== 'same'}<span class="tag">{OP[it.op]}</span>{/if}
                    </li>
                  {/if}
                {/each}
              </ul>
            </section>
          {/if}
        {/each}

        {#if result.actors.some((x) => x.op !== 'same')}
          <section>
            <h3>Pelaksana</h3>
            <ul class="items">
              {#each result.actors as x, i (i)}
                {#if showSame || x.op !== 'same'}
                  <li class={x.op}>
                    <span>{#if x.segs}{@render segs(x.segs)}{:else}{x.name || '(tanpa nama)'}{/if}</span>
                    {#if x.op !== 'same'}<span class="tag">{OP[x.op]}</span>{/if}
                  </li>
                {/if}
              {/each}
            </ul>
          </section>
        {/if}

        {#if result.steps.some((s) => s.op !== 'same')}
          <section>
            <h3>Kegiatan</h3>
            <ul class="steps">
              {#each result.steps as s, i (i)}
                {#if showSame || s.op !== 'same'}
                  <li class={s.op}>
                    <div class="shead">
                      <strong>{s.op === 'del' ? `Langkah lama ${s.n}` : `Langkah ${s.n}`}</strong>
                      <span class="k">{s.kegiatan || '(kegiatan kosong)'}</span>
                      {#if s.from}<span class="tag">Dipindah dari langkah {s.from}</span>{/if}
                      {#if s.op !== 'same'}<span class="tag">{OP[s.op]}</span>{/if}
                    </div>
                    {#if s.pelaksana}<small class="muted">Pelaksana: {s.pelaksana}</small>{/if}
                    {#if s.fields?.length}
                      <table>
                        <tbody>
                          {#each s.fields as f (f.label)}
                            <tr>
                              <th>{f.label}</th>
                              <td>{#if f.swap}<span class="del">{f.segs[0].text}</span> → <span class="add">{f.segs[1].text}</span>{:else}{@render segs(f.segs)}{/if}</td>
                            </tr>
                          {/each}
                        </tbody>
                      </table>
                    {/if}
                  </li>
                {/if}
              {/each}
            </ul>
          </section>
        {/if}

        {#if result.links.length}
          <section>
            <h3>Tautan Keterkaitan</h3>
            <ul class="items">
              {#each result.links as l, i (i)}
                <li class={l.op}><span>{l.text}</span><span class="tag">{OP[l.op]}</span></li>
              {/each}
            </ul>
          </section>
        {/if}
        <p class="note">Posisi garis alur yang diatur manual dan format huruf (tebal, miring) tidak ikut dibandingkan.</p>
      {/if}
    </div>
  {/if}
</dialog>

<style>
  .dialog {
    width: min(960px, calc(100vw - 2rem));
    height: calc(100dvh - 2rem);
    max-height: none;
    border: 0;
    border-radius: 14px;
    padding: 0;
    box-shadow: 0 20px 50px rgb(0 0 0 / 0.25);
    background: var(--surface);
    color: var(--text);
    overflow: hidden;
  }
  .dialog[open] {
    display: flex;
    flex-direction: column;
  }
  .dialog::backdrop {
    background: rgb(15 23 42 / 0.5);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--line);
  }
  h2 {
    margin: 0;
    font-size: 1.05rem;
  }
  header small,
  .muted {
    color: var(--muted);
    font-size: 0.8rem;
  }
  .pick {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
    padding: 0.55rem 1rem;
    border-bottom: 1px solid var(--line);
    font-size: 0.85rem;
  }
  .pick label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--muted);
  }
  .pick select {
    width: auto;
    max-width: min(22rem, 70vw);
  }
  .pick .same {
    margin-left: auto;
  }
  .body {
    flex: 1;
    overflow: auto;
    padding: 0.75rem 1rem 1rem;
  }
  .summary {
    margin: 0 0 0.75rem;
    font-size: 0.9rem;
  }
  .legend {
    margin-left: 0.5rem;
    font-size: 0.78rem;
  }
  section {
    margin-bottom: 1rem;
  }
  h3 {
    margin: 0 0 0.4rem;
    font-size: 0.85rem;
    letter-spacing: 0.02em;
  }
  h3 em {
    margin-left: 0.5rem;
    font-style: normal;
    font-weight: 400;
    color: var(--muted);
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 0.85rem;
  }
  th,
  td {
    text-align: left;
    vertical-align: top;
    padding: 0.25rem 0.5rem;
    border-bottom: 1px solid var(--line);
  }
  th {
    width: 11rem;
    font-weight: 600;
    color: var(--muted);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.3rem;
  }
  .items li {
    display: flex;
    gap: 0.4rem;
    align-items: baseline;
    font-size: 0.86rem;
    padding: 0.3rem 0.5rem;
    border-radius: 6px;
    border-left: 4px solid var(--line);
    background: var(--surface-2);
  }
  .items li > span:nth-last-child(2),
  .items li > span:only-child {
    flex: 1;
  }
  .n {
    color: var(--muted);
    min-width: 1.5rem;
  }
  .steps li {
    padding: 0.45rem 0.6rem;
    border-radius: 8px;
    border-left: 4px solid var(--line);
    background: var(--surface-2);
    display: grid;
    gap: 0.25rem;
  }
  .shead {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.5rem;
    align-items: baseline;
    font-size: 0.88rem;
  }
  .shead .k {
    flex: 1;
  }
  li.add {
    border-left-color: #16a34a;
  }
  li.del {
    border-left-color: #dc2626;
  }
  li.mod {
    border-left-color: #d98e04;
  }
  li.del > span:not(.tag):not(.n),
  li.del .k {
    text-decoration: line-through;
    color: var(--muted);
  }
  .tag {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--muted);
    white-space: nowrap;
  }
  span.add {
    background: rgb(22 163 74 / 0.18);
    border-radius: 3px;
  }
  span.del {
    background: rgb(220 38 38 / 0.15);
    text-decoration: line-through;
    border-radius: 3px;
    margin-right: 2px;
  }
  .empty,
  .note {
    color: var(--muted);
    font-size: 0.8rem;
  }
</style>
