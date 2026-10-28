<script>
  import { aiPrompt } from './aiPrompt.js';

  /** onpaste(text) → true bila jawaban berhasil dibuka. */
  let { open = $bindable(false), onpaste, onopen } = $props();

  let dialog;
  let description = $state('');
  let answer = $state('');
  let copied = $state(false);
  const prompt = $derived(aiPrompt(description));

  $effect(() => {
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      alert('Tidak bisa menyalin otomatis. Buka "Lihat prompt" lalu salin secara manual.');
    }
  }

  function load() {
    if (onpaste(answer)) {
      answer = '';
      open = false;
    }
  }

  function openFile() {
    open = false;
    onopen();
  }
</script>

<dialog bind:this={dialog} class="dialog" onclose={() => (open = false)}>
  <h2>Buat SOP dengan AI</h2>
  <p>Minta ChatGPT, Gemini, atau Claude menyusun SOP, lalu buka hasilnya di sini untuk dirapikan dan diekspor ke PDF.</p>

  <section>
    <h3><span class="num">1</span>Salin prompt ke AI</h3>
    <label class="field">
      <span class="label">Deskripsi proses (opsional, bisa juga ditulis langsung di chat AI)</span>
      <textarea rows="4" bind:value={description} placeholder="Contoh: SOP pengajuan cuti akademik di Fakultas Ilmu Komputer. Mahasiswa mengisi formulir, operator memverifikasi berkas, Kaprodi menyetujui, lalu dekan menerbitkan surat."></textarea>
    </label>
    <div class="row">
      <button type="button" class="btn primary" onclick={copy}>{copied ? 'Tersalin ✓' : 'Salin prompt'}</button>
      <details>
        <summary>Lihat prompt</summary>
        <textarea class="prompt" readonly rows="10" value={prompt} onfocus={(e) => e.currentTarget.select()}></textarea>
      </details>
    </div>
  </section>

  <section>
    <h3><span class="num">2</span>Tempel jawaban AI</h3>
    <label class="field">
      <span class="label">Jawaban AI (JSON, boleh beserta teks atau pembungkus ```json)</span>
      <textarea rows="5" class="mono" bind:value={answer} placeholder={'{ "format": "sop-editor", … }'}></textarea>
    </label>
    <small class="hint">
      Bila AI memberikan berkas .json, unduh lalu
      <button type="button" class="link" onclick={openFile}>buka berkasnya</button> atau seret ke jendela aplikasi.
    </small>
  </section>

  <div class="actions">
    <button type="button" class="btn" onclick={() => (open = false)}>Tutup</button>
    <button type="button" class="btn primary" disabled={!answer.trim()} onclick={load}>Buka di editor</button>
  </div>
</dialog>

<style>
  .dialog {
    width: min(560px, calc(100vw - 2rem));
    border: 0;
    border-radius: 14px;
    padding: 1.1rem 1.2rem;
    box-shadow: 0 20px 50px rgb(0 0 0 / 0.25);
    color: var(--text);
  }
  .dialog::backdrop {
    background: rgb(15 23 42 / 0.45);
  }
  h2 {
    margin: 0 0 0.6rem;
    font-size: 1.1rem;
  }
  h3 {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0 0 0.5rem;
    font-size: 0.95rem;
  }
  .num {
    display: inline-grid;
    place-items: center;
    width: 1.4rem;
    height: 1.4rem;
    border-radius: 50%;
    background: var(--accent);
    color: #fff;
    font-size: 0.8rem;
  }
  p {
    margin: 0 0 0.9rem;
    line-height: 1.45;
    font-size: 0.9rem;
  }
  section {
    margin-bottom: 1rem;
  }
  .row {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  details {
    flex: 1;
    min-width: 12rem;
    font-size: 0.85rem;
  }
  summary {
    cursor: pointer;
    padding: 0.4rem 0;
    color: var(--muted);
  }
  .prompt,
  .mono {
    width: 100%;
    font-family: ui-monospace, Consolas, monospace;
    font-size: 0.78rem;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
  .link {
    border: 0;
    background: none;
    padding: 0;
    color: var(--accent);
    text-decoration: underline;
    cursor: pointer;
    font-size: inherit;
  }
</style>
