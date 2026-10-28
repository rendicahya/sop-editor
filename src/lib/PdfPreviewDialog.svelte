<script>
  import Preview from './Preview.svelte';

  /** pdf: objek jsPDF hasil exportPdf; pages: tata letak (cadangan bila browser tak bisa menampilkan PDF). */
  let { pdf = $bindable(null), pages, filename, fontNote = '' } = $props();

  let dialog;
  // Browser seluler (mis. Chrome Android) tidak bisa menampilkan PDF di dalam halaman.
  const inline = navigator.pdfViewerEnabled !== false;
  const url = $derived(pdf ? URL.createObjectURL(pdf.output('blob')) : null);

  $effect(() => {
    const u = url;
    return () => u && URL.revokeObjectURL(u);
  });

  $effect(() => {
    if (pdf && !dialog.open) dialog.showModal();
    else if (!pdf && dialog.open) dialog.close();
  });

  function download() {
    pdf.save(filename);
    pdf = null;
  }
</script>

<dialog bind:this={dialog} class="dialog" onclose={() => (pdf = null)}>
  <header>
    <div>
      <h2>Pratinjau PDF</h2>
      <small>{filename}{fontNote ? ' · ' + fontNote : ''}</small>
    </div>
    <div class="actions">
      <button type="button" class="btn" onclick={() => (pdf = null)}>Kembali ke editor</button>
      <button type="button" class="btn primary" onclick={download}>Unduh PDF</button>
    </div>
  </header>
  {#if url}
    {#if inline}
      <iframe src={url + '#view=FitH'} title="Pratinjau PDF"></iframe>
    {:else}
      <div class="fallback">
        <p class="note">
          Browser ini tidak bisa menampilkan PDF secara langsung. Tampilan di bawah sama dengan isi PDF, atau
          <a href={url} target="_blank" rel="noopener">buka PDF di tab baru</a>.
        </p>
        <Preview {pages} editable={false} />
      </div>
    {/if}
  {/if}
</dialog>

<style>
  .dialog {
    width: min(1200px, calc(100vw - 2rem));
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
    background: rgb(15 23 42 / 0.55);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--line);
  }
  h2 {
    margin: 0;
    font-size: 1.05rem;
  }
  small {
    color: var(--muted);
    font-size: 0.78rem;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
  }
  iframe {
    flex: 1;
    width: 100%;
    border: 0;
    background: #525659;
  }
  .fallback {
    flex: 1;
    overflow: auto;
    background: var(--bg);
  }
  .note {
    margin: 0;
    padding: 0.6rem 1rem 0;
    font-size: 0.82rem;
    color: var(--muted);
  }
</style>
