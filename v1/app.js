/* ============================================================
   Kalayaan Callings — Trello-style board
   Version 1  (self-contained, no build step, no external calls)
   ------------------------------------------------------------
   Data is persisted in localStorage under a SHARED key so that
   switching between deployed versions (/v1, /v2, ...) keeps your
   board intact. See versions.json + the version switcher.
   ============================================================ */

'use strict';

const STORAGE_KEY = 'kalayaan-callings-board';
const APP_VERSION = 'v1';

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
  const mk = (title, opts = {}) => ({
    id: uid(),
    title,
    candidate: opts.candidate || '',
    candidateDone: !!opts.candidateDone,
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
        mk('Nursery Teacher', { candidate: 'Krizia Cureg Dela Rosa', due: 3, checklist: cl(2), members: ['Eljon Serrano'] }),
        mk('Assistant Clerk - Records', { candidate: 'Jerson Danao', due: 1, watching: true, checklist: cl(2), members: ['Eljon Serrano'] }),
      ]},
      { id: uid(), title: 'Contacting', cards: [
        mk('Ward Mission Leader', { candidate: '', due: 1, description: 'Coordinate with elders quorum.', checklist: cl(2), members: ['Eljon Serrano'] }),
      ]},
      { id: uid(), title: 'For Interview', cards: [
        mk('Sunday School 2nd Counselor', { candidate: 'Kai Serrano', description: 'x', checklist: cl(2), members: ['Jasmin Serrano'] }),
        mk('Relief Society Teacher', { candidate: 'Elisa Ruiz', checklist: cl(2), members: ['Jasmin Serrano'] }),
        mk('Ward History Specialist', { candidate: 'Justine Matt', checklist: cl(2), members: ['Jethro Moran'] }),
        mk('Sunday School Teacher', { candidate: 'Regine Villaruel', due: 1, checklist: cl(2), members: ['Jethro Moran'] }),
        mk('Gatherers of Light 2nd Counselor', { candidate: 'Czarina Trinidad', due: 1, watching: true, checklist: cl(2), members: ['Eljon Serrano'] }),
        mk('Young Women Teacher', { candidate: 'Mean Magalang', due: 2, checklist: cl(2), members: ['Eljon Serrano'] }),
        mk('Sunday School Teacher - Married', { candidate: 'Rowena Cruz', checklist: cl(2) }),
        mk('Elders Quorum Instructor', { candidate: 'Marc Villaluna', checklist: cl(1) }),
        mk('Primary Music Leader', { candidate: 'Hannah Reyes', checklist: cl(2) }),
        mk('Ward Organist', { candidate: 'Paolo Mendoza', checklist: cl(1) }),
      ]},
      { id: uid(), title: 'For Sustaining', cards: [
        mk('Disability Specialist', { candidate: 'Kathleen Barboza', due: 1, checklist: cl(2), members: ['Eljon Serrano'] }),
        mk('Relief Society Teacher', { candidate: 'Jasmin Serrano', checklist: cl(2), members: ['Jasmin Serrano'] }),
      ]},
      { id: uid(), title: 'For Setting Apart', cards: [] },
      { id: uid(), title: 'For Releasing', cards: [] },
      { id: uid(), title: 'For Recording', cards: [
        mk('Priests\' Quorum 2nd Assistant', { candidate: 'Joven Cris Matt', due: 3, checklist: cl(2), members: ['Jethro Moran'] }),
        mk('Teachers\' Quorum 2nd Counselor', { candidate: 'Jethro Moran', checklist: cl(2), members: ['Jethro Moran'] }),
      ]},
      { id: uid(), title: 'Done', cards: [
        mk('Young Men Adviser', { candidate: 'John Robin Ayo', due: 5, checklist: cl(3), candidateDone: true, members: ['Eljon Serrano'] }),
        mk('Teachers\' Quorum Secretary', { candidate: 'Leo Domingo', due: 5, checklist: cl(3), candidateDone: true, members: ['Eljon Serrano'] }),
        mk('Teachers\' Quorum 1st Counselor', { candidate: 'Neil Navarra', checklist: cl(2), candidateDone: true, members: ['Jasmin Serrano'] }),
        mk('YSA Leader', { candidate: 'Trisia Talosig', due: 2, checklist: cl(2), candidateDone: true, members: ['Eljon Serrano'] }),
        mk('Sunday School President', { candidate: 'Neil Navarra', due: 2, checklist: cl(2), candidateDone: true, members: ['Eljon Serrano'] }),
        mk('Welfare & Self-Reliance Leader', { candidate: 'Hela Panay', due: 2, checklist: cl(2), candidateDone: true, members: ['Eljon Serrano'] }),
        mk('RS Ministering Secretary', { candidate: 'Yolly Matuguinas', due: 2, checklist: cl(2), candidateDone: true, members: ['Eljon Serrano'] }),
        mk('Ward Clerk', { candidate: 'Rex Aquino', checklist: cl(3), candidateDone: true }),
        mk('Primary President', { candidate: 'Sheila Munoz', checklist: cl(3), candidateDone: true }),
        mk('Elders Quorum President', { candidate: 'Ariel Bautista', checklist: cl(3), candidateDone: true }),
      ]},
    ],
  };
}

/* ----------------------- State ----------------------- */
let board = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.lists)) return normalize(data);
    }
  } catch (e) { console.warn('Failed to load board, seeding.', e); }
  const s = seed();
  save(s);
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
      title: c.title || 'Untitled',
      candidate: c.candidate || '',
      candidateDone: !!c.candidateDone,
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

function save(b = board) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(b)); }
  catch (e) { console.warn('Failed to save board.', e); }
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

  // Drop handling
  ul.addEventListener('dragover', onDragOver);
  ul.addEventListener('drop', onDrop);
  ul.addEventListener('dragleave', () => el.classList.remove('drag-over'));

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
  li.draggable = true;

  li.addEventListener('dragstart', (e) => {
    dragState = { cardId: card.id, fromListId: list.id };
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', card.id); } catch (_) {}
  });
  li.addEventListener('dragend', () => {
    li.classList.remove('dragging');
    $$('.list').forEach(l => l.classList.remove('drag-over'));
    dragState = null;
  });
  li.addEventListener('click', (e) => {
    if (e.target.closest('.card-checkitem')) return; // handled separately
    openCard(card.id);
  });

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

  // Title
  const t = document.createElement('div');
  t.className = 'card-title';
  t.textContent = card.title;
  li.appendChild(t);

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
  if (card.due != null || card.watching || card.description || card.checklist.length || card.members.length) {
    li.appendChild(badges);
  }

  // Front candidate checkitem
  if (card.candidate) {
    const ci = document.createElement('label');
    ci.className = 'card-checkitem' + (card.candidateDone ? ' done' : '');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = card.candidateDone;
    cb.addEventListener('click', (e) => e.stopPropagation());
    cb.addEventListener('change', () => {
      card.candidateDone = cb.checked;
      ci.classList.toggle('done', cb.checked);
      save();
    });
    const span = document.createElement('span');
    span.textContent = card.candidate;
    ci.appendChild(cb);
    ci.appendChild(span);
    li.appendChild(ci);
  }

  return li;
}

/* ----------------------- Drag & drop ----------------------- */
let dragState = null;

function onDragOver(e) {
  if (!dragState) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const ul = e.currentTarget;
  ul.closest('.list').classList.add('drag-over');
  const after = getDragAfterElement(ul, e.clientY);
  const dragging = $('.card.dragging');
  if (!dragging) return;
  if (after == null) ul.appendChild(dragging);
  else ul.insertBefore(dragging, after);
}

function getDragAfterElement(ul, y) {
  const els = $$('.card:not(.dragging)', ul);
  let closest = { offset: -Infinity, el: null };
  for (const child of els) {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) closest = { offset, el: child };
  }
  return closest.el;
}

function onDrop(e) {
  if (!dragState) return;
  e.preventDefault();
  const ul = e.currentTarget;
  const toListId = ul.dataset.listId;
  const { card } = findCard(dragState.cardId);
  const fromList = findList(dragState.fromListId);
  const toList = findList(toListId);
  if (!card || !fromList || !toList) return;

  // New index based on current DOM order
  const orderedIds = $$('.card', ul).map(el => el.dataset.cardId);
  fromList.cards = fromList.cards.filter(c => c.id !== card.id);
  const idx = orderedIds.indexOf(card.id);
  if (idx === -1) toList.cards.push(card);
  else toList.cards.splice(idx, 0, card);

  save();
  render();
}

/* ----------------------- Composers ----------------------- */
function openCardComposer(list, ul, addBtn) {
  addBtn.style.display = 'none';
  const wrap = document.createElement('div');
  wrap.className = 'composer';
  wrap.innerHTML = `
    <textarea placeholder="Enter a title for this card…" rows="2"></textarea>
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
      list.cards.push({ id: uid(), title: val, candidate: '', candidateDone: false, due: null,
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

  // Title
  const h2 = document.createElement('input');
  h2.className = '';
  const title = document.createElement('h2');
  title.contentEditable = 'true';
  title.textContent = card.title;
  title.addEventListener('blur', () => { card.title = title.textContent.trim() || 'Untitled'; save(); });
  modal.appendChild(title);

  const sub = document.createElement('div');
  sub.className = 'sub';
  sub.textContent = `in list “${list.title}”`;
  modal.appendChild(sub);

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

  // Candidate
  const candSec = section('Candidate');
  const candRow = document.createElement('div');
  candRow.className = 'chip-input';
  const candInput = document.createElement('input');
  candInput.type = 'text';
  candInput.placeholder = 'Name of proposed member…';
  candInput.value = card.candidate;
  candInput.addEventListener('change', () => { card.candidate = candInput.value.trim(); save(); render(); });
  candRow.appendChild(candInput);
  candSec.appendChild(candRow);
  modal.appendChild(candSec);

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
    if (confirm(`Delete card "${card.title}"?`)) {
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
  if (confirm('Reset the board to the sample data? This clears your changes.')) {
    localStorage.removeItem(STORAGE_KEY);
    board = load();
    render();
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
    const res = await fetch('../versions.json', { cache: 'no-store' });
    data = await res.json();
  } catch (_) {
    data = { latest: APP_VERSION, versions: [{ id: APP_VERSION, label: 'Version 1' }] };
  }
  (data.versions || []).forEach(v => {
    const a = document.createElement('a');
    a.href = `../${v.id}/`;
    a.innerHTML = `<span class="${v.id === APP_VERSION ? 'current' : ''}">${v.label || v.id}</span>`;
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = (v.id === data.latest ? 'latest' : '') + (v.id === APP_VERSION ? ' • current' : '');
    a.appendChild(tag);
    versionMenu.appendChild(a);
  });
  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = 'Tip: revert anytime by visiting /' + (data.versions?.[0]?.id || 'v1');
  versionMenu.appendChild(hint);
}

/* ----------------------- SVG icons ----------------------- */
function iconClock() { return '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 10V7h-2v7h6v-2h-4z"/></svg>'; }
function iconEye() { return '<svg viewBox="0 0 24 24"><path d="M12 5c-7 0-10 7-10 7s3 7 10 7 10-7 10-7-3-7-10-7zm0 11a4 4 0 110-8 4 4 0 010 8zm0-6a2 2 0 100 4 2 2 0 000-4z"/></svg>'; }
function iconDesc() { return '<svg viewBox="0 0 24 24"><path d="M4 5h16v2H4V5zm0 4h16v2H4V9zm0 4h10v2H4v-2zm0 4h16v2H4v-2z"/></svg>'; }
function iconCheck() { return '<svg viewBox="0 0 24 24"><path d="M9 16.2l-3.5-3.5L4 14.2l5 5 11-11-1.5-1.4z"/></svg>'; }

/* ----------------------- Boot ----------------------- */
render();
