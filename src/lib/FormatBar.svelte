<script>
  // Tombol format teks (tebal/miring/garis bawah) untuk isian berformat yang sedang difokus.
  // Tombol tidak mengambil fokus, jadi perintahnya berlaku pada seleksi di isian tersebut.
  const FORMATS = [
    ['bold', 'B', 'Tebal (Ctrl+B)'],
    ['italic', 'I', 'Miring (Ctrl+I)'],
    ['underline', 'U', 'Garis bawah (Ctrl+U)'],
    ['removeFormat', 'T', 'Hapus format']
  ];

  let active = $state(false);
  let state = $state({});

  function update() {
    active = !!document.activeElement?.classList?.contains('f-rich');
    if (active) for (const [cmd] of FORMATS.slice(0, 3)) state[cmd] = document.queryCommandState(cmd);
  }

  function run(cmd) {
    if (!active) return;
    document.execCommand(cmd);
    update();
  }
</script>

<svelte:document onfocusin={update} onfocusout={() => setTimeout(update)} onselectionchange={update} oninput={update} />

<div
  class="fmt"
  role="toolbar"
  aria-label="Format teks"
  title={active ? '' : 'Klik butir ketentuan atau sel tabel langkah untuk memformat teks'}
>
  {#each FORMATS as [cmd, label, title] (cmd)}
    <button
      class="fmt-{cmd}"
      class:on={state[cmd] && active}
      disabled={!active}
      {title}
      aria-label={title}
      aria-pressed={cmd === 'removeFormat' ? undefined : !!(state[cmd] && active)}
      onpointerdown={(e) => e.preventDefault()}
      onclick={() => run(cmd)}>{label}</button
    >
  {/each}
</div>

<style>
  .fmt {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  button {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    color: var(--text);
    font: 700 14px/1 Georgia, 'Times New Roman', serif;
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    background: var(--surface-2);
    border-color: var(--line);
  }
  button:disabled {
    opacity: 0.35;
    cursor: default;
  }
  button.on {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .fmt-italic {
    font-style: italic;
  }
  .fmt-underline {
    text-decoration: underline;
  }
  .fmt-removeFormat {
    position: relative;
    font-weight: 400;
  }
  .fmt-removeFormat::after {
    content: '';
    position: absolute;
    left: 5px;
    right: 5px;
    top: 50%;
    border-top: 1.5px solid currentColor;
    transform: rotate(-35deg);
  }
</style>
