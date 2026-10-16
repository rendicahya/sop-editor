<script>
  import { app } from '../store.svelte.js';
  import { uid } from '../model.js';

  const actors = $derived(app.doc.actors);

  function usage(id) {
    return app.doc.steps.filter((s) => s.actor === id).length;
  }

  function move(i, d) {
    const j = i + d;
    if (j < 0 || j >= actors.length) return;
    [actors[i], actors[j]] = [actors[j], actors[i]];
  }

  function remove(i) {
    if (actors.length <= 1) return;
    const id = actors[i].id;
    const n = usage(id);
    if (n && !confirm(`${n} langkah memakai pelaksana ini dan akan dipindahkan ke pelaksana lain. Lanjutkan?`)) return;
    actors.splice(i, 1);
    for (const s of app.doc.steps) if (s.actor === id) s.actor = actors[0].id;
  }
</script>

<section class="panel">
  <h2>Pelaksana (kolom diagram alir)</h2>
  <p class="hint">Urutan di sini menentukan urutan kolom pada tabel diagram alir.</p>
  {#each actors as a, i (a.id)}
    <div class="list-row">
      <span class="num">{i + 1}</span>
      <input bind:value={a.name} placeholder="Nama pelaksana" />
      <span class="badge" title="Jumlah langkah">{usage(a.id)}</span>
      <div class="row-actions">
        <button type="button" class="icon" title="Geser ke kiri" disabled={i === 0} onclick={() => move(i, -1)}>↑</button>
        <button type="button" class="icon" title="Geser ke kanan" disabled={i === actors.length - 1} onclick={() => move(i, 1)}>↓</button>
        <button type="button" class="icon danger" title="Hapus" disabled={actors.length <= 1} onclick={() => remove(i)}>✕</button>
      </div>
    </div>
  {/each}
  <div class="panel-foot">
    <button type="button" class="btn small" onclick={() => actors.push({ id: uid(), name: '' })}>+ Tambah pelaksana</button>
  </div>
</section>
