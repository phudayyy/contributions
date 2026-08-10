#!/usr/bin/env node
/**
 * prepare.mjs — put the checkout on the right branch before anything is written.
 *
 * This runs first, while the tree is still clean, because switching branches
 * after the ledger has been edited either fails or drags the edit onto the wrong
 * base. Two cases:
 *
 *   - a contrib pull request is still open → check out its branch and fast-forward,
 *     so the new findings join that pull request instead of opening a second one
 *   - otherwise → fast-forward main to origin, then branch from it
 *
 * The fast-forward matters more than it looks. After you merge a contrib pull
 * request on GitHub, a local checkout still sitting on the old main carries a
 * ledger without those records — and the next scan would report them as new and
 * open a duplicate pull request for contributions that are already published.
 *
 * Prints the branch name on stdout.
 */

import { execFile } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function run (cmd, args, { allowFail = false } = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd: ROOT, timeout: 120000, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && !allowFail) return reject(new Error(`${cmd} ${args.join(' ')}\n${stderr || err.message}`))
      resolve((stdout ?? '').trim())
    })
  })
}
const git = (...a) => run('git', a)
const gitSoft = (...a) => run('git', a, { allowFail: true })
const ghSoft = (...a) => run('gh', a, { allowFail: true })

const dirty = await git('status', '--porcelain')
if (dirty) {
  console.error('working tree is not clean — commit or discard first:\n' + dirty)
  process.exit(1)
}

await gitSoft('fetch', 'origin', '--quiet')

const openPrs = JSON.parse(
  await ghSoft('pr', 'list', '--state', 'open', '--author', '@me',
    '--json', 'number,headRefName,url', '--limit', '20') || '[]'
)
const reusable = openPrs.find((p) => p.headRefName.startsWith('contrib/scan-'))

if (reusable) {
  const local = await gitSoft('rev-parse', '--verify', '--quiet', reusable.headRefName)
  if (local) await git('checkout', '--quiet', reusable.headRefName)
  else await git('checkout', '--quiet', '-b', reusable.headRefName, `origin/${reusable.headRefName}`)
  await gitSoft('merge', '--ff-only', '--quiet', `origin/${reusable.headRefName}`)
  console.error(`reusing open PR #${reusable.number} — ${reusable.url}`)
  console.log(reusable.headRefName)
  process.exit(0)
}

await git('checkout', '--quiet', 'main')
await gitSoft('merge', '--ff-only', '--quiet', 'origin/main')

const branch = `contrib/scan-${new Date().toISOString().slice(0, 10)}`
const exists = await gitSoft('rev-parse', '--verify', '--quiet', branch)
if (exists) await git('checkout', '--quiet', branch)
else await git('checkout', '--quiet', '-b', branch)

console.error(`branched ${branch} from main`)
console.log(branch)
