<script>
  import { richToHtml, domToRich, getSelection, setSelection, plainText, applyCase } from './richtext.js';

  // Isian teks berformat (contenteditable). Nilainya string bertag <b>/<i>/<u>; seperti textarea biasa,
  // teksnya transparan sehingga yang terlihat tetap hasil render halaman.
  let { value, oninput, onkeydown, multiline = false, placeholder = '', class: cls = '', ...rest } = $props();

  let el;
  let last = null; // nilai terakhir yang sudah ada di DOM (dari ketikan sendiri atau render terakhir)

  // Perubahan dari luar (undo, kolaborasi, cari & ganti): DOM diganti, kursor dipertahankan.
  $effect(() => {
    const v = value ?? '';
    if (v === last) return;
    const sel = document.activeElement === el ? getSelection(el) : null;
    el.innerHTML = richToHtml(v);
    last = v;
    if (sel) {
      const n = plainText(v).length;
      setSelection(el, Math.min(sel.start, n), Math.min(sel.end, n));
    }
  });

  const empty = $derived(!plainText(value));

  function input() {
    last = domToRich(el);
    oninput(last);
  }

  const SHORTCUT = { b: 'bold', i: 'italic', u: 'underline' };

  function keydown(e) {
    const cmd = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && SHORTCUT[e.key.toLowerCase()];
    if (cmd) {
      e.preventDefault();
      document.execCommand(cmd);
      return;
    }
    if (e.key === 'F3' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      applyCase(el, 'cycle');
      return;
    }
    onkeydown?.(e);
    if (e.defaultPrevented || e.key !== 'Enter') return;
    e.preventDefault();
    if (multiline || e.shiftKey) document.execCommand('insertLineBreak');
  }

  // Tempel sebagai teks polos agar format dari sumber lain tidak terbawa.
  function paste(e) {
    e.preventDefault();
    let t = e.clipboardData?.getData('text/plain') ?? '';
    t = t.replace(/\r\n?/g, '\n');
    if (!multiline) t = t.replace(/\n+/g, ' ');
    document.execCommand('insertText', false, t);
  }
</script>

<div
  bind:this={el}
  class="f-rich {cls}"
  class:empty
  contenteditable="true"
  role="textbox"
  tabindex="0"
  aria-multiline={multiline}
  data-placeholder={placeholder}
  spellcheck="false"
  oninput={input}
  onkeydown={keydown}
  onpaste={paste}
  ondrop={(e) => e.preventDefault()}
  {...rest}
></div>

<style>
  .f-rich {
    outline: none;
    overflow: hidden;
    white-space: pre-wrap;
    overflow-wrap: break-word;
    line-height: 1.2;
    color: transparent;
    caret-color: #000;
    cursor: text;
  }
  .f-rich :global(*) {
    color: transparent;
  }
  .f-rich::selection,
  .f-rich :global(*::selection) {
    background: rgb(var(--edit) / 0.3);
    color: transparent;
  }
  .f-rich.empty::before {
    content: attr(data-placeholder);
    position: absolute;
    color: #98a2b6;
    font-style: italic;
    opacity: 0;
    pointer-events: none;
  }
  :global(.page:hover) .f-rich.empty::before,
  .f-rich.empty:focus::before {
    opacity: 1;
  }
</style>
