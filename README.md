# Open-source contributions

A log of my contributions to other people's open-source projects, and of where each one was
acknowledged. Every credited entry carries a quote and a link to the place the credit was
written — a changelog line, a release note, or a maintainer's own words.

_Nothing recorded yet._

## How this file is produced

`data/contributions.json` is the source of truth. `scripts/scan.mjs` looks for six credit
signals across every repository I have opened an issue or pull request on — merged pull
requests, commits, changelog lines, release notes, maintainer thanks, and credits files —
and `scripts/render.mjs` regenerates this page and everything in `projects/`.

Nothing here is written by hand, and `render.mjs` refuses to publish an entry that claims
credit without a quote and a working link to back it.
