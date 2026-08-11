# Graphify-Labs/graphify

> Turn any codebase, with its docs, SQL schemas, configs, and PDFs, into a queryable knowledge graph. A /graphify skill for Claude Code, Cursor, Codex, and Gemini CLI: local deterministic AST parsing, every edge explained, no vector store.

**2 credited** · shipped in v0.9.39, v0.9.38 · first 2026-08-09 · latest 2026-08-10

[Graphify-Labs/graphify on GitHub](https://github.com/Graphify-Labs/graphify)

## Contents

| Contribution | Issue | Pull request | Status | Shipped in | Landed |
|---|---|---|---|---|---|
| [JS/TS: `affected` cannot traverse a dynamic `import('…')` made…](#n2584) | [#2584](https://github.com/Graphify-Labs/graphify/issues/2584) | [#2588](https://github.com/Graphify-Labs/graphify/pull/2588) | Shipped | v0.9.39 | 2026-08-10 |
| [JS/TS: `await import('…')` inside a nested function produces no…](#n2575) | [#2575](https://github.com/Graphify-Labs/graphify/issues/2575) | [#2574](https://github.com/Graphify-Labs/graphify/pull/2574) | Shipped | v0.9.38 | 2026-08-09 |

## Credited

<a id="n2584"></a>

### JS/TS: `affected` cannot traverse a dynamic `import('…')` made inside a function — edge exists, blast radius is short by 20%

`shipped` · bugfix · reporter + author · released in **v0.9.39**

| | |
|---|---|
| Issue | [#2584](https://github.com/Graphify-Labs/graphify/issues/2584) — reported 2026-08-10 |
| Pull request | [#2588](https://github.com/Graphify-Labs/graphify/pull/2588), closed 2026-08-10 — not merged; reimplemented upstream |
| Commit | — (landed under a maintainer's commit) |
| Release | [v0.9.39](https://github.com/Graphify-Labs/graphify/releases/tag/v0.9.39) — 2026-08-10 |

**Impact.** `affected` under-reported blast radius by about 20% wherever a dynamic `import(...)` sat inside a function — 39 of 49 truly affected files on a ~700-file TypeScript repo, and more depth did not help. Since 0.9.39 the dedupe keys on the importing file rather than the target, so those importers are reached and recall is back to 1.00.

<details><summary>Evidence</summary>

- “- Fix: `affected` now traverses a dynamic `import('…')` made inside a function or at module scope (#2584, thanks @phudayyy). The 0.9.38 dedupe keyed only on the target, so an in-function dynamic import (whose symbol-level edge is anchored on the enclosing function) suppressed the file-level edge `affected` follows; the dedupe now keys on the importing file, emitting one file-level `dynamic_import` edge per file/target while keeping the call-site edge.”
  <br>— [Changelog](https://github.com/Graphify-Labs/graphify/blob/50556baaea803e191947fdfcc2e0c22e2d4eb74d/CHANGELOG.md#L7) · [Release notes](https://github.com/Graphify-Labs/graphify/releases/tag/v0.9.39)
- “Shipped in v0.9.39 (`graphifyy==0.9.39`). Re-keying the dynamic-import dedupe on the importing file (not the target alone) is what landed for #2584, so `affected` traverses an in-function dynamic import. Credited in the release notes. Thanks @phudayyy!”
  <br>— [Maintainer @safishamsi](https://github.com/Graphify-Labs/graphify/pull/2588#issuecomment-5245052982)
- “Fixed in v0.9.39 (`graphifyy==0.9.39` on PyPI). The 0.9.38 dynamic-import dedupe keyed only on the target, so an in-function `import(...)` (whose symbol-level edge is anchored on the enclosing function) suppressed the file-level edge `affected` traverses. The dedupe now keys on the importing file, emitting one file-level `dynamic_import` edge per file/target while keeping the call-site edge, so `affected` reaches the importer for side-effect / namespace / different-symbol imports. Thanks @phuday”
  <br>— [Maintainer @safishamsi](https://github.com/Graphify-Labs/graphify/issues/2584#issuecomment-5245049934)

</details>

<a id="n2575"></a>

### JS/TS: `await import('…')` inside a nested function produces no edge — and `affected` cannot traverse `dynamic_import` at all

`shipped` · bugfix · reporter + author · released in **v0.9.38**

| | |
|---|---|
| Issue | [#2575](https://github.com/Graphify-Labs/graphify/issues/2575) — reported 2026-08-09 |
| Pull request | [#2574](https://github.com/Graphify-Labs/graphify/pull/2574), closed 2026-08-09 — not merged; reimplemented upstream |
| Commit | — (landed under a maintainer's commit) |
| Release | [v0.9.38](https://github.com/Graphify-Labs/graphify/releases/tag/v0.9.38) — 2026-08-09 |

**Impact.** A dynamic `await import(...)` written inside a nested function produced no edge at all, so code reachable only through a deferred import was missing from the graph, and `affected` could not traverse `dynamic_import` edges even where they did exist.

<details><summary>Evidence</summary>

- “- Fix: a dynamic `await import('…')` inside a nested function or at module scope now produces an edge (#2575, thanks @phudayyy), and `dynamic_import` edges are now included in `affected`. Calls inside a nested named function are also collected now. A dynamic import already captured as a deferred `imports_from` is not double-counted.”
  <br>— [Changelog](https://github.com/Graphify-Labs/graphify/blob/10ad921b423b767dd8a947bbf0fbcc2e95038ad3/CHANGELOG.md#L11) · [Release notes](https://github.com/Graphify-Labs/graphify/releases/tag/v0.9.38)
- “Shipped in v0.9.38. Your dynamic-import rescue + `dynamic_import` in DEFAULT_AFFECTED_RELATIONS is what landed for #2575, with a dedupe so an AST-captured deferred import is not double-counted and a companion engine fix so calls in nested named functions resolve too. Credited in the release notes. Thanks @phudayyy!”
  <br>— [Maintainer @safishamsi](https://github.com/Graphify-Labs/graphify/pull/2574#issuecomment-5234169527)
- “Fixed in v0.9.38. A dynamic `await import(...)` inside a nested function or at module scope now produces an edge, `dynamic_import` edges are included in `affected`, and calls inside a nested named function are collected too. A dynamic import already captured as a deferred imports_from is not double-counted. Thanks @phudayyy for the fix (PR #2574).”
  <br>— [Maintainer @safishamsi](https://github.com/Graphify-Labs/graphify/issues/2575#issuecomment-5234169255)

</details>

---

<sub>Generated by `scripts/render.mjs` from `data/contributions.json`. Do not edit by hand.</sub>
