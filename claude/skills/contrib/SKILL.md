---
name: contrib
description: "Record an open-source contribution in the public contributions log once it has been merged, shipped, or credited in a changelog or release notes. Use when a maintainer thanks the user, when a release names them, when a pull request of theirs is merged, or when the session-start scan reports new credit. Also use when the user asks what their contributions are, or says /contrib."
---

# /contrib

Keep `github.com/phudayyy/contributions` telling the truth about where the user's
open-source work was acknowledged.

Repository: `~/Documents/Công việc/project/contributions`

## What counts as a contribution being accepted

Not pull-request state. Maintainers routinely reimplement or squash a patch under
their own commit and credit the author in the changelog instead. That pull request
stays **closed with `mergedAt: null`**, and no commit in the upstream repository
carries the user's name — while the change itself is in the release.

This has already happened to this user. `Graphify-Labs/graphify#2574` is closed and
unmerged, yet `CHANGELOG.md` reads *"(#2575, thanks @phudayyy)"* and the maintainer
wrote *"Shipped in v0.9.38 … Credited in the release notes."* Scoring that by pull
request state would file a shipped contribution as a rejection.

So the ledger records **evidence**, and status follows from it:

| status | means |
|---|---|
| `merged` | the pull request really was merged |
| `shipped` | the change reached a release under someone else's commit |
| `credited` | thanked without code of theirs landing — a bug report that led to a fix, a review |
| `open` | still in flight; lives in `IN-FLIGHT.md`, counted in no total |
| `closed-unshipped` | closed without shipping; kept, because an honest log keeps it |

## Credit is what WAKES you — it is not what you are allowed to publish

The session-start hook fires **only when something was newly credited**, and that is the right
trigger: an open pull request upstream is not an achievement and its state changes every few days,
so nobody should be woken for it.

⚠️ **That is a rule about the alarm, not about the ledger.** It used to end "never open a pull
request carrying nothing but `open` records… say so and stop without publishing", and following that
sentence produced a page that was publicly wrong: on 2026-08-15 `IN-FLIGHT.md` read *"Nothing open
right now"* while `Graphify-Labs/graphify#2757` and `#2758` were both open upstream, because the
record was written and then parked waiting for credit that had not happened yet.

The reason behind the old wording was the user's **review time** — a pull request full of `open`
records is a review that says nothing. Rule 1 below removes that cost entirely: a record-only diff
is merged without asking, so nobody is being asked to read it. The reason no longer reaches the case.

So: **an in-flight record is written, rendered, published and merged like any other record-only
change.** What still stops and asks is decided by the diff (rule 1), never by whether the entry
carries credit. A manual `/contrib` that finds only in-flight work publishes it and says so.

## Running it

```bash
cd ~/Documents/Công\ việc/project/contributions
node scripts/prepare.mjs      # branch first, while the tree is clean
node scripts/scan.mjs --new-only    # or read data/.pending.json if the hook already scanned
```

`prepare.mjs` checks out the branch of an already-open contrib pull request when
there is one, so new findings join it instead of opening a second. Otherwise it
fast-forwards `main` and branches from there.

## Your job: the two fields the scanner cannot fill

The scanner gets repo, numbers, dates, links, versions, and the evidence quotes.
It leaves two nulls, because they need judgement:

- **`kind`** — one of `bugfix`, `feature`, `docs`, `test`, `report`, `review`.
- **`impact`** — one plain sentence on what changed for people using the project.
  Concrete, from the evidence and the issue body. *"`affected` under-reported blast
  radius by about 20% wherever a dynamic import sat inside a function"* — not
  *"improved the extractor"*.

Tighten `title` too if the upstream title is long or cryptic; keep the meaning.

## A draft carrying `updates` REPLACES a record — it is not a new one

Upstream keeps moving after something is logged. A pull request recorded while it was open gets
merged, shipped, or credited later, and the scanner re-reports it with
`updates: { from: "open", to: "shipped" }` and the new evidence. **Replace the record with that id;
do not append.** Appending produces two entries for one contribution and `render.mjs` will reject the
ledger, because both claim the same issue number.

The scanner already carries `id`, `kind`, `impact` and `recorded_at` across, so an update never
silently drops the sentence a person wrote. Re-read the `impact` line anyway when the status changes —
one written about an open pull request often describes a problem that has since been fixed.

Then append the genuinely new records to `data/contributions.json` and render:

```bash
node scripts/render.mjs
node scripts/publish.mjs
```

## Rules that are not negotiable

1. **Never write to `main` directly — but a record-only pull request you merge
   yourself.** `publish.mjs` pushes a branch and opens the pull request; it refuses
   to commit while `HEAD` is on `main`, and that refusal is not to be worked around.
   What changed on 2026-08-13 is only the last step, in the user's words: *"khi thêm
   contribute là merge luôn …, không cần chờ tôi review, khi nào có thêm sự thay đổi
   thì cần hỏi trước"*.

   The gate is now **what is in the diff**, not who clicks merge:

   - **Only the record** — `data/contributions.json` plus what `render.mjs`
     regenerates from it (`README.md`, `IN-FLIGHT.md`, `projects/*.md`) — then
     `gh pr merge <n> --merge --delete-branch` once the evidence checks out, and
     report the URL. Do not ask.
   - **Anything else** — `scripts/`, `data/config.json`, `claude/`, `.gitignore` —
     then stop after opening the pull request and **ask**, even when a record rides
     along in the same diff. A tooling change alters how every future entry is
     produced, and that is the review the user does want.

   Rule 2 is what makes this safe to do unattended: the evidence check is a script
   that runs before the branch exists, not a reviewer's attention afterwards.

2. **No evidence, no claim.** A record may only be `merged`, `shipped` or
   `credited` if it carries at least one evidence entry with a real quote and a
   resolvable URL. `render.mjs` exits non-zero otherwise; that check is the point,
   so fix the record, never the check.

3. **Quote what is written, not what it implies.** Copy the changelog line or the
   maintainer's sentence verbatim. Do not paraphrase into something stronger, and
   do not write an evidence entry you have not actually read.

4. **Never invent a version, a date, or a link.** Everything traceable comes from
   the scanner. If a field is unknown, leave it `null`.

5. **Only other people's repositories.** `data/config.json` excludes the user's own
   repos — 98 pull requests on `phudayyy/*` would drown the log. Add an exception
   to `scope.allowlist_repos` only if the user asks.

6. **Do not hand-edit `projects/*.md` or `README.md`.** They are rendered from the
   ledger and overwritten wholesale.

## When the user asks about their contributions

Read `data/contributions.json` and answer from it. Only rescan if they ask for
fresh data, or if the ledger looks stale against something they just mentioned.
