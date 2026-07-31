# Kalayaan Callings — Trello-style Board

A lightweight, dependency-free Trello-style board for tracking ward callings
through their pipeline (Proposal → For Discussion → Contacting → For Interview →
For Sustaining → For Setting Apart → For Releasing → For Recording → Done).

It is a **static site** — plain HTML/CSS/JS, no build step. There are two
deployed versions:

- **`/v1` — Local.** Fully self-contained, no external requests. Board data
  lives in the browser's `localStorage` (this device only).
- **`/v2` — Shared (latest).** Adds a realtime backend
  ([Firebase Firestore](#shared-backend-v2)) so everyone with the secret board
  link sees the same board, live. Falls back to local-only until you add your
  Firebase config.

## Features

- Lists (columns) and cards, matching the reference layout
- **Drag & drop** cards within and between lists
- Card details: candidate name, description, checklist (with progress bar),
  color labels, members/avatars, "days in stage" badge, watching flag
- Add / rename / delete lists and cards
- Rename the board; reset to sample data anytime
- Everything persists locally in your browser

## Shared backend (v2)

Version 2 syncs the board in realtime through **Firebase Firestore**, straight
from the static site — no server to run. Access is gated by a **secret board
ID** carried in the URL (`.../v2/#b=<random>`); anyone with that link shares the
same live board. No login.

### One-time setup

1. Go to <https://console.firebase.google.com> and **create a project** (free).
2. **Build → Firestore Database → Create database** → *Production mode*.
3. **Project settings** (⚙) → **Your apps** → **Web app** (`</>`) → register →
   copy the `firebaseConfig` values.
4. Paste them into **`v2/firebase-config.js`** (replace the `YOUR_...` values).
5. **Firestore → Rules**, paste the rules below, **Publish**:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       // A board is readable/writable only if you know its (unguessable) id.
       // `get` (not `list`) prevents anyone from enumerating all boards.
       match /boards/{boardId} {
         allow get, write: if true;
       }
     }
   }
   ```

6. Commit & push. On `/v2`, the status pill turns green **● Synced**.

### Using it

- Open `/v2`. The first visit **creates** a shared board (seeded from any board
  you already had locally) and puts a secret id in the URL.
- Click **Share** to copy the link and send it to the bishopric — everyone on
  that link edits the same board, live.
- Want **one fixed board for everyone** (no per-link ids)? Set
  `FIXED_BOARD_ID` in `v2/firebase-config.js` to any string, e.g. `"kalayaan"`.

### Verify sync

Open `/v2` in two browser windows (same `#b=` link). Move a card in one — it
moves in the other within a second.

### Security note (important)

You chose the **secret-link** model: anyone who has the board link can read and
edit it, and the link can leak (browser history, screenshots, forwards). The
Firebase config in `firebase-config.js` is *meant* to be public — protection
comes from the rules above + the unguessable id, not from hiding the config.
Because this board holds confidential member data, treat the link like a
password. If you later want stricter access (only specific Google accounts),
that's a natural **v3** — open an issue and it can be added without touching v1
or v2.

Concurrency is last-write-wins on the whole board — fine for a small bishopric
editing occasionally; not built for dozens of simultaneous editors.

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

When you want to change the app but keep the old ones reachable at `/v1`, `/v2`:

```bash
./new-version.sh v3        # copies the latest version folder → v3/
# ...make your changes inside v3/ ...
# then edit v3/app.js: set APP_VERSION = 'v3'
# and add v3 to versions.json (and set "latest": "v3")
git add . && git commit -m "Release v3" && git push
```

Older version folders stay byte-for-byte as they were — so `/v1` and `/v2`
always keep working.

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
# open http://localhost:8000/        (redirects to the latest, /v2/)
# open http://localhost:8000/v2/     (shared version)
# open http://localhost:8000/v1/     (local-only version)
```

Opening `index.html` via `file://` also works, though a local server matches
the GitHub Pages behavior most closely.
