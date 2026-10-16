<script>
  import { baseline, PT } from './layout.js';

  let { page } = $props();

  const anchor = { left: 'start', center: 'middle', right: 'end' };
  const pts = (list) => list.map((p) => p.join(',')).join(' ');
</script>

<svg viewBox="0 0 {page.w} {page.h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Halaman SOP">
  <rect width={page.w} height={page.h} fill="#fff" />
  {#each page.items as it, i (i)}
    {#if it.t === 'rect'}
      <rect x={it.x} y={it.y} width={it.w} height={it.h} rx={it.r || 0} fill={it.fill ?? 'none'} stroke={it.stroke} stroke-width={it.lw} />
    {:else if it.t === 'poly'}
      {#if it.closed}
        <polygon points={pts(it.pts)} fill={it.fill ?? 'none'} stroke={it.stroke} stroke-width={it.lw} />
      {:else}
        <polyline points={pts(it.pts)} fill="none" stroke={it.stroke} stroke-width={it.lw} />
      {/if}
    {:else if it.t === 'circle'}
      <circle cx={it.cx} cy={it.cy} r={it.r} fill={it.fill ?? 'none'} stroke={it.stroke} stroke-width={it.lw} />
    {:else if it.t === 'text'}
      <text
        font-family="Helvetica, Arial, sans-serif"
        font-size={it.size * PT}
        font-weight={it.bold ? 700 : 400}
        fill={it.color}
        text-anchor={anchor[it.align]}
      >
        {#each it.lines as line, j (j)}<tspan x={it.x} y={baseline(it, j)}>{line}</tspan>{/each}
      </text>
    {:else if it.t === 'image'}
      <image href={it.src} x={it.x} y={it.y} width={it.w} height={it.h} preserveAspectRatio="none" />
    {:else if it.t === 'placeholder'}
      <rect x={it.x} y={it.y} width={it.w} height={it.h} fill="#f5f7fb" stroke="#b8c2d6" stroke-width="0.3" stroke-dasharray="1.2 1" />
      <text x={it.x + it.w / 2} y={it.y + it.h / 2 + 1} font-family="Helvetica, Arial, sans-serif" font-size="3" fill="#8a94a8" text-anchor="middle">{it.label}</text>
    {/if}
  {/each}
</svg>

<style>
  svg {
    display: block;
    width: 100%;
    height: auto;
  }
</style>
