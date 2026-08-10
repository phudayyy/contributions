#!/bin/sh
# Session-start scan for newly credited open-source contributions.
#
# Runs in the background, so it never delays a session start. When it finds credit
# the ledger does not have yet, it exits 2, which wakes the model with the text on
# stdout — so the contribution gets recorded in this session rather than the next.
#
# Every failure path exits 0 in silence. A missing tool, no network, or an expired
# gh token must never surface as an error in the middle of unrelated work.

set -u

# Overridable so the alarm paths below can be exercised against a scratch repo;
# an alarm nobody has ever seen fire is an alarm nobody should trust.
REPO="${CONTRIB_REPO:-$HOME/Documents/Công việc/project/contributions}"
STAMP="${CONTRIB_STAMP:-$HOME/.claude/.contrib-last-scan}"
# Overridable for the same reason, and the omission was caught by using it: firing
# the auth alarm against a scratch repo still wrote the REAL reminder timestamp, so
# a genuine token lapse within the next day would have been swallowed — the hook
# would believe it had already spoken.
NAGGED="${CONTRIB_NAG:-$HOME/.claude/.contrib-last-nag}"
THROTTLE=86400    # at most one scan a day
STALE=259200      # three days unable to scan is worth saying out loud

now=$(date +%s)

# Seconds since the timestamp in $1, or a very large number if it is absent.
age_of () {
  [ -f "$1" ] || { echo 999999999; return; }
  v=$(cat "$1" 2>/dev/null || echo 0)
  case "$v" in ''|*[!0-9]*) v=0 ;; esac
  echo $(( now - v ))
}

# A missing tool or a lapsed token skips the scan, and that is right — a broken
# environment must not surface as an error inside unrelated work. Staying silent
# about it *forever* is not right, and it is the same failure this whole system
# exists to prevent: the log would just stop recording, with nothing anywhere
# saying so. An expired gh token is the realistic case. So after three quiet days
# it speaks up, and at most once a day after that.
blocked () {
  [ "$(age_of "$STAMP")" -lt "$STALE" ] && exit 0
  [ "$(age_of "$NAGGED")" -lt "$THROTTLE" ] && exit 0
  printf '%s' "$now" > "$NAGGED" 2>/dev/null
  if [ -f "$STAMP" ]; then
    when="has not run for $(( $(age_of "$STAMP") / 86400 )) day(s)"
  else
    when="has never run"
  fi
  cat <<EOF
The open-source contribution scan $when: $1

Nothing is being recorded while that is true, and no other signal reports it.
Tell the user plainly, and stop — do not try to work around it.
EOF
  exit 2
}

[ -d "$REPO/.git" ] || exit 0
command -v node >/dev/null 2>&1 || blocked "node is not on PATH"
command -v gh   >/dev/null 2>&1 || blocked "gh is not on PATH"
gh auth status  >/dev/null 2>&1 || blocked "gh is not authenticated — the token has most likely expired. Run: gh auth login"

[ "$(age_of "$STAMP")" -lt "$THROTTLE" ] && exit 0
# Stamp before scanning, not after: a scan that hangs must not re-fire every session.
printf '%s' "$now" > "$STAMP" 2>/dev/null

# Fetch unconditionally: the fast-forward below needs it, and so does the
# direct-push check at the end, which has to read origin/main from whatever
# branch the checkout happens to be sitting on.
git -C "$REPO" fetch origin main --quiet >/dev/null 2>&1

# Keep main current, so contributions recorded in an already-merged pull request
# are not rediscovered and filed a second time.
if [ -z "$(git -C "$REPO" status --porcelain 2>/dev/null)" ] &&
   [ "$(git -C "$REPO" rev-parse --abbrev-ref HEAD 2>/dev/null)" = "main" ]; then
  git -C "$REPO" merge --ff-only origin/main --quiet >/dev/null 2>&1
fi

drafts=$(cd "$REPO" && node scripts/scan.mjs --new-only --quiet --cache data/.pending.json 2>/dev/null) || exit 0
[ -n "$drafts" ] || exit 0

# Only newly CREDITED work wakes anybody up.
#
# An open pull request upstream is worth logging, but it is not an achievement and
# its state changes every few days — opening a pull request for it would hand the
# user a review that says nothing. So in-flight findings stay pending here and ride
# along the next time real credit arrives. The user asked for exactly this: they
# read a pull request only when there is genuinely a contribution to read about.
summary=$(printf '%s' "$drafts" | node -e '
let s = ""
process.stdin.on("data", (d) => (s += d)).on("end", () => {
  try {
    const a = JSON.parse(s)
    const credited = a.filter((r) => ["merged", "shipped", "credited"].includes(r.status)).length
    const open = a.filter((r) => r.status === "open").length
    const parts = []
    if (credited) parts.push(`${credited} newly credited`)
    if (open) parts.push(`${open} in flight, carried along`)
    const rest = a.length - credited - open
    if (rest > 0) parts.push(`${rest} closed without shipping`)
    process.stdout.write(`${credited}|${a.length}|${parts.join(", ")}`)
  } catch { process.stdout.write("0|0|") }
})' 2>/dev/null)

[ -n "$summary" ] || exit 0
credited=${summary%%|*}
rest=${summary#*|}
count=${rest%%|*}
breakdown=${rest#*|}
case "$credited" in ''|*[!0-9]*) credited=0 ;; esac

# Two alarms that are not about new contributions, and are worth waking for on
# their own — each describes something that is invisible everywhere else.
alarms=""

# 1. A truncated search. What it hid never arrives, so no later scan, no count
#    and no error will ever mention it.
warn=$(cat "$REPO/data/.scan-warnings" 2>/dev/null)
[ -n "$warn" ] && alarms="${alarms}
${warn}
"

# 2. A commit that reached main without a pull request. Walk main's own line —
#    first-parent, non-merge — and exclude the repository's root commit, which
#    was pushed directly when the repo was created and always will have been.
root=$(git -C "$REPO" rev-list --max-parents=0 origin/main 2>/dev/null | head -1)
if [ -n "$root" ]; then
  stray=$(git -C "$REPO" log --first-parent --no-merges origin/main \
            --format='  %h  %s' --not "$root" 2>/dev/null)
  [ -n "$stray" ] && alarms="${alarms}
DIRECT PUSH: commit(s) sit on main that never went through a pull request:
${stray}

Branch protection allows this for an admin, so it leaves no other trace. Force
pushing is blocked, so the only correct repair is a NEW revert commit — never
rewrite the history to hide it.
"
fi

if [ -n "$alarms" ]; then
  cat <<EOF
The contributions log needs attention:
$alarms
Tell the user, and deal with this before anything else.
EOF
  [ "$credited" -gt 0 ] 2>/dev/null || exit 2
  echo
fi

[ "$credited" -gt 0 ] 2>/dev/null || exit 0

cat <<EOF
$credited open-source contribution(s) have just been credited upstream and are missing from the
contributions ledger. $count record(s) to write in total: $breakdown.

Handle this first, then return to whatever the user asked for:

  cd "$REPO"
  node scripts/prepare.mjs
  cat data/.pending.json

then follow ~/.claude/skills/contrib/SKILL.md to record them.

The user has already approved this running unattended, so do not ask whether to
proceed. When it is done, report the pull request URL and nothing else.
EOF
exit 2
