<script>
  import { applyCase, CASES } from './richtext.js';

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

  let caseOpen = $state(false);
  let caseWrap;

  function setCase(mode) {
    caseOpen = false;
    if (active) applyCase(document.activeElement, mode);
    update();
  }

  $effect(() => {
    if (!active) caseOpen = false;
  });
</script>

<svelte:document
  onfocusin={update}
  onfocusout={() => setTimeout(update)}
  onselectionchange={update}
  oninput={update}
  onpointerdown={(e) => caseOpen && !caseWrap?.contains(e.target) && (caseOpen = false)}
  onkeydown={(e) => caseOpen && e.key === 'Escape' && (caseOpen = false)}
/>

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
  <div class="case" bind:this={caseWrap}>
    <button
      class="fmt-case"
      class:open={caseOpen}
      disabled={!active}
      title="Ubah huruf besar/kecil (Shift+F3)"
      aria-label="Ubah huruf besar/kecil"
      aria-haspopup="menu"
      aria-expanded={caseOpen}
      onpointerdown={(e) => e.preventDefault()}
      onclick={() => (caseOpen = !caseOpen)}>Aa<span class="caret">▾</span></button
    >
    {#if caseOpen}
      <div class="case-menu" role="menu">
        {#each CASES as [mode, label] (mode)}
          <button role="menuitem" onpointerdown={(e) => e.preventDefault()} onclick={() => setCase(mode)}
            >{label}</button
          >
        {/each}
      </div>
    {/if}
  </div>
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
  .case {
    position: relative;
  }
  .fmt-case {
    display: flex;
    gap: 1px;
    width: auto;
    padding: 0 3px;
    font-weight: 400;
  }
  .fmt-case.open {
    background: var(--surface-2);
    border-color: var(--line);
  }
  .caret {
    font: 9px/1 system-ui, sans-serif;
    opacity: 0.7;
  }
  .case-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 50;
    display: flex;
    flex-direction: column;
    min-width: 170px;
    padding: 4px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.15);
  }
  .case-menu button {
    display: block;
    width: 100%;
    height: auto;
    padding: 6px 10px;
    text-align: left;
    font: 400 0.85rem/1.2 system-ui, sans-serif;
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
