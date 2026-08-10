# The automation, kept where it can be reviewed

The two files that drive this log used to live only in `~/.claude/`, which is not a
git repository. They could not be reviewed in a pull request, no history recorded
why they changed, and a wiped machine took them with it.

They live here now and are **symlinked** into `~/.claude/` — so the file reviewed in
this repository is the exact file that runs. A copy would drift the first time
either side was edited, and nothing would report the drift.

```
claude/hooks/contrib-scan.sh    → ~/.claude/hooks/contrib-scan.sh
claude/skills/contrib/SKILL.md  → ~/.claude/skills/contrib/SKILL.md
```

```bash
sh claude/install.sh          # link them, and report anything missing
sh claude/install.sh --check  # report only, change nothing
```

`~/.claude/settings.json` is deliberately **not** written by the installer — it holds
the model, theme and permission settings, and a script that rewrites it can lose all
of that. `install.sh` checks whether the hook is wired and prints the four lines to
paste if it is not.

## What the hook does

It runs at session start, in the background, at most once a day. It never delays a
session, and a broken environment never surfaces as an error inside unrelated work.

It wakes the model in four situations. Three of them are alarms rather than news,
and each one describes something invisible everywhere else:

| Situation | Why it is worth interrupting for |
|---|---|
| A contribution was newly **credited** upstream | The thing the log exists for |
| The GitHub search was **truncated** | What it hid never arrives, so no later scan, count or error will ever mention it |
| `gh` has been **unable to authenticate for three days** | The log silently stops recording; an expired token is the realistic case |
| A commit reached **`main` without a pull request** | Branch protection permits this for an admin, so it leaves no other trace |

An open pull request upstream is *not* one of them. It is recorded and rendered into
`IN-FLIGHT.md`, and rides along with the next run that carries real credit — a pull
request containing only in-flight entries is a review that says nothing.

## Reading it

`REPO` and `STAMP` can be overridden with `CONTRIB_REPO` and `CONTRIB_STAMP`. That
exists so the alarm paths can be fired on purpose against a scratch repository:
an alarm nobody has ever watched fire is an alarm nobody should trust.

```bash
# prove the direct-push alarm fires, without touching anything real
git init --bare /tmp/fake-remote.git
git clone <this repo> /tmp/fake-work && cd /tmp/fake-work
git remote set-url origin /tmp/fake-remote.git && git push origin main
git commit --allow-empty -m "pretend somebody pushed straight to main"
git push origin main
CONTRIB_REPO=/tmp/fake-work CONTRIB_STAMP=/tmp/stamp sh claude/hooks/contrib-scan.sh
```
