<script>
  import { plainText } from './richtext.js';

  /** Daftar temuan pemeriksa dokumen dan estimasi waktu (duration.js); onjump(ref) menuju isian terkait di halaman. */
  let { open = $bindable(false), issues, duration, steps, onjump } = $props();
  const waktuRef = (i) => `st:${steps[i].id}:waktu`;

  let showInfo = $state(false);
  const LEVEL = { error: 'Salah', warn: 'Peringatan', info: 'Saran' };
  const count = (lv) => issues.filter((i) => i.level === lv).length;
  const shown = $derived(showInfo ? issues : issues.filter((i) => i.level !== 'info'));

  function onKey(e) {
    if (open && e.key === 'Escape' && !document.querySelector('dialog[open]')) open = false;
  }
</script>

<svelte:window onkeydown={onKey} />

{#if open}
  <div class="check" role="dialog" aria-label="Periksa dokumen">
    <div class="head">
      <strong>Periksa dokumen</strong>
      <button class="icon" onclick={() => (open = false)} title="Tutup (Esc)">✕</button>
    </div>
    <p class="summary">
      {#if !count('error') && !count('warn')}
        Tidak ada kesalahan alur maupun isian penting yang kosong.
      {:else}
        {count('error')} salah · {count('warn')} peringatan
      {/if}
    </p>
    <div class="dur">
      <span class="lv">Estimasi total waktu</span>
      <strong>{duration.text || 'Belum ada isian waktu yang terbaca'}</strong>
      <small>
        Jumlah kolom Waktu pada jalur utama ({duration.steps} langkah, mengikuti cabang
        "ya"){duration.skipped ? `; ${duration.skipped} langkah di cabang lain tidak dihitung` : ''}. Satuan tidak
        dikonversi ke hari karena hari kerja dan jam kerja bisa berbeda.
      </small>
      {#if duration.unread.length}
        <span class="sub">Tidak terbaca, tidak ikut dihitung:</span>
        <span class="refs">
          {#each duration.unread as i (i)}
            <button onclick={() => onjump(waktuRef(i))} title="Tampilkan di halaman">
              {i + 1}. "{plainText(steps[i].waktu).slice(0, 30)}"
            </button>
          {/each}
        </span>
      {/if}
      {#if duration.empty.length}
        <span class="sub">Waktu belum diisi:</span>
        <span class="refs">
          {#each duration.empty as i (i)}
            <button onclick={() => onjump(waktuRef(i))} title="Tampilkan di halaman">Langkah {i + 1}</button>
          {/each}
        </span>
      {/if}
    </div>
    <label class="check-row"><input type="checkbox" bind:checked={showInfo} /> Tampilkan saran ({count('info')})</label>
    {#if shown.length}
      <ul>
        {#each shown as it, i (i)}
          <li>
            <button class="hit {it.level}" disabled={!it.ref} onclick={() => onjump(it.ref)} title={it.ref ? 'Tampilkan di halaman' : ''}>
              <span class="lv">{LEVEL[it.level]}</span>
              <span class="msg">{it.msg}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}

<style>
  .check {
    position: fixed;
    top: 4rem;
    right: 1rem;
    z-index: 15;
    width: min(380px, calc(100vw - 2rem));
    max-height: calc(100vh - 5rem);
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    padding: 0.75rem 0.85rem;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: 0 16px 40px rgb(0 0 0 / 0.2);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .summary {
    margin: 0;
    font-size: 0.82rem;
    color: var(--muted);
  }
  .dur {
    display: grid;
    gap: 0.2rem;
    padding: 0.45rem 0.55rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
  }
  .dur strong {
    font-size: 0.95rem;
  }
  .dur small,
  .dur .sub {
    font-size: 0.75rem;
    color: var(--muted);
  }
  .dur .sub {
    margin-top: 0.2rem;
  }
  .refs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .refs button {
    border: 1px solid var(--line);
    border-left: 3px solid #d98e04;
    border-radius: 5px;
    background: var(--surface);
    color: var(--text);
    font-size: 0.75rem;
    padding: 0.1rem 0.4rem;
    cursor: pointer;
  }
  .refs button:hover {
    border-color: var(--accent);
  }
  .check-row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.8rem;
    color: var(--muted);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow: auto;
    display: grid;
    gap: 0.3rem;
  }
  .hit {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    text-align: left;
    border: 1px solid var(--line);
    border-left: 4px solid var(--muted);
    border-radius: 7px;
    background: var(--surface-2);
    padding: 0.35rem 0.5rem;
    cursor: pointer;
    color: var(--text);
  }
  .hit:hover:not(:disabled) {
    border-color: var(--accent);
  }
  .hit:disabled {
    cursor: default;
  }
  .hit.error {
    border-left-color: var(--danger, #b42318);
  }
  .hit.warn {
    border-left-color: #d98e04;
  }
  .lv {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .hit.error .lv {
    color: var(--danger, #b42318);
  }
  .msg {
    font-size: 0.82rem;
    overflow-wrap: anywhere;
  }
</style>
