<script>
  import { tick } from 'svelte';
  import { app } from './store.svelte.js';
  import { readImage } from './files.js';
  import { PT } from './layout.js';

  // Lapisan isian di atas halaman identitas: teks diketik langsung pada posisinya di dokumen.
  // Teks isian dibuat transparan sehingga yang terlihat tetap hasil render SVG (sama dengan PDF);
  // hanya kursor dan seleksi yang berasal dari elemen isian.
  let { fields, editable = true } = $props();

  const h = $derived(app.doc.header);
  const items = (key) => app.doc.sections[key].items;

  const value = (f) => (f.kind === 'item' ? items(f.key)[f.index] : h[f.key]) ?? '';
  function setValue(f, v) {
    if (f.kind === 'item') items(f.key)[f.index] = v;
    else h[f.key] = v;
  }

  /** Fokus ke isian `id` setelah tata letak diperbarui, dengan kursor di posisi `caret`. */
  async function focusField(id, caret = null) {
    await tick();
    const el = document.querySelector(`[data-field="${id}"]`);
    if (!el) return;
    el.focus();
    if (caret !== null) el.setSelectionRange(caret, caret);
  }

  function onTextKey(e, f) {
    if (e.key === 'Enter' && !e.shiftKey && !f.multiline) e.preventDefault();
  }

  function onItemKey(e, f) {
    const list = items(f.key);
    const i = f.index;
    const el = e.currentTarget;
    const { selectionStart: a, selectionEnd: b } = el;
    const text = list[i];
    const at = (j, caret) => focusField(`s:${f.key}:${j}`, caret);

    if (e.key === 'Enter' && !e.shiftKey) {
      // Enter memecah butir di posisi kursor.
      e.preventDefault();
      list[i] = text.slice(0, a);
      list.splice(i + 1, 0, text.slice(b));
      at(i + 1, 0);
    } else if (e.key === 'Backspace' && a === 0 && b === 0) {
      if (i > 0) {
        e.preventDefault();
        const prev = list[i - 1];
        list[i - 1] = prev + text;
        list.splice(i, 1);
        at(i - 1, prev.length);
      } else if (!text) {
        e.preventDefault();
        list.splice(0, 1);
        if (list.length) at(0, 0);
      }
    } else if (e.key === 'Delete' && a === text.length && b === a && i + 1 < list.length) {
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
      at(i - 1, list[i - 1].length);
    } else if (e.key === 'ArrowDown' && a === text.length && i + 1 < list.length) {
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

<div class="fields" inert={!editable}>
  {#each fields as f (f.id)}
    {#if f.kind === 'text'}
      <textarea
        class="f-text"
        class:bold={f.bold}
        class:center={f.align === 'center'}
        style={box(f)}
        data-field={f.id}
        aria-label={f.label}
        placeholder={f.placeholder ?? ''}
        spellcheck="false"
        value={value(f)}
        oninput={(e) => setValue(f, e.currentTarget.value)}
        onkeydown={(e) => onTextKey(e, f)}
      ></textarea>
    {:else if f.kind === 'item'}
      <div class="f-item" style={box({ ...f, size: 0, pad: 0 })}>
        <textarea
          class="f-text"
          style="font-size:calc({f.size * PT} * var(--mm))"
          data-field={f.id}
          aria-label="Butir {f.index + 1}"
          placeholder="Ketik butir…"
          spellcheck="false"
          value={value(f)}
          oninput={(e) => setValue(f, e.currentTarget.value)}
          onkeydown={(e) => onItemKey(e, f)}
        ></textarea>
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
    font-family: Carlito, Calibri, sans-serif;
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
  .f-item .f-text {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
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
    font: 600 11px/1 Calibri, Carlito, sans-serif;
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
    font: 11px/1.2 Calibri, Carlito, sans-serif;
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
  .err {
    font: 11px Calibri, Carlito, sans-serif;
    color: #c0392b;
  }
</style>
