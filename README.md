# megadev — #4471, what it shows

MEGA.dev course, Challenge S01E03 ("what it shows").

The support desk merged 412 reports about dates into one ticket, #4471, and marked it known: "one issue,
one fix queued". Run the kb's own logic over the reports and #4471 holds three problems.

| problem | reports | ticket |
|---|---|---|
| parser — dates read month first for day-first tenants | 374 | [#1](https://github.com/EnriqueMillanG/megadev/issues/1) |
| hint — booking-v3 form hint says `MM/DD` to day-first tenants | 33 | [#2](https://github.com/EnriqueMillanG/megadev/issues/2) |
| one-day move — bookings shift by one day (time zone?) | 5 | [#3](https://github.com/EnriqueMillanG/megadev/issues/3) |

Total 412 (the export has 427 rows; 15 are duplicate rows from overlapping export pages).

## The page

- Source (signed): [`support-kb/src/routes/kb/incidents/4471/causes/+page.svx`](support-kb/src/routes/kb/incidents/4471/causes/+page.svx)
- Its counting component: [`support-kb/src/lib/kb/SplitCounts.svelte`](support-kb/src/lib/kb/SplitCounts.svelte)
- As the desk will see it: [`rendered/kb/incidents/4471/causes/index.html`](rendered/kb/incidents/4471/causes/index.html)

The kb export does not include its Svelte toolchain, so [`tools/render.mjs`](tools/render.mjs) renders the page
with no dependencies. It ports the logic of the runbook layout and of the components the page uses
(CauseTable, SplitCounts, Callout, RenderStamp), and reads the same data files.

```
node tools/render.mjs support-kb/src/routes/kb/incidents/4471/causes/+page.svx rendered/kb/incidents/4471/causes/index.html
```

`support-kb/` is the kb export from the course, unchanged except for the two files above.
