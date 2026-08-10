#!/bin/sh
# Wire this repo's hook and skill into ~/.claude.
#
# They are SYMLINKED, not copied, and that is the point: the file reviewed in this
# repository is the exact file that runs. A copy would drift the first time either
# side was edited, and nothing would report the drift — which is the failure mode
# the whole log exists to avoid.
#
#   sh claude/install.sh          link them, and report what is missing
#   sh claude/install.sh --check  report only, change nothing

set -eu

CHECK=0
[ "${1:-}" = "--check" ] && CHECK=1

SELF=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$SELF/.." && pwd)
CLAUDE="$HOME/.claude"

say () { printf '%s\n' "$*"; }

link () {  # link <source-in-repo> <destination-under-~/.claude>
  src="$REPO/$1"
  dst="$CLAUDE/$2"

  [ -e "$src" ] || { say "  ✗ missing in repo: $1"; return 1; }

  if [ -L "$dst" ] && [ "$(readlink "$dst")" = "$src" ]; then
    say "  ✓ already linked: ~/.claude/$2"
    return 0
  fi

  if [ "$CHECK" = 1 ]; then
    if [ -e "$dst" ]; then say "  ! ~/.claude/$2 exists but is not a link to this repo"
    else say "  ! ~/.claude/$2 is missing"; fi
    return 0
  fi

  mkdir -p "$(dirname "$dst")"
  # Never overwrite a real file without keeping it — it may hold local edits that
  # were never brought back into the repo.
  if [ -e "$dst" ] && [ ! -L "$dst" ]; then
    backup="$dst.replaced-$(date +%Y%m%d%H%M%S)"
    mv "$dst" "$backup"
    say "  · kept the previous file as $(basename "$backup")"
  fi
  ln -sfn "$src" "$dst"
  say "  ✓ linked ~/.claude/$2 → $1"
}

say "repo: $REPO"
say ""
link claude/hooks/contrib-scan.sh  hooks/contrib-scan.sh
link claude/skills/contrib/SKILL.md skills/contrib/SKILL.md
chmod +x "$REPO/claude/hooks/contrib-scan.sh" 2>/dev/null || true

# settings.json is left alone on purpose: it carries the user's own model, theme
# and permissions, and a script that rewrites it can lose all of that. Report
# instead, and let a human paste four lines.
say ""
if grep -q 'contrib-scan.sh' "$CLAUDE/settings.json" 2>/dev/null; then
  say "  ✓ SessionStart hook is wired in ~/.claude/settings.json"
else
  say "  ! ~/.claude/settings.json does not run the hook yet. Add, under \"hooks\":"
  say ''
  cat <<'EOF'
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"$HOME/.claude/hooks/contrib-scan.sh\"",
            "asyncRewake": true,
            "timeout": 180,
            "statusMessage": "Checking open-source contribution credit",
            "rewakeSummary": "New open-source contributions to record",
            "rewakeMessage": "The contributions ledger is behind what GitHub shows."
          }
        ]
      }
    ]
EOF
fi

say ""
say "Prerequisites the hook checks for itself, and stays quiet about for three days:"
command -v node >/dev/null 2>&1 && say "  ✓ node" || say "  ✗ node is not on PATH"
command -v gh   >/dev/null 2>&1 && say "  ✓ gh"   || say "  ✗ gh is not on PATH"
if command -v gh >/dev/null 2>&1; then
  gh auth status >/dev/null 2>&1 && say "  ✓ gh is authenticated" || say "  ✗ gh is not authenticated — run: gh auth login"
fi
