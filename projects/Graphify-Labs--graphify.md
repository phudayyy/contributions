# Graphify-Labs/graphify

> Turn any codebase, with its docs, SQL schemas, configs, and PDFs, into a queryable knowledge graph. A /graphify skill for Claude Code, Cursor, Codex, and Gemini CLI: local deterministic AST parsing, every edge explained, no vector store.

**4 credited** · 1 not adopted · shipped in v0.9.44, v0.9.42, v0.9.39, v0.9.38 · first 2026-08-09 · latest 2026-08-13

[Graphify-Labs/graphify on GitHub](https://github.com/Graphify-Labs/graphify)

## Contents

| Contribution | Issue | Pull request | Status | Shipped in | Landed |
|---|---|---|---|---|---|
| [`affected` silently returns nothing when the seed path is spell…](#n2706) | [#2706](https://github.com/Graphify-Labs/graphify/issues/2706) | [#2707](https://github.com/Graphify-Labs/graphify/pull/2707) | Shipped | v0.9.42 | 2026-08-13 |
| [JS/TS: `affected` cannot traverse a dynamic `import('…')` made…](#n2584) | [#2584](https://github.com/Graphify-Labs/graphify/issues/2584) | [#2588](https://github.com/Graphify-Labs/graphify/pull/2588) | Shipped | v0.9.39 | 2026-08-10 |
| [JS/TS: `await import('…')` inside a nested function produces no…](#n2575) | [#2575](https://github.com/Graphify-Labs/graphify/issues/2575) | [#2574](https://github.com/Graphify-Labs/graphify/pull/2574) | Shipped | v0.9.38 | 2026-08-09 |
| [JS/TS: an import from outside the corpus does not shadow indire…](#n2757) | [#2757](https://github.com/Graphify-Labs/graphify/issues/2757) | [#2758](https://github.com/Graphify-Labs/graphify/pull/2758) | Shipped | v0.9.44 | — |
| [A git-tracked file is silently dropped when a .gitignore patter…](#n2759) | [#2759](https://github.com/Graphify-Labs/graphify/issues/2759) | [#2769](https://github.com/Graphify-Labs/graphify/pull/2769) | Not adopted | — | — |

## Credited

<a id="n2706"></a>

### `affected` silently returns nothing when the seed path is spelled `./x` or absolute

`shipped` · bugfix · reporter + author · released in **v0.9.42**

| | |
|---|---|
| Issue | [#2706](https://github.com/Graphify-Labs/graphify/issues/2706) — reported 2026-08-13 |
| Pull request | [#2707](https://github.com/Graphify-Labs/graphify/pull/2707), closed 2026-08-13 — not merged; the patch landed as its own commit |
| Commit | [a05b4084d](https://github.com/Graphify-Labs/graphify/commit/a05b4084d9ef7157af31af883d976515bda1f24e) |
| Release | [v0.9.42](https://github.com/Graphify-Labs/graphify/releases/tag/v0.9.42) — 2026-08-13 |

**Impact.** `affected src/x.py` reported 16 dependents while `affected ./src/x.py` and the absolute form returned an empty list and exit 0 — a blast-radius answer indistinguishable both from a genuine "nothing depends on this" and from a typo, and `./` is exactly what shell completion produces. Since 0.9.42 the seed is normalised to repo-relative form before it is compared against the stored `source_file`; an absolute seed still requires the working directory to be the analysed repo root.

<details><summary>Evidence</summary>

- “- Fix: `affected` resolves a seed passed as a `./`-relative path (or an absolute path when run from the repo root) instead of silently returning nothing (#2707, thanks @phudayyy). Note: an absolute-path seed still requires the working directory to be the analysed repo root.”
  <br>— [Changelog](https://github.com/Graphify-Labs/graphify/blob/7fe58b0b0f3873be9a21c30106b8b8527c353aa6/CHANGELOG.md#L9)
- “- `affected` resolves a `./`-relative seed instead of silently returning nothing (#2707, @phudayyy).”
  <br>— [Release notes](https://github.com/Graphify-Labs/graphify/releases/tag/v0.9.42)
- “Shipped in v0.9.42 (`graphifyy==0.9.42` on PyPI). Resolves a `./`-relative seed. Note: an absolute-path seed still requires the working directory to be the analysed repo root — a follow-up could derive the root from the graph location. Credited in the release notes. Thanks @phudayyy!”
  <br>— [Maintainer @safishamsi](https://github.com/Graphify-Labs/graphify/pull/2707#issuecomment-5281699928)
- “fix(affected): resolve a seed given as ./relative or absolute path form (#2584 follow-up)”
  <br>— [Commit](https://github.com/Graphify-Labs/graphify/commit/a05b4084d9ef7157af31af883d976515bda1f24e)

</details>

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
  <br>— [Changelog](https://github.com/Graphify-Labs/graphify/blob/7fe58b0b0f3873be9a21c30106b8b8527c353aa6/CHANGELOG.md#L57) · [Release notes](https://github.com/Graphify-Labs/graphify/releases/tag/v0.9.39)
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

<a id="n2757"></a>

### JS/TS: an import from outside the corpus does not shadow indirect_call resolution, fabricating cross-package edges

`shipped` · bugfix · reporter + author · released in **v0.9.44**

| | |
|---|---|
| Issue | [#2757](https://github.com/Graphify-Labs/graphify/issues/2757) |
| Pull request | [#2758](https://github.com/Graphify-Labs/graphify/pull/2758) — not merged; the patch landed as its own commit |
| Commit | [ceeafb0](https://github.com/Graphify-Labs/graphify/commit/ceeafb0) |

**Impact.** A name imported from an external package could be resolved to an unrelated same-named definition elsewhere in the corpus, inventing cross-package edges that then lead the "Surprising Connections" report.

<details><summary>Evidence</summary>

- “Fix: a JS/TS identifier bound by an import whose target resolves outside the scanned corpus (e.g. a `lucide-react` icon) is now shadowed, so using it as a value no longer fabricates an INFERRED `indirect_call` onto an unrelated same-named callable elsewhere in the corpus; a relative/in-corpus import still resolves to its real target (#2757, thanks @phudayyy).”
  <br>— [Changelog](https://github.com/Graphify-Labs/graphify/blob/4fca621/CHANGELOG.md) · [Release notes](https://github.com/Graphify-Labs/graphify/releases/tag/v0.9.44)

</details>

## Not adopted

<a id="n2759"></a>

### A git-tracked file is silently dropped when a .gitignore pattern matches it

`closed-unshipped` · bugreport · reporter

| | |
|---|---|
| Issue | [#2759](https://github.com/Graphify-Labs/graphify/issues/2759) |
| Pull request | [#2769](https://github.com/Graphify-Labs/graphify/pull/2769) |
| Commit | — |

**Impact.** A file the repository ships is absent from the graph with no report, so querying it returns empty — indistinguishable from the code being unused.

---

<sub>Generated by `scripts/render.mjs` from `data/contributions.json`. Do not edit by hand.</sub>
