/* ============================================================
   Kalayaan Callings — Trello-style board
   Version 2  (shared realtime backend via Firebase Firestore)
   ------------------------------------------------------------
   • Live multi-device sync: everyone with the secret board link sees
     the same board, updated in realtime.
   • Access is gated by an unguessable board ID carried in the URL
     (#b=...). No login. Configure Firebase in firebase-config.js.
   • If Firebase is NOT configured, the app runs LOCAL-ONLY (this
     device only) so it never breaks before setup.
   • localStorage is still used as an offline cache + fast first paint,
     and its data is migrated into the shared board on first connect.
   ============================================================ */

'use strict';

const STORAGE_KEY = 'kalayaan-callings-board';   // local cache (shared with v1)
const BOARD_ID_KEY = 'kalayaan-board-id';

/* Location-independent: the SAME files run at the site root (always-latest)
   and inside a frozen /vN/ snapshot. Detect which, and resolve sibling paths
   (versions.json, other versions, README) relative to the site root. */
const LOC = (function () {
  const path = location.pathname.replace(/index\.html$/, '');
  const m = path.match(/\/(v\d+)\/?$/);
  return m
    ? { atRoot: false, id: m[1], prefix: '../' }   // e.g. /v2/  → root is one up
    : { atRoot: true,  id: null, prefix: './'  };  // e.g. /     → root is here
})();
const APP_VERSION = LOC.atRoot ? 'latest' : LOC.id;

/* ----------------------- Utilities ----------------------- */
const uid = () => 'id' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const AVATAR_COLORS = ['#0079bf', '#d29034', '#519839', '#b04632', '#89609e', '#00aecc', '#4bbf6b', '#cd5a91'];
const LABEL_COLORS = ['#4bce97', '#f5cd47', '#fea362', '#f87168', '#9f8fef', '#579dff', '#6cc3e0', '#8590a2'];

function colorFor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}
function initials(name) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0] || '')[0] || '' ).toUpperCase() + ((parts[1] || '')[0] || '').toUpperCase();
}
function avatarEl(name) {
  const el = document.createElement('span');
  el.className = 'avatar';
  el.style.background = colorFor(name);
  el.textContent = initials(name) || '?';
  el.title = name;
  return el;
}

/* ----------------------- Seed data ----------------------- */
function seed() {
  const mk = (position, opts = {}) => ({
    id: uid(),
    position,               // the calling / position (subtitle)
    name: opts.name || '',  // the proposed person (card headline)
    due: opts.due || null,
    watching: !!opts.watching,
    description: opts.description || '',
    labels: opts.labels || [],
    members: opts.members || [],
    checklist: opts.checklist || [],
  });
  // Standard 3-step checklist most cards carry
  const cl = (done) => [
    { text: 'Approved in council', done: done >= 1 },
    { text: 'Candidate contacted', done: done >= 2 },
    { text: 'Interview scheduled', done: done >= 3 },
  ];
  return {
    title: 'Kalayaan Callings',
    members: ['Eljon Serrano', 'Kathleen Barboza', 'Aldrin Cruz', 'Jasmin Serrano', 'Jethro Moran'],
    lists: [
      { id: uid(), title: 'Proposal/Pending', cards: [
        mk('YSA Leader', { checklist: cl(0) }),
        mk('YW Teacher', { checklist: cl(0) }),
        mk('Young Men Advisor', { checklist: cl(0) }),
        mk('Teachers\' Quorum Secretary', { checklist: cl(0) }),
      ]},
      { id: uid(), title: 'For Discussion', cards: [
        mk('Nursery Teacher', { name: 'Krizia Cureg Dela Rosa', due: 3, checklist: cl(2), members: ['Eljon Serrano'] }),
        mk('Assistant Clerk - Records', { name: 'Jerson Danao', due: 1, watching: true, checklist: cl(2), members: ['Eljon Serrano'] }),
      ]},
      { id: uid(), title: 'Contacting', cards: [
        mk('Ward Mission Leader', { name: '', due: 1, description: 'Coordinate with elders quorum.', checklist: cl(2), members: ['Eljon Serrano'] }),
      ]},
      { id: uid(), title: 'For Interview', cards: [
        mk('Sunday School 2nd Counselor', { name: 'Kai Serrano', description: 'x', checklist: cl(2), members: ['Jasmin Serrano'] }),
        mk('Relief Society Teacher', { name: 'Elisa Ruiz', checklist: cl(2), members: ['Jasmin Serrano'] }),
        mk('Ward History Specialist', { name: 'Justine Matt', checklist: cl(2), members: ['Jethro Moran'] }),
        mk('Sunday School Teacher', { name: 'Regine Villaruel', due: 1, checklist: cl(2), members: ['Jethro Moran'] }),
        mk('Gatherers of Light 2nd Counselor', { name: 'Czarina Trinidad', due: 1, watching: true, checklist: cl(2), members: ['Eljon Serrano'] }),
        mk('Young Women Teacher', { name: 'Mean Magalang', due: 2, checklist: cl(2), members: ['Eljon Serrano'] }),
        mk('Sunday School Teacher - Married', { name: 'Rowena Cruz', checklist: cl(2) }),
        mk('Elders Quorum Instructor', { name: 'Marc Villaluna', checklist: cl(1) }),
        mk('Primary Music Leader', { name: 'Hannah Reyes', checklist: cl(2) }),
        mk('Ward Organist', { name: 'Paolo Mendoza', checklist: cl(1) }),
      ]},
      { id: uid(), title: 'For Sustaining', cards: [
        mk('Disability Specialist', { name: 'Kathleen Barboza', due: 1, checklist: cl(2), members: ['Eljon Serrano'] }),
        mk('Relief Society Teacher', { name: 'Jasmin Serrano', checklist: cl(2), members: ['Jasmin Serrano'] }),
      ]},
      { id: uid(), title: 'For Setting Apart', cards: [] },
      { id: uid(), title: 'For Releasing', cards: [] },
      { id: uid(), title: 'For Recording', cards: [
        mk('Priests\' Quorum 2nd Assistant', { name: 'Joven Cris Matt', due: 3, checklist: cl(2), members: ['Jethro Moran'] }),
        mk('Teachers\' Quorum 2nd Counselor', { name: 'Jethro Moran', checklist: cl(2), members: ['Jethro Moran'] }),
      ]},
      { id: uid(), title: 'Done', cards: [
        mk('Young Men Adviser', { name: 'John Robin Ayo', due: 5, checklist: cl(3), members: ['Eljon Serrano'] }),
        mk('Teachers\' Quorum Secretary', { name: 'Leo Domingo', due: 5, checklist: cl(3), members: ['Eljon Serrano'] }),
        mk('Teachers\' Quorum 1st Counselor', { name: 'Neil Navarra', checklist: cl(2), members: ['Jasmin Serrano'] }),
        mk('YSA Leader', { name: 'Trisia Talosig', due: 2, checklist: cl(2), members: ['Eljon Serrano'] }),
        mk('Sunday School President', { name: 'Neil Navarra', due: 2, checklist: cl(2), members: ['Eljon Serrano'] }),
        mk('Welfare & Self-Reliance Leader', { name: 'Hela Panay', due: 2, checklist: cl(2), members: ['Eljon Serrano'] }),
        mk('RS Ministering Secretary', { name: 'Yolly Matuguinas', due: 2, checklist: cl(2), members: ['Eljon Serrano'] }),
        mk('Ward Clerk', { name: 'Rex Aquino', checklist: cl(3) }),
        mk('Primary President', { name: 'Sheila Munoz', checklist: cl(3) }),
        mk('Elders Quorum President', { name: 'Ariel Bautista', checklist: cl(3) }),
      ]},
    ],
  };
}

/* ----------------------- State ----------------------- */
// Start from the local cache (or seed) for an instant first paint; the shared
// board from Firestore, if configured, replaces it once connected.
let board = loadLocal();

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.lists)) return normalize(data);
    }
  } catch (e) { console.warn('Failed to load cached board, seeding.', e); }
  const s = seed();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(toStorage(s))); } catch (_) {}
  return s;
}

// Tolerate older/newer shapes so switching versions never crashes.
function normalize(data) {
  data.title = data.title || 'Kalayaan Callings';
  data.members = Array.isArray(data.members) ? data.members : [];
  data.lists = data.lists.map(l => ({
    id: l.id || uid(),
    title: l.title || 'Untitled',
    cards: (l.cards || []).map(c => ({
      id: c.id || uid(),
      // Migrate old shape (title=calling, candidate=person) → position/name.
      position: c.position || c.title || 'Untitled',
      name: c.name || c.candidate || '',
      due: c.due ?? null,
      watching: !!c.watching,
      description: c.description || '',
      labels: Array.isArray(c.labels) ? c.labels : [],
      members: Array.isArray(c.members) ? c.members : [],
      checklist: Array.isArray(c.checklist) ? c.checklist : [],
    })),
  }));
  return data;
}

// Serialize with LEGACY-compatible fields so older snapshots (/v1, /v2), which
// read `title` (calling) and `candidate` (person), can still render data
// written by this newer name/position layout. New code prefers position/name.
function toStorage(b) {
  return {
    ...b,
    lists: b.lists.map(l => ({
      ...l,
      cards: l.cards.map(c => ({ ...c, title: c.position, candidate: c.name })),
    })),
  };
}

// Every mutation calls save(): cache locally AND push to the shared backend.
function save(b = board) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(toStorage(b))); }
  catch (e) { console.warn('Failed to cache board.', e); }
  scheduleRemotePush();
}

/* Lookups */
function findList(listId) { return board.lists.find(l => l.id === listId); }
function findCard(cardId) {
  for (const l of board.lists) {
    const c = l.cards.find(x => x.id === cardId);
    if (c) return { list: l, card: c };
  }
  return null;
}

/* ----------------------- Rendering ----------------------- */
const boardEl = $('#board');

function render() {
  boardEl.innerHTML = '';
  board.lists.forEach(list => boardEl.appendChild(renderList(list)));

  // "Add another list" trailing column
  const addWrap = document.createElement('div');
  addWrap.className = 'add-list';
  const addBtn = document.createElement('button');
  addBtn.className = 'add-list-btn';
  addBtn.innerHTML = '+ Add another list';
  addBtn.addEventListener('click', () => openListComposer(addWrap, addBtn));
  addWrap.appendChild(addBtn);
  boardEl.appendChild(addWrap);

  $('#board-title').textContent = board.title;
  renderTopMembers();
}

function renderTopMembers() {
  const wrap = $('#top-members');
  wrap.innerHTML = '';
  board.members.slice(0, 6).forEach(m => wrap.appendChild(avatarEl(m)));
}

function renderList(list) {
  const el = document.createElement('section');
  el.className = 'list';
  el.dataset.listId = list.id;

  // Header
  const header = document.createElement('div');
  header.className = 'list-header';
  const title = document.createElement('input');
  title.className = 'list-title';
  title.value = list.title;
  title.setAttribute('aria-label', 'List title');
  title.addEventListener('change', () => { list.title = title.value.trim() || 'Untitled'; save(); renderCount(); });
  const menu = document.createElement('button');
  menu.className = 'list-menu';
  menu.textContent = '⋯';
  menu.title = 'Delete list';
  menu.addEventListener('click', () => {
    if (confirm(`Delete list "${list.title}" and its ${list.cards.length} card(s)?`)) {
      board.lists = board.lists.filter(l => l.id !== list.id);
      save(); render();
    }
  });
  header.appendChild(title);
  header.appendChild(menu);

  const count = document.createElement('div');
  count.className = 'list-count';
  const countText = () => {
    const n = list.cards.length;
    return n === 1 ? '1 card matches filters' : `${n} cards match filters`;
  };
  count.textContent = countText();
  function renderCount() { count.textContent = countText(); }
  el._renderCount = renderCount;

  // Cards
  const ul = document.createElement('ul');
  ul.className = 'cards';
  ul.dataset.listId = list.id;
  list.cards.forEach(card => ul.appendChild(renderCard(card, list)));

  // Add card
  const add = document.createElement('button');
  add.className = 'add-card';
  add.innerHTML = '+ Add a card';
  add.addEventListener('click', () => openCardComposer(list, ul, add));

  el.appendChild(header);
  el.appendChild(count);
  el.appendChild(ul);
  el.appendChild(add);
  return el;
}

function renderCard(card, list) {
  const li = document.createElement('li');
  li.className = 'card';
  li.dataset.cardId = card.id;

  // Pointer-based drag (works for mouse + touch). Tap/click without a drag
  // opens the card. See the "Drag & drop" section below.
  li.addEventListener('pointerdown', (e) => onCardPointerDown(e, card, list, li));

  // Labels
  if (card.labels.length) {
    const labs = document.createElement('div');
    labs.className = 'card-labels';
    card.labels.forEach(color => {
      const s = document.createElement('span');
      s.className = 'card-label';
      s.style.background = color;
      labs.appendChild(s);
    });
    li.appendChild(labs);
  }

  // Headline: the proposed person's NAME (falls back to a muted placeholder).
  const t = document.createElement('div');
  t.className = 'card-title' + (card.name ? '' : ' unassigned');
  t.textContent = card.name || 'Unassigned';
  li.appendChild(t);

  // Subtitle: the calling / position.
  const sub = document.createElement('div');
  sub.className = 'card-subtitle';
  sub.textContent = card.position;
  li.appendChild(sub);

  // Badges row
  const badges = document.createElement('div');
  badges.className = 'card-badges';

  if (card.due != null) {
    const b = document.createElement('span');
    b.className = 'badge due';
    b.innerHTML = iconClock() + card.due;
    b.title = 'Days in stage';
    badges.appendChild(b);
  }
  if (card.watching) {
    const b = document.createElement('span');
    b.className = 'badge';
    b.innerHTML = iconEye();
    b.title = 'Watching';
    badges.appendChild(b);
  }
  if (card.description) {
    const b = document.createElement('span');
    b.className = 'badge';
    b.innerHTML = iconDesc();
    b.title = 'This card has a description';
    badges.appendChild(b);
  }
  if (card.checklist.length) {
    const done = card.checklist.filter(i => i.done).length;
    const b = document.createElement('span');
    const complete = done === card.checklist.length;
    b.className = 'badge checklist' + (complete ? ' complete' : '');
    b.innerHTML = iconCheck() + `${done}/${card.checklist.length}`;
    badges.appendChild(b);
  }

  const sp = document.createElement('span');
  sp.className = 'spacer';
  badges.appendChild(sp);

  if (card.members.length) {
    const m = document.createElement('span');
    m.className = 'card-front-members';
    card.members.forEach(name => m.appendChild(avatarEl(name)));
    badges.appendChild(m);
  }

  // Advance-to-next-step button — always visible, lives at the end of the
  // bottom row (hidden only on the last list, where there's nowhere to go).
  const idx = board.lists.indexOf(list);
  const hasNext = idx > -1 && idx < board.lists.length - 1;
  if (hasNext) {
    const nextBtn = document.createElement('button');
    nextBtn.className = 'card-next';
    nextBtn.innerHTML = iconArrowRight();
    nextBtn.title = `Move to “${board.lists[idx + 1].title}”`;
    nextBtn.setAttribute('aria-label', nextBtn.title);
    nextBtn.addEventListener('click', (e) => { e.stopPropagation(); advanceCard(card.id); });
    nextBtn.addEventListener('pointerdown', (e) => e.stopPropagation()); // don't start a drag
    badges.appendChild(nextBtn);
  }

  const hasBadgeContent = card.due != null || card.watching || card.description || card.checklist.length;
  if (hasBadgeContent || card.members.length || hasNext) {
    li.appendChild(badges);
  }

  return li;
}

/* ----------------------- Advance to next step (animated) ----------------------- */
function advanceCard(cardId) {
  const found = findCard(cardId);
  if (!found) return;
  const { card, list } = found;
  const idx = board.lists.indexOf(list);
  const next = board.lists[idx + 1];
  if (!next) return;

  // FLIP "First": where the card is right now (viewport coords).
  const srcEl = boardEl.querySelector(`.card[data-card-id="${cardId}"]`);
  const first = srcEl ? srcEl.getBoundingClientRect() : null;

  // Move data → bottom of the next list, then re-render.
  list.cards = list.cards.filter(c => c.id !== cardId);
  next.cards.push(card);
  save();
  render();

  // Bring the destination into view (instant) so the landing spot is visible.
  const destCol = boardEl.querySelector(`.list[data-list-id="${next.id}"]`);
  const destUl = boardEl.querySelector(`.cards[data-list-id="${next.id}"]`);
  if (destCol) ensureColumnVisible(destCol);
  if (destUl) destUl.scrollTop = destUl.scrollHeight;

  flyCardTo(cardId, first);
}

// Instantly nudge the horizontal board scroll so a column is fully visible.
function ensureColumnVisible(colEl) {
  const cr = colEl.getBoundingClientRect();
  const br = boardEl.getBoundingClientRect();
  if (cr.right > br.right) boardEl.scrollLeft += (cr.right - br.right) + 12;
  else if (cr.left < br.left) boardEl.scrollLeft -= (br.left - cr.left) + 12;
}

// Animate the card from its old spot to its new spot with an inertial ease-out.
// Uses a fixed-position clone so it isn't clipped by the columns' scroll areas.
function flyCardTo(cardId, first) {
  const el = boardEl.querySelector(`.card[data-card-id="${cardId}"]`);
  if (!el || !first) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const last = el.getBoundingClientRect();
  const dx = last.left - first.left;
  const dy = last.top - first.top;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

  const clone = el.cloneNode(true);
  clone.classList.add('fly-clone');
  Object.assign(clone.style, {
    position: 'fixed',
    left: first.left + 'px',
    top: first.top + 'px',
    width: first.width + 'px',
    height: first.height + 'px',
    margin: '0',
    transform: 'translate(0, 0)',
    transition: 'none',
  });
  document.body.appendChild(clone);
  el.style.visibility = 'hidden';        // reserve the real slot; reveal on landing

  void clone.offsetWidth;                // force reflow so the start state sticks
  requestAnimationFrame(() => {
    // Inertial glide: fast start, long gentle deceleration (easeOutQuint-ish).
    clone.style.transition =
      'transform 640ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 320ms ease-out';
    clone.style.boxShadow = '0 18px 40px rgba(9, 30, 66, 0.35)';
    clone.style.transform = `translate(${dx}px, ${dy}px)`;
  });

  let done = false;
  const finish = () => {
    if (done) return; done = true;
    clone.remove();
    el.style.visibility = '';
  };
  clone.addEventListener('transitionend', (ev) => { if (ev.propertyName === 'transform') finish(); });
  setTimeout(finish, 850);               // safety net if transitionend is missed
}

/* ============================================================
   Drag & drop — pointer based (mouse + touch), forgiving targets
   ------------------------------------------------------------
   • Mouse: press and move past a small threshold to pick up a card.
   • Touch: long-press (~200ms) to pick up, so normal swipes still
     scroll the board; a quick tap opens the card.
   • Dropping anywhere over a list drops into that list — you don't
     need to be precise. A placeholder shows where it will land.
   • Auto-scrolls the board (horizontal) and the hovered list
     (vertical) when you drag near an edge, so you can cross columns
     on a small screen.
   ============================================================ */

const DRAG = {
  pending: null,   // { card, list, li, startX, startY, pointerId, pointerType, timer }
  active: null,    // { card, fromList, clone, placeholder, offsetX, offsetY, targetUl }
  pointer: { x: 0, y: 0 },
  raf: null,
};

// Suppress the iOS long-press callout/context menu while picking up a card.
document.addEventListener('contextmenu', (e) => {
  if (DRAG.active || DRAG.pending) e.preventDefault();
});

// Pointerdown just detects where a press starts. Movement is then driven by
// TOUCH events on touch devices and POINTER events on mouse. Touch is kept off
// the pointer path on purpose: the browser fires pointercancel the moment it
// scrolls, which would kill a drag — but touch events keep flowing, and a
// cancelable touchmove lets us stop the scroll instead.
function onCardPointerDown(e, card, list, li) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;               // left button only
  if (e.target.closest('button, input, a, select, textarea, label')) return; // interactive child
  if (DRAG.pending || DRAG.active) return;

  DRAG.pending = {
    card, list, li,
    startX: e.clientX, startY: e.clientY,
    pointerType: e.pointerType, timer: null,
  };
  DRAG.pointer = { x: e.clientX, y: e.clientY };

  if (e.pointerType === 'touch') {
    // Long-press to pick up, so a quick swipe still scrolls.
    DRAG.pending.timer = setTimeout(() => { if (DRAG.pending) beginDrag(); }, 180);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);
  } else {
    window.addEventListener('pointermove', onMouseMove);
    window.addEventListener('pointerup', onMouseUp);
    window.addEventListener('pointercancel', onMouseCancel);
  }
}

/* ---- Touch path ---- */
function onTouchMove(e) {
  const t = e.touches[0] || e.changedTouches[0];
  if (!t) return;
  DRAG.pointer = { x: t.clientX, y: t.clientY };

  if (!DRAG.active) {
    const pend = DRAG.pending;
    if (!pend) return;
    const dist = Math.hypot(t.clientX - pend.startX, t.clientY - pend.startY);
    // Finger moved before the long-press fired → it's a scroll; let it go.
    if (dist > 10 && pend.timer) { clearTimeout(pend.timer); teardownDrag(); }
    return;
  }
  e.preventDefault(); // keep the browser from scrolling while we drag
  moveClone(t.clientX, t.clientY);
  updateDropTarget(t.clientX, t.clientY);
  ensureAutoScroll();
}

function onTouchEnd(e) {
  if (DRAG.active) { endDrag(true); return; }
  const pend = DRAG.pending;
  if (pend) {
    const t = e.changedTouches[0];
    const dist = t ? Math.hypot(t.clientX - pend.startX, t.clientY - pend.startY) : 0;
    const cardId = pend.card.id;
    teardownDrag();
    if (dist < 10) openCard(cardId); // it was a tap
  }
}

/* ---- Mouse path ---- */
function onMouseMove(e) {
  DRAG.pointer = { x: e.clientX, y: e.clientY };
  if (!DRAG.active) {
    const pend = DRAG.pending;
    if (!pend) return;
    if (Math.hypot(e.clientX - pend.startX, e.clientY - pend.startY) > 6) beginDrag();
    return;
  }
  e.preventDefault();
  moveClone(e.clientX, e.clientY);
  updateDropTarget(e.clientX, e.clientY);
  ensureAutoScroll();
}

function onMouseUp(e) {
  if (DRAG.active) { endDrag(true); return; }
  const pend = DRAG.pending;
  if (pend) {
    const dist = Math.hypot(e.clientX - pend.startX, e.clientY - pend.startY);
    const cardId = pend.card.id;
    teardownDrag();
    if (dist < 8) openCard(cardId); // it was a click
  }
}

function onMouseCancel() {
  if (DRAG.active) endDrag(true);
  else teardownDrag();
}

// Remove all move/end listeners and clear a pending (not-yet-active) pickup.
function teardownDrag() {
  if (DRAG.pending && DRAG.pending.timer) clearTimeout(DRAG.pending.timer);
  DRAG.pending = null;
  window.removeEventListener('touchmove', onTouchMove);
  window.removeEventListener('touchend', onTouchEnd);
  window.removeEventListener('touchcancel', onTouchEnd);
  window.removeEventListener('pointermove', onMouseMove);
  window.removeEventListener('pointerup', onMouseUp);
  window.removeEventListener('pointercancel', onMouseCancel);
}

function beginDrag() {
  const pend = DRAG.pending;
  if (!pend) return;
  const li = pend.li;
  const rect = li.getBoundingClientRect();

  const clone = li.cloneNode(true);
  clone.classList.add('drag-clone');
  Object.assign(clone.style, {
    position: 'fixed',
    left: rect.left + 'px',
    top: rect.top + 'px',
    width: rect.width + 'px',
    margin: '0',
  });
  document.body.appendChild(clone);

  const placeholder = document.createElement('li');
  placeholder.className = 'card-placeholder';
  placeholder.style.height = rect.height + 'px';
  li.parentElement.insertBefore(placeholder, li);
  // Keep the original <li> CONNECTED (just hidden), not removed: touch events
  // target it, and a detached target stops bubbling to window — which would
  // break move/end handling on mobile. render() discards it on drop.
  li.style.display = 'none';

  DRAG.active = {
    card: pend.card,
    fromList: pend.list,
    li,
    clone,
    placeholder,
    offsetX: DRAG.pointer.x - rect.left,
    offsetY: DRAG.pointer.y - rect.top,
    targetUl: placeholder.parentElement,
  };
  DRAG.pending = null;

  document.body.classList.add('dragging-active');
  if (navigator.vibrate) { try { navigator.vibrate(12); } catch (_) {} } // haptic "pickup"
  moveClone(DRAG.pointer.x, DRAG.pointer.y);
}

function moveClone(x, y) {
  if (!DRAG.active) return;
  DRAG.active.clone.style.left = (x - DRAG.active.offsetX) + 'px';
  DRAG.active.clone.style.top = (y - DRAG.active.offsetY) + 'px';
}

// Which list column is the pointer over? Forgiving: use the horizontal band,
// and if between columns, pick the nearest one by center distance.
function listAtPoint(x) {
  const lists = $$('#board .list');
  let nearest = null, best = Infinity;
  for (const el of lists) {
    const r = el.getBoundingClientRect();
    if (x >= r.left && x <= r.right) return el;
    const d = Math.min(Math.abs(x - r.left), Math.abs(x - r.right));
    if (d < best) { best = d; nearest = el; }
  }
  return nearest;
}

function cardAfterPoint(ul, y) {
  // Visible cards only (the dragged card is display:none; placeholder isn't a .card).
  const cards = $$('.card', ul).filter(c => c.offsetParent !== null);
  let closest = { offset: -Infinity, el: null };
  for (const child of cards) {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) closest = { offset, el: child };
  }
  return closest.el;
}

function updateDropTarget(x, y) {
  if (!DRAG.active) return;
  const listEl = listAtPoint(x);
  if (!listEl) return;
  const ul = listEl.querySelector('.cards');
  if (!ul) return;
  DRAG.active.targetUl = ul;
  const after = cardAfterPoint(ul, y);
  if (after == null) ul.appendChild(DRAG.active.placeholder);
  else ul.insertBefore(DRAG.active.placeholder, after);
}

function ensureAutoScroll() {
  if (DRAG.raf == null) DRAG.raf = requestAnimationFrame(autoScrollTick);
}

function autoScrollTick() {
  DRAG.raf = null;
  if (!DRAG.active) return;
  const EDGE = 70, SPEED = 16;
  const { x, y } = DRAG.pointer;
  const br = boardEl.getBoundingClientRect();
  let moved = false;

  if (x < br.left + EDGE) { boardEl.scrollLeft -= SPEED; moved = true; }
  else if (x > br.right - EDGE) { boardEl.scrollLeft += SPEED; moved = true; }

  const ul = DRAG.active.targetUl;
  if (ul) {
    const lr = ul.getBoundingClientRect();
    if (y < lr.top + EDGE && ul.scrollTop > 0) { ul.scrollTop -= SPEED; moved = true; }
    else if (y > lr.bottom - EDGE && ul.scrollTop + lr.height < ul.scrollHeight) { ul.scrollTop += SPEED; moved = true; }
  }

  if (moved) {
    moveClone(x, y);
    updateDropTarget(x, y);
    DRAG.raf = requestAnimationFrame(autoScrollTick); // keep scrolling while in the edge zone
  }
}

function endDrag(commit) {
  const a = DRAG.active;
  if (!a) return;
  if (DRAG.raf != null) { cancelAnimationFrame(DRAG.raf); DRAG.raf = null; }

  if (commit && a.placeholder.parentElement) {
    const ul = a.placeholder.parentElement;
    const toList = findList(ul.dataset.listId);
    if (toList) {
      // Insertion index = number of real cards before the placeholder.
      let index = 0;
      for (const node of ul.children) {
        if (node === a.placeholder) break;
        if (node.classList.contains('card')) index++;
      }
      a.fromList.cards = a.fromList.cards.filter(c => c.id !== a.card.id);
      const insertAt = Math.max(0, Math.min(index, toList.cards.length));
      toList.cards.splice(insertAt, 0, a.card);
      save();
    }
  }

  a.clone.remove();
  if (a.placeholder.parentElement) a.placeholder.remove();
  document.body.classList.remove('dragging-active');
  DRAG.active = null;
  teardownDrag();
  render();
}

/* ----------------------- Composers ----------------------- */
function openCardComposer(list, ul, addBtn) {
  addBtn.style.display = 'none';
  const wrap = document.createElement('div');
  wrap.className = 'composer';
  wrap.innerHTML = `
    <textarea placeholder="Enter the calling (position)…" rows="2"></textarea>
    <div class="composer-actions">
      <button class="btn btn-primary add">Add card</button>
      <button class="btn btn-ghost cancel">Cancel</button>
    </div>`;
  ul.parentElement.insertBefore(wrap, addBtn);
  const ta = $('textarea', wrap);
  ta.focus();
  const close = () => { wrap.remove(); addBtn.style.display = ''; };
  const commit = () => {
    const val = ta.value.trim();
    if (val) {
      list.cards.push({ id: uid(), position: val, name: '', due: null,
        watching: false, description: '', labels: [], members: [], checklist: [] });
      save(); render();
    } else close();
  };
  $('.add', wrap).addEventListener('click', commit);
  $('.cancel', wrap).addEventListener('click', close);
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
    if (e.key === 'Escape') close();
  });
}

function openListComposer(wrap, addBtn) {
  addBtn.style.display = 'none';
  const box = document.createElement('div');
  box.className = 'composer';
  box.style.background = 'var(--list-bg)';
  box.style.borderRadius = '12px';
  box.style.padding = '8px';
  box.innerHTML = `
    <input type="text" placeholder="Enter list title…" />
    <div class="composer-actions">
      <button class="btn btn-primary add">Add list</button>
      <button class="btn btn-ghost cancel">Cancel</button>
    </div>`;
  wrap.insertBefore(box, addBtn);
  const input = $('input', box);
  input.focus();
  const close = () => { box.remove(); addBtn.style.display = ''; };
  const commit = () => {
    const val = input.value.trim();
    if (val) { board.lists.push({ id: uid(), title: val, cards: [] }); save(); render(); }
    else close();
  };
  $('.add', box).addEventListener('click', commit);
  $('.cancel', box).addEventListener('click', close);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') close();
  });
}

/* ----------------------- Card detail modal ----------------------- */
const overlay = $('#overlay');
const modal = $('#modal');
let activeCardId = null;

function openCard(cardId) {
  const found = findCard(cardId);
  if (!found) return;
  activeCardId = cardId;
  const { card, list } = found;

  modal.innerHTML = '';

  // Headline: the proposed person's name.
  const title = document.createElement('h2');
  title.contentEditable = 'true';
  title.dataset.placeholder = 'Add a name…';
  title.textContent = card.name;
  title.addEventListener('blur', () => { card.name = title.textContent.trim(); save(); render(); });
  modal.appendChild(title);

  const sub = document.createElement('div');
  sub.className = 'sub';
  sub.textContent = `${card.position || 'No position set'} · in “${list.title}”`;
  modal.appendChild(sub);

  // Position / calling
  const posSec = section('Position / Calling');
  const posRow = document.createElement('div');
  posRow.className = 'chip-input';
  const posInput = document.createElement('input');
  posInput.type = 'text';
  posInput.placeholder = 'e.g. Nursery Teacher';
  posInput.value = card.position;
  posInput.addEventListener('change', () => {
    card.position = posInput.value.trim() || 'Untitled';
    save(); render();
    sub.textContent = `${card.position} · in “${list.title}”`;
  });
  posRow.appendChild(posInput);
  posSec.appendChild(posRow);
  modal.appendChild(posSec);

  // Move to list
  const moveSec = section('List');
  const select = document.createElement('select');
  select.style.cssText = 'padding:7px 10px;border-radius:6px;border:1px solid var(--border);font-family:inherit;font-size:14px;';
  board.lists.forEach(l => {
    const opt = document.createElement('option');
    opt.value = l.id; opt.textContent = l.title;
    if (l.id === list.id) opt.selected = true;
    select.appendChild(opt);
  });
  select.addEventListener('change', () => {
    const target = findList(select.value);
    if (!target || target.id === list.id) return;
    list.cards = list.cards.filter(c => c.id !== card.id);
    target.cards.push(card);
    save(); render(); openCard(card.id);
  });
  moveSec.appendChild(select);
  modal.appendChild(moveSec);

  // Description
  const descSec = section('Description');
  const desc = document.createElement('textarea');
  desc.className = 'desc';
  desc.placeholder = 'Add notes about this calling…';
  desc.value = card.description;
  desc.addEventListener('change', () => { card.description = desc.value.trim(); save(); render(); });
  descSec.appendChild(desc);
  modal.appendChild(descSec);

  // Labels
  const labSec = section('Labels');
  const picker = document.createElement('div');
  picker.className = 'label-picker';
  LABEL_COLORS.forEach(color => {
    const s = document.createElement('div');
    s.className = 'label-swatch' + (card.labels.includes(color) ? ' active' : '');
    s.style.background = color;
    s.addEventListener('click', () => {
      if (card.labels.includes(color)) card.labels = card.labels.filter(c => c !== color);
      else card.labels.push(color);
      s.classList.toggle('active');
      save(); render();
    });
    picker.appendChild(s);
  });
  labSec.appendChild(picker);
  modal.appendChild(labSec);

  // Members
  const memSec = section('Members');
  const memPick = document.createElement('div');
  memPick.className = 'member-picker';
  board.members.forEach(name => {
    const t = document.createElement('div');
    t.className = 'member-toggle' + (card.members.includes(name) ? ' active' : '');
    t.appendChild(avatarEl(name));
    const span = document.createElement('span');
    span.textContent = name;
    t.appendChild(span);
    t.addEventListener('click', () => {
      if (card.members.includes(name)) card.members = card.members.filter(m => m !== name);
      else card.members.push(name);
      t.classList.toggle('active');
      save(); render();
    });
    memPick.appendChild(t);
  });
  memSec.appendChild(memPick);
  modal.appendChild(memSec);

  // Days-in-stage badge
  const dueSec = section('Days in stage (badge)');
  const dueInput = document.createElement('input');
  dueInput.type = 'number'; dueInput.min = '0';
  dueInput.style.cssText = 'width:100px;padding:7px 10px;border-radius:6px;border:1px solid var(--border);font-family:inherit;font-size:14px;';
  dueInput.value = card.due ?? '';
  dueInput.placeholder = '—';
  dueInput.addEventListener('change', () => {
    const v = dueInput.value.trim();
    card.due = v === '' ? null : Math.max(0, parseInt(v, 10) || 0);
    save(); render();
  });
  dueSec.appendChild(dueInput);
  const watchLbl = document.createElement('label');
  watchLbl.style.cssText = 'display:inline-flex;align-items:center;gap:6px;margin-left:16px;font-size:14px;';
  const watchCb = document.createElement('input');
  watchCb.type = 'checkbox'; watchCb.checked = card.watching;
  watchCb.addEventListener('change', () => { card.watching = watchCb.checked; save(); render(); });
  watchLbl.appendChild(watchCb);
  watchLbl.appendChild(document.createTextNode('Watching'));
  dueSec.appendChild(watchLbl);
  modal.appendChild(dueSec);

  // Checklist
  const clSec = section('Checklist');
  const done = card.checklist.filter(i => i.done).length;
  const prog = document.createElement('div');
  prog.className = 'progress';
  const bar = document.createElement('div');
  bar.style.width = (card.checklist.length ? (done / card.checklist.length * 100) : 0) + '%';
  prog.appendChild(bar);
  clSec.appendChild(prog);

  const list_ul = document.createElement('ul');
  list_ul.className = 'checklist-items';
  card.checklist.forEach((item, i) => list_ul.appendChild(renderCheckRow(card, item, i)));
  clSec.appendChild(list_ul);

  const clAdd = document.createElement('div');
  clAdd.className = 'chip-input';
  const clInput = document.createElement('input');
  clInput.type = 'text';
  clInput.placeholder = 'Add an item…';
  const addChkBtn = document.createElement('button');
  addChkBtn.className = 'btn btn-primary';
  addChkBtn.textContent = 'Add';
  const addChk = () => {
    const v = clInput.value.trim();
    if (!v) return;
    card.checklist.push({ text: v, done: false });
    clInput.value = '';
    save(); render(); openCard(card.id);
  };
  addChkBtn.addEventListener('click', addChk);
  clInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addChk(); });
  clAdd.appendChild(clInput);
  clAdd.appendChild(addChkBtn);
  clSec.appendChild(clAdd);
  modal.appendChild(clSec);

  // Footer
  const footer = document.createElement('div');
  footer.className = 'modal-footer';
  const del = document.createElement('button');
  del.className = 'btn btn-danger';
  del.textContent = 'Delete card';
  del.addEventListener('click', () => {
    if (confirm(`Delete card "${card.name || card.position}"?`)) {
      list.cards = list.cards.filter(c => c.id !== card.id);
      save(); render(); closeModal();
    }
  });
  const close = document.createElement('button');
  close.className = 'btn btn-ghost';
  close.textContent = 'Close';
  close.addEventListener('click', closeModal);
  footer.appendChild(del);
  footer.appendChild(close);
  modal.appendChild(footer);

  overlay.hidden = false;
}

function renderCheckRow(card, item, i) {
  const li = document.createElement('li');
  li.className = 'checklist-row' + (item.done ? ' done' : '');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = item.done;
  cb.addEventListener('change', () => { item.done = cb.checked; li.classList.toggle('done', cb.checked); save(); render(); openCard(card.id); });
  const txt = document.createElement('span');
  txt.className = 'txt';
  txt.textContent = item.text;
  const rm = document.createElement('button');
  rm.className = 'rm';
  rm.textContent = '✕';
  rm.addEventListener('click', () => { card.checklist.splice(i, 1); save(); render(); openCard(card.id); });
  li.appendChild(cb); li.appendChild(txt); li.appendChild(rm);
  return li;
}

function section(titleText) {
  const s = document.createElement('div');
  s.className = 'section';
  const h = document.createElement('h3');
  h.textContent = titleText;
  s.appendChild(h);
  return s;
}

function closeModal() { overlay.hidden = true; activeCardId = null; }
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.hidden) closeModal(); });

/* ----------------------- Board title edit ----------------------- */
$('#board-title').addEventListener('click', function () {
  const cur = board.title;
  const next = prompt('Board title:', cur);
  if (next != null) { board.title = next.trim() || cur; save(); render(); }
});

/* ----------------------- Reset ----------------------- */
$('#reset-btn').addEventListener('click', () => {
  const shared = remote.connected;
  const msg = shared
    ? 'Reset the SHARED board to the sample data for everyone? This cannot be undone.'
    : 'Reset the board to the sample data? This clears your changes.';
  if (confirm(msg)) {
    board = seed();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(toStorage(board))); } catch (_) {}
    render();
    scheduleRemotePush(true);
  }
});

/* ----------------------- Version switcher ----------------------- */
const versionMenu = $('#version-menu');
$('#version-btn').addEventListener('click', async (e) => {
  e.stopPropagation();
  const btn = e.currentTarget; // capture before await (currentTarget clears afterward)
  if (!versionMenu.hidden) { versionMenu.hidden = true; return; }
  await buildVersionMenu();
  const rect = btn.getBoundingClientRect();
  versionMenu.style.top = (rect.bottom + 6) + 'px';
  versionMenu.style.right = '14px';
  versionMenu.hidden = false;
});
document.addEventListener('click', () => { versionMenu.hidden = true; });
versionMenu.addEventListener('click', (e) => e.stopPropagation());

async function buildVersionMenu() {
  versionMenu.innerHTML = '<h4>Versions</h4>';
  let data;
  try {
    const res = await fetch(LOC.prefix + 'versions.json', { cache: 'no-store' });
    data = await res.json();
  } catch (_) {
    data = { latest: 'v2', versions: [{ id: 'v2', label: 'Version 2' }] };
  }

  // "Latest" — the root URL, which always serves the newest version.
  const latestA = document.createElement('a');
  latestA.href = LOC.prefix;
  latestA.innerHTML = `<span class="${LOC.atRoot ? 'current' : ''}">Latest</span>`;
  const lt = document.createElement('span');
  lt.className = 'tag';
  lt.textContent = LOC.atRoot ? 'current' : 'always newest';
  latestA.appendChild(lt);
  versionMenu.appendChild(latestA);

  (data.versions || []).forEach(v => {
    const a = document.createElement('a');
    a.href = LOC.prefix + v.id + '/';
    const isCur = !LOC.atRoot && v.id === LOC.id;
    a.innerHTML = `<span class="${isCur ? 'current' : ''}">${v.label || v.id}</span>`;
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = (v.id === data.latest ? 'latest' : '') + (isCur ? ' • current' : '');
    a.appendChild(tag);
    versionMenu.appendChild(a);
  });

  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = '“Latest” (/) always loads the newest. /v1, /v2 … are frozen snapshots.';
  versionMenu.appendChild(hint);
}

/* ----------------------- SVG icons ----------------------- */
function iconClock() { return '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 10V7h-2v7h6v-2h-4z"/></svg>'; }
function iconEye() { return '<svg viewBox="0 0 24 24"><path d="M12 5c-7 0-10 7-10 7s3 7 10 7 10-7 10-7-3-7-10-7zm0 11a4 4 0 110-8 4 4 0 010 8zm0-6a2 2 0 100 4 2 2 0 000-4z"/></svg>'; }
function iconDesc() { return '<svg viewBox="0 0 24 24"><path d="M4 5h16v2H4V5zm0 4h16v2H4V9zm0 4h10v2H4v-2zm0 4h16v2H4v-2z"/></svg>'; }
function iconCheck() { return '<svg viewBox="0 0 24 24"><path d="M9 16.2l-3.5-3.5L4 14.2l5 5 11-11-1.5-1.4z"/></svg>'; }
function iconArrowRight() { return '<svg viewBox="0 0 24 24"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg>'; }

/* ============================================================
   Shared backend — Firebase Firestore realtime sync
   ============================================================ */

const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/10.12.2';

const remote = {
  connected: false,
  docRef: null,
  fns: null,          // { doc, setDoc, onSnapshot, serverTimestamp }
  boardId: null,
  initialized: false, // has the shared doc been created at least once
  applying: false,    // currently applying a remote snapshot (suppress echo push)
};

let pushTimer = null;
let pushPending = false;

/* Debounced write to the shared board. `force` also (re)creates the doc. */
function scheduleRemotePush(force = false) {
  if (!remote.connected) return;
  pushPending = true;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => pushNow(force), 350);
}

async function pushNow() {
  if (!remote.connected || !pushPending) return;
  pushPending = false;
  setStatus('saving');
  try {
    await remote.fns.setDoc(remote.docRef, {
      board: toStorage(board),
      updatedAt: remote.fns.serverTimestamp(),
      updatedBy: APP_VERSION,
    });
    remote.initialized = true;
    setStatus('synced');
  } catch (e) {
    console.warn('Remote push failed:', e);
    setStatus('error');
  }
}

/* Read the secret board id from the URL (#b=...), or make/remember one. */
function resolveBoardId(fixed) {
  if (fixed) return fixed;
  const params = new URLSearchParams(location.hash.slice(1));
  let id = params.get('b') || localStorage.getItem(BOARD_ID_KEY);
  if (!id) id = 'brd_' + randomToken(20);
  localStorage.setItem(BOARD_ID_KEY, id);
  // Reflect it in the URL so the link is shareable.
  params.set('b', id);
  history.replaceState(null, '', location.pathname + '#' + params.toString());
  return id;
}

function randomToken(bytes) {
  const arr = new Uint8Array(bytes);
  (crypto || window.crypto).getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

async function connectFirebase() {
  let cfg, fixedId;
  try {
    const mod = await import('./firebase-config.js');
    cfg = mod.firebaseConfig;
    fixedId = mod.FIXED_BOARD_ID || '';
  } catch (e) {
    console.warn('No firebase-config.js found.', e);
  }

  const configured = cfg && cfg.apiKey && !String(cfg.apiKey).startsWith('YOUR_');
  if (!configured) {
    setStatus('local');
    showSetupBanner();
    return; // stay in local-only mode
  }

  setStatus('connecting');
  try {
    const [{ initializeApp }, fs] = await Promise.all([
      import(`${FIREBASE_SDK}/firebase-app.js`),
      import(`${FIREBASE_SDK}/firebase-firestore.js`),
    ]);
    const app = initializeApp(cfg);
    const db = fs.getFirestore(app);
    remote.fns = {
      doc: fs.doc, setDoc: fs.setDoc, onSnapshot: fs.onSnapshot,
      serverTimestamp: fs.serverTimestamp,
    };
    remote.boardId = resolveBoardId(fixedId);
    remote.docRef = fs.doc(db, 'boards', remote.boardId);
    remote.connected = true;
    updateShareUI();

    // Subscribe to realtime updates.
    fs.onSnapshot(remote.docRef,
      (snap) => onRemoteSnapshot(snap),
      (err) => { console.warn('Snapshot error:', err); setStatus('error'); }
    );
  } catch (e) {
    console.error('Failed to connect to Firebase:', e);
    remote.connected = false;
    setStatus('error');
    showSetupBanner('Couldn’t reach Firebase. Check your config and Firestore rules. Working locally for now.');
  }
}

function onRemoteSnapshot(snap) {
  // First time this board is opened: create it from our current (local) board.
  if (!snap.exists()) {
    remote.initialized = false;
    setStatus('synced');
    scheduleRemotePush(true); // seed the shared doc with local/migrated data
    return;
  }
  remote.initialized = true;

  // Skip our own optimistic writes echoing back.
  if (snap.metadata && snap.metadata.hasPendingWrites) { setStatus('synced'); return; }

  const data = snap.data();
  if (!data || !data.board || !Array.isArray(data.board.lists)) { setStatus('synced'); return; }

  // Normalize the incoming shape first, then compare against our current board.
  // (Compare normalized forms so legacy compat fields don't cause false diffs.)
  const incoming = normalize(data.board);
  if (JSON.stringify(incoming) === JSON.stringify(board)) { setStatus('synced'); return; }

  board = incoming;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(toStorage(board))); } catch (_) {}
  remote.applying = true;
  render();
  // Keep an open card modal in sync if its card still exists.
  if (!overlay.hidden && activeCardId && findCard(activeCardId)) openCard(activeCardId);
  else if (!overlay.hidden) closeModal();
  remote.applying = false;
  setStatus('synced');
}

/* ----------------------- Status + Share UI ----------------------- */
function setStatus(state) {
  const el = $('#sync-status');
  if (!el) return;
  const map = {
    local:      ['●', 'Local only', '#8590a2'],
    connecting: ['●', 'Connecting…', '#f5cd47'],
    saving:     ['●', 'Saving…',     '#f5cd47'],
    synced:     ['●', 'Synced',      '#4bce97'],
    error:      ['●', 'Sync error',  '#f87168'],
  };
  const [dot, label, color] = map[state] || map.local;
  el.innerHTML = `<span style="color:${color}">${dot}</span> ${label}`;
  el.dataset.state = state;
}

function updateShareUI() {
  const btn = $('#share-btn');
  if (btn) btn.hidden = !remote.connected;
}

$('#share-btn').addEventListener('click', async () => {
  const url = location.href;
  try {
    await navigator.clipboard.writeText(url);
    flashShare('Link copied!');
  } catch (_) {
    prompt('Copy this shared board link:', url);
  }
});

function flashShare(text) {
  const btn = $('#share-btn');
  if (!btn) return;
  const original = btn.textContent;
  btn.textContent = text;
  setTimeout(() => { btn.textContent = original; }, 1600);
}

/* ----------------------- Setup banner ----------------------- */
function showSetupBanner(customMsg) {
  if ($('#setup-banner')) return;
  const bar = document.createElement('div');
  bar.id = 'setup-banner';
  bar.className = 'banner';
  bar.innerHTML = `
    <span>${customMsg || 'Shared sync isn’t set up yet — changes are saved on this device only.'}
      Add your Firebase config in <code>firebase-config.js</code>.</span>
    <a href="${LOC.prefix}README.md" target="_blank" rel="noopener">Setup guide</a>
    <button class="banner-x" aria-label="Dismiss">✕</button>`;
  bar.querySelector('.banner-x').addEventListener('click', () => bar.remove());
  document.body.insertBefore(bar, document.body.firstChild.nextSibling);
}

/* React to the browser back/forward changing the board id. */
window.addEventListener('hashchange', () => {
  if (!remote.connected) return;
  const params = new URLSearchParams(location.hash.slice(1));
  const id = params.get('b');
  if (id && id !== remote.boardId) location.reload();
});

/* ----------------------- Boot ----------------------- */
document.title = 'Kalayaan Callings' + (LOC.atRoot ? '' : ' · ' + LOC.id);
const versionLabel = $('#version-label');
if (versionLabel) versionLabel.textContent = LOC.atRoot ? 'latest' : LOC.id;
render();
setStatus('connecting');
connectFirebase();
