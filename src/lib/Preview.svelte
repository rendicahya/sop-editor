<script>
  import PageSvg from './PageSvg.svelte';

  let { pages, zoom = 100 } = $props();
</script>

<div class="pages" style:--zoom={zoom / 100}>
  {#each pages as page, i (i)}
    <figure class="sheet">
      <PageSvg {page} />
      <figcaption>Halaman {i + 1} / {pages.length}</figcaption>
    </figure>
  {/each}
</div>

<style>
  .pages {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.25rem;
    padding: 1.25rem;
  }
  .sheet {
    margin: 0;
    width: calc(100% * var(--zoom));
    max-width: none;
    flex: none;
  }
  .sheet :global(svg) {
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.15), 0 8px 24px rgb(0 0 0 / 0.08);
  }
  figcaption {
    text-align: center;
    font-size: 0.75rem;
    color: var(--muted);
    margin-top: 0.4rem;
  }
</style>
