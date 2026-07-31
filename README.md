# Kalayaan Callings — Trello-style Board

A lightweight, dependency-free Trello-style board for tracking ward callings
through their pipeline (Proposal → For Discussion → Contacting → For Interview →
For Sustaining → For Setting Apart → For Releasing → For Recording → Done).

It is a **static site** — plain HTML/CSS/JS, no build step, no server, no
external requests. Board data is saved in your browser's `localStorage`.

## Features

- Lists (columns) and cards, matching the reference layout
- **Drag & drop** cards within and between lists
- Card details: candidate name, description, checklist (with progress bar),
  color labels, members/avatars, "days in stage" badge, watching flag
- Add / rename / delete lists and cards
- Rename the board; reset to sample data anytime
- Everything persists locally in your browser

## URL-based versioning (revert easily)

Each release is a **frozen, self-contained folder**:

```
/            → redirects to the latest version
/v1/         → Version 1   (this release)
/v2/         → Version 2   (a future release)
versions.json → the manifest of all versions + which one is "latest"
```

- The site root always opens the **latest** version.
- To **revert**, just visit an older version's URL, e.g.
  `https://<user>.github.io/bishopric-dashboard/v1/`.
- An in-app **version switcher** (top-right `v1 ▼`) lets you hop between
  versions without typing URLs.
- Board **data is shared** across versions (same `localStorage` key), so
  reverting the code keeps your board. The loader is version-tolerant, so an
  older version won't choke on data written by a newer one.

## Cutting a new version

When you want to change the app but keep the old one reachable at `/v1`:

```bash
./new-version.sh v2        # copies the latest version folder → v2/
# ...make your changes inside v2/ ...
# then edit v2/app.js: set APP_VERSION = 'v2'
# and add v2 to versions.json (and set "latest": "v2")
git add . && git commit -m "Release v2" && git push
```

`v1/` stays byte-for-byte as it was — so `/v1` always works.

## Hosting on GitHub Pages

Two options:

1. **GitHub Actions (recommended, already configured).**
   `.github/workflows/deploy.yml` deploys the repo to Pages on every push to
   `main`. In the repo: **Settings → Pages → Build and deployment → Source:
   GitHub Actions**. Merge this branch to `main` and it deploys automatically.

2. **Deploy from a branch.** Settings → Pages → Source: *Deploy from a branch*
   → `main` / `/ (root)`. The `.nojekyll` file makes Pages serve the folders
   as-is.

The site will be at `https://<user>.github.io/bishopric-dashboard/`.

## Local preview

```bash
python3 -m http.server 8000
# open http://localhost:8000/        (redirects to /v1/)
# open http://localhost:8000/v1/     (direct)
```

Opening `index.html` via `file://` also works, though a local server matches
the GitHub Pages behavior most closely.
