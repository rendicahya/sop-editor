<script>
  import { app } from '../store.svelte.js';
  import { newStep, removeStep, SHAPES } from '../model.js';
  import { collab } from '../collab.svelte.js';

  const steps = $derived(app.doc.steps);
  const actors = $derived(app.doc.actors);

  const short = (s, i) => `${i + 1}. ${s.kegiatan.length > 40 ? s.kegiatan.slice(0, 40) + '…' : s.kegiatan || '(tanpa nama)'}`;

  function move(i, d) {
    const j = i + d;
    if (j < 0 || j >= steps.length) return;
    [steps[i], steps[j]] = [steps[j], steps[i]];
  }

  function insertAfter(i) {
    const ref = steps[i];
    steps.splice(i + 1, 0, newStep(ref?.actor ?? actors[0].id));
  }

  function duplicate(i) {
    const copy = { ...$state.snapshot(steps[i]), id: newStep(actors[0].id).id, next: 'auto', alt: null };
    steps.splice(i + 1, 0, copy);
  }

  const remove = (i) => removeStep(steps, i);
</script>

<section class="panel">
  <h2>Langkah Kegiatan</h2>
  <p class="hint">
    Setiap langkah menjadi satu baris pada diagram alir. Secara bawaan alur berlanjut ke langkah berikutnya; untuk
    <b>Keputusan</b>, tentukan juga ke mana alur kembali bila hasilnya tidak terpenuhi.
  </p>
</section>

{#each steps as s, i (s.id)}
  {@const editing = collab.peers.filter((p) => p.focus?.step === s.id)}
  <article class="panel step" data-step={s.id} class:shared={editing.length} style:--peer={editing[0]?.color}>
    {#if editing.length}
      <div class="editing">
        {#each editing as p (p.id)}<span style:background={p.color}>{p.name}</span>{/each}
      </div>
    {/if}
    <header class="step-head">
      <span class="step-no">{i + 1}</span>
      <input class="grow strong" bind:value={s.kegiatan} placeholder="Nama kegiatan" aria-label="Kegiatan" />
      <div class="row-actions">
        <button type="button" class="icon" title="Naik" disabled={i === 0} onclick={() => move(i, -1)}>↑</button>
        <button type="button" class="icon" title="Turun" disabled={i === steps.length - 1} onclick={() => move(i, 1)}>↓</button>
        <button type="button" class="icon" title="Duplikat" onclick={() => duplicate(i)}>⧉</button>
        <button type="button" class="icon danger" title="Hapus" onclick={() => remove(i)}>✕</button>
      </div>
    </header>

    <div class="grid2">
      <label class="field">
        <span class="label">Pelaksana</span>
        <select bind:value={s.actor}>
          {#each actors as a (a.id)}<option value={a.id}>{a.name || '(tanpa nama)'}</option>{/each}
        </select>
      </label>
      <label class="field">
        <span class="label">Simbol</span>
        <select bind:value={s.shape}>
          {#each SHAPES as sh (sh.value)}<option value={sh.value}>{sh.label}</option>{/each}
        </select>
      </label>
    </div>

    <div class="grid3">
      <label class="field">
        <span class="label">Kelengkapan</span>
        <input bind:value={s.kelengkapan} />
      </label>
      <label class="field">
        <span class="label">Waktu</span>
        <input bind:value={s.waktu} />
      </label>
      <label class="field">
        <span class="label">Output</span>
        <input bind:value={s.output} />
      </label>
    </div>

    <label class="field">
      <span class="label">Keterangan</span>
      <textarea rows="2" class="autogrow" bind:value={s.keterangan}></textarea>
    </label>

    <div class="flow">
      <label class="field">
        <span class="label">{s.shape === 'decision' ? 'Jika ya, lanjut ke' : 'Lanjut ke'}</span>
        <select bind:value={s.next}>
          <option value="auto">Langkah berikutnya{i + 1 < steps.length ? ` (${i + 2})` : ' (tidak ada)'}</option>
          <option value="none">Tidak ada (akhir alur)</option>
          {#each steps as t, j (t.id)}
            {#if j !== i}<option value={t.id}>{short(t, j)}</option>{/if}
          {/each}
        </select>
      </label>
      {#if s.shape === 'decision'}
        <label class="field">
          <span class="label">Label ya</span>
          <input bind:value={s.yesLabel} />
        </label>
        <label class="field">
          <span class="label">Jika tidak, kembali/lanjut ke</span>
          <select bind:value={s.alt}>
            <option value={null}>—</option>
            {#each steps as t, j (t.id)}
              {#if j !== i}<option value={t.id}>{short(t, j)}</option>{/if}
            {/each}
          </select>
        </label>
        <label class="field">
          <span class="label">Label tidak</span>
          <input bind:value={s.noLabel} />
        </label>
      {/if}
    </div>
  </article>
  <div class="insert">
    <button type="button" class="btn small ghost" onclick={() => insertAfter(i)}>+ Sisipkan langkah</button>
  </div>
{:else}
  <div class="panel">
    <p class="empty">Belum ada langkah.</p>
    <button type="button" class="btn small" onclick={() => insertAfter(-1)}>+ Tambah langkah</button>
  </div>
{/each}

<style>
  .step {
    position: relative;
  }
  .step.shared {
    border-color: var(--peer);
    box-shadow: 0 0 0 1px var(--peer);
  }
  .editing {
    position: absolute;
    top: -0.65rem;
    right: 0.8rem;
    display: flex;
    gap: 0.25rem;
  }
  .editing span {
    color: #fff;
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.05rem 0.45rem;
    border-radius: 99px;
  }
  .step-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.6rem;
  }
  .step-no {
    flex: none;
    width: 1.9rem;
    height: 1.9rem;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--accent);
    color: #fff;
    font-weight: 600;
    font-size: 0.85rem;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .strong {
    font-weight: 600;
  }
  .flow {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 0 0.6rem;
    padding: 0.6rem 0.6rem 0;
    margin-top: 0.2rem;
    border-radius: 8px;
    background: var(--surface-2);
  }
  .insert {
    display: flex;
    justify-content: center;
    margin: -0.35rem 0 0.4rem;
  }
  @media (max-width: 520px) {
    .flow {
      grid-template-columns: 1fr;
    }
  }
</style>
