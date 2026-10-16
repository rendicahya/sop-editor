<script>
  let { section, title, children } = $props();

  function move(i, d) {
    const j = i + d;
    if (j < 0 || j >= section.items.length) return;
    [section.items[i], section.items[j]] = [section.items[j], section.items[i]];
  }
</script>

<section class="panel">
  <div class="panel-head">
    <h2>{title}</h2>
    <label class="check">
      <input type="checkbox" bind:checked={section.numbered} /> Bernomor
    </label>
  </div>
  {#each section.items as _, i (i)}
    <div class="list-row">
      <span class="num">{section.numbered ? i + 1 : '•'}</span>
      <textarea rows="1" class="autogrow" bind:value={section.items[i]}></textarea>
      <div class="row-actions">
        <button type="button" class="icon" title="Naik" disabled={i === 0} onclick={() => move(i, -1)}>↑</button>
        <button type="button" class="icon" title="Turun" disabled={i === section.items.length - 1} onclick={() => move(i, 1)}>↓</button>
        <button type="button" class="icon danger" title="Hapus" onclick={() => section.items.splice(i, 1)}>✕</button>
      </div>
    </div>
  {:else}
    <p class="empty">Belum ada butir.</p>
  {/each}
  <div class="panel-foot">
    <button type="button" class="btn small" onclick={() => section.items.push('')}>+ Tambah butir</button>
    {@render children?.()}
  </div>
</section>
