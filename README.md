# Open-source contributions

A log of my contributions to other people's open-source projects, and of where each one was
acknowledged. Every credited entry carries a quote and a link to the place the credit was
written — a changelog line, a release note, or a maintainer's own words.

**4 credited contributions** across **1 project** · 1 not adopted

| Project | Credited | In flight | Not adopted | Shipped in | Latest |
|---|---|---|---|---|---|
| [Graphify-Labs/graphify](projects/Graphify-Labs--graphify.md) | 4 | — | 1 | v0.9.44, v0.9.42, v0.9.39, v0.9.38 | 2026-08-13 |

### What “not adopted” means, and why it is counted here

An entry sits here when the work was reported and the behaviour reached a release, but the
credit went elsewhere — a different contributor's patch was taken, or the maintainer wrote
their own and thanked someone else. The pull request is closed with no merge, and no quote
names me, so nothing is claimed: `render.mjs` refuses an evidence block on these.

They are counted anyway. A log that lists only the wins is a scoreboard, not a record — and
the same evidence rule that lets a `shipped` entry stand without a merge is what forces this
one to stand without a claim.

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
