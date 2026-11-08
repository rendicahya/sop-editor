<script>
  import { SvelteSet } from 'svelte/reactivity';
  import { haystack } from './library.js';
  import * as F from './faculty.svelte.js';
  import { faculty, canManage, canEdit } from './faculty.svelte.js';
  import AccessDialog from './AccessDialog.svelte';
  import ContextMenu from './ContextMenu.svelte';
  import Icon from './Icon.svelte';
  import { tips } from './tips.js';

  /**
   * openIds: id SOP yang sedang terbuka di tab. onopen(sop), onupload(folder): di App.
   * onloaded(live): daftar baru dimuat, tab yang terbuka mengikuti hak akses terbaru. onrenamed(id, hasil renameSop): tab mengikuti.
   * onbinned(id): tab SOP yang dihapus ditutup; hasilnya true bila tab dipertahankan karena ada perubahan belum tersimpan.
   */
  let { open = $bindable(false), openIds = [], cansave = true, onopen, onupload, onloaded, onrenamed, onbinned, onnotify } = $props();

  let dialog = $state();
  let moveDialog;
  let view = $state('sops'); // sops | bin | admin
  let live = $state([]);
  let bin = $state([]);
  let folders = $state([]);
  let folderId = $state(null); // folder yang dipilih; null = tingkat utama
  const expanded = new SvelteSet();
  let moving = $state(null); // { item, isFolder, target }
  let accessTarget = $state(null);
  let menu = $state(null); // { x, y, items }
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

  $effect(() => {
    if (moving && !moveDialog.open) moveDialog.showModal();
    else if (!moving && moveDialog.open) moveDialog.close();
  });

  async function refresh() {
    busy = true;
    loadError = '';
    try {
      const [r, f] = await Promise.all([F.listSops(), F.listFolders()]);
      // Penyebaran hak akses tidak boleh menghalangi tampilnya daftar; yang gagal dicoba lagi saat dimuat berikutnya.
      await F.reconcileAccess(f, [...r.live, ...r.bin]).catch(() => {});
      live = r.live.map(withText);
      bin = r.bin.map(withText);
      folders = f;
      onloaded(r.live);
    } catch (e) {
      loadError = e.message;
    } finally {
      busy = false;
    }
  }
  const withText = (s) => ({ ...s, text: haystack({ ...s, fileName: null, tags: [s.createdByName] }) });

  const words = $derived(query.trim().toLowerCase().split(/\s+/).filter(Boolean));
  const matches = (s) => words.every((w) => s.text.includes(w));
  const searching = $derived(words.length > 0);
  const shownBin = $derived(bin.filter(matches));

  // ---- Folder ----
  const byId = $derived(new Map(folders.map((f) => [f.id, f])));
  const parents = $derived(F.resolveParents(folders));
  const folderOf = (s) => (byId.has(s.folder) ? s.folder : null);
  const here = $derived(byId.has(folderId) ? folderId : null);
  const byName = (a, b) => a.name.localeCompare(b.name, 'id');
  const childrenOf = (id) => folders.filter((f) => parents.get(f.id) === id).sort(byName);
  /** Menambah isi hanya untuk pemilik folder dan admin; tingkat utama terbuka untuk semua anggota. */
  const canAdd = (id) => !id || (byId.has(id) && canManage(byId.get(id)));

  /** Folder dari tingkat teratas sampai `id`. */
  function pathOf(id) {
    const path = [];
    for (let f = byId.get(id); f; f = byId.get(parents.get(f.id))) path.unshift(f);
    return path;
  }
  const pathText = (id) => pathOf(id).map((f) => f.name).join(' / ');
  const crumbs = $derived(pathOf(here));

  const shownFolders = $derived(searching ? folders.filter((f) => words.every((w) => f.name.toLowerCase().includes(w))).sort(byName) : []);
  const shownLive = $derived(live.filter((s) => (searching ? matches(s) : folderOf(s) === here)));
  const counts = $derived.by(() => {
    const out = new Map();
    for (const s of live) out.set(folderOf(s), (out.get(folderOf(s)) ?? 0) + 1);
    return out;
  });

  /** Semua folder berurutan menurut pohonnya, untuk pilihan tujuan pindah. */
  const flatTree = $derived.by(() => {
    const out = [];
    const walk = (id, depth) => {
      for (const f of childrenOf(id)) {
        out.push({ id: f.id, name: f.name, depth });
        walk(f.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  });
  // Tujuan harus folder milik sendiri (admin: semua folder). Folder tidak bisa dipindahkan ke dirinya sendiri atau ke dalam subfoldernya.
  const moveTargets = $derived(flatTree.filter((t) => canAdd(t.id) && !(moving?.isFolder && pathOf(t.id).some((a) => a.id === moving.item.id))));

  function select(id) {
    view = 'sops';
    folderId = id;
    query = '';
    history = null;
    for (const f of pathOf(id)) expanded.add(f.id);
  }
  function toggle(id) {
    if (!expanded.delete(id)) expanded.add(id);
  }

  const nameTaken = (name, parent, except) =>
    folders.some((f) => f.id !== except && parents.get(f.id) === parent && f.name.toLowerCase() === name.toLowerCase());
  const askName = (label, current = '') => prompt(label, current)?.trim().slice(0, 120).trim();
  const takenMessage = (name) => `Sudah ada folder bernama "${name}" di lokasi ini.`;

  function newFolder(parent = here) {
    const name = askName('Nama folder baru:');
    if (!name) return;
    if (nameTaken(name, parent)) return alert(takenMessage(name));
    if (parent) expanded.add(parent);
    act(() => F.createFolder(name, parent), 'Folder dibuat');
  }

  function renameFolder(f) {
    const name = askName('Nama folder:', f.name);
    if (!name || name === f.name) return;
    if (nameTaken(name, parents.get(f.id), f.id)) return alert(takenMessage(name));
    act(() => F.renameFolder(f.id, name), 'Nama folder diubah');
  }

  // Yang dihitung hanya isi yang terlihat. Isi dengan hak khusus milik orang lain akan tampil di tingkat utama
  // bagi pemiliknya setelah foldernya dihapus, jadi tidak hilang.
  function removeFolder(f) {
    const subs = childrenOf(f.id).length;
    const sops = live.filter((s) => folderOf(s) === f.id).length;
    if (subs || sops) {
      const isi = [subs && `${subs} subfolder`, sops && `${sops} SOP`].filter(Boolean).join(' dan ');
      return alert(`Folder "${f.name}" masih berisi ${isi}. Pindahkan isinya dulu. SOP milik orang lain hanya bisa dipindahkan oleh pemiliknya atau admin.`);
    }
    if (!confirm(`Hapus folder "${f.name}"?`)) return;
    if (folderId === f.id) folderId = parents.get(f.id) ?? null;
    act(() => F.deleteFolder(f.id), 'Folder dihapus');
  }

  function submitMove(e) {
    e.preventDefault();
    const { item, isFolder, target } = moving;
    moving = null;
    const dest = byId.get(target) ?? null;
    if (isFolder) {
      if (target === parents.get(item.id)) return;
      if (nameTaken(item.name, target, item.id)) return alert(takenMessage(item.name));
      act(() => F.moveFolder(item, dest), 'Folder dipindahkan');
    } else if (target !== folderOf(item)) {
      act(() => F.moveSop(item, dest), 'SOP dipindahkan');
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

  const duplicate = (s) => act(() => F.duplicateSop(s), 'Salinan dibuat');
  const moveSop = (s) => (moving = { item: s, isFolder: false, target: folderOf(s) });
  const moveFolder = (f) => (moving = { item: f, isFolder: true, target: parents.get(f.id) ?? null });
  const restoreFromBin = (s) => act(() => F.restoreFromBin(s.id), 'SOP dipulihkan');

  function purge(s) {
    const msg = `Hapus "${titleOf(s)}" secara permanen?\n\nSeluruh riwayat versinya, termasuk suntingan orang lain, ikut terhapus. Tindakan ini tidak bisa dibatalkan.`;
    if (confirm(msg)) act(() => F.purgeSop(s), 'Dihapus permanen');
  }

  async function toggleHistory(s) {
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

  // ---- Hak akses ----
  function openAccess(kind, item) {
    const up = kind === 'folders' ? parents.get(item.id) : folderOf(item);
    accessTarget = { kind, item, name: kind === 'folders' ? item.name : titleOf(item), parent: byId.get(up) ?? null };
  }
  function saveAccess(data) {
    const { kind, item } = accessTarget;
    accessTarget = null;
    act(() => F.setAccess(kind, item.id, data), 'Hak akses disimpan');
  }
  /** Ringkasan siapa yang bisa melihat, untuk lencana di daftar. */
  function accessLabel(item) {
    const readers = item.readers ?? [];
    if (readers.includes(F.EVERYONE)) return 'Semua anggota';
    const others = readers.filter((r) => r !== item.createdByEmail).length;
    return others ? `${others} orang` : 'Private';
  }
  const accessTip = (item) => (canManage(item) ? 'Atur hak akses' : 'Lihat hak akses');

  // ---- Menu klik kanan ----
  function openMenu(e, items) {
    e.preventDefault();
    e.stopPropagation();
    menu = { x: e.clientX, y: e.clientY, items };
  }
  function hereItems(id) {
    const add = canAdd(id);
    return [
      { label: 'Folder baru di sini', run: () => newFolder(id), disabled: !add },
      { label: 'Unggah dokumen ini ke sini', run: () => onupload(id), disabled: !add || !cansave }
    ];
  }
  function folderMenu(f) {
    const manage = canManage(f);
    return [
      { label: 'Buka', run: () => select(f.id) },
      { sep: true },
      ...hereItems(f.id),
      { sep: true },
      { label: accessTip(f), run: () => openAccess('folders', f) },
      ...(canEdit(f) ? [{ label: 'Ubah nama', run: () => renameFolder(f) }] : []),
      ...(manage
        ? [
            { label: 'Pindahkan', run: () => moveFolder(f) },
            { sep: true },
            { label: 'Hapus', run: () => removeFolder(f), danger: true }
          ]
        : [])
    ];
  }
  function sopMenu(s) {
    const manage = canManage(s);
    return [
      { label: 'Buka', run: () => openSop(s) },
      { sep: true },
      { label: 'Duplikat', run: () => duplicate(s) },
      { label: 'Riwayat', run: () => toggleHistory(s) },
      { label: accessTip(s), run: () => openAccess('sops', s) },
      ...(canEdit(s) ? [{ label: 'Ubah nama', run: () => rename(s) }] : []),
      ...(manage
        ? [
            { label: 'Pindahkan', run: () => moveSop(s) },
            { sep: true },
            { label: 'Hapus', run: () => moveToBin(s), danger: true }
          ]
        : [])
    ];
  }
  const binMenu = (s) => [
    { label: 'Pulihkan', run: () => restoreFromBin(s) },
    { sep: true },
    { label: 'Hapus permanen', run: () => purge(s), danger: true }
  ];

  const noAddTip = 'Hanya pemilik folder ini yang bisa menambah isinya';
  const uploadBlocked = $derived(!canAdd(here) ? noAddTip : !cansave ? 'Dokumen ini kosong atau sudah tertaut ke Pustaka Daring' : '');
  const uploadTip = $derived(uploadBlocked || (here ? `Unggah dokumen ini ke ${byId.get(here).name}` : 'Unggah dokumen ini ke Utama'));

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
    if (!/^[^@\s/]+@(ub\.ac\.id|gmail\.com)$/.test(email)) return alert('Masukkan alamat email @ub.ac.id atau @gmail.com.');
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

{#snippet ib(icon, tip, run, opts = {})}
  <button
    type="button"
    class="ib"
    class:danger={opts.danger}
    class:on={opts.on}
    aria-label={tip}
    aria-disabled={opts.disabled ? 'true' : undefined}
    aria-expanded={opts.expanded}
    data-tip={tip}
    onclick={() => !opts.disabled && run()}
  >
    <Icon name={icon} />
  </button>
{/snippet}

{#snippet node(f, depth)}
  {@const kids = childrenOf(f.id)}
  {@const opened = expanded.has(f.id)}
  <li role="treeitem" aria-selected={view === 'sops' && here === f.id} aria-expanded={kids.length ? opened : undefined}>
    <div class="tn" class:sel={view === 'sops' && here === f.id} style:padding-left="{depth * 0.9 + 0.2}rem" role="presentation" oncontextmenu={(e) => openMenu(e, folderMenu(f))}>
      {#if kids.length}
        <button type="button" class="chev" class:open={opened} aria-label={opened ? `Tutup ${f.name}` : `Buka ${f.name}`} onclick={() => toggle(f.id)}><Icon name="chevron" size={13} /></button>
      {:else}
        <span class="chev none"></span>
      {/if}
      <button type="button" class="tname" onclick={() => select(f.id)}>
        <Icon name="folder" size={15} />
        <span>{f.name}</span>
        {#if counts.get(f.id)}<small>{counts.get(f.id)}</small>{/if}
      </button>
    </div>
    {#if kids.length && opened}
      <ul role="group">
        {#each kids as k (k.id)}{@render node(k, depth + 1)}{/each}
      </ul>
    {/if}
  </li>
{/snippet}

<dialog bind:this={dialog} class="dialog" use:tips onclose={() => (open = false)}>
  <header>
    <h2>Pustaka Daring</h2>
    {#if faculty.status === 'in' && view !== 'admin'}
      <input class="search" type="search" bind:value={query} placeholder="Cari nama, nomor, pembuat, pelaksana, atau kegiatan…" />
    {:else}
      <span class="grow"></span>
    {/if}
    {#if faculty.user}
      <small class="who" title={faculty.user.email}>{faculty.user.name}{admin ? ' · Admin' : ''}</small>
      {@render ib('logout', 'Keluar', () => F.signOut())}
    {/if}
    <button class="ib x" onclick={() => (open = false)} aria-label="Tutup" data-tip="Tutup"><Icon name="x" /></button>
  </header>

  {#if faculty.status === 'in'}
    {#if loadError}<p class="error">{loadError} <button class="link" onclick={refresh}>Coba lagi</button></p>{/if}
    <div class="panes">
      <aside>
        <div class="tree" role="presentation" oncontextmenu={(e) => openMenu(e, hereItems(null))}>
          <ul role="tree" aria-label="Folder">
            <li role="treeitem" aria-selected={view === 'sops' && !here}>
              <div class="tn" class:sel={view === 'sops' && !here} style:padding-left="0.2rem" role="presentation">
                <span class="chev none"></span>
                <button type="button" class="tname" onclick={() => select(null)}>
                  <Icon name="folder" size={15} />
                  <span>Utama</span>
                  {#if counts.get(null)}<small>{counts.get(null)}</small>{/if}
                </button>
              </div>
            </li>
            {#each childrenOf(null) as f (f.id)}{@render node(f, 1)}{/each}
          </ul>
        </div>
        <nav aria-label="Lainnya">
          <button type="button" class="tname nav" class:sel={view === 'bin'} onclick={() => (view = 'bin')}>
            <Icon name="trash" size={15} /><span>Recycle bin</span>{#if bin.length}<small>{bin.length}</small>{/if}
          </button>
          {#if admin}
            <button type="button" class="tname nav" class:sel={view === 'admin'} onclick={() => (view = 'admin')}>
              <Icon name="settings" size={15} /><span>Admin</span>
            </button>
          {/if}
        </nav>
      </aside>

      <section class="content">
        {#if view === 'sops'}
          <div class="crumbs">
            {#if searching}
              <span class="muted grow">Hasil pencarian di semua folder</span>
            {:else}
              <nav class="grow" aria-label="Lokasi folder">
                <button class="crumb" aria-current={here ? undefined : 'location'} onclick={() => select(null)}>Utama</button>
                {#each crumbs as c (c.id)}
                  <span class="sep" aria-hidden="true">/</span>
                  <button class="crumb" aria-current={c.id === here ? 'location' : undefined} onclick={() => select(c.id)}>{c.name}</button>
                {/each}
              </nav>
            {/if}
            {#if here && !searching}
              {@render ib('users', accessTip(byId.get(here)), () => openAccess('folders', byId.get(here)))}
            {/if}
            {@render ib('folderPlus', canAdd(here) ? 'Folder baru di sini' : noAddTip, () => newFolder(), { disabled: !canAdd(here) })}
            {@render ib('upload', uploadTip, () => onupload(here), { disabled: !!uploadBlocked })}
            {@render ib('refresh', 'Muat ulang daftar', refresh)}
          </div>
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <ul class="list" oncontextmenu={(e) => openMenu(e, hereItems(here))}>
            {#each shownFolders as f (f.id)}
              {@const parent = parents.get(f.id)}
              <li oncontextmenu={(e) => openMenu(e, folderMenu(f))}>
                <button class="main" onclick={() => select(f.id)}>
                  <strong><Icon name="folder" size={15} /> {f.name} <em class:shared={F.isShared(f)}>{accessLabel(f)}</em></strong>
                  <small>{[parent && `di ${pathText(parent)}`, `dibuat ${f.createdBy === faculty.user.uid ? 'Anda' : f.createdByName}`].filter(Boolean).join(' · ')}</small>
                </button>
              </li>
            {/each}
            {#each shownLive as s (s.id)}
              {@const manage = canManage(s)}
              {@const editors = namesEditing(s)}
              <li oncontextmenu={(e) => openMenu(e, sopMenu(s))}>
                <button class="main" onclick={() => openSop(s)}>
                  <strong>
                    <Icon name="file" size={15} />
                    {titleOf(s)}
                    <em class:shared={F.isShared(s)}>{accessLabel(s)}</em>
                    {#if s.custom && folderOf(s)}<em>Khusus</em>{/if}
                    {#if !canEdit(s)}<em>Hanya lihat</em>{/if}
                    {#if isOpen(s)}<em>Terbuka di tab</em>{/if}
                  </strong>
                  <small title={s.createdByEmail}>
                    {[searching && folderOf(s) && `di ${pathText(folderOf(s))}`, s.nomor, `dibuat ${s.createdBy === faculty.user.uid ? 'Anda' : s.createdByName}`, `diubah ${s.updatedByName}, ${when(s.updatedAt)}`].filter(Boolean).join(' · ')}
                  </small>
                  {#if editors}<small class="editing">✎ Sedang diedit oleh {editors}</small>{/if}
                </button>
                <span class="acts" role="group" aria-label="Tindakan SOP">
                  {@render ib('copy', 'Duplikat sebagai milik Anda', () => duplicate(s))}
                  {@render ib('history', 'Riwayat', () => toggleHistory(s), { on: history?.id === s.id, expanded: history?.id === s.id })}
                  {@render ib('users', accessTip(s), () => openAccess('sops', s))}
                  {#if canEdit(s)}{@render ib('pencil', 'Ubah nama', () => rename(s))}{/if}
                  {#if manage}
                    {@render ib('move', 'Pindahkan', () => moveSop(s))}
                    {@render ib('trash', 'Pindahkan ke Recycle bin', () => moveToBin(s), { danger: true })}
                  {/if}
                </span>
                {#if history?.id === s.id}
                  <div class="history">
                    {#each history.versions as v (v.rev)}
                      <div>
                        <span>{when(v.savedAt)} · {v.savedByName}</span>
                        {#if canEdit(s)}
                          {@render ib('restore', isOpen(s) ? 'Tutup tabnya dulu untuk mengembalikan versi' : 'Kembalikan versi ini', () => restoreVersion(s, v), { disabled: isOpen(s) })}
                        {/if}
                      </div>
                    {:else}
                      <span class="muted">Belum ada versi lama.</span>
                    {/each}
                  </div>
                {/if}
              </li>
            {/each}
            {#if !shownFolders.length && !shownLive.length}
              <li class="empty">{busy ? 'Memuat…' : searching ? 'Tidak ada yang cocok.' : here ? 'Belum ada SOP di folder ini.' : 'Belum ada SOP di sini.'}</li>
            {/if}
          </ul>
        {:else if view === 'bin'}
          <ul class="list">
            {#each shownBin as s (s.id)}
              <li oncontextmenu={(e) => openMenu(e, binMenu(s))}>
                <div class="main static">
                  <strong><Icon name="file" size={15} /> {titleOf(s)}</strong>
                  <small>{[s.nomor, `dibuat ${s.createdBy === faculty.user.uid ? 'Anda' : s.createdByName}`, `dihapus ${when(s.deletedAt)}`, size(s.totalBytes)].filter(Boolean).join(' · ')}</small>
                </div>
                <span class="acts" role="group" aria-label="Tindakan SOP">
                  {@render ib('restore', 'Pulihkan', () => restoreFromBin(s))}
                  {@render ib('trash', 'Hapus permanen', () => purge(s), { danger: true })}
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
              {@render ib('gauge', 'Ubah batas penyimpanan', changeLimit)}
              {@render ib('refresh', 'Hitung ulang pemakaian', recount)}
            </div>
          {:else}
            <small>Memuat…</small>
          {/if}
        </section>
        <section>
          <h3>Anggota <span class="muted">{members.length}</span></h3>
          <form onsubmit={addMember} class="row">
            <input bind:value={newEmail} type="email" placeholder="nama@ub.ac.id atau nama@gmail.com" aria-label="Email anggota baru" />
            <select bind:value={newRole} aria-label="Peran">
              <option value="member">Anggota</option>
              <option value="admin">Admin</option>
            </select>
            <button class="ib" aria-label="Tambah anggota" data-tip="Tambah anggota" disabled={!newEmail.trim()}><Icon name="plus" /></button>
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
                {@render ib('trash', self ? 'Anda tidak bisa mencabut akses sendiri' : 'Cabut akses', () => removeMember(m), { danger: true, disabled: self })}
              </li>
            {/each}
          </ul>
        </section>
      </div>
        {/if}
      </section>
    </div>
  {:else}
    <div class="gate">
      {#if faculty.status === 'out'}
        <p>Pustaka Daring menyimpan SOP bersama secara daring. Masuk dengan akun Google <strong>@ub.ac.id</strong> atau <strong>@gmail.com</strong> yang sudah didaftarkan admin.</p>
        <button class="btn primary" onclick={() => F.signIn().catch((e) => alert(e.message))}>Masuk dengan Google</button>
      {:else if faculty.status === 'domain'}
        <p><strong>{faculty.user.email}</strong> tidak bisa dipakai. Pustaka Daring hanya untuk akun @ub.ac.id atau @gmail.com.</p>
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
  {#if menu}<ContextMenu x={menu.x} y={menu.y} items={menu.items} host={dialog} onclose={() => (menu = null)} />{/if}
</dialog>

<dialog bind:this={moveDialog} class="dialog small-dialog" onclose={() => (moving = null)}>
  {#if moving}
    <form onsubmit={submitMove}>
      <h2>Pindahkan</h2>
      <p class="muted moved">{moving.isFolder ? moving.item.name : titleOf(moving.item)}</p>
      <label class="move">
        <span>Ke folder</span>
        <select bind:value={moving.target}>
          <option value={null}>Utama</option>
          {#each moveTargets as t (t.id)}
            <option value={t.id}>{'   '.repeat(t.depth + 1)}{t.name}</option>
          {/each}
        </select>
      </label>
      {#if !moving.item.custom}<small class="muted">Hak aksesnya akan mengikuti folder tujuan.</small>{/if}
      <footer class="end">
        <button type="button" class="btn" onclick={() => (moving = null)}>Batal</button>
        <button class="btn primary">Pindahkan</button>
      </footer>
    </form>
  {/if}
</dialog>

<AccessDialog target={accessTarget} onsave={saveAccess} onclose={() => (accessTarget = null)} />

<style>
  .dialog {
    width: min(1180px, calc(100vw - 2rem));
    max-height: calc(100vh - 3rem);
    border: 0;
    border-radius: 14px;
    padding: 1rem 1.1rem;
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
  .small-dialog {
    width: min(460px, calc(100vw - 2rem));
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
    flex: none;
  }
  h3 {
    margin: 0 0 0.45rem;
    font-size: 0.92rem;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .search {
    flex: 1;
    min-width: 0;
    margin: 0 0.5rem;
  }
  .who {
    flex: none;
    max-width: 14rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted);
    font-size: 0.8rem;
  }
  .muted {
    color: var(--muted);
    font-weight: 400;
  }
  .ib {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 1.85rem;
    height: 1.85rem;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 7px;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }
  .ib:hover:not([aria-disabled='true']):not(:disabled) {
    background: var(--surface-2);
    color: var(--text);
  }
  .ib.danger:hover:not([aria-disabled='true']):not(:disabled) {
    color: var(--danger);
  }
  .ib.on {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .ib[aria-disabled='true'],
  .ib:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .panes {
    flex: 0 1 auto;
    min-height: 0;
    height: min(660px, calc(100vh - 8rem));
    display: grid;
    grid-template-columns: minmax(200px, 270px) minmax(0, 1fr);
    border: 1px solid var(--line);
    border-radius: 10px;
    overflow: hidden;
  }
  aside {
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-right: 1px solid var(--line);
    background: var(--surface-2);
  }
  .tree {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 0.35rem;
  }
  .tree ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .tn {
    display: flex;
    align-items: center;
    border-radius: 6px;
  }
  .tn:hover {
    background: var(--line);
  }
  .tn.sel,
  .tname.nav.sel {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .chev {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 1.2rem;
    height: 1.2rem;
    padding: 0;
    border: 0;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }
  .chev.none {
    cursor: default;
  }
  .chev.open :global(svg) {
    transform: rotate(90deg);
  }
  .tname {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.28rem 0.35rem 0.28rem 0.1rem;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 0.85rem;
    text-align: left;
    cursor: pointer;
  }
  .tname :global(svg) {
    flex: none;
  }
  .tname span {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tname small {
    flex: none;
    color: var(--muted);
    font-size: 0.72rem;
  }
  aside nav {
    flex: none;
    padding: 0.35rem;
    border-top: 1px solid var(--line);
  }
  .tname.nav {
    width: 100%;
    padding-left: 0.5rem;
    border-radius: 6px;
  }
  .tname.nav:hover:not(.sel) {
    background: var(--line);
  }
  .content {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    padding: 0.45rem 0.6rem;
  }
  .crumbs {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    min-height: 2rem;
    margin-bottom: 0.35rem;
    font-size: 0.85rem;
  }
  .crumbs nav {
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
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow: auto;
    flex: 1;
    min-height: 0;
  }
  .list > li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.45rem;
    border-bottom: 1px solid var(--line);
    border-radius: 6px;
  }
  .list > li:hover:not(.empty) {
    background: var(--surface-2);
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
  .main strong :global(svg) {
    vertical-align: -2px;
    color: var(--muted);
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
    margin-left: 0.2rem;
    white-space: nowrap;
  }
  em.shared {
    color: var(--accent);
    background: var(--accent-soft);
    border-color: transparent;
  }
  .acts {
    display: inline-flex;
    flex: none;
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
    background: var(--surface);
    border: 1px solid var(--line);
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
    border-bottom: 0 !important;
  }
  .moved {
    margin: 0.2rem 0 0.7rem;
    font-size: 0.88rem;
    overflow-wrap: anywhere;
  }
  .move {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.86rem;
    margin-bottom: 0.4rem;
  }
  .move span {
    flex: none;
  }
  .move select {
    flex: 1;
    min-width: 0;
  }
  .small-dialog small {
    font-size: 0.78rem;
  }
  .end {
    display: flex;
    justify-content: flex-end;
    gap: 0.4rem;
    margin-top: 0.9rem;
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
    padding: 0.3rem 0.2rem;
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
