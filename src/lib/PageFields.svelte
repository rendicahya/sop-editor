<script>
  import { tick } from 'svelte';
  import { app } from './store.svelte.js';
  import { readImage } from './files.js';
  import { PT } from './layout.js';
  import { newStep, removeStep, uid, SHAPES } from './model.js';
  import { collab } from './collab.svelte.js';
  import { plainText, sliceRich, getSelection, setSelection } from './richtext.js';
  import RichField from './RichField.svelte';

  // Lapisan isian di atas halaman (identitas dan diagram alir): teks diketik langsung pada posisinya di dokumen.
  // Teks isian dibuat transparan sehingga yang terlihat tetap hasil render SVG (sama dengan PDF);
  // hanya kursor dan seleksi yang berasal dari elemen isian.
  let { fields, editable = true } = $props();

  const h = $derived(app.doc.header);
  const items = (key) => app.doc.sections[key].items;

  /** Objek pemilik isian beserta kuncinya: langkah, pelaksana, butir bagian, atau kop. */
  function target(f) {
    if (f.step) return [app.doc.steps.find((s) => s.id === f.step), f.key];
    if (f.actor) return [app.doc.actors.find((a) => a.id === f.actor), f.key];
    if (f.kind === 'item') return [items(f.key), f.index];
    return [h, f.key];
  }
  const value = (f) => {
    const [o, k] = target(f);
    return o?.[k] ?? '';
  };
  function setValue(f, v) {
    const [o, k] = target(f);
    if (o) o[k] = v;
  }

  function moveStep(f) {
    const s = app.doc.steps.find((s) => s.id === f.step);
    if (s) s.actor = f.actor;
  }

  // Kelompok isian yang sedang disorot/difokus (pelaksana atau baris langkah): alatnya ditampilkan.
  let hover = $state(null);
  let focused = $state(null);
  const groupOf = (e) => e.target.closest?.('[data-hot]')?.dataset.hot ?? null;
  const isHot = (f) => hover === f.hot || focused === f.hot;

  const actors = $derived(app.doc.actors);
  const steps = $derived(app.doc.steps);
  const usage = (id) => steps.filter((s) => s.actor === id).length;

  function moveActor(i, d) {
    const j = i + d;
    if (j < 0 || j >= actors.length) return;
    [actors[i], actors[j]] = [actors[j], actors[i]];
  }
  function addActor(i) {
    const a = { id: uid(), name: '' };
    actors.splice(i + 1, 0, a);
    focusField('a:' + a.id);
  }
  // Pelaksana hanya bisa dihapus bila tidak ada langkah di lajurnya (dan bukan satu-satunya).
  const actorLock = (a) =>
    !a ? 'Tidak ditemukan' : actors.length <= 1 ? 'Minimal harus ada satu pelaksana' : usage(a.id) ? `Tidak bisa dihapus: ${usage(a.id)} langkah dilakukan pelaksana ini` : '';
  function removeActor(i) {
    if (!actorLock(actors[i])) actors.splice(i, 1);
  }

  function addStep(i) {
    const s = newStep(steps[i]?.actor ?? actors[0].id);
    steps.splice(i + 1, 0, s);
    focusField(`st:${s.id}:kegiatan`);
  }
  function moveStepRow(i, d) {
    const j = i + d;
    if (j < 0 || j >= steps.length) return;
    [steps[i], steps[j]] = [steps[j], steps[i]];
  }
  function duplicateStep(i) {
    steps.splice(i + 1, 0, { ...$state.snapshot(steps[i]), id: uid(), next: 'auto', alt: null });
  }
  // Peserta kolaborasi yang sedang mengedit langkah ini.
  const editors = (id) => collab.peers.filter((p) => p.focus?.step === id);

  // Menu simbol: id langkah yang menunya sedang terbuka.
  let menu = $state(null);
  const short = (s, i) => {
    const k = plainText(s.kegiatan);
    return `${i + 1}. ${k.length > 36 ? k.slice(0, 36) + '…' : k || '(tanpa nama)'}`;
  };
  function closeMenu(e) {
    if (menu && !e.target.closest?.('.f-shape')) menu = null;
  }

  /** Fokus ke isian `id` setelah tata letak diperbarui, dengan kursor di posisi `caret`. */
  async function focusField(id, caret = null) {
    await tick();
    const el = document.querySelector(`[data-field="${id}"]`);
    if (!el) return;
    el.focus();
    if (caret === null) return;
    if (el.isContentEditable) setSelection(el, caret);
    else el.setSelectionRange(caret, caret);
  }

  function onTextKey(e, f) {
    if (e.key === 'Enter' && !e.shiftKey && !f.multiline) e.preventDefault();
  }

  // Butir ketentuan berformat: posisi kursor dihitung pada teks polos, pemecahan butir mempertahankan format.
  function onItemKey(e, f) {
    const list = items(f.key);
    const i = f.index;
    const sel = getSelection(e.currentTarget) ?? { start: 0, end: 0 };
    const { start: a, end: b } = sel;
    const text = list[i];
    const len = plainText(text).length;
    const at = (j, caret) => focusField(`s:${f.key}:${j}`, caret);

    if (e.key === 'Enter' && !e.shiftKey) {
      // Enter memecah butir di posisi kursor.
      e.preventDefault();
      list[i] = sliceRich(text, 0, a);
      list.splice(i + 1, 0, sliceRich(text, b));
      at(i + 1, 0);
    } else if (e.key === 'Backspace' && a === 0 && b === 0) {
      if (i > 0) {
        e.preventDefault();
        const prev = list[i - 1];
        list[i - 1] = prev + text;
        list.splice(i, 1);
        at(i - 1, plainText(prev).length);
      } else if (!len) {
        e.preventDefault();
        list.splice(0, 1);
        if (list.length) at(0, 0);
      }
    } else if (e.key === 'Delete' && a === len && b === a && i + 1 < list.length) {
      e.preventDefault();
      list[i] = text + list[i + 1];
      list.splice(i + 1, 1);
      at(i, a);
    } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      // Alt+↑/↓ memindahkan butir.
      e.preventDefault();
      const j = i + (e.key === 'ArrowUp' ? -1 : 1);
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      at(j, a);
    } else if (e.key === 'ArrowUp' && a === 0 && b === 0 && i > 0) {
      e.preventDefault();
      at(i - 1, plainText(list[i - 1]).length);
    } else if (e.key === 'ArrowDown' && a === len && i + 1 < list.length) {
      e.preventDefault();
      at(i + 1, 0);
    }
  }

  function addItem(key) {
    items(key).push('');
    focusField(`s:${key}:${items(key).length - 1}`, 0);
  }

  function removeItem(f) {
    items(f.key).splice(f.index, 1);
  }

  function fromActors() {
    app.doc.sections.kualifikasi.items = app.doc.actors.map((a) => a.name);
  }

  let fileInput = $state();
  let imageError = $state('');
  async function pickImage(e) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    imageError = '';
    try {
      h.signature = await readImage(file);
    } catch (err) {
      imageError = err.message;
    }
  }

  const box = (f) =>
    `left:calc(${f.x} * var(--mm));top:calc(${f.y} * var(--mm));width:calc(${f.w} * var(--mm));height:calc(${f.h} * var(--mm));` +
    (f.size ? `font-size:calc(${f.size * PT} * var(--mm));` : '') +
    (f.pad ? `padding:calc(${f.pad} * var(--mm));` : '');
</script>

<svelte:window onpointerdown={closeMenu} onkeydown={(e) => e.key === 'Escape' && (menu = null)} /><div
  class="fields"
  inert={!editable}
  onpointerover={(e) => (hover = groupOf(e))}
  onpointerleave={() => (hover = null)}
  onfocusin={(e) => (focused = groupOf(e))}
  onfocusout={() => (focused = null)}
>
  {#each fields as f (f.id)}
    {#if f.kind === 'text' && f.rich}
      <RichField
        class="f-text"
        style={box(f)}
        data-field={f.id}
        data-hot={f.hot}
        aria-label={f.label}
        placeholder={f.placeholder ?? ''}
        multiline={f.multiline}
        value={value(f)}
        oninput={(v) => setValue(f, v)}
      />
    {:else if f.kind === 'text'}
      <textarea
        class="f-text"
        class:bold={f.bold}
        class:center={f.align === 'center'}
        style={box(f)}
        data-field={f.id}
        data-hot={f.hot}
        aria-label={f.label}
        placeholder={f.placeholder ?? ''}
        spellcheck="false"
        value={value(f)}
        oninput={(e) => setValue(f, e.currentTarget.value)}
        onkeydown={(e) => onTextKey(e, f)}
      ></textarea>
    {:else if f.kind === 'item'}
      <div class="f-item" style={box({ ...f, size: 0, pad: 0 })}>
        <RichField
          class="f-text"
          style="position:absolute;inset:0;font-size:calc({f.size * PT} * var(--mm))"
          data-field={f.id}
          aria-label="Butir {f.index + 1}"
          placeholder="Ketik butir…"
          value={value(f)}
          oninput={(v) => setValue(f, v)}
          onkeydown={(e) => onItemKey(e, f)}
        />
        <button class="f-del" tabindex="-1" title="Hapus butir" aria-label="Hapus butir" onclick={() => removeItem(f)}>✕</button>
      </div>
    {:else if f.kind === 'date'}
      <!-- Input tanggal tak terlihat: hasilnya langsung tampil terformat di halaman. -->
      <span class="f-date" style={box({ ...f, pad: 0 })} title="Pilih tanggal">
        <input
          type="date"
          data-field={f.id}
          aria-label={f.label}
          bind:value={h[f.key]}
          onclick={(e) => e.currentTarget.showPicker?.()}
        />
      </span>
    {:else if f.kind === 'image'}
      <div class="f-image" class:has={!!h.signature} style={box(f)}>
        {#if h.signature}
          <span class="tools">
            <button onclick={() => fileInput.click()}>Ganti tanda tangan</button>
            <button onclick={() => (h.signature = null)}>Hapus</button>
          </span>
        {:else}
          <button class="f-hint" onclick={() => fileInput.click()} title="PNG berlatar transparan akan tampak paling baik">
            + Tanda tangan / stempel (opsional)
          </button>
        {/if}
        {#if imageError}<span class="err">{imageError}</span>{/if}
      </div>
    {:else if f.kind === 'section'}
      <div class="f-head" style={box(f)}>
        <span class="tools">
          <label title="Butir bernomor">
            <input type="checkbox" bind:checked={app.doc.sections[f.key].numbered} /> Bernomor
          </label>
          {#if f.key === 'kualifikasi'}
            <button onclick={fromActors} title="Isi dengan nama-nama pelaksana">Dari pelaksana</button>
          {/if}
          <button onclick={() => addItem(f.key)}>+ Butir</button>
        </span>
      </div>
    {:else if f.kind === 'lane'}
      <button
        class="f-lane"
        style={box(f)}
        data-field={f.id}
        data-hot={f.hot}
        tabindex="-1"
        title="Pindahkan langkah ini ke {f.name || 'pelaksana ini'}"
        aria-label="Pindahkan langkah ke {f.name || 'pelaksana ini'}"
        onclick={() => moveStep(f)}
      ></button>
    {:else if f.kind === 'actor-tools'}
      {@const a = actors[f.index]}
      {@const lock = actorLock(a)}
      <div class="f-group" class:hot={isHot(f)} style={box(f)} data-hot={f.hot}>
        <span class="g-tools g-top">
          <button tabindex="-1" title="Geser ke kiri" aria-label="Geser pelaksana ke kiri" aria-disabled={f.index === 0} onclick={() => moveActor(f.index, -1)}>◀</button>
          <button tabindex="-1" title="Tambah pelaksana di kanan" aria-label="Tambah pelaksana" onclick={() => addActor(f.index)}>＋</button>
          <button
            tabindex="-1"
            class="danger"
            title={lock || 'Hapus pelaksana'}
            aria-label="Hapus pelaksana"
            aria-disabled={!!lock}
            onclick={() => removeActor(f.index)}>✕</button
          >
          <button tabindex="-1" title="Geser ke kanan" aria-label="Geser pelaksana ke kanan" aria-disabled={f.index === actors.length - 1} onclick={() => moveActor(f.index, 1)}>▶</button>
        </span>
      </div>
    {:else if f.kind === 'step-tools'}
      {@const peers = editors(f.step)}
      <div class="f-group" class:hot={isHot(f)} class:shared={peers.length} style="{box(f)}--peer:{peers[0]?.color}" data-hot={f.hot}>
        <span class="g-tools g-left">
          <button tabindex="-1" title="Naikkan" aria-label="Naikkan kegiatan" aria-disabled={f.index === 0} onclick={() => moveStepRow(f.index, -1)}>▲</button>
          <button tabindex="-1" title="Turunkan" aria-label="Turunkan kegiatan" aria-disabled={f.index === steps.length - 1} onclick={() => moveStepRow(f.index, 1)}>▼</button>
          <button tabindex="-1" title="Duplikat" aria-label="Duplikat kegiatan" onclick={() => duplicateStep(f.index)}>⧉</button>
          <button tabindex="-1" title="Tambah kegiatan di bawah" aria-label="Tambah kegiatan di bawah" onclick={() => addStep(f.index)}>＋</button>
          <button tabindex="-1" class="danger" title="Hapus kegiatan" aria-label="Hapus kegiatan" onclick={() => removeStep(steps, f.index)}>✕</button>
        </span>
        {#if peers.length}
          <span class="peers">{#each peers as p (p.id)}<span style:background={p.color}>{p.name}</span>{/each}</span>
        {/if}
      </div>
    {:else if f.kind === 'shape'}
      {@const s = steps[f.index]}
      {@const open = menu === f.step && s}
      <div class="f-shape" class:open style={box(f)} data-hot={f.hot}>
        <button
          class="f-shape-btn"
          tabindex="-1"
          data-field={f.id}
          title="Ubah simbol"
          aria-label="Ubah simbol langkah {f.index + 1}"
          aria-expanded={!!open}
          onclick={() => (menu = open ? null : f.step)}
        ></button>
        {#if open}
          {@const dec = s.shape === 'decision'}
          <div class="shape-menu" class:up={f.y > 115} role="dialog" aria-label="Simbol langkah {f.index + 1}">
            <div class="seg" role="group" aria-label="Simbol">
              {#each SHAPES as sh (sh.value)}
                <button class:on={s.shape === sh.value} aria-pressed={s.shape === sh.value} onclick={() => (s.shape = sh.value)}>{sh.label}</button>
              {/each}
            </div>
            <label>
              <span>{dec ? 'Jika ya, lanjut ke' : 'Lanjut ke'}</span>
              <select value={s.next} onchange={(e) => (s.next = e.currentTarget.value)}>
                <option value="auto">Langkah berikutnya{f.index + 1 < steps.length ? ` (${f.index + 2})` : ' (tidak ada)'}</option>
                <option value="none">Tidak ada (akhir alur)</option>
                {#each steps as t, j (t.id)}
                  {#if j !== f.index}<option value={t.id}>{short(t, j)}</option>{/if}
                {/each}
              </select>
            </label>
            {#if dec}
              <label>
                <span>Label ya</span>
                <input value={s.yesLabel} oninput={(e) => (s.yesLabel = e.currentTarget.value)} />
              </label>
              <label>
                <span>Jika tidak, ke</span>
                <select value={s.alt ?? ''} onchange={(e) => (s.alt = e.currentTarget.value || null)}>
                  <option value="">—</option>
                  {#each steps as t, j (t.id)}
                    {#if j !== f.index}<option value={t.id}>{short(t, j)}</option>{/if}
                  {/each}
                </select>
              </label>
              <label>
                <span>Label tidak</span>
                <input value={s.noLabel} oninput={(e) => (s.noLabel = e.currentTarget.value)} />
              </label>
            {/if}
          </div>
        {/if}
      </div>
    {:else if f.kind === 'add-step'}
      <button class="f-empty f-hint" style={box(f)} onclick={() => addStep(-1)}>+ Tambah kegiatan</button>
    {:else if f.kind === 'empty'}
      <button class="f-empty f-hint" style={box(f)} onclick={() => addItem(f.key)}>+ Tambah butir {f.title.toLowerCase()}</button>
    {/if}
  {/each}
</div>
<input bind:this={fileInput} type="file" accept="image/*" hidden onchange={pickImage} />

<style>
  .fields {
    position: absolute;
    inset: 0;
    --mm: calc(100cqw / 297);
    --edit: 47 102 176;
    font-family: SOPDoc, Calibri, Carlito, sans-serif;
  }
  .fields > * {
    position: absolute;
    box-sizing: border-box;
    margin: 0;
  }
  .f-text {
    border: 0;
    border-radius: 0;
    resize: none;
    overflow: hidden;
    background: transparent;
    color: transparent;
    caret-color: #000;
    font: inherit;
    line-height: 1.2;
    white-space: pre-wrap;
    overflow-wrap: break-word;
    outline: none;
    padding: 0;
    cursor: text;
  }
  /* Isian berformat (RichField) memakai gaya isian teks yang sama. */
  .fields > :global(.f-rich) {
    position: absolute;
    box-sizing: border-box;
    margin: 0;
  }
  .fields :global(.f-rich:hover) {
    background: rgb(var(--edit) / 0.06);
    box-shadow: inset 0 0 0 1px rgb(var(--edit) / 0.35);
  }
  .fields :global(.f-rich:focus) {
    background: rgb(var(--edit) / 0.08);
    box-shadow: inset 0 0 0 1.5px rgb(var(--edit));
  }
  .f-text.bold {
    font-weight: 700;
  }
  .f-text.center {
    text-align: center;
  }
  .f-text::selection {
    background: rgb(var(--edit) / 0.3);
    color: transparent;
  }
  .f-text::placeholder {
    color: #98a2b6;
    opacity: 0;
    font-style: italic;
  }
  :global(.page:hover) .f-text::placeholder,
  .f-text:focus::placeholder {
    opacity: 1;
  }
  .f-text:hover,
  .f-date:hover,
  .f-image:hover {
    background: rgb(var(--edit) / 0.06);
    box-shadow: inset 0 0 0 1px rgb(var(--edit) / 0.35);
  }
  .f-text:focus {
    background: rgb(var(--edit) / 0.08);
    box-shadow: inset 0 0 0 1.5px rgb(var(--edit));
  }

  .f-del {
    right: 0;
    top: 0;
    transform: translate(35%, -35%);
    box-shadow: 0 0 0 1.5px #fff;
    width: calc(4 * var(--mm));
    height: calc(4 * var(--mm));
    min-width: 14px;
    min-height: 14px;
    position: absolute;
    display: none;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: #c0392b;
    color: #fff;
    font-size: 9px;
    cursor: pointer;
  }
  .f-item:hover .f-del,
  .f-item:focus-within .f-del {
    display: grid;
  }

  .f-date input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    opacity: 0;
    cursor: pointer;
  }
  .f-date:focus-within {
    background: rgb(var(--edit) / 0.08);
    box-shadow: inset 0 0 0 1.5px rgb(var(--edit));
  }

  .f-image,
  .f-head {
    display: flex;
    align-items: flex-start;
    justify-content: flex-end;
    padding: 0 0.25rem;
  }
  .f-image.has {
    align-items: flex-end;
  }
  .f-image:not(.has) {
    justify-content: center;
    align-items: center;
  }
  .f-head {
    align-items: center;
  }
  .tools {
    display: flex;
    gap: 0.25rem;
    align-items: center;
    opacity: 0;
    transition: opacity 0.12s;
  }
  .f-image:hover .tools,
  .f-image:focus-within .tools,
  .f-head:hover .tools,
  .f-head:focus-within .tools {
    opacity: 1;
  }
  .tools button,
  .tools label {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    font: 600 11px/1 var(--ui-font);
    padding: 3px 7px;
    border: 1px solid rgb(var(--edit) / 0.5);
    border-radius: 5px;
    background: #fff;
    color: rgb(var(--edit));
    cursor: pointer;
    white-space: nowrap;
  }
  .tools input {
    margin: 0;
  }
  .f-hint {
    font: 11px/1.2 var(--ui-font);
    color: rgb(var(--edit));
    background: transparent;
    border: 1px dashed rgb(var(--edit) / 0.5);
    border-radius: 5px;
    padding: 4px 8px;
    cursor: pointer;
    opacity: 0;
  }
  :global(.page:hover) .f-hint,
  .f-hint:focus-visible {
    opacity: 1;
  }
  .f-empty {
    border-radius: 0;
    border: 0;
  }
  .f-empty:hover {
    background: rgb(var(--edit) / 0.06);
    box-shadow: inset 0 0 0 1px rgb(var(--edit) / 0.35);
  }
  .f-lane {
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    cursor: pointer;
  }
  .f-lane:hover {
    background: rgb(var(--edit) / 0.06);
    box-shadow: inset 0 0 0 1px rgb(var(--edit) / 0.35);
  }
  .f-lane:hover::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: calc(14 * var(--mm));
    height: calc(5.5 * var(--mm));
    transform: translate(-50%, -50%);
    border: 1.5px dashed rgb(var(--edit) / 0.6);
  }
  .f-group.hot {
    background: rgb(var(--edit) / 0.035);
  }
  .f-group.shared {
    box-shadow: inset 0 0 0 1.5px var(--peer);
  }
  .peers {
    position: absolute;
    right: 2px;
    top: 2px;
    display: flex;
    gap: 2px;
    pointer-events: none;
  }
  .peers span {
    font: 600 10px/1 var(--ui-font);
    color: #fff;
    padding: 2px 5px;
    border-radius: 3px;
    white-space: nowrap;
  }
  .g-tools {
    position: absolute;
    display: flex;
    gap: 2px;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.12s;
    z-index: 1;
  }
  .f-group.hot .g-tools {
    opacity: 1;
    pointer-events: auto;
  }
  .g-top {
    left: 50%;
    top: 0;
    transform: translate(-50%, -55%);
  }
  .g-left {
    right: 100%;
    top: 50%;
    flex-direction: column;
    padding-right: 3px;
    transform: translateY(-50%);
  }
  .g-tools button {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    padding: 0;
    font: 600 10px/1 var(--ui-font);
    border: 1px solid rgb(var(--edit) / 0.5);
    border-radius: 4px;
    background: #fff;
    color: rgb(var(--edit));
    cursor: pointer;
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
  }
  .g-tools button:hover {
    background: rgb(var(--edit));
    color: #fff;
  }
  .g-tools button.danger {
    border-color: rgb(192 57 43 / 0.5);
    color: #c0392b;
  }
  .g-tools button.danger:hover {
    background: #c0392b;
    color: #fff;
  }
  .g-tools button[aria-disabled='true'] {
    opacity: 0.35;
    cursor: not-allowed;
    background: #fff;
    color: #888;
    border-color: #bbb;
  }
  .f-shape.open {
    z-index: 5;
  }
  .f-shape-btn {
    position: absolute;
    inset: 0;
    padding: 0;
    border: 0;
    border-radius: 3px;
    background: transparent;
    cursor: pointer;
  }
  .f-shape-btn:hover,
  .f-shape.open .f-shape-btn {
    box-shadow: 0 0 0 1.5px rgb(var(--edit) / 0.7);
    background: rgb(var(--edit) / 0.06);
  }
  .shape-menu {
    position: absolute;
    left: 50%;
    top: calc(100% + 4px);
    transform: translateX(-50%);
    width: 250px;
    display: grid;
    gap: 6px;
    padding: 8px;
    font: 12px/1.2 var(--ui-font);
    color: #1f2633;
    background: #fff;
    border: 1px solid rgb(var(--edit) / 0.4);
    border-radius: 8px;
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.18);
  }
  .shape-menu.up {
    top: auto;
    bottom: calc(100% + 4px);
  }
  .seg {
    display: flex;
    border: 1px solid rgb(var(--edit) / 0.5);
    border-radius: 6px;
    overflow: hidden;
  }
  .seg button {
    flex: 1;
    padding: 5px 4px;
    border: 0;
    background: #fff;
    color: rgb(var(--edit));
    font: 600 11px/1.1 var(--ui-font);
    cursor: pointer;
  }
  .seg button + button {
    border-left: 1px solid rgb(var(--edit) / 0.5);
  }
  .seg button.on {
    background: rgb(var(--edit));
    color: #fff;
  }
  .shape-menu label {
    display: grid;
    gap: 2px;
  }
  .shape-menu label span {
    font-size: 11px;
    color: #5b6577;
  }
  .shape-menu select,
  .shape-menu input {
    width: 100%;
    box-sizing: border-box;
    font: 12px var(--ui-font);
    padding: 3px 5px;
    border: 1px solid #c5cbd6;
    border-radius: 5px;
    background: #fff;
    color: #1f2633;
  }
  .err {
    font: 11px var(--ui-font);
    color: #c0392b;
  }
</style>
