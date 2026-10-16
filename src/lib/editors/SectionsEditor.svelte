<script>
  import { app } from '../store.svelte.js';
  import { SECTION_DEFS } from '../model.js';
  import ListEditor from './ListEditor.svelte';

  function fromActors() {
    app.doc.sections.kualifikasi.items = app.doc.actors.map((a) => a.name);
  }
</script>

{#each SECTION_DEFS as s (s.key)}
  <ListEditor section={app.doc.sections[s.key]} title={s.title}>
    {#if s.key === 'kualifikasi'}
      <button type="button" class="btn small ghost" onclick={fromActors}>Isi dari daftar pelaksana</button>
    {/if}
  </ListEditor>
{/each}
