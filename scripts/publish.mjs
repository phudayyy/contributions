#!/usr/bin/env node
/**
 * publish.mjs — put newly recorded contributions on a branch and open a pull
 * request for review.
 *
 * The whole point of this script is what it refuses to do. It never commits to
 * main, never pushes to main, and never merges. `main` only ever moves when a
 * human merges the pull request, so the public log cannot gain an entry nobody
 * read. If an unmerged pull request from an earlier scan is still open, this
 * pushes onto that same branch and updates it rather than opening a second one.
 *
 * Usage
 *   node scripts/publish.mjs                 branch, commit, push, open or update the PR
 *   node scripts/publish.mjs --dry-run       print what it would do and stop
 */

import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DRY = process.argv.includes('--dry-run')

const PROTECTED = new Set(['main', 'master'])

function run (cmd, args, { allowFail = false } = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd: ROOT, timeout: 120000, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && !allowFail) {
        reject(new Error(`${cmd} ${args.join(' ')}\n${stderr || err.message}`))
        return
      }
      resolve((stdout ?? '').trim())
    })
  })
}

const git = (...args) => run('git', args)
const gitSoft = (...args) => run('git', args, { allowFail: true })
const gh = (...args) => run('gh', args)
const ghSoft = (...args) => run('gh', args, { allowFail: true })

/* ------------------------------------------------------------------ what changed */

const status = await git('status', '--porcelain')
if (!status) {
  console.log('nothing to publish — the working tree is clean.')
  process.exit(0)
}

const ledger = JSON.parse(await readFile(path.join(ROOT, 'data/contributions.json'), 'utf8'))
const records = ledger.records ?? []

// Describe the change using the ledger the render was produced from.
const credited = records.filter((r) => ['merged', 'shipped', 'credited'].includes(r.status))
const projects = [...new Set(records.map((r) => r.project.repo))]

/* ------------------------------------------------------------------ the guard rail */

// scripts/prepare.mjs put us on the branch. Refuse to write if it did not.
const now = await git('rev-parse', '--abbrev-ref', 'HEAD')
if (PROTECTED.has(now)) {
  console.error(`refusing to commit: HEAD is on "${now}". Run scripts/prepare.mjs first.`)
  process.exit(1)
}

const openPrs = JSON.parse(
  await ghSoft('pr', 'list', '--state', 'open', '--author', '@me', '--json', 'number,headRefName,url', '--limit', '20') || '[]'
)
const reusable = openPrs.find((p) => p.headRefName === now)

if (DRY) {
  console.log(`would ${reusable ? `update PR #${reusable.number} on` : 'open a PR from'} branch ${now}`)
  console.log(status)
  process.exit(0)
}

await git('add', 'data/contributions.json', 'projects', 'README.md')

const staged = await git('diff', '--cached', '--name-only')
if (!staged) {
  console.log('nothing staged — no ledger or rendered page changed.')
  process.exit(0)
}

const subject = `contrib: record ${credited.length} credited contribution${credited.length === 1 ? '' : 's'} across ${projects.length} project${projects.length === 1 ? '' : 's'}`

const body = [
  '',
  ...records.slice(0, 20).map((r) => `- ${r.status}: ${r.project.repo} — ${r.title}`),
  '',
  'Rendered by scripts/render.mjs from data/contributions.json.',
  '',
  'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>'
].join('\n')

await git('commit', '-m', subject, '-m', body)
await git('push', '-u', 'origin', now)

/* ---------------------------------------------------------------------- the PR */

if (reusable) {
  console.log(`updated PR #${reusable.number} — ${reusable.url}`)
  process.exit(0)
}

const prBody = [
  'Recorded automatically by the `/contrib` rule. Nothing here reaches `main` until you merge.',
  '',
  '### What to check',
  '',
  'Every entry claiming credit carries a quote and a link to where that credit was written.',
  'Open the evidence block on each one and confirm the quote really says what the entry claims.',
  '',
  '### Entries in this pull request',
  '',
  ...records.map((r) => {
    const where = r.links?.release ?? r.links?.pr ?? r.links?.issue ?? ''
    return `- **${r.status}** · ${r.project.repo} — ${r.title}${where ? ` (${where})` : ''}`
  }),
  '',
  '🤖 Generated with [Claude Code](https://claude.com/claude-code)'
].join('\n')

const url = await gh('pr', 'create', '--base', 'main', '--head', now, '--title', subject, '--body', prBody)
console.log(`opened ${url}`)
console.log('main is unchanged — merge it yourself once the evidence checks out.')
