<script>
  import { collab, createRoom, joinRoom, leaveRoom, roomLink, setName } from './collab.svelte.js';

  /** invite: undangan dari URL yang belum diterima (null bila dibuka dari tombol toolbar). */
  let { open = $bindable(false), invite = $bindable(null), onsave } = $props();

  let dialog;
  let name = $state(collab.me.name);
  let copied = $state(false);

  $effect(() => {
    if (open && !dialog.open) {
      name = collab.me.name;
      dialog.showModal();
    } else if (!open && dialog.open) dialog.close();
  });

  function close() {
    open = false;
    if (invite && collab.status === 'off') {
      invite = null;
      history.replaceState(null, '', location.pathname + location.search);
    }
  }

  function start(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setName(name);
    if (invite) {
      joinRoom(invite);
      open = false;
    } else createRoom();
    invite = null;
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(roomLink());
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      alert('Tidak bisa menyalin otomatis. Salin tautan secara manual.');
    }
  }

  function leave() {
    if (!confirm('Keluar dari ruang? Dokumen tetap ada di browser ini, tetapi perubahan tidak lagi tersinkron.')) return;
    leaveRoom();
    close();
  }

  const status = $derived(
    collab.status === 'connecting'
      ? 'Menghubungkan & menunggu isi dokumen…'
      : !collab.online
        ? 'Server signaling tidak terjangkau — mencoba lagi…'
        : collab.peers.length
          ? `Terhubung dengan ${collab.peers.length} peserta`
          : 'Terhubung — belum ada peserta lain'
  );
</script>

<dialog bind:this={dialog} class="dialog" onclose={() => open && close()}>
  {#if collab.status !== 'off'}
    <h2>Ruang kolaborasi</h2>
    <p class="status"><span class="dot" class:on={collab.online && collab.status === 'ready'}></span>{status}</p>

    <div class="field">
      <span class="label">Tautan undangan</span>
      <div class="row">
        <input readonly value={roomLink()} onfocus={(e) => e.currentTarget.select()} />
        <button type="button" class="btn" onclick={copy}>{copied ? 'Tersalin ✓' : 'Salin'}</button>
      </div>
      <small class="hint">Siapa pun yang memegang tautan ini bisa melihat dan mengedit dokumen. Bagikan hanya kepada rekan kerja.</small>
    </div>

    <div class="field">
      <span class="label">Peserta</span>
      <ul class="people">
        <li><span class="avatar" style:background={collab.me.color}>{collab.me.name[0]?.toUpperCase()}</span>{collab.me.name} (Anda)</li>
        {#each collab.peers as p (p.id)}
          <li><span class="avatar" style:background={p.color}>{p.name[0]?.toUpperCase()}</span>{p.name}</li>
        {/each}
      </ul>
    </div>

    <div class="actions">
      <button type="button" class="btn danger-text" onclick={leave}>Keluar dari ruang</button>
      <button type="button" class="btn primary" onclick={close}>Tutup</button>
    </div>
  {:else}
    <form onsubmit={start}>
      {#if invite}
        <h2>Gabung ke ruang kolaborasi</h2>
        <p>
          Anda diundang untuk mengedit sebuah dokumen SOP bersama. Dokumen yang sedang terbuka di sini akan
          <b>diganti</b> dengan dokumen ruang.
          <button type="button" class="link" onclick={onsave}>Simpan JSON dokumen ini dulu</button> bila masih diperlukan.
        </p>
      {:else}
        <h2>Kolaborasi real-time</h2>
        <p>
          Buat ruang dari dokumen ini, lalu bagikan tautannya. Semua yang membuka tautan bisa mengedit bersama secara
          langsung: perubahan langsung muncul, dan Anda bisa melihat siapa sedang mengedit bagian mana.
        </p>
      {/if}

      <label class="field">
        <span class="label">Nama Anda (terlihat oleh peserta lain)</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input bind:value={name} required maxlength="40" autofocus />
      </label>

      <p class="hint">
        Data dikirim langsung antar-browser (peer-to-peer, terenkripsi) tanpa server penyimpan. Isi ruang tetap tersimpan
        di browser setiap peserta, jadi tetap bisa dibuka lagi lewat tautan yang sama. Jaringan kantor/kampus yang ketat
        kadang memblokir koneksi peer-to-peer.
      </p>

      <div class="actions">
        <button type="button" class="btn" onclick={close}>Batal</button>
        <button type="submit" class="btn primary" disabled={!name.trim()}>{invite ? 'Gabung' : 'Buat ruang'}</button>
      </div>
    </form>
  {/if}
</dialog>

<style>
  .dialog {
    width: min(480px, calc(100vw - 2rem));
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
  p {
    margin: 0 0 0.8rem;
    line-height: 1.45;
    font-size: 0.9rem;
  }
  .row {
    display: flex;
    gap: 0.4rem;
  }
  .status {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    color: var(--muted);
  }
  .dot {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background: #f79009;
  }
  .dot.on {
    background: #12b76a;
  }
  .people {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.35rem;
    font-size: 0.9rem;
  }
  .people li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .actions {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    margin-top: 0.4rem;
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
  .danger-text {
    color: var(--danger);
  }
</style>
