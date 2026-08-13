# Open-source contributions

A log of my contributions to other people's open-source projects, and of where each one was
acknowledged. Every credited entry carries a quote and a link to the place the credit was
written — a changelog line, a release note, or a maintainer's own words.

**3 credited contributions** across **1 project**

| Project | Credited | In flight | Shipped in | Latest |
|---|---|---|---|---|
| [Graphify-Labs/graphify](projects/Graphify-Labs--graphify.md) | 3 | — | v0.9.42, v0.9.39, v0.9.38 | 2026-08-13 |

### Why some entries say “shipped” rather than “merged”

Maintainers often reimplement or squash a patch under their own commit and credit the
author in the changelog. The pull request then stays closed with no merge and no commit
carries my name, even though the change is in the release. Those entries are marked
`shipped`, and the evidence block shows where the credit was written.

## How this file is produced

`data/contributions.json` is the source of truth. `scripts/scan.mjs` looks for six credit
signals across every repository I have opened an issue or pull request on — merged pull
requests, commits, changelog lines, release notes, maintainer thanks, and credits files —
and `scripts/render.mjs` regenerates this page and everything in `projects/`.

Nothing here is written by hand, and `render.mjs` refuses to publish an entry that claims
credit without a quote and a working link to back it.
