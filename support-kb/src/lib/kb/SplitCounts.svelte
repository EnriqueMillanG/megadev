<script lang="ts">
  // One row per problem found in a merged ticket, each with its count. Computed, never typed:
  // causes.ts sorts reports into parser / hint by tenant; desk-notes.json lists the reports the desk
  // read as a one-day move, which are not a day↔month swap and so are counted on their own.
  import reports from '#lib/data/reports-4471.json';
  import notes from '#lib/data/desk-notes.json';
  import { causeOf, uniqueById, type Report } from '#lib/kb/causes';
  import { tenantOf } from '#lib/kb/locales';

  let { ticket, issues = {} }: { ticket: number; issues?: Record<string, string> } = $props();

  const rows = $derived.by(() => {
    const merged = uniqueById(reports as Report[]).filter((r) => r.mergedInto === ticket);
    const count = new Map<string, number>();
    for (const r of merged) {
      const k = notes.oneDayMove.includes(r.id) ? 'one-day move' : (causeOf(r, tenantOf(r)) ?? 'unplaced');
      count.set(k, (count.get(k) ?? 0) + 1);
    }
    return { total: merged.length, rows: [...count.entries()].sort((a, b) => b[1] - a[1]) };
  });
</script>

<p class="sum"><strong>{rows.total}</strong> reports in #{ticket} · <strong>{rows.rows.length}</strong> problems</p>
<table>
  <thead><tr><th>problem</th><th>reports</th><th>ticket</th></tr></thead>
  <tbody>
    {#each rows.rows as [problem, n] (problem)}
      <tr>
        <td><code>{problem}</code></td>
        <td>{n}</td>
        <td>{#if issues[problem]}<a href={issues[problem]}>{issues[problem].replace(/^.*\/issues\//, 'megadev#')}</a>{:else}—{/if}</td>
      </tr>
    {/each}
  </tbody>
</table>

<style>
  .sum { font-size: 1.1rem; }
</style>
