#!/usr/bin/env bash
# Snapshot the CURRENT app (served at the site root, "/") into a frozen
# version folder /vN, so it stays reachable at that URL forever.
#
#   ./new-version.sh          # auto-pick the next vN number
#   ./new-version.sh v3       # explicit
#
# Model:
#   /            → the LATEST app (this is where you edit). Refreshing / always
#                  loads the newest version.
#   /v1, /v2 ... → frozen snapshots for reverting. Never edited after release.
#
# Typical flow: edit the files at the root → run this to freeze a snapshot →
# commit & push. The root keeps serving the latest.
set -euo pipefail

APP_FILES=(index.html app.js styles.css firebase-config.js)

# Ensure we're at the repo root (where index.html + versions.json live).
if [[ ! -f index.html || ! -f versions.json ]]; then
  echo "Run this from the repository root (where index.html and versions.json are)."
  exit 1
fi

# Determine the new version id.
NEW="${1:-}"
if [[ -z "$NEW" ]]; then
  HIGH=$(ls -d v[0-9]* 2>/dev/null | sed 's/^v//' | sort -n | tail -n1 || true)
  NEW="v$(( ${HIGH:-0} + 1 ))"
fi
if [[ ! "$NEW" =~ ^v[0-9]+$ ]]; then
  echo "Version id should look like v3, v4, ... (got '$NEW')"; exit 1
fi
if [[ -d "$NEW" ]]; then
  echo "Folder '$NEW' already exists. Aborting."; exit 1
fi

# Freeze the current root app into /vN.
mkdir "$NEW"
for f in "${APP_FILES[@]}"; do
  [[ -f "$f" ]] && cp "$f" "$NEW/$f"
done
echo "Snapshotted current root → $NEW/"

# Register it in versions.json and mark it latest (uses node for safe JSON).
TODAY="$(date +%F 2>/dev/null || echo '')"
node - "$NEW" "$TODAY" <<'NODE'
const fs = require('fs');
const [id, today] = process.argv.slice(2);
const p = 'versions.json';
const data = JSON.parse(fs.readFileSync(p, 'utf8'));
data.versions = data.versions || [];
if (!data.versions.find(v => v.id === id)) {
  const n = id.replace(/^v/, '');
  data.versions.push({ id, label: `Version ${n}`, released: today, notes: 'Snapshot.' });
}
data.latest = id;
fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
console.log(`versions.json: added ${id}, set latest=${id}.`);
NODE

# Cache-bust the ROOT's asset URLs (?v=N) so browsers fetch the new files
# instead of a stale cached copy. (The snapshot's own /vN/ URLs are immutable,
# so they don't need this.)
NUM="${NEW#v}"
if [[ -f index.html ]]; then
  perl -pi -e "s/(styles\.css|app\.js)\?v=\d+/\$1?v=$NUM/g" index.html
  echo "index.html: cache-bust query bumped to ?v=$NUM"
fi

echo
echo "Done. Next:"
echo "  • (optional) edit $NEW's label/notes in versions.json"
echo "  • git add . && git commit -m 'Release $NEW' && git push"
echo
echo "The root (/) still serves the latest app; /$NEW is now a frozen snapshot."
