#!/usr/bin/env node
/**
 * scan.mjs — find open-source contributions that have been credited.
 *
 * Deterministic: no model in the loop. Every `gh` failure degrades to "found
 * nothing" instead of throwing, because this runs from a session-start hook and
 * must never break a session.
 *
 * A contribution is NOT detected by pull-request state. Maintainers routinely
 * reimplement or squash a patch under their own commit and credit the author in
 * the changelog instead; such a pull request stays CLOSED with `mergedAt: null`
 * and no commit in the repository carries the author's name. Keying off
 * `state == MERGED` would score that contribution as a rejection. So this
 * scanner looks for six independent credit signals and keeps the quote it found:
 *
 *   1. merged-pr        a pull request that really was merged
 *   2. commit           a commit in the upstream repo authored by the user
 *   3. changelog        a line naming the user in CHANGELOG/HISTORY/NEWS
 *   4. release-notes    a release body naming the user
 *   5. maintainer-thanks  a non-bot, non-self comment thanking the user on their
 *                       own issue or pull request
 *   6. credit-file      AUTHORS / CONTRIBUTORS / THANKS listing the user
 *
 * Usage
 *   node scripts/scan.mjs                 human summary on stderr, drafts on stdout
 *   node scripts/scan.mjs --new-only      only what is not already in the ledger
 *   node scripts/scan.mjs --quiet         suppress the human summary
 *   node scripts/scan.mjs --cache <path>  also write the drafts to <path>
 */

import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const argv = process.argv.slice(2)
const NEW_ONLY = argv.includes('--new-only')
const QUIET = argv.includes('--quiet')
const CACHE = argv.includes('--cache') ? argv[argv.indexOf('--cache') + 1] : null

const say = (...a) => { if (!QUIET) console.error(...a) }

/* ------------------------------------------------------------------ gh calls */

let ghTimeout = 25000

function gh (args) {
  return new Promise((resolve) => {
    execFile('gh', args, { timeout: ghTimeout, maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => {
      resolve(err ? null : stdout)
    })
  })
}

async function ghJson (args, fallback = null) {
  const out = await gh(args)
  if (out == null) return fallback
  try {
    const t = out.trim()
    return t === '' ? fallback : JSON.parse(t)
  } catch {
    return fallback
  }
}

/** Read a file from a repo's default branch. Returns text, or null if absent. */
async function ghFile (repo, filePath) {
  const b64 = await gh(['api', `repos/${repo}/contents/${filePath}`, '--jq', '.content'])
  if (!b64) return null
  try {
    return Buffer.from(b64.replace(/\s+/g, ''), 'base64').toString('utf8')
  } catch {
    return null
  }
}

/* -------------------------------------------------------------- text helpers */

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Match the user's handle as a credit, not as part of a URL or a longer word.
 * "thanks @phudayyy" and "phudayyy" match; "github.com/phudayyy" does not —
 * a link to someone's profile is not by itself a statement of credit.
 */
function makeAliasRe (aliases) {
  const alts = aliases.map(escapeRe).join('|')
  return new RegExp(`(?<![\\w@/-])@?(?:${alts})(?![\\w-])`, 'i')
}

/** Numbers cited as "#123" anywhere in a string. */
function refsIn (text) {
  const out = new Set()
  for (const m of String(text ?? '').matchAll(/#(\d{1,7})\b/g)) out.add(Number(m[1]))
  return [...out]
}

/**
 * Issue numbers a pull request deliberately points at.
 *
 * Two forms only, and the narrowness is the point:
 *   - a closing keyword anywhere            "Fixes #2575"
 *   - a reference on the body's first line  "Issue #2584"
 *
 * A bare "#N" in mid-prose is ignored. Finch's own PR #2588 opens with
 * "Issue #2584" and later says "this is not #2575, which 0.9.38 fixed" —
 * clustering on every mention would fuse a shipped contribution with an
 * unrelated open one and corrupt the ledger's dedup key permanently.
 */
function linkedIssues (body) {
  const text = String(body ?? '')
  const out = new Set()

  for (const m of text.matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s*#(\d{1,7})\b/gi)) {
    out.add(Number(m[1]))
  }

  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const lead = firstLine.match(/^\s*(?:issue|ref|refs|related(?:\s+to)?|for)\s*:?\s*#(\d{1,7})\b/i)
  if (lead) out.add(Number(lead[1]))

  return [...out]
}

/** The nearest markdown heading above `lineIdx`, e.g. "## 0.9.38 (unreleased)". */
function headingAbove (lines, lineIdx) {
  for (let i = lineIdx; i >= 0; i--) {
    const m = lines[i].match(/^#{1,3}\s+(.+?)\s*$/)
    if (m) return m[1]
  }
  return null
}

/** A version-looking token, e.g. "0.9.38" out of "## 0.9.38 (unreleased)". */
function versionIn (text) {
  const m = String(text ?? '').match(/\bv?(\d+\.\d+(?:\.\d+)?(?:[-.][\w.]+)?)\b/)
  return m ? m[1] : null
}

const isBot = (login) => !login || /\[bot\]$/i.test(login) || /^(dependabot|github-actions|codecov)/i.test(login)

const dateOnly = (iso) => (iso ? String(iso).slice(0, 10) : null)

const THANKS_RE = /\b(thanks?|thank you|shipped in|released in|fixed in|landed in|credited|cherry-picked|included in|incorporated)\b/i
const SHIPPED_IN_RE = /\b(?:shipped|released|fixed|landed|available|included)\s+in\s+(v?\d+[\w.\-]*)/i

/** "v0.9.38." at the end of a sentence is the version plus punctuation, not a version. */
const trimVersion = (v) => (v ? String(v).replace(/[.,;:)\]]+$/, '') : null)

/* -------------------------------------------------------------------- loading */

const config = JSON.parse(await readFile(path.join(ROOT, 'data/config.json'), 'utf8'))
const ledger = JSON.parse(await readFile(path.join(ROOT, 'data/contributions.json'), 'utf8'))

const LOGIN = config.github_login
const ALIAS_RE = makeAliasRe(config.aliases?.length ? config.aliases : [LOGIN])
const LIMIT = String(config.limits?.search_limit ?? 100)
ghTimeout = config.limits?.gh_timeout_ms ?? 25000

/** Every issue/PR number already recorded, so a rescan cannot re-add it. */
const knownNumbers = new Set()
for (const r of ledger.records ?? []) {
  for (const n of r.numbers ?? []) knownNumbers.add(`${r.project.repo}#${n}`)
}

/* ------------------------------------------------------------------ discovery */

say(`scanning as @${LOGIN} …`)

const excluded = new Set((config.scope?.exclude_owners ?? []).map((s) => s.toLowerCase()))
const allow = new Set((config.scope?.allowlist_repos ?? []).map((s) => s.toLowerCase()))

/**
 * Exclude our own repositories inside the query, not after it.
 *
 * `gh search` returns at most `--limit` results, newest first, and that ceiling
 * is already saturated: measured 2026-08-10, `--limit 100` came back with exactly
 * 100 pull requests, 98 of them on `phudayyy/*`. Filtering after the search cannot
 * recover a contribution that fell off the end of the window — every new pull
 * request on a personal repo pushes an older upstream one out of sight, silently.
 * `-user:<owner>` makes GitHub drop them server-side, so the whole budget is spent
 * on other people's projects.
 */
const excludeQuery = [...excluded].map((o) => `-user:${o}`)

const PR_FIELDS = 'repository,number,title,state,createdAt,closedAt,url,body,isDraft'
const ISSUE_FIELDS = 'repository,number,title,state,createdAt,closedAt,url,body'

const warnings = []

/**
 * A saturated search is the dangerous case, because it looks exactly like a
 * complete one: `gh search` returns newest-first and simply stops at `--limit`,
 * with no flag, no error and no count of what it dropped. Getting back exactly
 * the number asked for is the only evidence there was more, so it is worth
 * saying out loud — a contribution that fell off the end leaves no other trace.
 */
const search = async (kind, fields, extra = []) => {
  const out = await ghJson(
    ['search', kind, '--author', LOGIN, '--limit', LIMIT, '--json', fields, ...extra],
    []
  ) ?? []
  if (out.length >= Number(LIMIT)) {
    warnings.push(
      `SATURATED: the ${kind} search returned ${out.length}, which is the whole limit. ` +
      'Results are truncated newest-first, so anything older is invisible and silently unlogged. ' +
      'Raise limits.search_limit in data/config.json, or narrow the query further.'
    )
  }
  return out
}

const prSearch = [...(await search('prs', PR_FIELDS, ['--', ...excludeQuery]) ?? [])]
const issueSearch = [...(await search('issues', ISSUE_FIELDS, ['--', ...excludeQuery]) ?? [])]

// An allowlisted repo we own is invisible to the query above, so ask for it directly.
for (const repo of config.scope?.allowlist_repos ?? []) {
  prSearch.push(...(await search('prs', PR_FIELDS, ['--repo', repo]) ?? []))
  issueSearch.push(...(await search('issues', ISSUE_FIELDS, ['--repo', repo]) ?? []))
}

// `gh search issues` returns pull requests too; keep only true issues.
const prNumbersByRepo = new Map()
for (const p of prSearch) {
  const k = p.repository.nameWithOwner
  if (!prNumbersByRepo.has(k)) prNumbersByRepo.set(k, new Set())
  prNumbersByRepo.get(k).add(p.number)
}
const issuesOnly = issueSearch.filter(
  (i) => !prNumbersByRepo.get(i.repository.nameWithOwner)?.has(i.number)
)

function inScope (nameWithOwner) {
  const lower = nameWithOwner.toLowerCase()
  if (allow.has(lower)) return true
  return !excluded.has(lower.split('/')[0])
}

const repos = new Set()
for (const x of [...prSearch, ...issuesOnly]) {
  if (inScope(x.repository.nameWithOwner)) repos.add(x.repository.nameWithOwner)
}
for (const r of config.scope?.watch_repos ?? []) repos.add(r)

say(`  ${prSearch.length} pull requests, ${issuesOnly.length} issues → ${repos.size} in-scope repo(s)`)
if (repos.size === 0) {
  await emit([])
  process.exit(0)
}

/* ------------------------------------------------- per-repo signal collection */

const drafts = []

for (const repo of [...repos].sort()) {
  const myPrs = prSearch.filter((p) => p.repository.nameWithOwner === repo)
  const myIssues = issuesOnly.filter((i) => i.repository.nameWithOwner === repo)

  const meta = await ghJson(['api', `repos/${repo}`, '--jq',
    '{default_branch,description,html_url,stargazers_count}'], {}) ?? {}
  const headSha = await gh(['api', `repos/${repo}/commits/${meta.default_branch ?? 'HEAD'}`, '--jq', '.sha'])
  const pin = headSha ? headSha.trim() : (meta.default_branch ?? 'HEAD')

  /* --- signal 3: changelog ------------------------------------------------ */
  const changelogHits = []
  for (const file of config.changelog_paths ?? []) {
    const text = await ghFile(repo, file)
    if (!text) continue
    const lines = text.split(/\r?\n/)
    lines.forEach((line, idx) => {
      if (!ALIAS_RE.test(line)) return
      changelogHits.push({
        type: 'changelog',
        quote: line.trim(),
        source: `${meta.html_url}/blob/${pin}/${file}#L${idx + 1}`,
        where: file,
        version: versionIn(headingAbove(lines, idx)),
        refs: refsIn(line)
      })
    })
    break // the first changelog that exists is the changelog
  }

  /* --- signal 4: release notes -------------------------------------------- */
  const releaseHits = []
  const releases = await ghJson(
    ['api', `repos/${repo}/releases?per_page=${config.limits?.releases_per_repo ?? 30}`,
      '--jq', '[.[]|{tag:.tag_name,published:.published_at,url:.html_url,body:.body}]'],
    []
  ) ?? []
  for (const rel of releases) {
    if (!rel.body || !ALIAS_RE.test(rel.body)) continue
    const line = rel.body.split(/\r?\n/).find((l) => ALIAS_RE.test(l)) ?? ''
    releaseHits.push({
      type: 'release-notes',
      quote: line.trim(),
      source: rel.url,
      version: rel.tag,
      published: dateOnly(rel.published),
      refs: refsIn(line)
    })
  }

  /* --- signal 6: AUTHORS / CONTRIBUTORS ----------------------------------- */
  const creditFileHits = []
  for (const file of config.credit_file_paths ?? []) {
    const text = await ghFile(repo, file)
    if (!text) continue
    const lines = text.split(/\r?\n/)
    const idx = lines.findIndex((l) => ALIAS_RE.test(l))
    if (idx >= 0) {
      creditFileHits.push({
        type: 'credit-file',
        quote: lines[idx].trim(),
        source: `${meta.html_url}/blob/${pin}/${file}#L${idx + 1}`,
        where: file,
        refs: []
      })
    }
  }

  /* --- signal 2: commits authored by the user ----------------------------- */
  const commits = await ghJson(
    ['search', 'commits', '--author', LOGIN, '--repo', repo, '--limit', '50',
      '--json', 'sha,commit,url'],
    []
  ) ?? []

  /* --- signal 5: maintainer thanks on the user's own threads -------------- */
  const thanksByNumber = new Map()
  for (const item of [...myPrs, ...myIssues]) {
    const comments = await ghJson(
      ['api', `repos/${repo}/issues/${item.number}/comments?per_page=100`,
        '--jq', '[.[]|{author:.user.login,createdAt:.created_at,url:.html_url,body:.body}]'],
      []
    ) ?? []
    for (const c of comments) {
      if (c.author === LOGIN || isBot(c.author)) continue
      if (!THANKS_RE.test(c.body ?? '')) continue
      const line = (c.body ?? '').split(/\r?\n/).find((l) => THANKS_RE.test(l)) ?? c.body
      if (!thanksByNumber.has(item.number)) thanksByNumber.set(item.number, [])
      thanksByNumber.get(item.number).push({
        type: 'maintainer-thanks',
        quote: line.trim().slice(0, 500),
        source: c.url,
        by: c.author,
        at: dateOnly(c.createdAt),
        version: trimVersion((c.body.match(SHIPPED_IN_RE) ?? [])[1]),
        refs: []
      })
    }
  }

  /* --- cluster: one record per contribution, not per artefact -------------- */
  const clusters = []
  const placed = new Set()

  for (const pr of myPrs) {
    const linked = linkedIssues(pr.body).filter((n) => myIssues.some((i) => i.number === n))
    const cluster = { repo, meta, prs: [pr], issues: myIssues.filter((i) => linked.includes(i.number)) }
    placed.add(`pr:${pr.number}`)
    for (const n of linked) placed.add(`issue:${n}`)
    clusters.push(cluster)
  }
  for (const iss of myIssues) {
    if (placed.has(`issue:${iss.number}`)) continue
    clusters.push({ repo, meta, prs: [], issues: [iss] })
  }

  /* --- attach evidence to whichever cluster it cites ----------------------- */
  for (const cluster of clusters) {
    const nums = new Set([...cluster.prs.map((p) => p.number), ...cluster.issues.map((i) => i.number)])
    const evidence = []

    for (const hit of [...changelogHits, ...releaseHits]) {
      if (hit.refs.some((n) => nums.has(n))) evidence.push(hit)
    }
    for (const n of nums) {
      for (const t of thanksByNumber.get(n) ?? []) evidence.push(t)
    }
    // A credit file names a person, not a change: attach it only when the user
    // has no other contribution in this repo to attach it to.
    if (evidence.length === 0 && clusters.length === 1) evidence.push(...creditFileHits)

    const mergedPr = cluster.prs.find((p) => String(p.state).toUpperCase() === 'MERGED')
    const myCommits = commits.filter((c) => {
      const msgRefs = refsIn(c.commit?.message)
      return msgRefs.some((n) => nums.has(n))
    })

    if (mergedPr) {
      evidence.unshift({
        type: 'merged-pr',
        quote: `Pull request #${mergedPr.number} was merged.`,
        source: mergedPr.url,
        refs: []
      })
    }
    for (const c of myCommits) {
      evidence.push({
        type: 'commit',
        quote: (c.commit?.message ?? '').split(/\r?\n/)[0],
        source: c.url,
        refs: []
      })
    }

    /* --- status: evidence first, pull-request state last ------------------ */
    const hasCredit = evidence.some((e) =>
      ['changelog', 'release-notes', 'maintainer-thanks', 'credit-file'].includes(e.type))
    const anyOpen = [...cluster.prs, ...cluster.issues].some((x) => String(x.state).toUpperCase() === 'OPEN')

    let status
    if (mergedPr) status = 'merged'
    else if (hasCredit && cluster.prs.length > 0) status = 'shipped'
    else if (hasCredit) status = 'credited'
    else if (anyOpen) status = 'open'
    else status = 'closed-unshipped'

    const releaseHit = evidence.find((e) => e.type === 'release-notes')
    // The release tag is the name the project itself publishes under; a version
    // parsed out of a changelog heading or a comment is a paraphrase of it.
    const shippedIn = trimVersion(
      releaseHit?.version ??
      evidence.find((e) => e.type === 'changelog')?.version ??
      evidence.map((e) => e.version).find(Boolean)
    )

    const primary = cluster.issues[0]?.number ?? cluster.prs[0]?.number
    const opened = [...cluster.prs, ...cluster.issues]
      .map((x) => x.createdAt).filter(Boolean).sort()[0]
    const landed = [...cluster.prs, ...cluster.issues]
      .map((x) => x.closedAt).filter(Boolean).sort().pop()

    const draft = {
      id: `${repo}#${primary}`,
      numbers: [...nums].sort((a, b) => a - b),
      project: {
        repo,
        name: repo.split('/')[1],
        url: meta.html_url ?? `https://github.com/${repo}`,
        description: meta.description ?? null
      },
      title: (cluster.issues[0] ?? cluster.prs[0])?.title ?? '(untitled)',
      kind: null,      // filled in by /contrib — bugfix | feature | docs | test | report | review
      role: [
        ...(cluster.issues.length ? ['reporter'] : []),
        ...(cluster.prs.length ? ['author'] : [])
      ],
      status,
      shipped_in: shippedIn,
      links: {
        issue: cluster.issues[0]?.url ?? null,
        pr: cluster.prs[0]?.url ?? null,
        commit: myCommits[0]?.url ?? null,
        release: releaseHit?.source ?? null
      },
      dates: {
        opened: dateOnly(opened),
        landed: status === 'open' ? null : dateOnly(landed),
        released: releaseHit?.published ?? null
      },
      impact: null,    // filled in by /contrib — one plain sentence
      evidence: evidence.map(({ refs, ...keep }) => keep)
    }

    const isKnown = draft.numbers.some((n) => knownNumbers.has(`${repo}#${n}`))
    if (NEW_ONLY && isKnown) continue
    draft.already_recorded = isKnown
    drafts.push(draft)
  }
}

drafts.sort((a, b) => (b.dates.opened ?? '').localeCompare(a.dates.opened ?? '') || a.id.localeCompare(b.id))

say('')
for (const d of drafts) {
  say(`  ${d.status.padEnd(17)} ${d.id}  ${d.evidence.length} evidence  ${d.title.slice(0, 60)}`)
}
say(`\n${drafts.length} draft record(s)${NEW_ONLY ? ' not yet in the ledger' : ''}.`)

await emit(drafts)

async function emit (list) {
  // Rewritten every run, empty when clean, so a warning cannot outlive its cause.
  await writeFile(path.join(ROOT, 'data/.scan-warnings'), warnings.join('\n') + (warnings.length ? '\n' : ''), 'utf8')
  for (const w of warnings) say(`  ⚠ ${w}`)

  const json = JSON.stringify(list, null, 2)
  if (CACHE) await writeFile(CACHE, json + '\n', 'utf8')
  process.stdout.write(json + '\n')
}
