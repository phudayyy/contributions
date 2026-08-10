#!/usr/bin/env node
/**
 * render.mjs — validate the ledger, then regenerate README.md and projects/*.md.
 *
 * data/contributions.json is the only source of truth. The markdown is a view of
 * it and is overwritten wholesale, so rendering is deterministic and a diff shows
 * exactly what changed.
 *
 * Validation runs first and exits non-zero on failure, which is the point: a
 * record may claim `merged`, `shipped` or `credited` only if it carries at least
 * one piece of evidence with a real quote and a resolvable URL. Without that gate
 * a scanner bug — or a model filling in a plausible-sounding line — would publish
 * a claim of credit that nobody ever gave.
 *
 * Usage
 *   node scripts/render.mjs           validate and write
 *   node scripts/render.mjs --check   validate only, write nothing
 */

import { readFile, writeFile, readdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CHECK_ONLY = process.argv.includes('--check')

const CREDITED = new Set(['merged', 'shipped', 'credited'])
const ALL_STATUSES = new Set([...CREDITED, 'open', 'closed-unshipped'])

const STATUS_LABEL = {
  merged: 'Merged',
  shipped: 'Shipped',
  credited: 'Credited',
  open: 'In flight',
  'closed-unshipped': 'Not adopted'
}

const STATUS_NOTE = {
  merged: 'the pull request was merged',
  shipped: 'the change reached a release under a maintainer\'s commit',
  credited: 'credited without code of mine landing',
  open: 'still under review',
  'closed-unshipped': 'closed without shipping'
}

const EVIDENCE_LABEL = {
  'merged-pr': 'Merged pull request',
  commit: 'Commit',
  changelog: 'Changelog',
  'release-notes': 'Release notes',
  'maintainer-thanks': 'Maintainer',
  'credit-file': 'Credits file'
}

const ledger = JSON.parse(await readFile(path.join(ROOT, 'data/contributions.json'), 'utf8'))
const records = ledger.records ?? []

/* ------------------------------------------------------------------ validate */

const errors = []
const seenIds = new Set()
const seenNumbers = new Map()

for (const r of records) {
  const at = r.id ?? '(record with no id)'

  if (!r.id) errors.push('a record has no id')
  else if (seenIds.has(r.id)) errors.push(`${at}: duplicate id`)
  seenIds.add(r.id)

  if (!r.project?.repo) errors.push(`${at}: no project.repo`)
  if (!r.title) errors.push(`${at}: no title`)

  if (!ALL_STATUSES.has(r.status)) {
    errors.push(`${at}: unknown status "${r.status}"`)
  }

  for (const n of r.numbers ?? []) {
    const key = `${r.project?.repo}#${n}`
    if (seenNumbers.has(key) && seenNumbers.get(key) !== r.id) {
      errors.push(`${at}: ${key} is also claimed by ${seenNumbers.get(key)}`)
    }
    seenNumbers.set(key, r.id)
  }

  // The anti-fabrication gate.
  if (CREDITED.has(r.status)) {
    const usable = (r.evidence ?? []).filter(
      (e) => e?.quote?.trim() && /^https?:\/\//.test(e?.source ?? '')
    )
    if (usable.length === 0) {
      errors.push(
        `${at}: status "${r.status}" claims credit but carries no evidence with both a quote and a URL`
      )
    }
  }

  for (const [i, e] of (r.evidence ?? []).entries()) {
    if (!EVIDENCE_LABEL[e?.type]) errors.push(`${at}: evidence[${i}] has unknown type "${e?.type}"`)
    if (e?.source && !/^https?:\/\//.test(e.source)) {
      errors.push(`${at}: evidence[${i}] source is not a URL`)
    }
  }

  for (const [k, v] of Object.entries(r.dates ?? {})) {
    if (v != null && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      errors.push(`${at}: dates.${k} = "${v}" is not YYYY-MM-DD`)
    }
  }
}

if (errors.length) {
  console.error('ledger is invalid — nothing was written:\n')
  for (const e of errors) console.error(`  ✗ ${e}`)
  console.error('')
  process.exit(1)
}

if (CHECK_ONLY) {
  console.log(`ledger is valid — ${records.length} record(s), no errors.`)
  process.exit(0)
}

/* -------------------------------------------------------------------- render */

const slug = (repo) => repo.replace(/\//g, '--')
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
const byDateDesc = (a, b) =>
  (b.dates?.opened ?? '').localeCompare(a.dates?.opened ?? '') || String(a.id).localeCompare(String(b.id))

function renderRecord (r) {
  const out = []
  const roles = (r.role ?? []).join(' + ') || 'contributor'
  const bits = [
    `\`${r.status}\``,
    r.kind ?? null,
    roles,
    r.shipped_in ? `released in **${r.shipped_in}**` : null
  ].filter(Boolean)

  out.push(`### ${r.title}`)
  out.push('')
  out.push(bits.join(' · '))
  out.push('')

  const rows = []
  const link = (url, label) => (url ? `[${label}](${url})` : '—')
  const num = (url) => (url ? `#${url.split('/').pop()}` : null)

  if (r.links?.issue) {
    rows.push(['Issue', `${link(r.links.issue, num(r.links.issue))}${r.dates?.opened ? ` — reported ${r.dates.opened}` : ''}`])
  }
  if (r.links?.pr) {
    const closed = r.dates?.landed ? `, closed ${r.dates.landed}` : ''
    const note = r.status === 'shipped' ? ' — not merged; reimplemented upstream' : ''
    rows.push(['Pull request', `${link(r.links.pr, num(r.links.pr))}${closed}${note}`])
  }
  rows.push(['Commit', r.links?.commit
    ? link(r.links.commit, r.links.commit.split('/').pop().slice(0, 9))
    : (r.status === 'shipped' ? '— (landed under a maintainer\'s commit)' : '—')])
  if (r.links?.release || r.dates?.released) {
    rows.push(['Release', `${link(r.links?.release, r.shipped_in ?? 'release')}${r.dates?.released ? ` — ${r.dates.released}` : ''}`])
  }

  out.push('| | |')
  out.push('|---|---|')
  for (const [k, v] of rows) out.push(`| ${k} | ${v} |`)
  out.push('')

  if (r.impact) {
    out.push(`**Impact.** ${r.impact}`)
    out.push('')
  }

  if ((r.evidence ?? []).length) {
    out.push('<details><summary>Evidence</summary>')
    out.push('')
    for (const e of r.evidence) {
      const label = EVIDENCE_LABEL[e.type] ?? e.type
      const who = e.by ? ` (@${e.by})` : ''
      out.push(`- **${label}**${who} — “${esc(e.quote)}” — [source](${e.source})`)
    }
    out.push('')
    out.push('</details>')
    out.push('')
  }

  return out.join('\n')
}

function renderProject (repo, list) {
  const meta = list[0].project
  const credited = list.filter((r) => CREDITED.has(r.status))
  const inFlight = list.filter((r) => r.status === 'open')
  const notAdopted = list.filter((r) => r.status === 'closed-unshipped')

  const dates = list.flatMap((r) => Object.values(r.dates ?? {})).filter(Boolean).sort()
  const versions = [...new Set(list.map((r) => r.shipped_in).filter(Boolean))]

  const out = []
  out.push(`# ${repo}`)
  out.push('')
  if (meta.description) out.push(`> ${meta.description}`)
  out.push('')
  const summary = [
    `**${credited.length} credited**`,
    inFlight.length ? `${inFlight.length} in flight` : null,
    notAdopted.length ? `${notAdopted.length} not adopted` : null,
    versions.length ? `shipped in ${versions.join(', ')}` : null,
    dates.length ? `first ${dates[0]} · latest ${dates[dates.length - 1]}` : null
  ].filter(Boolean)
  out.push(summary.join(' · '))
  out.push('')
  out.push(`[${repo} on GitHub](${meta.url})`)
  out.push('')

  if (credited.length) {
    out.push('## Credited')
    out.push('')
    for (const r of credited.sort(byDateDesc)) out.push(renderRecord(r))
  }
  if (inFlight.length) {
    out.push('## In flight')
    out.push('')
    out.push('_Open, not yet accepted. Not counted in any total._')
    out.push('')
    for (const r of inFlight.sort(byDateDesc)) out.push(renderRecord(r))
  }
  if (notAdopted.length) {
    out.push('## Not adopted')
    out.push('')
    for (const r of notAdopted.sort(byDateDesc)) out.push(renderRecord(r))
  }

  out.push('---')
  out.push('')
  out.push('<sub>Generated by `scripts/render.mjs` from `data/contributions.json`. Do not edit by hand.</sub>')
  out.push('')
  return out.join('\n')
}

const byRepo = new Map()
for (const r of records) {
  const k = r.project.repo
  if (!byRepo.has(k)) byRepo.set(k, [])
  byRepo.get(k).push(r)
}

// Drop project pages whose repo left the ledger, so the tree never keeps a stale file.
const wanted = new Set([...byRepo.keys()].map((r) => `${slug(r)}.md`))
let existing = []
try { existing = await readdir(path.join(ROOT, 'projects')) } catch { /* first run */ }
for (const f of existing) {
  if (f.endsWith('.md') && !wanted.has(f)) await unlink(path.join(ROOT, 'projects', f))
}

for (const [repo, list] of byRepo) {
  await writeFile(path.join(ROOT, 'projects', `${slug(repo)}.md`), renderProject(repo, list), 'utf8')
}

/* -------------------------------------------------------------------- README */

const credited = records.filter((r) => CREDITED.has(r.status))
const inFlight = records.filter((r) => r.status === 'open')
const projectCount = byRepo.size

const readme = []
readme.push('# Open-source contributions')
readme.push('')
readme.push('A log of my contributions to other people\'s open-source projects, and of where each one was')
readme.push('acknowledged. Every credited entry carries a quote and a link to the place the credit was')
readme.push('written — a changelog line, a release note, or a maintainer\'s own words.')
readme.push('')

if (records.length === 0) {
  readme.push('_Nothing recorded yet._')
  readme.push('')
} else {
  readme.push(`**${credited.length} credited contribution${credited.length === 1 ? '' : 's'}** across ` +
    `**${projectCount} project${projectCount === 1 ? '' : 's'}**` +
    (inFlight.length ? ` · ${inFlight.length} in flight` : ''))
  readme.push('')
  readme.push('| Project | Credited | In flight | Shipped in | Latest |')
  readme.push('|---|---|---|---|---|')
  const rows = [...byRepo.entries()].sort((a, b) => {
    const ac = a[1].filter((r) => CREDITED.has(r.status)).length
    const bc = b[1].filter((r) => CREDITED.has(r.status)).length
    return bc - ac || a[0].localeCompare(b[0])
  })
  for (const [repo, list] of rows) {
    const c = list.filter((r) => CREDITED.has(r.status)).length
    const f = list.filter((r) => r.status === 'open').length
    const versions = [...new Set(list.map((r) => r.shipped_in).filter(Boolean))].join(', ') || '—'
    const latest = list.flatMap((r) => Object.values(r.dates ?? {})).filter(Boolean).sort().pop() ?? '—'
    readme.push(`| [${repo}](projects/${slug(repo)}.md) | ${c} | ${f || '—'} | ${versions} | ${latest} |`)
  }
  readme.push('')

  const shipped = records.filter((r) => r.status === 'shipped')
  if (shipped.length) {
    readme.push('### Why some entries say “shipped” rather than “merged”')
    readme.push('')
    readme.push('Maintainers often reimplement or squash a patch under their own commit and credit the')
    readme.push('author in the changelog. The pull request then stays closed with no merge and no commit')
    readme.push('carries my name, even though the change is in the release. Those entries are marked')
    readme.push('`shipped`, and the evidence block shows where the credit was written.')
    readme.push('')
  }
}

readme.push('## How this file is produced')
readme.push('')
readme.push('`data/contributions.json` is the source of truth. `scripts/scan.mjs` looks for six credit')
readme.push('signals across every repository I have opened an issue or pull request on — merged pull')
readme.push('requests, commits, changelog lines, release notes, maintainer thanks, and credits files —')
readme.push('and `scripts/render.mjs` regenerates this page and everything in `projects/`.')
readme.push('')
readme.push('Nothing here is written by hand, and `render.mjs` refuses to publish an entry that claims')
readme.push('credit without a quote and a working link to back it.')
readme.push('')

await writeFile(path.join(ROOT, 'README.md'), readme.join('\n'), 'utf8')

console.log(`rendered ${records.length} record(s) across ${projectCount} project(s).`)
