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

// Distinct pastels (dark text is used on top — see .avatar in CSS).
const AVATAR_COLORS = ['#9ec5fe', '#ffc09f', '#c3a5f2', '#a0e7b0', '#f7a9c4', '#ffe08a', '#8fd9d0', '#f6a6a6'];
const LABEL_COLORS = ['#a0e7b0', '#ffe08a', '#ffc09f', '#f7a9c4', '#c3a5f2', '#9ec5fe', '#8fd9d0', '#c7cdd6'];

// Fixed, clearly-distinct pastel per roster member (avoids hash collisions
// like Eljon/John landing on similar greens).
const MEMBER_COLORS = {
  'Eljon Serrano': '#9ec5fe', // blue
  'John Sombrero': '#ffc09f', // peach
  'Ace Magno':     '#c3a5f2', // purple
  'Arvin Navarra': '#a0e7b0', // green
  'Stake':         '#f7a9c4', // pink
};

function colorFor(name) {
  if (MEMBER_COLORS[name]) return MEMBER_COLORS[name];
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

/* The fixed roster of people who can be assigned to cards. */
const ROSTER = ['Eljon Serrano', 'John Sombrero', 'Ace Magno', 'Arvin Navarra', 'Stake'];
// Bump to run the one-time "clear all assignees" migration in normalize().
const SCHEMA = 11;

/* The list whose cards get an interview date + date-sorting. */
const INTERVIEW_LIST = 'For Interview';

/* ----------------------- Dates ----------------------- */
function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
// Next Sunday, or today if today is Sunday (local time), as YYYY-MM-DD.
function upcomingSundayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const add = (7 - d.getDay()) % 7; // getDay(): 0 = Sunday
  d.setDate(d.getDate() + add);
  return toISODate(d);
}
// The date to show/sort by: the card's chosen date, else the upcoming Sunday.
function effectiveInterviewDate(card) {
  return card.interviewDate || upcomingSundayISO();
}
// Interviews start at 11:00 and run in 20-minute slots.
const DEFAULT_TIME = '11:00';
const SLOT_MIN = 20;
function effectiveInterviewTime(card) {
  return card.interviewTime || DEFAULT_TIME;
}
const timeToMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const minToTime = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;


// Build a conflict-free schedule for the "For Interview" cards. Each person
// (assignee) can only run one interview at a time, so cards are grouped by
// assignee + date and given 20-minute slots from 11:00. A manually-picked time
// is kept and reserves its slot; cards without one fill the next free slot.
// Returns a Map of cardId -> "HH:MM".
function computeInterviewSchedule(cards) {
  const result = new Map();
  const groups = new Map(); // "assignee|date" -> [cards] (in list order)
  for (const c of cards) {
    const key = (c.assignee || '') + '|' + effectiveInterviewDate(c);
    (groups.get(key) || groups.set(key, []).get(key)).push(c);
  }
  for (const gcards of groups.values()) {
    const taken = new Set();
    for (const c of gcards) if (c.interviewTime) taken.add(timeToMin(c.interviewTime));
    let next = timeToMin(DEFAULT_TIME);
    for (const c of gcards) {
      if (c.interviewTime) { result.set(c.id, c.interviewTime); continue; }
      while (taken.has(next)) next += SLOT_MIN;
      taken.add(next);
      result.set(c.id, minToTime(next));
      next += SLOT_MIN;
    }
  }
  return result;
}

/* ----------------------- Seed data ----------------------- */
function seed() {
  const mk = (position, opts = {}) => ({
    id: uid(),
    position,               // the calling / position (subtitle)
    name: opts.name || '',  // the proposed person (card headline)
    assignee: '',           // one bishopric member, or '' (placeholder)
    description: opts.description || '',
    labels: opts.labels || [],
  });
  return {
    title: 'Kalayaan Callings',
    members: ROSTER.slice(),
    schema: SCHEMA,
    lists: [
      { id: uid(), title: 'Proposal/Pending', cards: [
        mk('YSA Leader', {}),
        mk('YW Teacher', {}),
        mk('Young Men Advisor', {}),
        mk('Teachers\' Quorum Secretary', {}),
      ]},
      { id: uid(), title: 'For Discussion', cards: [
        mk('Nursery Teacher', { name: 'Krizia Cureg Dela Rosa' }),
        mk('Assistant Clerk - Records', { name: 'Jerson Danao' }),
      ]},
      { id: uid(), title: 'Contacting', cards: [
        mk('Ward Mission Leader', { name: '', description: 'Coordinate with elders quorum.' }),
      ]},
      { id: uid(), title: 'For Interview', cards: [
        mk('Sunday School 2nd Counselor', { name: 'Kai Serrano', description: 'x' }),
        mk('Relief Society Teacher', { name: 'Elisa Ruiz' }),
        mk('Ward History Specialist', { name: 'Justine Matt' }),
        mk('Sunday School Teacher', { name: 'Regine Villaruel' }),
        mk('Gatherers of Light 2nd Counselor', { name: 'Czarina Trinidad' }),
        mk('Young Women Teacher', { name: 'Mean Magalang' }),
        mk('Sunday School Teacher - Married', { name: 'Rowena Cruz' }),
        mk('Elders Quorum Instructor', { name: 'Marc Villaluna' }),
        mk('Primary Music Leader', { name: 'Hannah Reyes' }),
        mk('Ward Organist', { name: 'Paolo Mendoza' }),
      ]},
      { id: uid(), title: 'For Sustaining', cards: [
        mk('Disability Specialist', { name: 'Kathleen Barboza' }),
        mk('Relief Society Teacher', { name: 'Jasmin Serrano' }),
      ]},
      { id: uid(), title: 'For Setting Apart', cards: [] },
      { id: uid(), title: 'For Releasing', cards: [] },
      { id: uid(), title: 'For Recording', cards: [
        mk('Priests\' Quorum 2nd Assistant', { name: 'Joven Cris Matt' }),
        mk('Teachers\' Quorum 2nd Counselor', { name: 'Jethro Moran' }),
      ]},
      { id: uid(), title: 'Done', cards: [
        mk('Young Men Adviser', { name: 'John Robin Ayo' }),
        mk('Teachers\' Quorum Secretary', { name: 'Leo Domingo' }),
        mk('Teachers\' Quorum 1st Counselor', { name: 'Neil Navarra' }),
        mk('YSA Leader', { name: 'Trisia Talosig' }),
        mk('Sunday School President', { name: 'Neil Navarra' }),
        mk('Welfare & Self-Reliance Leader', { name: 'Hela Panay' }),
        mk('RS Ministering Secretary', { name: 'Yolly Matuguinas' }),
        mk('Ward Clerk', { name: 'Rex Aquino' }),
        mk('Primary President', { name: 'Sheila Munoz' }),
        mk('Elders Quorum President', { name: 'Ariel Bautista' }),
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
  data.members = ROSTER.slice();                 // fixed 4-person roster
  const clearAssignees = data.schema !== SCHEMA;  // one-time migration on old data
  data.lists = data.lists.map(l => ({
    id: l.id || uid(),
    title: l.title || 'Untitled',
    cards: (l.cards || []).map(c => ({
      id: c.id || uid(),
      // Migrate old shape (title=calling, candidate=person) → position/name.
      position: c.position || c.title || 'Untitled',
      name: c.name || c.candidate || '',
      // Single assignee. Cleared once when migrating a pre-roster board.
      assignee: clearAssignees ? '' : (c.assignee || ''),
      description: c.description || '',
      labels: Array.isArray(c.labels) ? c.labels : [],
      interviewDate: c.interviewDate || '', // YYYY-MM-DD; used in "For Interview"
      interviewTime: c.interviewTime || '', // HH:MM (24h); used in "For Interview"
      // due / watching / checklist were removed — intentionally dropped here.
    })),
  }));
  data.schema = SCHEMA;
  return data;
}

// Serialize with LEGACY-compatible fields so older snapshots (/v1…/v10), which
// read `title`/`candidate` and `members[]`, can still render data written by
// this newer layout. New code prefers position/name/assignee.
function toStorage(b) {
  return {
    ...b,
    lists: b.lists.map(l => ({
      ...l,
      cards: l.cards.map(c => ({
        ...c,
        title: c.position,
        candidate: c.name,
        members: c.assignee ? [c.assignee] : [],
      })),
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

let suppressReorderAnim = false; // set before a render that shouldn't FLIP (drag/advance)

function render() {
  const prevRects = captureAutoSortRects(); // for the reorder animation

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

  flipAutoSort(prevRects);
}

// Capture card positions in auto-sorted lists before a re-render.
function captureAutoSortRects() {
  const m = new Map();
  $$('#board .list').forEach(listEl => {
    if (listEl.querySelector('.list-title')?.value !== INTERVIEW_LIST) return;
    $$('.card', listEl).forEach(c => m.set(c.dataset.cardId, c.getBoundingClientRect()));
  });
  return m;
}

// Animate cards in auto-sorted lists sliding from their old spot to the new one
// (FLIP) — e.g. when the "For Interview" list re-orders after a time change.
function flipAutoSort(prevRects) {
  if (suppressReorderAnim) { suppressReorderAnim = false; return; }
  if (!prevRects.size) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  $$('#board .list').forEach(listEl => {
    if (listEl.querySelector('.list-title')?.value !== INTERVIEW_LIST) return;
    $$('.card', listEl).forEach(c => {
      const before = prevRects.get(c.dataset.cardId);
      if (!before) return;
      const after = c.getBoundingClientRect();
      const dy = before.top - after.top;
      if (Math.abs(dy) < 1) return;
      c.style.transition = 'none';
      c.style.transform = `translateY(${dy}px)`;
      c.style.zIndex = '1';
      requestAnimationFrame(() => {
        c.style.transition = 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
        c.style.transform = '';
      });
      c.addEventListener('transitionend', function te() {
        c.style.transition = ''; c.style.transform = ''; c.style.zIndex = '';
        c.removeEventListener('transitionend', te);
      });
    });
  });
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

  // Cards. "For Interview" is auto-arranged by interview date (earliest first).
  const ul = document.createElement('ul');
  ul.className = 'cards';
  ul.dataset.listId = list.id;
  let schedule = null;
  if (list.title === INTERVIEW_LIST) {
    schedule = computeInterviewSchedule(list.cards);
    const key = c => effectiveInterviewDate(c) + 'T' + schedule.get(c.id);
    list.cards.sort((a, b) => {
      const ka = key(a), kb = key(b);
      return ka < kb ? -1 : ka > kb ? 1 : 0; // sort by date, then scheduled time
    });
  }
  list.cards.forEach(card =>
    ul.appendChild(renderCard(card, list, schedule ? schedule.get(card.id) : null)));

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

function renderCard(card, list, slotTime) {
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

  // Top row: name + position on the left, assignee icon on the right
  // (aligned with the card name).
  const top = document.createElement('div');
  top.className = 'card-top';

  const heading = document.createElement('div');
  heading.className = 'card-heading';

  const t = document.createElement('div');
  t.className = 'card-title' + (card.name ? '' : ' unassigned');
  t.textContent = card.name || 'Unassigned';
  heading.appendChild(t);

  const sub = document.createElement('div');
  sub.className = 'card-subtitle';
  sub.textContent = card.position;
  heading.appendChild(sub);

  top.appendChild(heading);

  // Interview date & time (only in the "For Interview" list): the v23 2-column
  // badge (calendar | clock). Tapping it opens a CUSTOM combined picker that
  // shows real 5-minute time increments (native datetime-local can't on iOS).
  if (list.title === INTERVIEW_LIST) {
    const dateISO = effectiveInterviewDate(card);
    const timeHM = slotTime || effectiveInterviewTime(card);
    const [Y, M, D] = dateISO.split('-').map(Number);
    const monthAbbr = new Date(Y, M - 1, D).toLocaleDateString(undefined, { month: 'short' }).toUpperCase();
    const [hh, mm] = timeHM.split(':');

    const dt = document.createElement('div');
    dt.className = 'dt-badge';
    dt.title = 'Interview date & time — tap to change';
    dt.innerHTML =
      `<span class="dt-cal"><span class="dt-head">${monthAbbr}</span><span class="dt-day">${D}</span></span>` +
      `<span class="dt-clock"><span class="dt-hh">${hh}</span><span class="dt-mm">${mm}</span></span>`;
    dt.addEventListener('click', (e) => { e.stopPropagation(); openWhenPicker(card, dateISO, timeHM); });
    dt.addEventListener('pointerdown', (e) => e.stopPropagation()); // don't start a card drag
    top.appendChild(dt);
  }

  // Assignee — avatar if assigned, else a placeholder profile icon.
  const assignBtn = document.createElement('button');
  assignBtn.className = 'card-assignee' + (card.assignee ? '' : ' unassigned');
  assignBtn.title = card.assignee ? `Assigned to ${card.assignee}` : 'Assign someone';
  assignBtn.setAttribute('aria-label', assignBtn.title);
  if (card.assignee) assignBtn.appendChild(avatarEl(card.assignee));
  else assignBtn.innerHTML = iconPerson();
  assignBtn.addEventListener('click', (e) => { e.stopPropagation(); openAssigneePicker(card.id, assignBtn); });
  assignBtn.addEventListener('pointerdown', (e) => e.stopPropagation()); // don't start a drag
  top.appendChild(assignBtn);

  li.appendChild(top);

  return li;
}

/* ----------------------- Assignee picker ----------------------- */
function closeAssigneePicker() {
  const p = $('#assignee-picker');
  if (p) p.remove();
  document.removeEventListener('click', onDocClickForPicker, true);
}
function onDocClickForPicker(e) {
  if (!e.target.closest('#assignee-picker')) closeAssigneePicker();
}
function openAssigneePicker(cardId, anchor) {
  closeAssigneePicker();
  const found = findCard(cardId);
  if (!found) return;
  const { card } = found;

  const pop = document.createElement('div');
  pop.id = 'assignee-picker';
  pop.className = 'assignee-picker';
  const h = document.createElement('div');
  h.className = 'assignee-picker-h';
  h.textContent = 'Assign to';
  pop.appendChild(h);

  board.members.forEach(name => {
    const opt = document.createElement('button');
    opt.className = 'assignee-opt' + (card.assignee === name ? ' active' : '');
    opt.appendChild(avatarEl(name));
    const span = document.createElement('span');
    span.textContent = name;
    opt.appendChild(span);
    opt.addEventListener('click', () => {
      card.assignee = (card.assignee === name) ? '' : name; // toggle
      save(); render(); closeAssigneePicker();
    });
    pop.appendChild(opt);
  });

  if (card.assignee) {
    const clear = document.createElement('button');
    clear.className = 'assignee-opt unassign';
    clear.textContent = 'Unassign';
    clear.addEventListener('click', () => { card.assignee = ''; save(); render(); closeAssigneePicker(); });
    pop.appendChild(clear);
  }

  document.body.appendChild(pop);
  // Position under the anchor, kept within the viewport.
  const r = anchor.getBoundingClientRect();
  const w = 210;
  let left = Math.min(r.right - w, window.innerWidth - w - 8);
  if (left < 8) left = 8;
  let top = r.bottom + 6;
  if (top + pop.offsetHeight > window.innerHeight - 8) top = Math.max(8, r.top - pop.offsetHeight - 6);
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';

  setTimeout(() => document.addEventListener('click', onDocClickForPicker, true), 0);
}

/* ----------------------- Interview date+time picker -----------------------
   A custom combined picker: a month calendar + a 5-minute time list, in one
   panel (bottom sheet on mobile). Changes are applied only when the picker is
   closed (Done / tap-away), so the board — and its reorder animation — updates
   once, after you're done picking. */
let whenState = null;

function pad2(n) { return String(n).padStart(2, '0'); }

// Geometry of the iOS-style time wheels.
const WHEEL_ITEM_H = 40;   // px row height
const WHEEL_VISIBLE = 5;   // odd — rows shown at once (center = selection)

// 24h "HH:MM" → 12-hour parts, minute snapped to the nearest 5.
function parse12(timeHM) {
  const [hh, mm] = timeHM.split(':').map(Number);
  const min = (Math.round(mm / 5) * 5) % 60;
  const ampm = hh >= 12 ? 'PM' : 'AM';
  let h = hh % 12; if (h === 0) h = 12;
  return { h, min, ampm };
}
// 12-hour parts → 24h "HH:MM".
function to24(h12, min, ampm) {
  let h = h12 % 12;
  if (ampm === 'PM') h += 12;
  return pad2(h) + ':' + pad2(min);
}

function openWhenPicker(card, dateISO, timeHM) {
  closeWhenPicker(false);
  const t = parse12(timeHM);
  whenState = {
    card,
    selDate: dateISO,
    selH: t.h, selMin: t.min, ampm: t.ampm,
    viewY: +dateISO.slice(0, 4),
    viewM: +dateISO.slice(5, 7) - 1,
    timeOpen: false,
    dirty: false,
    cleared: false,   // Reset pressed → revert to automatic scheduling
    panel: null,
  };
  const backdrop = document.createElement('div');
  backdrop.id = 'when-backdrop';
  // Tapping the dimmed area (or Escape) dismisses without committing.
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeWhenPicker(false); });
  const panel = document.createElement('div');
  panel.className = 'when-picker';
  panel.addEventListener('click', (e) => e.stopPropagation());
  whenState.panel = panel;
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);
  refreshWhenPanel();
}

// (Re)build the whole panel. Keeps the current month view + whether the time
// wheel is revealed; never commits — that only happens on the ✓ button.
function refreshWhenPanel() {
  const s = whenState;
  if (!s) return;
  const panel = s.panel;
  panel.innerHTML = '';
  panel.appendChild(buildWhenCalendar());
  panel.appendChild(buildWhenTime());
  panel.appendChild(buildWhenFooter());
  if (s.timeOpen) {
    requestAnimationFrame(() => panel.querySelectorAll('.wp-wheel').forEach(w => w._center && w._center()));
  }
}

// Month calendar grid: "August 2026" + ‹ › nav, weekday header, day buttons.
function buildWhenCalendar() {
  const s = whenState;
  const wrap = document.createElement('div');
  wrap.className = 'wp-cal';

  const head = document.createElement('div');
  head.className = 'wp-cal-head';
  const title = document.createElement('span');
  title.className = 'wp-cal-title';
  title.textContent = new Date(s.viewY, s.viewM, 1)
    .toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const nav = document.createElement('div');
  nav.className = 'wp-cal-nav';
  const prev = document.createElement('button');
  prev.className = 'wp-nav'; prev.setAttribute('aria-label', 'Previous month'); prev.textContent = '‹';
  prev.addEventListener('click', () => { if (--s.viewM < 0) { s.viewM = 11; s.viewY--; } refreshWhenPanel(); });
  const next = document.createElement('button');
  next.className = 'wp-nav'; next.setAttribute('aria-label', 'Next month'); next.textContent = '›';
  next.addEventListener('click', () => { if (++s.viewM > 11) { s.viewM = 0; s.viewY++; } refreshWhenPanel(); });
  nav.append(prev, next);
  head.append(title, nav);
  wrap.appendChild(head);

  const wd = document.createElement('div');
  wd.className = 'wp-cal-grid wp-cal-wd';
  ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].forEach(t => {
    const e = document.createElement('span'); e.textContent = t; wd.appendChild(e);
  });
  wrap.appendChild(wd);

  const grid = document.createElement('div');
  grid.className = 'wp-cal-grid';
  const firstDow = new Date(s.viewY, s.viewM, 1).getDay();
  const dim = new Date(s.viewY, s.viewM + 1, 0).getDate();
  for (let i = 0; i < firstDow; i++) grid.appendChild(document.createElement('span'));
  const todayISO = toISODate(new Date());
  for (let day = 1; day <= dim; day++) {
    const iso = `${s.viewY}-${pad2(s.viewM + 1)}-${pad2(day)}`;
    const b = document.createElement('button');
    b.className = 'wp-day' + (iso === s.selDate ? ' sel' : '') + (iso === todayISO ? ' today' : '');
    b.textContent = day;
    b.addEventListener('click', () => { s.selDate = iso; s.dirty = true; s.cleared = false; refreshWhenPanel(); });
    grid.appendChild(b);
  }
  wrap.appendChild(grid);
  return wrap;
}

// "Time" row: a pill showing the time; tapping it reveals the iOS-style wheel.
function buildWhenTime() {
  const s = whenState;
  const wrap = document.createElement('div');
  wrap.className = 'wp-time';

  const row = document.createElement('div');
  row.className = 'wp-time-row';
  const label = document.createElement('span');
  label.className = 'wp-time-label';
  label.textContent = 'Time';
  const pill = document.createElement('button');
  pill.className = 'wp-time-pill' + (s.timeOpen ? ' active' : '');
  pill.textContent = `${s.selH}:${pad2(s.selMin)} ${s.ampm}`;
  pill.addEventListener('click', () => { s.timeOpen = !s.timeOpen; refreshWhenPanel(); });
  row.append(label, pill);
  wrap.appendChild(row);

  if (s.timeOpen) {
    const wheels = document.createElement('div');
    wheels.className = 'wp-wheels';
    const band = document.createElement('div'); band.className = 'wp-band';
    wheels.appendChild(band);

    const hourItems = [];
    for (let h = 1; h <= 12; h++) hourItems.push({ value: h, label: String(h) });
    const hourWheel = buildWheel(hourItems, s.selH, 'wp-wheel-num',
      (v) => { s.selH = v; s.dirty = true; s.cleared = false; syncTimePill(); });

    const minItems = [];
    for (let m = 0; m < 60; m += 5) minItems.push({ value: m, label: pad2(m) }); // real 5-min steps
    const minWheel = buildWheel(minItems, s.selMin, 'wp-wheel-num',
      (v) => { s.selMin = v; s.dirty = true; s.cleared = false; syncTimePill(); });

    const apItems = [{ value: 'AM', label: 'AM' }, { value: 'PM', label: 'PM' }];
    const apWheel = buildWheel(apItems, s.ampm, 'wp-wheel-ap',
      (v) => { s.ampm = v; s.dirty = true; s.cleared = false; syncTimePill(); });

    wheels.append(hourWheel, minWheel, apWheel);
    wrap.appendChild(wheels);
  }
  return wrap;
}

// Update just the pill text while spinning the wheels (no full rebuild).
function syncTimePill() {
  const s = whenState; if (!s || !s.panel) return;
  const pill = s.panel.querySelector('.wp-time-pill');
  if (pill) pill.textContent = `${s.selH}:${pad2(s.selMin)} ${s.ampm}`;
}

// Footer: Reset (revert to automatic scheduling) + blue ✓ (confirm).
function buildWhenFooter() {
  const s = whenState;
  const foot = document.createElement('div');
  foot.className = 'wp-foot';

  const reset = document.createElement('button');
  reset.className = 'wp-reset'; reset.textContent = 'Reset';
  reset.addEventListener('click', () => {
    s.selDate = upcomingSundayISO();
    const t = parse12(DEFAULT_TIME);
    s.selH = t.h; s.selMin = t.min; s.ampm = t.ampm;
    s.viewY = +s.selDate.slice(0, 4);
    s.viewM = +s.selDate.slice(5, 7) - 1;
    s.dirty = true; s.cleared = true; s.timeOpen = false;
    refreshWhenPanel();
  });

  const done = document.createElement('button');
  done.className = 'wp-check'; done.setAttribute('aria-label', 'Done');
  done.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" d="M5 12.5l4.5 4.5L19 7"/></svg>';
  done.addEventListener('click', () => closeWhenPicker(true));

  foot.append(reset, done);
  return foot;
}

// Build one spinning time wheel. `items` = [{value, label}]; `onSelect(value)`
// fires when the wheel settles on a new row. Returns the scroll element (with a
// ._center() helper to snap it onto its selected row after mount).
function buildWheel(items, selValue, cls, onSelect) {
  const wheel = document.createElement('div');
  wheel.className = 'wp-wheel ' + cls;
  const inner = document.createElement('div');
  inner.className = 'wp-wheel-inner';
  const rows = items.map((it) => {
    const r = document.createElement('div');
    r.className = 'wp-wheel-item';
    r.textContent = it.label;
    inner.appendChild(r);
    return r;
  });
  wheel.appendChild(inner);

  const PAD = WHEEL_VISIBLE >> 1; // padding rows above/below (2)
  let selIndex = Math.max(0, items.findIndex(it => it.value === selValue));

  // Curve the rows toward a cylinder: rows away from center rotate back and fade.
  const curve = () => {
    const mid = wheel.scrollTop + wheel.clientHeight / 2;
    const first = Math.max(0, Math.floor(wheel.scrollTop / WHEEL_ITEM_H) - 1);
    const last = Math.min(rows.length - 1, first + WHEEL_VISIBLE + 2);
    for (let i = first; i <= last; i++) {
      const c = (PAD + i) * WHEEL_ITEM_H + WHEEL_ITEM_H / 2;
      const d = Math.max(-2.4, Math.min(2.4, (c - mid) / WHEEL_ITEM_H));
      rows[i].style.transform = `rotateX(${d * 20}deg) scale(${1 - Math.abs(d) * 0.05})`;
      rows[i].style.opacity = String(Math.max(0.12, 1 - Math.abs(d) * 0.32));
      rows[i].classList.toggle('is-sel', Math.abs(d) < 0.5);
    }
  };

  let rafPending = false, settleTimer = null;
  wheel.addEventListener('scroll', () => {
    if (!rafPending) { rafPending = true; requestAnimationFrame(() => { rafPending = false; curve(); }); }
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      const idx = Math.max(0, Math.min(items.length - 1, Math.round(wheel.scrollTop / WHEEL_ITEM_H)));
      if (idx !== selIndex) { selIndex = idx; onSelect(items[idx].value); }
      curve();
    }, 110);
  }, { passive: true });

  // Tap a row to spin it to the center.
  rows.forEach((r, i) => {
    r.addEventListener('click', () => wheel.scrollTo({ top: i * WHEEL_ITEM_H, behavior: 'smooth' }));
  });

  wheel._center = () => { wheel.scrollTop = selIndex * WHEEL_ITEM_H; curve(); };
  return wheel;
}

// Close the picker. Commit=true applies the selection (and triggers the board
// re-render + reorder animation) only now — not while picking. Reset commits an
// empty date/time so the card falls back to automatic scheduling.
function closeWhenPicker(commit) {
  const bd = document.getElementById('when-backdrop');
  if (bd) bd.remove();
  const s = whenState;
  whenState = null;
  if (commit && s && s.dirty) {
    if (s.cleared) {
      s.card.interviewDate = '';
      s.card.interviewTime = '';
    } else {
      s.card.interviewDate = s.selDate;
      s.card.interviewTime = to24(s.selH, s.selMin, s.ampm);
    }
    save();
    render();
  }
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && whenState) closeWhenPicker(false); });

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
  suppressReorderAnim = true; // the advance has its own fly animation
  render();

  // Bring the destination into view (instant) so the landing spot is visible.
  const destCol = boardEl.querySelector(`.list[data-list-id="${next.id}"]`);
  const destUl = boardEl.querySelector(`.cards[data-list-id="${next.id}"]`);
  if (destCol) ensureColumnVisible(destCol);
  if (destUl) destUl.scrollTop = destUl.scrollHeight;

  flyCardTo(cardId, first);
}

/* ----------------------- Tap vs. double-tap ----------------------- */
// Single tap opens the card; double tap advances it to the next stage
// (what the old → button did). We must briefly delay the open to see whether a
// second tap is coming — once the modal is open, a second tap can't reach the
// card. Works for touch (tap) and mouse (click) alike.
const DOUBLE_TAP_MS = 160;
let tapTimer = null;
let tapCardId = null;

function handleTap(cardId) {
  if (tapTimer !== null && tapCardId === cardId) {
    clearTimeout(tapTimer); tapTimer = null; tapCardId = null;
    advanceCard(cardId); // second tap on the same card → advance
    return;
  }
  if (tapTimer !== null) clearTimeout(tapTimer); // a pending open on another card
  tapCardId = cardId;
  tapTimer = setTimeout(() => {
    tapTimer = null; tapCardId = null;
    openCard(cardId);
  }, DOUBLE_TAP_MS);
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
    if (dist < 10) handleTap(cardId); // tap → open, double-tap → advance
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
    if (dist < 8) handleTap(cardId); // click → open, double-click → advance
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
  suppressReorderAnim = true; // dropping already animated the card into place
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
      list.cards.push({ id: uid(), position: val, name: '', assignee: '', description: '', labels: [] });
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
  modal.style.transform = '';       // reset any leftover swipe offset
  modal.style.transition = '';
  modal.scrollTop = 0;

  // Drag handle (mobile bottom-sheet). Hidden on desktop via CSS.
  const handle = document.createElement('div');
  handle.className = 'sheet-handle';
  handle.setAttribute('aria-hidden', 'true');
  modal.appendChild(handle);

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

  // Assignee (single select from the roster)
  const memSec = section('Assignee');
  const memPick = document.createElement('div');
  memPick.className = 'member-picker';
  board.members.forEach(name => {
    const t = document.createElement('div');
    t.className = 'member-toggle' + (card.assignee === name ? ' active' : '');
    t.appendChild(avatarEl(name));
    const span = document.createElement('span');
    span.textContent = name;
    t.appendChild(span);
    t.addEventListener('click', () => {
      card.assignee = (card.assignee === name) ? '' : name; // toggle
      save(); render(); openCard(card.id);
    });
    memPick.appendChild(t);
  });
  memSec.appendChild(memPick);
  modal.appendChild(memSec);

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

function section(titleText) {
  const s = document.createElement('div');
  s.className = 'section';
  const h = document.createElement('h3');
  h.textContent = titleText;
  s.appendChild(h);
  return s;
}

function closeModal() {
  overlay.hidden = true;
  activeCardId = null;
  modal.style.transform = '';
  modal.style.transition = '';
}
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.hidden) closeModal(); });

// Pull the bottom sheet down to dismiss (mobile). Activates only when the sheet
// is scrolled to the top and the finger moves DOWN — so normal content
// scrolling is unaffected. Past a threshold (or a quick flick) it closes.
// Attached once to the modal (a persistent element).
function enableSheetSwipe() {
  let startY = 0, dy = 0, startT = 0, tracking = false, dragging = false;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);

  modal.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || modal.scrollTop > 0) { tracking = false; return; }
    tracking = true; dragging = false; dy = 0;
    startY = e.touches[0].clientY; startT = now();
    modal.style.transition = 'none';
  }, { passive: true });

  modal.addEventListener('touchmove', (e) => {
    if (!tracking) return;
    const delta = e.touches[0].clientY - startY;
    if (!dragging) {
      if (delta <= 0 || modal.scrollTop > 0) { tracking = false; return; } // it's a scroll
      dragging = true;
    }
    dy = Math.max(0, delta);
    modal.style.transform = `translateY(${dy}px)`;
    if (e.cancelable) e.preventDefault(); // don't scroll the sheet while dragging it
  }, { passive: false });

  const end = () => {
    if (!tracking) return;
    tracking = false;
    if (!dragging) return;
    dragging = false;
    const dt = now() - startT;
    modal.style.transition = 'transform 0.2s ease';
    if (dy > 120 || (dy > 40 && dt < 250)) {
      modal.style.transform = 'translateY(100%)';
      setTimeout(closeModal, 190);
    } else {
      modal.style.transform = 'translateY(0)';
    }
  };
  modal.addEventListener('touchend', end);
  modal.addEventListener('touchcancel', end);
}
enableSheetSwipe();

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

/* ----------------------- Version badge ----------------------- */
// Static version number in the top bar. In a /vN snapshot it's that id; at the
// root it's the latest version (read from versions.json).
function setVersionBadge() {
  const el = $('#version-badge');
  if (!el) return;
  if (!LOC.atRoot) { el.textContent = LOC.id; return; }
  el.textContent = '…';
  fetch(LOC.prefix + 'versions.json', { cache: 'no-store' })
    .then(r => r.json())
    .then(d => { el.textContent = d.latest || 'latest'; })
    .catch(() => { el.textContent = 'latest'; });
}

/* ----------------------- SVG icons ----------------------- */
function iconPerson() { return '<svg viewBox="0 0 24 24"><path d="M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5z"/></svg>'; }

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

  // Did the shared board predate the current schema? If so, normalize() will
  // clear assignees; push the migrated board back so it persists for everyone.
  const needsMigrationPush = data.board.schema !== SCHEMA;

  // Normalize the incoming shape first, then compare against our current board.
  // (Compare normalized forms so legacy compat fields don't cause false diffs.)
  const incoming = normalize(data.board);
  if (JSON.stringify(incoming) === JSON.stringify(board)) {
    if (needsMigrationPush) scheduleRemotePush();
    setStatus('synced');
    return;
  }

  board = incoming;
  if (needsMigrationPush) scheduleRemotePush();
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
setVersionBadge();
// Persist the normalized/migrated board (roster + cleared assignees) to the
// local cache so the one-time migration doesn't re-run on every load.
try { localStorage.setItem(STORAGE_KEY, JSON.stringify(toStorage(board))); } catch (_) {}
render();
setStatus('connecting');
connectFirebase();
