#!/usr/bin/env bash
# Snapshot the current latest version into a new version folder.
#
#   ./new-version.sh v2
#
# This copies the latest version folder (per versions.json) to the new id,
# then reminds you of the two manual edits needed. The OLD version folder is
# left untouched, so its URL keeps working forever.
set -euo pipefail

NEW="${1:-}"
if [[ -z "$NEW" ]]; then
  echo "Usage: ./new-version.sh <new-version-id>   e.g. ./new-version.sh v2"
  exit 1
fi

if [[ ! "$NEW" =~ ^v[0-9]+$ ]]; then
  echo "Version id should look like v2, v3, ... (got '$NEW')"
  exit 1
fi

if [[ -d "$NEW" ]]; then
  echo "Folder '$NEW' already exists. Aborting."
  exit 1
fi

# Determine the current latest version from versions.json (fallback: highest vN dir).
LATEST=""
if [[ -f versions.json ]]; then
  LATEST=$(grep -o '"latest"[[:space:]]*:[[:space:]]*"[^"]*"' versions.json | grep -o 'v[0-9]*' | head -n1 || true)
fi
if [[ -z "$LATEST" ]]; then
  LATEST=$(ls -d v[0-9]* 2>/dev/null | sort -V | tail -n1 || true)
fi
if [[ -z "$LATEST" || ! -d "$LATEST" ]]; then
  echo "Could not find a source version folder to copy. Aborting."
  exit 1
fi

cp -r "$LATEST" "$NEW"
echo "Copied $LATEST/ -> $NEW/"
echo
echo "Next steps:"
echo "  1. Make your changes inside $NEW/"
echo "  2. In $NEW/app.js set:   const APP_VERSION = '$NEW';"
echo "  3. In $NEW/index.html update the <title> and the version badge text to $NEW"
echo "  4. Add $NEW to versions.json and set \"latest\": \"$NEW\""
echo "  5. git add . && git commit -m 'Release $NEW' && git push"
echo
echo "  ($LATEST/ is untouched, so /$LATEST keeps working.)"
