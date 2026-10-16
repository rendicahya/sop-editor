<script>
  import { app } from '../store.svelte.js';
  import ImageField from './ImageField.svelte';

  const h = $derived(app.doc.header);
</script>

<section class="panel">
  <h2>Kop &amp; Instansi</h2>
  <ImageField label="Logo" bind:value={h.logo} hint="PNG transparan disarankan." />
  <label class="field">
    <span class="label">Nama instansi (satu baris per enter)</span>
    <textarea rows="4" bind:value={h.institution}></textarea>
  </label>
</section>

<section class="panel">
  <h2>Identitas SOP</h2>
  <label class="field">
    <span class="label">Nama SOP</span>
    <input bind:value={h.namaSop} />
  </label>
  <label class="field">
    <span class="label">Nomor SOP</span>
    <input bind:value={h.nomor} />
  </label>
  <div class="grid3">
    <label class="field">
      <span class="label">Tgl pembuatan</span>
      <input bind:value={h.tglPembuatan} placeholder="07 Agustus 2023" />
    </label>
    <label class="field">
      <span class="label">Tgl revisi</span>
      <input bind:value={h.tglRevisi} />
    </label>
    <label class="field">
      <span class="label">Tgl efektif</span>
      <input bind:value={h.tglEfektif} />
    </label>
  </div>
</section>

<section class="panel">
  <h2>Disahkan Oleh</h2>
  <label class="field">
    <span class="label">Jabatan</span>
    <input bind:value={h.disahkanJabatan} />
  </label>
  <label class="field">
    <span class="label">Nama</span>
    <input bind:value={h.disahkanNama} />
  </label>
  <label class="field">
    <span class="label">NIP</span>
    <input bind:value={h.disahkanNip} placeholder="NIP. …" />
  </label>
  <ImageField label="Tanda tangan / stempel (opsional)" bind:value={h.signature} hint="Gambar hasil pindai dengan latar transparan akan tampak paling baik." />
</section>
