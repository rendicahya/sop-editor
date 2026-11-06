<script>
  import { haystack } from './library.js';
  import * as F from './faculty.svelte.js';
  import { faculty, isAdmin, canManage, canEdit } from './faculty.svelte.js';

  /**
   * openIds: id SOP yang sedang terbuka di tab. onopen(sop), onupload(folder): di App.
   * onvisibility(id, visibility), onrenamed(id, hasil renameSop): tab yang terbuka mengikuti perubahan.
   * onbinned(id): tab SOP yang dihapus ditutup; hasilnya true bila tab dipertahankan karena ada perubahan belum tersimpan.
   */
  let { open = $bindable(false), openIds = [], cansave = true, onopen, onupload, onvisibility, onrenamed, onbinned, onnotify } = $props();

  let dialog;
  let view = $state('sops'); // sops | bin | admin
  let live = $state([]);
  let bin = $state([]);
  let folders = $state([]);
  let folderId = $state(null); // folder yang sedang dibuka; null = tingkat utama
  let moving = $state(null); // { id, isFolder, target }: baris yang sedang memilih tujuan pindah
  let query = $state('');
  let busy = $state(false);
  let loadError = $state('');
  let history = $state(null); // { id, versions }
  let usage = $state(null);
  let members = $state([]);
  let newEmail = $state('');
  let newRole = $state('member');

  const admin = $derived(faculty.status === 'in' && faculty.role === 'admin');

  $effect(() => {
    if (open && !dialog.open) {
      query = '';
      history = null;
      view = 'sops';
      dialog.showModal();
      F.start();
    } else if (!open && dialog.open) dialog.close();
  });

  // Daftar dibaca sekali saat dialog dibuka atau akun berubah; tidak terus-menerus, agar hemat kuota baca.
  $effect(() => {
    if (open && faculty.status === 'in') refresh();
  });

  $effect(() => {
    if (open && faculty.status === 'in' && view === 'admin') refreshAdmin();
  });

  async function refresh() {
    busy = true;
    loadError = '';
    try {
      const [r, f] = await Promise.all([F.listSops(), F.listFolders()]);
      live = r.live.map(withText);
      bin = r.bin.map(withText);
      folders = f;
    } catch (e) {
      loadError = e.message;
    } finally {
      busy = false;
    }
  }
  const withText = (s) => ({ ...s, text: haystack({ ...s, fileName: null, tags: [s.createdByName, s.visibility] }) });

  const matches = (s) => {
    const q = query.trim().toLowerCase();
    return !q || q.split(/\s+/).every((w) => s.text.includes(w));
  };
  const searching = $derived(!!query.trim());
  const shownBin = $derived(bin.filter(matches));

  // ---- Folder ----
  const byId = $derived(new Map(folders.map((f) => [f.id, f])));
  // Induk yang sudah dihapus, atau putaran akibat dua orang memindahkan bersamaan, dibaca sebagai tingkat
  // utama. Aturan server tidak bisa memeriksa keduanya, dan tanpa ini foldernya tidak bisa dicapai.
  const parents = $derived.by(() => {
    const out = new Map();
    for (const f of folders) {
      const seen = new Set();
      let p = f.parent;
      while (p && p !== f.id && byId.has(p) && !seen.has(p)) {
        seen.add(p);
        p = byId.get(p).parent;
      }
      out.set(f.id, p === f.id || !byId.has(f.parent) ? null : f.parent);
    }
    return out;
  });
  const folderOf = (s) => (byId.has(s.folder) ? s.folder : null);
  const here = $derived(byId.has(folderId) ? folderId : null);
  const byName = (a, b) => a.name.localeCompare(b.name, 'id');
  const childrenOf = (id) => folders.filter((f) => parents.get(f.id) === id).sort(byName);

  /** Folder dari tingkat teratas sampai `id`. */
  function pathOf(id) {
    const path = [];
    for (let f = byId.get(id); f; f = byId.get(parents.get(f.id))) path.unshift(f);
    return path;
  }
  const pathText = (id) => pathOf(id).map((f) => f.name).join(' / ');
  const crumbs = $derived(pathOf(here));

  const shownFolders = $derived(
    searching ? folders.filter((f) => query.trim().toLowerCase().split(/\s+/).every((w) => f.name.toLowerCase().includes(w))).sort(byName) : childrenOf(here)
  );
  const shownLive = $derived(live.filter((s) => (searching ? matches(s) : folderOf(s) === here)));

  /** Semua folder berurutan menurut pohonnya, untuk pilihan tujuan pindah. */
  const tree = $derived.by(() => {
    const out = [];
    const walk = (id, depth) => {
      for (const f of childrenOf(id)) {
        out.push({ ...f, depth });
        walk(f.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  });
  // Folder tidak bisa dipindahkan ke dirinya sendiri atau ke dalam subfoldernya.
  const moveTargets = $derived(moving?.isFolder ? tree.filter((f) => !pathOf(f.id).some((a) => a.id === moving.id)) : tree);

  function enter(id) {
    folderId = id;
    query = '';
    history = null;
    moving = null;
  }

  const nameTaken = (name, parent, except) =>
    folders.some((f) => f.id !== except && parents.get(f.id) === parent && f.name.toLowerCase() === name.toLowerCase());
  const askName = (label, current = '') => prompt(label, current)?.trim().slice(0, 120).trim();
  const takenMessage = (name) => `Sudah ada folder bernama "${name}" di lokasi ini.`;

  function newFolder() {
    const name = askName('Nama folder baru:');
    if (!name) return;
    if (nameTaken(name, here)) return alert(takenMessage(name));
    act(() => F.createFolder(name, here), 'Folder dibuat');
  }

  function renameFolder(f) {
    const name = askName('Nama folder:', f.name);
    if (!name || name === f.name) return;
    if (nameTaken(name, parents.get(f.id), f.id)) return alert(takenMessage(name));
    act(() => F.updateFolder(f.id, { name }), 'Nama folder diubah');
  }

  // Yang dihitung hanya isi yang terlihat. SOP private milik orang lain di folder ini akan tampil di tingkat
  // utama bagi pemiliknya setelah foldernya dihapus, jadi isinya tidak hilang.
  function removeFolder(f) {
    const subs = childrenOf(f.id).length;
    const sops = live.filter((s) => folderOf(s) === f.id).length;
    if (subs || sops) {
      const isi = [subs && `${subs} subfolder`, sops && `${sops} SOP`].filter(Boolean).join(' dan ');
      return alert(`Folder "${f.name}" masih berisi ${isi}. Pindahkan isinya dulu. SOP milik orang lain hanya bisa dipindahkan oleh pembuatnya atau admin.`);
    }
    if (confirm(`Hapus folder "${f.name}"?`)) act(() => F.deleteFolder(f.id), 'Folder dihapus');
  }

  function toggleMove(id, isFolder, target) {
    history = null;
    moving = moving?.id === id ? null : { id, isFolder, target };
  }

  function submitMove(e, item) {
    e.preventDefault();
    const { id, isFolder, target } = moving;
    moving = null;
    if (isFolder) {
      if (target === parents.get(id)) return;
      if (nameTaken(item.name, target, id)) return alert(takenMessage(item.name));
      act(() => F.updateFolder(id, { parent: target }), 'Folder dipindahkan');
    } else if (target !== folderOf(item)) {
      act(() => F.moveSop(id, target), 'SOP dipindahkan');
    }
  }

  async function act(fn, done) {
    try {
      await fn();
      if (done) onnotify(done);
    } catch (e) {
      alert(e.message);
    }
    await refresh();
  }

  const titleOf = (s) => s.title || 'SOP tanpa judul';
  const isOpen = (s) => openIds.includes(s.id);

  function openSop(s) {
    open = false;
    onopen(s);
  }

  function rename(s) {
    const name = prompt('Nama SOP:', s.title)?.trim();
    if (!name || name === s.title) return;
    act(async () => onrenamed(s.id, await F.renameSop(s.id, name)), 'Nama SOP diubah');
  }

  function moveToBin(s) {
    act(async () => {
      await F.moveToBin(s.id);
      const kept = onbinned(s.id);
      onnotify(kept ? 'Dipindahkan ke Recycle bin. Perubahan yang belum tersimpan masih ada di tabnya.' : 'Dipindahkan ke Recycle bin');
    });
  }

  function toggleVisibility(s) {
    const next = s.visibility === 'public' ? 'private' : 'public';
    const msg =
      next === 'public'
        ? `Jadikan "${titleOf(s)}" public?\n\nSemua anggota bisa membuka, mengedit isinya, dan menduplikatnya.`
        : `Jadikan "${titleOf(s)}" private?\n\nHanya pembuat dan admin yang bisa membukanya. Salinan yang sudah dibuat orang lain tidak ikut tertarik.`;
    if (!confirm(msg)) return;
    act(async () => {
      await F.setVisibility(s.id, next);
      onvisibility(s.id, next);
    }, next === 'public' ? 'SOP sekarang public' : 'SOP sekarang private');
  }

  function purge(s) {
    const msg = `Hapus "${titleOf(s)}" secara permanen?\n\nSeluruh riwayat versinya, termasuk suntingan orang lain, ikut terhapus. Tindakan ini tidak bisa dibatalkan.`;
    if (confirm(msg)) act(() => F.purgeSop(s), 'Dihapus permanen');
  }

  async function toggleHistory(s) {
    moving = null;
    if (history?.id === s.id) return (history = null);
    try {
      history = { id: s.id, versions: await F.listVersions(s.id) };
    } catch (e) {
      alert(e.message);
    }
  }

  function restoreVersion(s, v) {
    if (!confirm(`Kembalikan isi "${titleOf(s)}" ke versi ${when(v.savedAt)}? Isi saat ini tetap tersimpan di Riwayat.`)) return;
    history = null;
    act(() => F.restoreVersion(s.id, v), 'Versi lama dikembalikan');
  }

  // ---- Admin ----
  async function refreshAdmin() {
    try {
      [usage, members] = await Promise.all([F.getUsage(), F.listMembers()]);
    } catch (e) {
      alert(e.message);
    }
  }
  const adminAct = (fn) => fn().catch((e) => alert(e.message)).finally(refreshAdmin);

  function addMember(e) {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!/^[^@\s/]+@ub\.ac\.id$/.test(email)) return alert('Masukkan alamat email @ub.ac.id.');
    newEmail = '';
    adminAct(() => F.setMember(email, newRole));
  }
  function removeMember(m) {
    if (confirm(`Cabut akses ${m.email}? SOP buatannya tetap ada.`)) adminAct(() => F.removeMember(m.email));
  }
  function changeLimit() {
    const v = Number(prompt('Batas penyimpanan (MB):', String(Math.round(usage.limit / 1e6))));
    if (v > 0) adminAct(() => F.setLimit(Math.round(v * 1e6)));
  }
  const recount = () => adminAct(() => F.recountUsage());

  const size = (n) => (n >= 1e6 ? `${(n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} MB` : `${Math.ceil(n / 1000).toLocaleString('id-ID')} KB`);
  const when = (ms) => new Date(ms).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  const percent = $derived(usage ? Math.min(100, (usage.bytes / usage.limit) * 100) : 0);
  const namesEditing = (s) => (faculty.editing[s.id] ?? []).map((m) => m.name).join(', ');
</script>

{#snippet movePanel(item, isFolder)}
  <form class="move" onsubmit={(e) => submitMove(e, item)}>
    <label>
      <span>Pindahkan ke</span>
      <select bind:value={moving.target}>
        <option value={null}>Utama</option>
        {#each moveTargets as t (t.id)}
          <option value={t.id}>{'   '.repeat(t.depth + 1)}{t.name}</option>
        {/each}
      </select>
    </label>
    <button class="btn small">Pindahkan</button>
    <button type="button" class="btn small" onclick={() => (moving = null)}>Batal</button>
  </form>
{/snippet}

<dialog bind:this={dialog} class="dialog" onclose={() => (open = false)}>
  <header>
    <h2>Pustaka Daring</h2>
    <span class="grow"></span>
    {#if faculty.user}
      <small class="who" title={faculty.user.email}>{faculty.user.name}{admin ? ' · Admin' : ''}</small>
      <button class="btn small" onclick={() => F.signOut()}>Keluar</button>
    {/if}
    <button class="x" onclick={() => (open = false)} aria-label="Tutup">×</button>
  </header>

  {#if faculty.status === 'in'}
    <div class="bar">
      <div class="seg" role="tablist">
        <button role="tab" aria-selected={view === 'sops'} class:on={view === 'sops'} onclick={() => (view = 'sops')}>SOP <span>{live.length}</span></button>
        <button role="tab" aria-selected={view === 'bin'} class:on={view === 'bin'} onclick={() => (view = 'bin')}>Recycle bin <span>{bin.length}</span></button>
        {#if admin}<button role="tab" aria-selected={view === 'admin'} class:on={view === 'admin'} onclick={() => (view = 'admin')}>Admin</button>{/if}
      </div>
      {#if view !== 'admin'}
        <input type="search" bind:value={query} placeholder="Cari nama, nomor, pembuat, pelaksana, atau kegiatan…" />
      {/if}
    </div>
    {#if loadError}<p class="error">{loadError} <button class="link" onclick={refresh}>Coba lagi</button></p>{/if}

    {#if view === 'sops'}
      <div class="crumbs">
        {#if searching}
          <span class="muted">Hasil pencarian di semua folder</span>
        {:else}
          <nav aria-label="Lokasi folder">
            <button class="crumb" aria-current={here ? undefined : 'location'} onclick={() => enter(null)}>Utama</button>
            {#each crumbs as c (c.id)}
              <span class="sep" aria-hidden="true">/</span>
              <button class="crumb" aria-current={c.id === here ? 'location' : undefined} onclick={() => enter(c.id)}>{c.name}</button>
            {/each}
          </nav>
          <button class="btn small" onclick={newFolder}>Folder baru</button>
        {/if}
      </div>
      <ul class="list">
        {#each shownFolders as f (f.id)}
          {@const subs = childrenOf(f.id).length}
          {@const sops = live.filter((s) => folderOf(s) === f.id).length}
          {@const parent = parents.get(f.id)}
          <li>
            <button class="main" onclick={() => enter(f.id)}>
              <strong><span class="ico" aria-hidden="true">📁</span>{f.name}</strong>
              <small>
                {[searching && parent && `di ${pathText(parent)}`, subs && `${subs} subfolder`, `${sops} SOP`, `dibuat ${f.createdBy === faculty.user.uid ? 'Anda' : f.createdByName}`].filter(Boolean).join(' · ')}
              </small>
            </button>
            {#if canManage(f)}
              <span class="acts" role="group" aria-label="Tindakan folder">
                <button class="btn small" class:on={moving?.id === f.id} aria-expanded={moving?.id === f.id} onclick={() => toggleMove(f.id, true, parent)}>Pindahkan</button>
                <button class="btn small" onclick={() => renameFolder(f)}>Ubah nama</button>
                <button class="btn small danger" onclick={() => removeFolder(f)}>Hapus</button>
              </span>
            {/if}
            {#if moving?.id === f.id}{@render movePanel(f, true)}{/if}
          </li>
        {/each}
        {#each shownLive as s (s.id)}
          {@const manage = canManage(s)}
          {@const editors = namesEditing(s)}
          <li>
            <button class="main" onclick={() => openSop(s)}>
              <strong>
                {titleOf(s)}
                <em class:public={s.visibility === 'public'}>{s.visibility === 'public' ? 'Public' : 'Private'}</em>
                {#if isOpen(s)}<em>terbuka di tab</em>{/if}
              </strong>
              <small title={s.createdByEmail}>
                {[searching && folderOf(s) && `di ${pathText(folderOf(s))}`, s.nomor, `dibuat ${s.createdBy === faculty.user.uid ? 'Anda' : s.createdByName}`, `diubah ${s.updatedByName}, ${when(s.updatedAt)}`].filter(Boolean).join(' · ')}
              </small>
              {#if editors}<small class="editing">✎ Sedang diedit oleh {editors}</small>{/if}
            </button>
            <span class="acts" role="group" aria-label="Tindakan SOP">
              <button class="btn small" onclick={() => act(() => F.duplicateSop(s), 'Salinan private dibuat')} title="Buat salinan private milik Anda">Duplikat</button>
              <button class="btn small" class:on={history?.id === s.id} onclick={() => toggleHistory(s)} aria-expanded={history?.id === s.id}>Riwayat</button>
              {#if manage}
                <button class="btn small" onclick={() => toggleVisibility(s)}>{s.visibility === 'public' ? 'Jadikan private' : 'Jadikan public'}</button>
                <button class="btn small" class:on={moving?.id === s.id} aria-expanded={moving?.id === s.id} onclick={() => toggleMove(s.id, false, folderOf(s))}>Pindahkan</button>
                <button class="btn small" onclick={() => rename(s)}>Ubah nama</button>
                <button class="btn small danger" title="Pindahkan ke Recycle bin" onclick={() => moveToBin(s)}>Hapus</button>
              {/if}
            </span>
            {#if history?.id === s.id}
              <div class="history">
                {#each history.versions as v (v.rev)}
                  <div>
                    <span>{when(v.savedAt)} · {v.savedByName}</span>
                    {#if canEdit(s)}<button class="btn small" disabled={isOpen(s)} title={isOpen(s) ? 'Tutup tabnya dulu untuk mengembalikan versi' : ''} onclick={() => restoreVersion(s, v)}>Kembalikan</button>{/if}
                  </div>
                {:else}
                  <span class="muted">Belum ada versi lama.</span>
                {/each}
              </div>
            {/if}
            {#if moving?.id === s.id}{@render movePanel(s, false)}{/if}
          </li>
        {/each}
        {#if !shownFolders.length && !shownLive.length}
          <li class="empty">{busy ? 'Memuat…' : searching ? 'Tidak ada yang cocok.' : here ? 'Folder ini kosong.' : 'Belum ada SOP yang bisa Anda lihat.'}</li>
        {/if}
      </ul>
      <footer>
        <button class="btn" disabled={!cansave} onclick={() => onupload(here)}>{here ? `Unggah dokumen ini ke folder ${byId.get(here).name}` : 'Unggah dokumen ini ke Pustaka Daring'}</button>
      </footer>
    {:else if view === 'bin'}
      <ul class="list">
        {#each shownBin as s (s.id)}
          <li>
            <div class="main static">
              <strong>{titleOf(s)}</strong>
              <small>{[s.nomor, `dibuat ${s.createdBy === faculty.user.uid ? 'Anda' : s.createdByName}`, `dihapus ${when(s.deletedAt)}`, size(s.totalBytes)].filter(Boolean).join(' · ')}</small>
            </div>
            <span class="acts" role="group" aria-label="Tindakan SOP">
              <button class="btn small" onclick={() => act(() => F.restoreFromBin(s.id), 'SOP dipulihkan')}>Pulihkan</button>
              <button class="btn small danger" onclick={() => purge(s)}>Hapus permanen</button>
            </span>
          </li>
        {:else}
          <li class="empty">{busy ? 'Memuat…' : query.trim() ? 'Tidak ada yang cocok.' : 'Recycle bin kosong.'}</li>
        {/each}
      </ul>
    {:else if admin}
      <div class="admin">
        <section>
          <h3>Penyimpanan</h3>
          {#if usage}
            <p class="usage"><strong>{size(usage.bytes)}</strong> dari {size(usage.limit)} terpakai · sisa {size(Math.max(0, usage.limit - usage.bytes))}</p>
            <div class="meter" role="progressbar" aria-valuenow={Math.round(percent)} aria-valuemin="0" aria-valuemax="100"><span style:width="{percent}%"></span></div>
            <small>
              Perkiraan dari ukuran isi SOP, riwayat, dan Recycle bin. Ruang sebenarnya lebih besar karena indeks Firestore.
              Kuota baca dan tulis harian hanya terlihat di Firebase Console.
            </small>
            <div class="row">
              <button class="btn small" onclick={changeLimit}>Ubah batas</button>
              <button class="btn small" onclick={recount}>Hitung ulang</button>
            </div>
          {:else}
            <small>Memuat…</small>
          {/if}
        </section>
        <section>
          <h3>Anggota <span class="muted">{members.length}</span></h3>
          <form onsubmit={addMember} class="row">
            <input bind:value={newEmail} type="email" placeholder="nama@ub.ac.id" aria-label="Email anggota baru" />
            <select bind:value={newRole} aria-label="Peran">
              <option value="member">Anggota</option>
              <option value="admin">Admin</option>
            </select>
            <button class="btn small" disabled={!newEmail.trim()}>Tambah</button>
          </form>
          <ul class="members">
            {#each members as m (m.email)}
              {@const self = m.email === faculty.user.email}
              <li>
                <span>{m.email}{self ? ' (Anda)' : ''}</span>
                <select value={m.role} disabled={self} aria-label={`Peran ${m.email}`} onchange={(e) => adminAct(() => F.setMember(m.email, e.currentTarget.value))}>
                  <option value="member">Anggota</option>
                  <option value="admin">Admin</option>
                </select>
                <button class="btn small danger" disabled={self} onclick={() => removeMember(m)}>Cabut</button>
              </li>
            {/each}
          </ul>
        </section>
      </div>
    {/if}
  {:else}
    <div class="gate">
      {#if faculty.status === 'out'}
        <p>Pustaka Daring menyimpan SOP bersama secara daring. Masuk dengan akun Google <strong>@ub.ac.id</strong> yang sudah didaftarkan admin.</p>
        <button class="btn primary" onclick={() => F.signIn().catch((e) => alert(e.message))}>Masuk dengan Google</button>
      {:else if faculty.status === 'domain'}
        <p><strong>{faculty.user.email}</strong> tidak bisa dipakai. Pustaka Daring hanya untuk akun @ub.ac.id.</p>
        <button class="btn" onclick={() => F.signOut().then(() => F.signIn()).catch((e) => alert(e.message))}>Ganti akun</button>
      {:else if faculty.status === 'notMember'}
        <p><strong>{faculty.user.email}</strong> belum terdaftar sebagai anggota. Minta admin Pustaka Daring mendaftarkan akun ini.</p>
        <button class="btn" onclick={() => F.recheck()}>Periksa lagi</button>
      {:else if faculty.status === 'error'}
        <p class="error">{faculty.error}</p>
        <button class="btn" onclick={() => (faculty.user ? F.recheck() : F.start())}>Coba lagi</button>
      {:else}
        <p>Memuat…</p>
      {/if}
    </div>
  {/if}
</dialog>

<style>
  .dialog {
    width: min(880px, calc(100vw - 2rem));
    max-height: min(720px, calc(100vh - 3rem));
    border: 0;
    border-radius: 14px;
    padding: 1.1rem 1.2rem;
    box-shadow: 0 20px 50px rgb(0 0 0 / 0.25);
    background: var(--surface);
    color: var(--text);
    flex-direction: column;
  }
  .dialog[open] {
    display: flex;
  }
  .dialog::backdrop {
    background: rgb(15 23 42 / 0.45);
  }
  header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.7rem;
  }
  h2 {
    margin: 0;
    font-size: 1.1rem;
  }
  h3 {
    margin: 0 0 0.45rem;
    font-size: 0.92rem;
  }
  .grow {
    flex: 1;
  }
  .who {
    color: var(--muted);
    font-size: 0.8rem;
  }
  .muted {
    color: var(--muted);
    font-weight: 400;
  }
  .x {
    border: 0;
    background: none;
    font-size: 1.4rem;
    line-height: 1;
    color: var(--muted);
    cursor: pointer;
  }
  .bar {
    display: flex;
    gap: 0.6rem;
    margin-bottom: 0.6rem;
  }
  .seg {
    display: flex;
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
    flex: none;
  }
  .seg button {
    border: 0;
    background: none;
    padding: 0.35rem 0.75rem;
    cursor: pointer;
    font-weight: 500;
    color: var(--muted);
  }
  .seg button.on {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .seg span {
    font-size: 0.75rem;
    opacity: 0.8;
  }
  .bar input {
    flex: 1;
    min-width: 0;
  }
  .crumbs {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 1.9rem;
    margin-bottom: 0.45rem;
    font-size: 0.85rem;
  }
  .crumbs nav {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.15rem 0.3rem;
  }
  .crumb {
    border: 0;
    background: none;
    padding: 0.1rem 0.2rem;
    font: inherit;
    color: var(--accent);
    cursor: pointer;
    overflow-wrap: anywhere;
    text-align: left;
  }
  .crumb:hover {
    text-decoration: underline;
  }
  .crumb[aria-current] {
    color: var(--text);
    font-weight: 600;
  }
  .sep {
    color: var(--muted);
  }
  .ico {
    margin-right: 0.35rem;
  }
  .move {
    flex-basis: 100%;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.5rem;
    border-radius: 8px;
    background: var(--surface-2);
    font-size: 0.82rem;
  }
  .move label {
    flex: 1;
    min-width: 14rem;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .move span {
    flex: none;
  }
  .move select {
    flex: 1;
    min-width: 0;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow: auto;
    flex: 1;
    min-height: 10rem;
    border: 1px solid var(--line);
    border-radius: 10px;
  }
  .list > li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding: 0.45rem 0.6rem;
    border-bottom: 1px solid var(--line);
  }
  .list > li:last-child {
    border-bottom: 0;
  }
  .main {
    flex: 1 1 18rem;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.1rem;
    border: 0;
    background: none;
    text-align: left;
    padding: 0.15rem 0;
    cursor: pointer;
    color: inherit;
    font: inherit;
  }
  .main.static {
    cursor: default;
  }
  button.main:hover strong {
    color: var(--accent);
  }
  .main small {
    color: var(--muted);
    font-size: 0.78rem;
  }
  .main small.editing {
    color: var(--danger);
    font-weight: 500;
  }
  em {
    font-style: normal;
    font-size: 0.72rem;
    font-weight: 500;
    color: var(--muted);
    border: 1px solid var(--line);
    border-radius: 99px;
    padding: 0.03rem 0.45rem;
    margin-left: 0.3rem;
  }
  em.public {
    color: var(--accent);
    background: var(--accent-soft);
    border-color: transparent;
  }
  .acts {
    display: inline-flex;
    flex: none;
  }
  .acts .btn {
    position: relative;
    margin-left: -1px;
    border-radius: 0;
  }
  .acts .btn:hover:not(:disabled) {
    z-index: 1;
  }
  .acts .btn:first-child {
    margin-left: 0;
    border-radius: 7px 0 0 7px;
  }
  .acts .btn:last-child {
    border-radius: 0 7px 7px 0;
  }
  .acts .on {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .danger {
    color: var(--danger);
  }
  .btn:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .history {
    flex-basis: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.4rem 0.5rem;
    border-radius: 8px;
    background: var(--surface-2);
    font-size: 0.82rem;
  }
  .history div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .empty {
    justify-content: center;
    color: var(--muted);
    padding: 1.5rem !important;
    font-size: 0.9rem;
  }
  footer {
    margin-top: 0.8rem;
  }
  .gate {
    padding: 1.5rem 0.5rem;
    text-align: center;
  }
  .gate p {
    margin: 0 0 1rem;
    line-height: 1.5;
  }
  .error {
    color: var(--danger);
    font-size: 0.85rem;
    margin: 0 0 0.5rem;
  }
  .link {
    border: 0;
    background: none;
    color: var(--accent);
    cursor: pointer;
    text-decoration: underline;
  }
  .admin {
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .admin section {
    flex: none;
  }
  .admin select {
    width: auto;
    flex: none;
  }
  .admin small {
    display: block;
    color: var(--muted);
    font-size: 0.78rem;
    line-height: 1.45;
  }
  .usage {
    margin: 0 0 0.35rem;
    font-size: 0.9rem;
  }
  .meter {
    height: 8px;
    border-radius: 99px;
    background: var(--surface-2);
    overflow: hidden;
    margin-bottom: 0.4rem;
  }
  .meter span {
    display: block;
    height: 100%;
    background: var(--accent);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-top: 0.5rem;
  }
  .row input {
    flex: 1;
    min-width: 12rem;
  }
  .members {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 10px;
  }
  .members li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.6rem;
    border-bottom: 1px solid var(--line);
    font-size: 0.85rem;
  }
  .members li:last-child {
    border-bottom: 0;
  }
  .members span {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
</style>
