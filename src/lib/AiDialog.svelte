<script>
  import { aiPrompt, aiImportPrompt, aiRevisePrompt } from './aiPrompt.js';
  import { DEFAULT_PENGESAH } from './model.js';
  import { app } from './store.svelte.js';

  /** onpaste(text, revise) → true bila jawaban berhasil dibuka. */
  let { open = $bindable(false), onpaste, onopen } = $props();

  let dialog;
  // 'new' = susun SOP baru dari deskripsi; 'import' = salin SOP lama yang dilampirkan di chat AI;
  // 'revise' = ubah dokumen yang sedang dibuka sesuai instruksi.
  let mode = $state('new');
  let description = $state('');
  let note = $state('');
  let instruction = $state('');
  let update = $state(true);
  let answer = $state('');
  let copied = $state(false);
  // Prompt revisi memuat seluruh dokumen; hanya dihitung saat dibutuhkan.
  const prompt = $derived(
    mode === 'import' ? aiImportPrompt(note, update) : mode === 'revise' ? (open ? aiRevisePrompt(app.doc, instruction) : '') : aiPrompt(description)
  );

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
    if (onpaste(answer, mode === 'revise')) {
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
  <h2>SOP dengan bantuan AI</h2>
  <div class="seg" role="tablist" aria-label="Jenis">
    <button role="tab" aria-selected={mode === 'new'} class:on={mode === 'new'} onclick={() => (mode = 'new')}>Susun SOP baru</button>
    <button role="tab" aria-selected={mode === 'import'} class:on={mode === 'import'} onclick={() => (mode = 'import')}>Impor SOP lama</button>
    <button role="tab" aria-selected={mode === 'revise'} class:on={mode === 'revise'} onclick={() => (mode = 'revise')}>Revisi SOP ini</button>
  </div>
  {#if mode === 'new'}
    <p>Minta asisten AI menyusun SOP dari deskripsi proses, lalu buka hasilnya di sini untuk dirapikan dan diekspor.</p>
  {:else if mode === 'revise'}
    <p>
      Minta asisten AI mengubah dokumen yang sedang dibuka{app.doc.header.namaSop ? ` (${app.doc.header.namaSop})` : ''}, misalnya
      memecah langkah, merapikan keterangan, atau menambah pelaksana. Hasilnya menggantikan dokumen ini dan bisa di-Undo.
    </p>
  {:else}
    <p>
      Ubah SOP lama (PDF, Word, atau foto/pindaian) menjadi dokumen yang bisa diedit di sini. Asisten AI membaca berkasnya,
      termasuk diagram alirnya, lalu menyalin isinya ke format aplikasi ini.
    </p>
  {/if}

  <section>
    <h3><span class="num">1</span>{mode === 'import' ? 'Lampirkan SOP lama dan salin prompt ke AI' : 'Salin prompt ke AI'}</h3>
    {#if mode === 'revise'}
      <label class="field">
        <span class="label">Instruksi revisi</span>
        <textarea rows="4" bind:value={instruction} placeholder="Contoh: pecah langkah 3 menjadi verifikasi berkas dan verifikasi pembayaran; tulis ulang kolom keterangan agar lebih ringkas; ganti “Kasubbag” dengan “Kepala Subbagian Akademik”."></textarea>
      </label>
    {:else if mode === 'new'}
      <label class="field">
        <span class="label">Deskripsi proses (opsional, bisa juga ditulis langsung di chat AI)</span>
        <textarea rows="4" bind:value={description} placeholder="Contoh: SOP pengajuan cuti akademik di Fakultas Ilmu Komputer. Mahasiswa mengisi formulir, operator memverifikasi berkas, Kaprodi menyetujui, lalu dekan menerbitkan surat."></textarea>
      </label>
    {:else}
      <ol class="steps">
        <li>Buka chat baru di asisten AI, lalu lampirkan berkas SOP lama (unggah PDF/DOCX atau foto setiap halaman).</li>
        <li>Salin prompt di bawah, tempel ke chat yang sama, lalu kirim.</li>
      </ol>
      <label class="check">
        <input type="checkbox" bind:checked={update} />
        <span>Perbarui kop instansi dan pengesah ke bawaan saat ini ({DEFAULT_PENGESAH.disahkanNama})</span>
      </label>
      <label class="field">
        <span class="label">Catatan untuk AI (opsional)</span>
        <textarea rows="2" bind:value={note} placeholder="Contoh: tanggal pembuatan diganti hari ini; pelaksana “Kasubbag” diganti “Kepala Subbagian Akademik”."></textarea>
      </label>
    {/if}
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
      {#if mode === 'revise'}
        Bila AI memberikan berkas .json, buka berkasnya di editor teks lalu tempel isinya di sini.
      {:else}
        Bila AI memberikan berkas .json, unduh lalu
        <button type="button" class="link" onclick={openFile}>buka berkasnya</button> atau seret ke jendela aplikasi.
      {/if}
      {#if mode === 'import'}Bandingkan hasilnya dengan dokumen asli, terutama arah panah dan cabang keputusan.{/if}
      {#if mode === 'revise'}Tanda tangan dan jalur garis yang diatur manual tetap dipertahankan.{/if}
    </small>
  </section>

  <div class="actions">
    <button type="button" class="btn" onclick={() => (open = false)}>Tutup</button>
    <button type="button" class="btn primary" disabled={!answer.trim()} onclick={load}>{mode === 'revise' ? 'Terapkan revisi' : 'Buka di editor'}</button>
  </div>
</dialog>

<style>
  .dialog {
    width: min(560px, calc(100vw - 2rem));
    border: 0;
    border-radius: 14px;
    padding: 1.1rem 1.2rem;
    box-shadow: 0 20px 50px rgb(0 0 0 / 0.25);
    background: var(--surface);
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
  .seg {
    display: flex;
    margin-bottom: 0.8rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
  }
  .seg button {
    flex: 1;
    padding: 0.45rem 0.6rem;
    border: 0;
    background: var(--surface);
    color: var(--text);
    font: 600 0.85rem var(--ui-font);
    cursor: pointer;
  }
  .seg button + button {
    border-left: 1px solid var(--line);
  }
  .seg button.on {
    background: var(--accent);
    color: #fff;
  }
  .steps {
    margin: 0 0 0.6rem;
    padding-left: 1.2rem;
    font-size: 0.88rem;
    line-height: 1.45;
  }
  .check {
    display: flex;
    gap: 0.45rem;
    align-items: flex-start;
    margin-bottom: 0.6rem;
    font-size: 0.85rem;
  }
  .check input {
    margin-top: 0.15rem;
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
