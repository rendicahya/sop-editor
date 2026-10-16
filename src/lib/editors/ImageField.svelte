<script>
  import { readImage } from '../files.js';

  let { label, value = $bindable(null), hint = '' } = $props();
  let error = $state('');

  async function pick(e) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    error = '';
    try {
      value = await readImage(file);
    } catch (err) {
      error = err.message;
    }
  }
</script>

<div class="field">
  <span class="label">{label}</span>
  <div class="image-field">
    <div class="thumb">
      {#if value}
        <img src={value.src} alt={label} />
      {:else}
        <span>Belum ada</span>
      {/if}
    </div>
    <div class="actions">
      <label class="btn small">
        {value ? 'Ganti…' : 'Pilih gambar…'}
        <input type="file" accept="image/*" onchange={pick} hidden />
      </label>
      {#if value}
        <button type="button" class="btn small ghost" onclick={() => (value = null)}>Hapus</button>
      {/if}
    </div>
  </div>
  {#if hint}<small class="hint">{hint}</small>{/if}
  {#if error}<small class="error">{error}</small>{/if}
</div>

<style>
  .image-field {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }
  .thumb {
    width: 88px;
    height: 64px;
    border: 1px dashed var(--line);
    border-radius: 6px;
    display: grid;
    place-items: center;
    background: var(--surface-2);
    overflow: hidden;
    flex: none;
  }
  .thumb img {
    max-width: 100%;
    max-height: 100%;
  }
  .thumb span {
    font-size: 0.75rem;
    color: var(--muted);
  }
  .actions {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
  }
</style>
