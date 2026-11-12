<script>
  import { tick } from 'svelte';
  import { dismiss } from './dismiss.js';
  import { linkGraph, layoutGraph, NODE_W, NODE_H } from './linkMap.js';

  /**
   * Peta keterkaitan: SOP di Pustaka Daring yang saling tertaut lewat butir Keterkaitan (doc.links).
   * sops: baris pustaka yang sudah membawa `links`; titleOf(s), where(s): nama dan lokasi folder; isOpen(s): terbuka di tab;
   * onopen(s): membuka SOP.
   */
  let { open = $bindable(false), sops = [], titleOf, where, isOpen, onopen } = $props();

  let dialog;
  let box = $state();
  let zoom = $state(1);
  let hover = $state(null);
  let picked = $state(null);
  let query = $state('');

  $effect(() => {
    if (open && !dialog.open) {
      dialog.showModal();
      picked = null;
      hover = null;
      query = '';
      tick().then(fit);
    } else if (!open && dialog.open) dialog.close();
  });

  const graph = $derived(open ? linkGraph(sops) : null);
  const layout = $derived(graph ? layoutGraph(graph, (s) => titleOf(s)) : null);
  const byId = $derived(new Map(layout?.nodes.map((n) => [n.id, n]) ?? []));

  function fit() {
    if (!layout || !box) return;
    const z = Math.min((box.clientWidth - 16) / layout.w, (box.clientHeight - 16) / layout.h, 1);
    zoom = Math.max(0.2, Math.round(z * 100) / 100);
  }
  const setZoom = (z) => (zoom = Math.min(2.5, Math.max(0.2, Math.round(z * 100) / 100)));
  function wheel(e) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
  }

  // Sorotan: simpul yang disorot (atau dipilih) beserta tetangganya.
  const focus = $derived(hover ?? picked);
  const near = $derived.by(() => {
    if (!focus || !graph) return null;
    const set = new Set([focus]);
    for (const e of graph.edges) {
      if (e.from === focus) set.add(e.to);
      if (e.to === focus) set.add(e.from);
    }
    return set;
  });
  const words = $derived(query.trim().toLowerCase().split(/\s+/).filter(Boolean));
  const hit = (n) => words.length > 0 && words.every((w) => n.search.includes(w));

  const pickedNode = $derived(picked ? byId.get(picked) : null);
  // Tautan dua arah disimpan sebagai satu garis (`both`).
  const outOf = (id) => graph.edges.flatMap((e) => (e.from === id ? [e.to] : e.both && e.to === id ? [e.from] : [])).map((x) => byId.get(x));
  const inOf = (id) => graph.edges.flatMap((e) => (e.to === id ? [e.from] : e.both && e.from === id ? [e.to] : [])).map((x) => byId.get(x));

  /** Titik pada tepi kotak simpul `n` di arah titik (x, y). */
  function edgePoint(n, x, y) {
    const dx = x - n.x;
    const dy = y - n.y;
    if (!dx && !dy) return [n.x, n.y];
    const sx = NODE_W / 2 / Math.abs(dx || 1e-9);
    const sy = NODE_H / 2 / Math.abs(dy || 1e-9);
    const s = Math.min(sx, sy);
    return [n.x + dx * s, n.y + dy * s];
  }
  function segment(e) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    const [x1, y1] = edgePoint(a, b.x, b.y);
    const [x2, y2] = edgePoint(b, a.x, a.y);
    return { x1, y1, x2, y2 };
  }

  function nodeKey(e, n) {
    if (e.key === 'Enter') onopen(n.sop);
    else if (e.key === ' ') {
      e.preventDefault();
      picked = picked === n.id ? null : n.id;
    }
  }
</script>

<dialog bind:this={dialog} class="dialog" use:dismiss onclose={() => (open = false)}>
  {#if open && layout}
    <header>
      <div>
        <h2>Peta keterkaitan</h2>
        <small>
          {#if layout.nodes.length}
            {layout.nodes.length} SOP · {graph.edges.length} tautan{graph.hidden ? ` · ${graph.hidden} tautan menuju SOP yang tidak terlihat atau sudah dihapus` : ''}
          {:else}
            Belum ada SOP yang saling tertaut
          {/if}
        </small>
      </div>
      <div class="tools">
        <input type="search" bind:value={query} placeholder="Sorot SOP…" aria-label="Cari SOP di peta" />
        <button type="button" class="btn ghost" onclick={() => setZoom(zoom / 1.2)} aria-label="Perkecil">−</button>
        <span class="zoom">{Math.round(zoom * 100)}%</span>
        <button type="button" class="btn ghost" onclick={() => setZoom(zoom * 1.2)} aria-label="Perbesar">+</button>
        <button type="button" class="btn ghost" onclick={fit}>Pas layar</button>
        <button type="button" class="btn" onclick={() => (open = false)}>Tutup</button>
      </div>
    </header>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="canvas" bind:this={box} onwheel={wheel}>
      {#if layout.nodes.length}
        <svg width={layout.w * zoom} height={layout.h * zoom} viewBox="0 0 {layout.w} {layout.h}" role="img" aria-label="Diagram keterkaitan SOP">
          <defs>
            <marker id="lm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 10 5 0 10z" style="fill: var(--muted)" />
            </marker>
            <marker id="lm-arrow-lit" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0 0 10 5 0 10z" style="fill: var(--accent, #2563eb)" />
            </marker>
          </defs>
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <rect width={layout.w} height={layout.h} fill="transparent" onclick={() => (picked = null)} />
          {#each graph.edges as e (e.key)}
            {@const s = segment(e)}
            {@const lit = !!near && (e.from === focus || e.to === focus)}
            {@const m = lit ? 'url(#lm-arrow-lit)' : 'url(#lm-arrow)'}
            <line
              {...s}
              class="edge"
              class:lit
              class:dim={near && !lit}
              marker-end={m}
              marker-start={e.both ? m : undefined}
            />
          {/each}
          {#each layout.nodes as n (n.id)}
            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
            <g
              class="node"
              class:dim={near && !near.has(n.id)}
              class:sel={picked === n.id}
              class:hit={hit(n)}
              class:opened={isOpen(n.sop)}
              transform="translate({n.x - NODE_W / 2} {n.y - NODE_H / 2})"
              role="button"
              tabindex="0"
              aria-label={n.title}
              onpointerenter={() => (hover = n.id)}
              onpointerleave={() => hover === n.id && (hover = null)}
              onfocus={() => (hover = n.id)}
              onblur={() => hover === n.id && (hover = null)}
              onclick={() => (picked = picked === n.id ? null : n.id)}
              ondblclick={() => onopen(n.sop)}
              onkeydown={(e) => nodeKey(e, n)}
            >
              <title>{n.title}{'\n'}{where(n.sop)}{'\n'}Klik dua kali untuk membuka</title>
              <rect width={NODE_W} height={NODE_H} rx="8" />
              {#each n.lines as line, i (i)}
                <text x={NODE_W / 2} y={NODE_H / 2 + (i - (n.lines.length - 1) / 2) * 15 + 5}>{line}</text>
              {/each}
            </g>
          {/each}
        </svg>
      {:else}
        <p class="empty">
          Tautkan butir Keterkaitan ke SOP lain di Pustaka Daring (klik kanan butir Keterkaitan → Tautkan ke SOP), lalu simpan
          SOP-nya ke Pustaka Daring. SOP yang saling tertaut akan tampil di sini.
        </p>
      {/if}
    </div>
    {#if pickedNode}
      {@const outs = outOf(pickedNode.id)}
      {@const ins = inOf(pickedNode.id)}
      <footer>
        <div class="who">
          <strong>{pickedNode.title}</strong>
          <small>{where(pickedNode.sop)}</small>
        </div>
        <div class="rel">
          <span class="lbl">Merujuk ke</span>
          {#each outs as n (n.id)}<button type="button" class="chip" onclick={() => (picked = n.id)}>{n.title}</button>{:else}<span class="none">—</span>{/each}
        </div>
        <div class="rel">
          <span class="lbl">Dirujuk oleh</span>
          {#each ins as n (n.id)}<button type="button" class="chip" onclick={() => (picked = n.id)}>{n.title}</button>{:else}<span class="none">—</span>{/each}
        </div>
        <button type="button" class="btn primary" onclick={() => onopen(pickedNode.sop)}>Buka SOP</button>
      </footer>
    {:else if layout.nodes.length}
      <footer class="hint">Arahkan ke SOP untuk menyorot tautannya · klik untuk melihat rinciannya · klik dua kali untuk membuka · Ctrl+gulir untuk memperbesar</footer>
    {/if}
  {/if}
</dialog>

<style>
  .dialog {
    width: min(1300px, calc(100vw - 2rem));
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
    background: rgb(15 23 42 / 0.5);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem 0.75rem;
    padding: 0.7rem 1rem;
    border-bottom: 1px solid var(--line);
  }
  h2 {
    margin: 0;
    font-size: 1.05rem;
  }
  header small {
    color: var(--muted);
    font-size: 0.8rem;
  }
  .tools {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .tools input {
    width: min(14rem, 50vw);
  }
  .tools .btn.ghost {
    min-width: 2rem;
  }
  .zoom {
    font-size: 0.8rem;
    color: var(--muted);
    min-width: 2.8rem;
    text-align: center;
  }
  .canvas {
    flex: 1;
    overflow: auto;
    background: var(--bg);
    padding: 8px;
  }
  svg {
    display: block;
    margin: auto;
  }
  .edge {
    stroke: var(--muted);
    stroke-width: 1.4;
    opacity: 0.7;
    transition: opacity 0.12s;
  }
  .edge.lit {
    stroke: var(--accent, #2563eb);
    stroke-width: 2.2;
    opacity: 1;
  }
  .edge.dim {
    opacity: 0.12;
  }
  .node {
    cursor: pointer;
    transition: opacity 0.12s;
    outline: none;
  }
  .node rect {
    fill: var(--surface);
    stroke: var(--line);
    stroke-width: 1.4;
  }
  .node text {
    fill: var(--text);
    font-size: 12.5px;
    text-anchor: middle;
  }
  .node:hover rect,
  .node:focus-visible rect {
    stroke: var(--accent, #2563eb);
  }
  .node.opened rect {
    stroke-dasharray: 5 3;
  }
  .node.sel rect {
    stroke: var(--accent, #2563eb);
    stroke-width: 2.6;
  }
  .node.hit rect {
    fill: var(--warn-bg, #fef3c7);
    stroke: #d98e04;
  }
  .node.dim {
    opacity: 0.25;
  }
  .empty {
    max-width: 34rem;
    margin: 3rem auto;
    color: var(--muted);
    font-size: 0.9rem;
    line-height: 1.5;
    text-align: center;
  }
  footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 1rem;
    padding: 0.6rem 1rem;
    border-top: 1px solid var(--line);
    font-size: 0.85rem;
  }
  footer.hint {
    color: var(--muted);
    font-size: 0.78rem;
  }
  .who {
    display: grid;
    min-width: 12rem;
    max-width: 22rem;
  }
  .who small,
  .lbl,
  .none {
    color: var(--muted);
    font-size: 0.78rem;
  }
  .rel {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
    flex: 1;
    min-width: 12rem;
  }
  .lbl {
    margin-right: 0.2rem;
  }
  .chip {
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--text);
    font-size: 0.78rem;
    padding: 0.1rem 0.55rem;
    cursor: pointer;
    max-width: 18rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chip:hover {
    border-color: var(--accent, #2563eb);
  }
</style>
