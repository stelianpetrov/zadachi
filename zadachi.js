/* The same code runs on two pages: index.html (Задачи, Отпуски, Пари) and belezhki.html (Покупки only, window.ZAD_MODE = 'shop'). */
const MODE = window.ZAD_MODE === 'shop' ? 'shop' : 'tasks';
const KEYS = { lists: 'lists', tasks: 'tasks', mgroups: 'groups', money: 'money', vacation: 'leave' };
const S = { lists: {}, tasks: {}, groups: {}, money: {}, leave: {}, got: {}, noDb: false, readOnly: false,
  tab: 'tasks', view: 'agenda', filter: 'open', q: '', open: new Set(), sel: null, armed: null, menu: null, dirty: false, shopEdit: false, extraMonths: 0,
  qa: { list: '', due: '', time: '', prio: 'normal' }, shopList: '', yrDue: '' };
const LOCAL = { lists: {}, tasks: {}, mgroups: {}, money: {}, vacation: {} };   // created here, not yet confirmed by the server
let db = null;
if (MODE === 'shop') S.tab = 'shop';
try { const v = localStorage.getItem('zad-tab'); if (MODE === 'tasks' && ['tasks', 'leave', 'money'].includes(v)) S.tab = v; const w = localStorage.getItem('zad-view'); if (w === 'lists' || w === 'year') S.view = w; } catch (e) {}

const root = document.getElementById('root');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => { n = Math.round((n || 0) * 100) / 100; return n.toLocaleString('bg-BG', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) + ' €'; };
const parseNum = v => { const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : null; };
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const pad = n => String(n).padStart(2, '0');
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => keyOf(new Date());
const dt = k => new Date(k + 'T12:00');
const addDays = (k, n) => { const d = dt(k); d.setDate(d.getDate() + n); return keyOf(d); };
const nextSat = () => { const d = new Date(); return addDays(today(), (6 - d.getDay() + 7) % 7); };
if (document.getElementById('today-line')) document.getElementById('today-line').textContent = new Intl.DateTimeFormat('bg', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()).replace(/^./, c => c.toUpperCase());
const WD = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const MS = ['ян', 'фев', 'мар', 'апр', 'май', 'юни', 'юли', 'авг', 'сеп', 'окт', 'ное', 'дек'];
const ML = ['януари', 'февруари', 'март', 'април', 'май', 'юни', 'юли', 'август', 'септември', 'октомври', 'ноември', 'декември'];
const fmtDate = k => { const t = today(); if (k === t) return 'Днес'; if (k === addDays(t, 1)) return 'Утре'; if (k === addDays(t, -1)) return 'Вчера';
  const d = dt(k); return `${WD[d.getDay()]}, ${d.getDate()} ${MS[d.getMonth()]}`; };
const fmtDateLong = k => { const d = dt(k); return `${WD[d.getDay()]}, ${d.getDate()} ${ML[d.getMonth()]}`; };
const byOrder = (a, b) => (a[1].order ?? 0) - (b[1].order ?? 0) || String(a[1].name || a[1].title).localeCompare(b[1].name || b[1].title, 'bg');
const listsSorted = () => Object.entries(S.lists).sort(byOrder);
const isShopList = id => !!(S.lists[id] && S.lists[id].kind === 'shop');
const taskLists = () => listsSorted().filter(([id]) => !isShopList(id));
const shopLists = () => listsSorted().filter(([id]) => isShopList(id));
const groupsSorted = () => Object.entries(S.groups).sort(byOrder);
/* Yearly tasks (yearly: true) live in their own view. They show up in the normal views only in the last 30 days before the deadline. */
const YEAR_SOON = 30;
const yearSoon = t => !!t.due && t.due <= addDays(today(), YEAR_SOON);
const taskEntries = () => Object.entries(S.tasks).filter(([, t]) => !isShopList(t.list) && (!t.yearly || yearSoon(t)));
const yearlyEntries = () => Object.entries(S.tasks).filter(([, t]) => t.yearly && !isShopList(t.list));
const addYear = k => { const [y, m, d] = k.split('-').map(Number), x = new Date(y + 1, m - 1, d, 12); if (x.getMonth() !== m - 1) x.setDate(0); return keyOf(x); };
const fmtFull = k => { const d = dt(k); return `${d.getDate()} ${ML[d.getMonth()]} ${d.getFullYear()}`; };
const daysTo = k => Math.round((dt(k) - dt(today())) / 864e5);
const shopEntries = () => Object.entries(S.tasks).filter(([, t]) => isShopList(t.list));
const PR = { high: 0, normal: 1, low: 2 };

function overdue(t) {
  if (t.done || !t.due) return false;
  const tk = today(); if (t.due < tk) return true;
  if (t.due === tk && t.time) { const n = new Date(); return t.time < `${pad(n.getHours())}:${pad(n.getMinutes())}`; }
  return false;
}
function bucket(t) {
  if (t.done) return 'done';
  if (!t.due) return 'nodate';
  const tk = today();
  if (t.due < tk) return 'overdue';
  if (t.due === tk) return 'today';
  return 'upcoming';
}
const sortTasks = arr => arr.sort((a, b) => {
  const A = a[1], B = b[1];
  if (!!A.done !== !!B.done) return A.done ? 1 : -1;
  if ((A.due || '9') !== (B.due || '9')) return (A.due || '9') < (B.due || '9') ? -1 : 1;
  if ((A.time || '99') !== (B.time || '99')) return (A.time || '99') < (B.time || '99') ? -1 : 1;
  if (PR[A.priority || 'normal'] !== PR[B.priority || 'normal']) return PR[A.priority || 'normal'] - PR[B.priority || 'normal'];
  return (A.order ?? 0) - (B.order ?? 0);
});
const matches = t => {
  if (S.filter === 'open' && t.done) return false;
  if (S.filter === 'done' && !t.done) return false;
  if (S.filter === 'high' && (t.done || t.priority !== 'high')) return false;
  if (S.q) { const l = S.lists[t.list]; const h = [t.title, t.notes, t.where, l && l.name].join(' ').toLowerCase(); if (!h.includes(S.q)) return false; }
  return true;
};
function gcal(t) {
  if (!t.due) return '';
  let dates;
  if (t.time) { const s = new Date(t.due + 'T' + t.time), e = new Date(s.getTime() + 3600e3), f = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); dates = f(s) + '/' + f(e); }
  else dates = t.due.replace(/-/g, '') + '/' + addDays(t.due, 1).replace(/-/g, '');
  const det = [t.where && 'Къде: ' + t.where, t.notes].filter(Boolean).join('\n');
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(t.title) + '&dates=' + dates + (det ? '&details=' + encodeURIComponent(det) : '');
}
function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, 2800); }

/* ---------- writes ----------
   A new document is kept in LOCAL until the server confirms it, and is always written with its full data.
   Retries on any transient error, so a first write failing with "unavailable" can never end up empty. */
const pend = {}, busy = {}, creating = {};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fatal = e => e && ['invalid_argument', 'not_granted', 'permission_denied', 'quota_exceeded', 'revoked'].includes(e.code);
function onWriteError(e) {
  if (e && (e.code === 'not_granted' || e.code === 'permission_denied')) { if (!S.readOnly) { S.readOnly = true; render(); } }
  else if (e && e.code === 'quota_exceeded') toast('Хранилището е пълно. Изтрий стари завършени неща.');
  else toast('Промяната не се записа. Провери връзката и опитай пак.');
}
const current = (col, id) => LOCAL[col][id] || S[KEYS[col]][id];
async function attempt(fn) {
  let last;
  for (let i = 0; i < 5; i++) {
    try { return await fn(); }
    catch (e) { last = e; if (fatal(e)) throw e; await sleep(500 * (i + 1) + Math.random() * 400); }
  }
  throw last;
}
async function save(col, id, patch, create) {
  if (!db || S.readOnly) return;
  const key = col + '/' + id;
  pend[key] = Object.assign(pend[key] || {}, patch);
  if (create) creating[key] = true;
  if (busy[key]) return;
  busy[key] = true;
  while (pend[key]) {
    const p = pend[key]; delete pend[key];
    const ref = db.collection(col).doc(id);
    try {
      if (creating[key]) {
        const data = Object.assign({}, current(col, id), p);
        if (!Object.keys(data).length) throw { code: 'invalid_argument' };
        await attempt(() => ref.set(data));
        delete creating[key]; delete LOCAL[col][id];
      } else {
        try { await attempt(() => ref.update(p)); }
        catch (e) { if (e && (e.code === 'not_found' || e.code === 'not-found') && S[KEYS[col]][id]) await attempt(() => ref.set(Object.assign({}, S[KEYS[col]][id], p))); else throw e; }
      }
    } catch (e) {
      if (creating[key]) { delete creating[key]; delete LOCAL[col][id]; delete S[KEYS[col]][id]; render(); }
      onWriteError(e);
    }
  }
  busy[key] = false;
}
function create(col, id, data) { LOCAL[col][id] = data; S[KEYS[col]][id] = data; save(col, id, {}, true); }
async function remove(col, id) {
  delete LOCAL[col][id]; if (!db || S.readOnly) return;
  try { await attempt(() => db.collection(col).doc(id).delete()); } catch (e) { onWriteError(e); }
}
const patcher = (col) => (id, p) => { const o = S[KEYS[col]][id]; if (!o) return; Object.assign(o, p); if (LOCAL[col][id]) Object.assign(LOCAL[col][id], p); save(col, id, p); };
const setT = patcher('tasks'), setM = patcher('money'), setL = patcher('lists'), setG = patcher('mgroups');

/* ---------- rendering ---------- */
const typing = () => { const a = document.activeElement; return a && root.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'checkbox'; };
function schedule() { if (typing()) S.dirty = true; else render(); }
root.addEventListener('focusout', () => setTimeout(() => { if (S.dirty && !typing()) { S.dirty = false; render(); } }, 0));
const ready = () => Object.keys(KEYS).every(c => S.got[c]);

function render() {
  if (S.noDb) { root.innerHTML = `<div class="card state">Нямаш достъп до данните. Излез и влез отново.</div>`; return; }
  if (!ready()) { root.innerHTML = `<div class="state">Зареждане…</div>`; return; }
  const dis = S.readOnly ? ' disabled' : '';
  const openShop = shopEntries().filter(([, t]) => !t.done).length;
  const futureLeave = Object.values(S.leave).filter(v => v.date >= today()).length;
  const openTasks = taskEntries().filter(([, t]) => !t.done).length;
  let h = '';
  if (S.readOnly) h += `<div class="banner">Промените не се записват. Излез и влез отново.</div>`;
  const sc = document.getElementById('shop-count'); if (sc) sc.textContent = openShop + ' за купуване';
  if (MODE === 'tasks') h += `<nav class="maintabs" aria-label="Раздели">${[['tasks', 'Задачи', openTasks + ' отворени'], ['leave', 'Отпуски', futureLeave + ' предстоящи'], ['money', 'Пари', '']].map(([v, l, c]) => `<button data-act="tab" data-v="${v}" aria-pressed="${S.tab === v}">${l}${c ? `<small>${c}</small>` : ''}</button>`).join('')}</nav>`;
  if (S.tab === 'money') h += moneyView(dis);
  else if (S.tab === 'shop') h += shopView(dis);
  else if (S.tab === 'leave') h += leaveView(dis);
  else { h += summary(); if (!S.readOnly) h += S.view === 'year' ? yearAdd() : quickAdd(); h += tools(); h += S.view === 'agenda' ? agendaView(dis) : S.view === 'year' ? yearView(dis) : listsView(dis); }
  if (S.sel && (S.tab === 'leave' || S.readOnly)) S.sel = null;
  if (S.sel) { const src = S.tab === 'money' ? S.money : S.tasks; [...S.sel].forEach(x => { if (!src[x]) S.sel.delete(x); }); h += selBar(); }
  document.body.classList.toggle('selecting', !!S.sel);
  root.innerHTML = h;
}

/* ----- tasks ----- */
function summary() {
  const c = { over: 0, today: 0, week: 0, nodate: 0 }, tk = today(), wk = addDays(tk, 7);
  taskEntries().forEach(([, t]) => { if (t.done) return;
    if (!t.due) c.nodate++; else if (overdue(t)) c.over++; else if (t.due === tk) c.today++; else if (t.due <= wk) c.week++; });
  const nxt = sortTasks(taskEntries().filter(([, t]) => !t.done && t.due && !overdue(t)))[0];
  const st = (k, n, l) => `<button class="stat s-${k}${n ? '' : ' zero'}" data-act="jump" data-v="${k}"><b>${n}</b><span>${l}</span></button>`;
  return `<section class="card sum" aria-label="Обобщение">
    <div class="stats">${st('over', c.over, 'просрочени')}${st('today', c.today, 'за днес')}${st('week', c.week, 'следващите 7 дни')}${st('nodate', c.nodate, 'без дата')}</div>
    <div class="next">${nxt ? `Следва: <b>${esc(nxt[1].title)}</b> · ${fmtDate(nxt[1].due)}${nxt[1].time ? ' в ' + esc(nxt[1].time) : ''}` : 'Няма задачи с предстояща дата.'}</div>
  </section>`;
}
function quickAdd() {
  const ls = taskLists(); if (!S.qa.list || !S.lists[S.qa.list] || isShopList(S.qa.list)) S.qa.list = ls.length ? ls[0][0] : '';
  const tk = today(), dc = [['', 'Без дата'], [tk, 'Днес'], [addDays(tk, 1), 'Утре'], [nextSat(), 'В събота']];
  return `<form class="card qa" data-act="quickadd">
    <div class="qa-row"><input id="qa-title" placeholder="Нова задача…" aria-label="Нова задача" autocomplete="off"><button class="btn primary" type="submit">Добави</button></div>
    <div class="qa-opts">
      <select id="qa-list" data-qa="list" aria-label="Списък">${ls.map(([id, l]) => `<option value="${esc(id)}"${id === S.qa.list ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}</select>
      ${dc.map(([v, l]) => `<button type="button" class="chipbtn" data-act="qadate" data-v="${v}" aria-pressed="${S.qa.due === v}">${l}</button>`).join('')}
      <input id="qa-due" type="date" data-qa="due" value="${esc(S.qa.due)}" aria-label="Дата">
      <input id="qa-time" type="time" data-qa="time" value="${esc(S.qa.time)}" aria-label="Час">
      <button type="button" class="chipbtn" data-act="qaprio" aria-pressed="${S.qa.prio === 'high'}">Важно</button>
    </div>
  </form>`;
}
function tools() {
  const F = [['open', 'Незавършени'], ['high', 'Важни'], ['done', 'Завършени'], ['all', 'Всички']];
  return `<div class="tools"><div class="tabs" role="group" aria-label="Подредба">${[['agenda', 'По дати'], ['lists', 'По списъци'], ['year', 'Годишни']].map(([v, l]) => `<button data-act="view" data-v="${v}" aria-pressed="${S.view === v}">${l}</button>`).join('')}</div>
    ${S.view === 'year' ? '' : `<div class="chips" role="group" aria-label="Филтър">${F.map(([v, l]) => `<button class="chipbtn" data-act="filter" data-v="${v}" aria-pressed="${S.filter === v}">${l}</button>`).join('')}</div>
    <input class="search" id="search" type="search" placeholder="Търси…" value="${esc(S.q)}" aria-label="Търси в задачите">`}
    ${S.readOnly ? '' : `<button class="chipbtn" data-act="selmode" aria-pressed="${!!S.sel}">${S.sel ? 'Спри избора' : 'Избери няколко'}</button>`}</div>`;
}
function selBar() {
  const n = S.sel.size, armed = S.armed === 'seldel', what = S.tab === 'money' ? 'редовете' : S.tab === 'shop' ? 'покупките' : 'задачите';
  return `<div class="selbar" role="region" aria-label="Избрани"><span class="selcount">${n ? `Избрани: ${n}` : `Докосни ${what}, които искаш`}</span>
    <span class="selbtns"><button class="btn" data-act="selall">Избери всички видими</button>${n ? `<button class="btn" data-act="selnone">Махни избора</button>` : ''}
    <button class="btn danger${armed ? ' armed' : ''}" data-act="seldel"${n ? '' : ' disabled'}>${armed ? `Да, изтрий ${n}` : 'Изтрий избраните'}</button></span></div>`;
}
function agendaView(dis) {
  const g = { overdue: [], today: [], upcoming: [], nodate: [], done: [] };
  taskEntries().forEach(([id, t]) => { if (!matches(t)) return; let b = bucket(t); if (b === 'today' && overdue(t)) b = 'overdue'; g[b].push([id, t]); });
  const box = (k, label, sub, arr, cls) => `<section class="sec b-${cls || k}" id="sec-${k}"><div class="sec-head"><h2>${label}${sub ? `<small>${sub}</small>` : ''}</h2><div class="sec-meta">${arr.length}</div></div>
      <div class="list">${arr.map(([id, t]) => taskHtml(id, t, dis, true)).join('')}</div></section>`;
  let h = '', any = false;
  const sorted = k => sortTasks(g[k]);
  if (g.overdue.length) { any = true; h += box('overdue', 'Просрочени', '', sorted('overdue')); }
  if (g.today.length) { any = true; h += box('today', 'Днес', fmtDateLong(today()), sorted('today')); }
  if (g.upcoming.length) {
    any = true; const byM = {};
    sorted('upcoming').forEach(e => (byM[e[1].due.slice(0, 7)] = byM[e[1].due.slice(0, 7)] || []).push(e));
    h += `<div id="sec-upcoming"></div>`;
    Object.keys(byM).sort().forEach(m => { const [y, mo] = m.split('-').map(Number); h += box('m' + m, `${ML[mo - 1]} <small>${y}</small>`, '', byM[m], 'upcoming'); });
  }
  if (g.nodate.length) { any = true; h += box('nodate', 'Без дата', '', sorted('nodate')); }
  if (g.done.length) { any = true; h += box('done', 'Завършени', '', sorted('done')); }
  if (!any) h += taskEntries().length ? `<div class="card state">Нищо не отговаря на филтъра.</div>` : `<div class="card state">Още няма задачи. Напиши първата в полето горе.</div>`;
  return h;
}
function listsView(dis) {
  let h = '', shown = 0;
  const ls = taskLists(), filtering = S.filter !== 'open' || S.q;
  if (!ls.length) h += `<div class="card state">Още няма списъци. Добави първия отдолу.</div>`;
  ls.forEach(([lid, l], idx) => {
    const all = Object.entries(S.tasks).filter(([, t]) => t.list === lid && !t.yearly), done = all.filter(([, t]) => t.done).length;
    const vis = sortTasks(all.filter(([, t]) => matches(t)));
    if (filtering && !vis.length) return; shown++;
    h += `<section class="sec" aria-labelledby="h-${esc(lid)}"><div class="sec-head">
      <div style="display:flex;align-items:center;gap:6px;min-width:0"><h2 id="h-${esc(lid)}">${esc(l.name)}</h2><button class="iconbtn" data-act="menu" data-id="l:${esc(lid)}" aria-label="Настройки на списъка" aria-expanded="${S.menu === 'l:' + lid}">⋯</button></div>
      <div class="sec-meta">${done}/${all.length} готови</div>
      <div class="bar"><span style="width:${all.length ? done / all.length * 100 : 0}%"></span></div></div>`;
    if (S.menu === 'l:' + lid) h += secMenu('l', lid, l, idx, ls.length, all.length, dis);
    h += `<div class="list">${vis.length ? vis.map(([id, t]) => taskHtml(id, t, dis, false)).join('') : `<div class="empty">${all.length ? 'Всичко тук е готово.' : 'Празно.'}</div>`}`;
    if (!S.readOnly) h += `<form class="add" data-act="addtask" data-list="${esc(lid)}"><input id="add-${esc(lid)}" placeholder="Добави в „${esc(l.name)}“…" aria-label="Нова задача в ${esc(l.name)}" autocomplete="off"><button class="btn" type="submit">Добави</button></form>`;
    h += `</div></section>`;
  });
  if (filtering && !shown && ls.length) h += `<div class="card state">Нищо не отговаря на филтъра.</div>`;
  if (!S.readOnly) h += `<form class="addsec" data-act="addlist"><input id="newlist" placeholder="Нов списък със задачи" aria-label="Нов списък"><button class="btn" type="submit">Добави списък</button></form>`;
  return h;
}
function yearAdd() {
  return `<form class="card qa" data-act="addyear">
    <div class="qa-row"><input id="yr-title" placeholder="Нова годишна задача, напр. Винетка…" aria-label="Нова годишна задача" autocomplete="off"><button class="btn primary" type="submit">Добави</button></div>
    <div class="qa-opts"><label class="hint" for="yr-due">Срок</label><input id="yr-due" type="date" data-yr="1" value="${esc(S.yrDue)}" aria-label="Срок"></div>
  </form>`;
}
function yearView(dis) {
  const all = sortTasks(yearlyEntries());
  let h = `<section class="sec b-upcoming"><div class="sec-head"><h2>Всяка година<small>Отметнеш ли я, срокът се мести с година.</small></h2><div class="sec-meta">${all.length}</div></div>
    <div class="list">${all.length ? all.map(([id, t]) => taskHtml(id, t, dis, false)).join('') : `<div class="empty">Още няма годишни задачи. Добави първата горе.</div>`}</div></section>`;
  return h + `<p class="hint">30 дни преди срока задачата се появява и в „По дати“.</p>`;
}
function secMenu(kind, id, o, idx, n, count, dis) {
  const armed = S.armed === kind + 'del:' + id;
  return `<div class="secmenu">
    <label class="f">Име<input id="sn-${esc(id)}" data-sec="${kind}" data-sid="${esc(id)}" data-sf="name" value="${esc(o.name)}"${dis}></label>
    ${kind === 'g' ? `<label class="f">Бележка към групата<input id="sno-${esc(id)}" data-sec="g" data-sid="${esc(id)}" data-sf="note" value="${esc(o.note)}" placeholder="по желание"${dis}></label>` : ''}
    <div class="edit-foot"><div style="display:flex;gap:6px"><button class="btn" data-act="move" data-k="${kind}" data-id="${esc(id)}" data-d="-1"${idx === 0 ? ' disabled' : ''}${dis}>↑ По-горе</button><button class="btn" data-act="move" data-k="${kind}" data-id="${esc(id)}" data-d="1"${idx === n - 1 ? ' disabled' : ''}${dis}>↓ По-долу</button></div>
    <button class="btn danger${armed ? ' armed' : ''}" data-act="secdel" data-k="${kind}" data-id="${esc(id)}"${dis}>${armed ? (count ? `Да, изтрий заедно с ${count} реда` : 'Да, изтрий') : 'Изтрий'}</button></div>
  </div>`;
}
function tileHtml(t, od) {
  const d = dt(t.due), tk = today(), cls = od ? 'over' : t.due === tk ? 'today' : t.due <= addDays(tk, 7) ? 'soon' : '';
  return `<span class="tile ${cls}"><i>${WD[d.getDay()]}</i><b>${d.getDate()}</b><i>${MS[d.getMonth()]}</i>${d.getFullYear() !== new Date().getFullYear() ? `<i>${d.getFullYear()}</i>` : ''}${t.time ? `<em>${esc(t.time)}</em>` : ''}</span>`;
}
function taskHtml(id, t, dis, showList) {
  const open = S.open.has(id), od = overdue(t), l = S.lists[t.list], p = t.priority || 'normal', cal = gcal(t);
  let tags = '';
  if (showList && l) tags += `<span class="tag">${esc(l.name)}</span>`;
  if (p === 'high') tags += `<span class="tag t-hi">Важно</span>`;
  if (p === 'low') tags += `<span class="tag t-low">Някой ден</span>`;
  if (t.where) tags += `<span class="tag">${esc(t.where)}</span>`;
  if (t.yearly) {
    if (S.view !== 'year' || S.tab !== 'tasks') tags += `<span class="tag">Всяка година</span>`;
    else if (t.due) { const n = daysTo(t.due); tags += `<span class="tag${n <= YEAR_SOON ? ' t-hi' : ''}">${n < 0 ? 'просрочена' : n === 0 ? 'днес' : n === 1 ? 'утре' : 'след ' + n + ' дни'}</span>`; }
    if (t.lastDone) tags += `<span class="tag t-low">последно: ${esc(fmtFull(t.lastDone))}</span>`;
  }
  const right = t.due && !t.done ? `<span class="tilecol">${tileHtml(t, od)}${t.due >= today() ? `<a class="rem" href="${esc(cal)}" target="_blank" rel="noopener">+ напомняне</a>` : ''}</span>` : '<span></span>';
  if (S.sel) { const on = S.sel.has(id);
    return `<div class="item${t.done ? ' is-done' : ''}${on ? ' picked' : ''}"><div class="item-row">
      <input type="checkbox" class="check pick" data-act="pick" data-id="${esc(id)}" ${on ? 'checked' : ''} aria-label="Избери: ${esc(t.title)}">
      <button class="item-main" data-act="pick" data-id="${esc(id)}" aria-pressed="${on}">
        <span class="item-name">${esc(t.title)}</span>
        ${t.notes ? `<span class="item-note">${esc(t.notes)}</span>` : ''}
        ${tags ? `<span class="tags">${tags}</span>` : ''}
      </button>
      ${t.due && !t.done ? `<span class="tilecol">${tileHtml(t, od)}</span>` : '<span></span>'}
    </div></div>`; }
  let h = `<div class="item${t.done ? ' is-done' : ''}${p === 'high' ? ' p-high' : ''}">
    <div class="item-row">
      <input type="checkbox" class="check" id="chk-${esc(id)}" data-act="done" data-id="${esc(id)}" ${t.done ? 'checked' : ''} aria-label="Готово: ${esc(t.title)}"${dis}>
      <button class="item-main" data-act="toggle" data-id="${esc(id)}" aria-expanded="${open}">
        <span class="item-name">${esc(t.title)}</span>
        ${t.notes ? `<span class="item-note">${esc(t.notes)}</span>` : ''}
        ${tags ? `<span class="tags">${tags}</span>` : ''}
      </button>
      ${right}
    </div>`;
  if (open) h += taskEdit(id, t, dis, cal);
  return h + `</div>`;
}
function taskEdit(id, t, dis, cal, shop) {
  const tk = today(), lists = shop ? shopLists() : taskLists(), p = t.priority || 'normal';
  if (shop) return `<div class="shopedit">
      <label class="f">Какво<input id="t-title-${esc(id)}" data-tid="${esc(id)}" data-f="title" value="${esc(t.title)}"${dis}></label>
      <div class="row2"><label class="f">Къде / магазин<input id="t-where-${esc(id)}" data-tid="${esc(id)}" data-f="where" value="${esc(t.where)}" placeholder="напр. ИКЕА"${dis}></label>
      <label class="f">Група<select id="t-list-${esc(id)}" data-tid="${esc(id)}" data-f="list"${dis}>${lists.map(([lid, x]) => `<option value="${esc(lid)}"${lid === t.list ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label></div>
      <label class="f">Бележка<input id="t-notes-${esc(id)}" data-tid="${esc(id)}" data-f="notes" value="${esc(t.notes)}"${dis}></label>
      <div class="edit-foot"><button class="btn" data-act="toggle" data-id="${esc(id)}">Затвори</button>
      <button class="btn danger${S.armed === 't:' + id ? ' armed' : ''}" data-act="deltask" data-id="${esc(id)}"${dis}>${S.armed === 't:' + id ? 'Да, изтрий' : 'Изтрий'}</button></div></div>`;
  return `<div class="edit">
      <label class="f">Задача<input id="t-title-${esc(id)}" data-tid="${esc(id)}" data-f="title" value="${esc(t.title)}"${dis}></label>
      <div class="row2"><label class="f">Дата<input id="t-due-${esc(id)}" type="date" data-tid="${esc(id)}" data-f="due" value="${esc(t.due)}"${dis}></label>
      <label class="f">Час (по желание)<input id="t-time-${esc(id)}" type="time" data-tid="${esc(id)}" data-f="time" value="${esc(t.time)}"${dis}></label></div>
      <div class="datechips">${[['', 'Без дата'], [tk, 'Днес'], [addDays(tk, 1), 'Утре'], [nextSat(), 'В събота'], [addDays(t.due || tk, 7), '+1 седмица']].map(([v, lb]) => `<button class="chipbtn" data-act="setdue" data-id="${esc(id)}" data-v="${v}" aria-pressed="${(t.due || '') === v}"${dis}>${lb}</button>`).join('')}</div>
      <div class="f">Важност<div class="seg" role="group" aria-label="Важност">${[['low', 'Някой ден'], ['normal', 'Нормално'], ['high', 'Важно']].map(([v, lb]) => `<button data-act="prio" data-id="${esc(id)}" data-v="${v}" aria-pressed="${p === v}"${dis}>${lb}</button>`).join('')}</div></div>
      <div class="f">Повтаряне<div class="seg" role="group" aria-label="Повтаряне">${[['', 'Веднъж'], ['1', 'Всяка година']].map(([v, lb]) => `<button data-act="yearly" data-id="${esc(id)}" data-v="${v}" aria-pressed="${!!t.yearly === !!v}"${dis}>${lb}</button>`).join('')}</div></div>
      <div class="row2">${t.yearly ? '' : `<label class="f">Списък<select id="t-list-${esc(id)}" data-tid="${esc(id)}" data-f="list"${dis}>${lists.map(([lid, x]) => `<option value="${esc(lid)}"${lid === t.list ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>`}
      <label class="f">Къде<input id="t-where-${esc(id)}" data-tid="${esc(id)}" data-f="where" value="${esc(t.where)}" placeholder="напр. МЦ, адрес"${dis}></label></div>
      <label class="f">Бележки<textarea id="t-notes-${esc(id)}" data-tid="${esc(id)}" data-f="notes" placeholder="подробности, суми, кой…"${dis}>${esc(t.notes)}</textarea></label>
      ${cal ? `<a class="link" href="${esc(cal)}" target="_blank" rel="noopener">Добави напомняне в Google Календар ↗</a>` : `<p class="hint">Сложи дата, за да можеш да добавиш напомняне в календара на телефона.</p>`}
      <div class="edit-foot"><button class="btn" data-act="toggle" data-id="${esc(id)}">Готово</button>
      <button class="btn danger${S.armed === 't:' + id ? ' armed' : ''}" data-act="deltask" data-id="${esc(id)}"${dis}>${S.armed === 't:' + id ? 'Да, изтрий' : 'Изтрий'}</button></div>
    </div>`;
}

/* ----- shopping ----- */
function shopView(dis) {
  const gs = shopLists(), all = shopEntries(), bought = all.filter(([, t]) => t.done);
  if (!S.shopList || !S.lists[S.shopList] || !isShopList(S.shopList)) S.shopList = gs.length ? gs[0][0] : '';
  let h = '';
  if (!S.readOnly) h += `<form class="card sf" data-act="addshop">
      <div class="sf-row"><input class="big" id="shop-name" placeholder="Какво да купя? Може няколко, със запетая" aria-label="Какво да купя" autocomplete="off"><button class="btn primary" type="submit">Добави</button></div>
      <div class="sf-row"><select id="shop-list" data-shoplist="1" aria-label="Група">${gs.map(([id, l]) => `<option value="${esc(id)}"${id === S.shopList ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}</select>
      <input id="shop-where" placeholder="Магазин (по желание)" aria-label="Магазин" autocomplete="off"></div></form>`;
  h += `<div class="shopbar"><span class="hint">${all.length - bought.length} за купуване${bought.length ? ` · ${bought.length} купени` : ''}. Докосни, за да отбележиш.</span><span style="display:flex;gap:6px;flex-wrap:wrap">
    ${S.readOnly ? '' : `<button class="chipbtn" data-act="selmode" aria-pressed="${!!S.sel}">${S.sel ? 'Спри избора' : 'Избери няколко'}</button>`}
    <button class="chipbtn" data-act="shopedit" aria-pressed="${S.shopEdit}">Редактирай</button>
    ${bought.length && !S.readOnly ? `<button class="chipbtn" data-act="clearbought">${S.armed === 'clr' ? 'Да, изтрий купените' : 'Изчисти купените'}</button>` : ''}</span></div>`;
  h += `<div class="shopgrid">`;
  gs.forEach(([lid, l], idx) => {
    const items = sortTasks(all.filter(([, t]) => t.list === lid)).sort((a, b) => (!!a[1].done - !!b[1].done));
    const left = items.filter(([, t]) => !t.done).length;
    const openId = items.find(([id]) => S.open.has(id));
    h += `<section class="shopcard" data-lid="${esc(lid)}" aria-label="${esc(l.name)}"><div class="shead"><div style="display:flex;align-items:center;gap:6px;min-width:0"><h2>${esc(l.name)}</h2><button class="iconbtn" data-act="menu" data-id="l:${esc(lid)}" aria-label="Настройки на групата" aria-expanded="${S.menu === 'l:' + lid}">⋯</button></div><span class="cnt">${left}/${items.length}</span></div>`;
    if (S.menu === 'l:' + lid) h += secMenu('l', lid, l, idx, gs.length, items.length, dis);
    h += items.length ? `<div class="sc-list">${items.map(([id, t]) => S.sel ? `<button class="sc${S.sel.has(id) ? ' picked' : ''}" data-act="pick" data-id="${esc(id)}" aria-pressed="${S.sel.has(id)}"><span>${esc(t.title)}${t.where ? ` <small>· ${esc(t.where)}</small>` : ''}</span></button>` : `<button class="sc${t.done ? ' done' : ''}${S.shopEdit && S.open.has(id) ? ' sel' : ''}" data-act="shopchip" data-id="${esc(id)}"${S.readOnly && !S.shopEdit ? ' disabled' : ''}><span>${esc(t.title)}${t.where ? ` <small>· ${esc(t.where)}</small>` : ''}</span></button>`).join('')}</div>` : `<div class="empty" style="padding:0">Празно.</div>`;
    if (S.shopEdit && openId && !S.sel) h += taskEdit(openId[0], openId[1], dis, '', true);
    h += `</section>`;
  });
  h += `</div>`;
  if (!gs.length) h += `<div class="card state">Още няма групи за покупки. Добави първата отдолу, напр. „Храна“.</div>`;
  if (!S.readOnly) h += `<form class="addsec" data-act="addshopgroup"><input id="newshopgroup" placeholder="Нова група, напр. „Аптека“" aria-label="Нова група за покупки"><button class="btn" type="submit">Добави група</button></form>`;
  return h;
}

/* ----- vacation ----- */
const HOL = { // [име, true = официален празник, false = почивен ден]
'2026-01-01':['Нова година',1],'2026-01-02':['Почивен ден след Нова година',0],'2026-03-03':['Ден на Освобождението',1],
'2026-04-10':['Велики петък',1],'2026-04-11':['Велика събота',1],'2026-04-12':['Великден',1],'2026-04-13':['Почивен ден (Великденски понеделник)',0],
'2026-05-01':['Ден на труда',1],'2026-05-06':['Гергьовден',1],'2026-05-24':['Ден на славянската писменост',1],'2026-05-25':['Почивен ден (за 24 май)',0],
'2026-09-06':['Ден на Съединението',1],'2026-09-07':['Почивен ден (за 6 септември)',0],'2026-09-22':['Ден на Независимостта',1],
'2026-12-24':['Бъдни вечер',1],'2026-12-25':['Рождество Христово',1],'2026-12-26':['Рождество Христово (2-ри ден)',1],'2026-12-28':['Почивен ден (за 26 декември)',0],
'2027-01-01':['Нова година',1],'2027-03-03':['Ден на Освобождението',1],
'2027-04-30':['Велики петък',1],'2027-05-01':['Ден на труда / Велика събота',1],'2027-05-02':['Великден',1],'2027-05-03':['Почивен ден (за 1 май / Великден)',0],
'2027-05-06':['Гергьовден',1],'2027-05-24':['Ден на славянската писменост',1],'2027-09-06':['Ден на Съединението',1],'2027-09-22':['Ден на Независимостта',1],
'2027-12-24':['Бъдни вечер',1],'2027-12-25':['Рождество Христово',1],'2027-12-26':['Рождество Христово (2-ри ден)',1],'2027-12-27':['Почивен ден (за 25 декември)',0],'2027-12-28':['Почивен ден (за 26 декември)',0] };
let TIPS = {};
function leaveView(dis) {
  // past leave days are hidden everywhere (data stays in the db, only the view skips them)
  const tk = today(), dates = Object.values(S.leave).map(v => v.date).filter(d => d && d >= tk).sort();
  const cm = tk.slice(0, 7);
  let start = cm;
  let end = [dates.length ? dates[dates.length - 1].slice(0, 7) : cm, '2026-12'].sort().pop();
  const months = []; let [y, m] = start.split('-').map(Number); const [ey, em] = end.split('-').map(Number);
  let guard = 0;
  while ((y < ey || (y === ey && m <= em)) && guard++ < 36) { months.push([y, m]); m++; if (m > 12) { m = 1; y++; } }
  for (let i = 0; i < S.extraMonths; i++) { months.push([y, m]); m++; if (m > 12) { m = 1; y++; } }
  const up = dates;
  const byM = {}; dates.forEach(d => (byM[d.slice(0, 7)] = byM[d.slice(0, 7)] || []).push(d));
  const taskDays = new Set(taskEntries().filter(([, t]) => t.due && !t.done).map(([, t]) => t.due));
  TIPS = {};
  taskEntries().filter(([, t]) => t.due && !t.done).sort((a, b) => String(a[1].time || '99').localeCompare(String(b[1].time || '99'))).forEach(([, t]) => (TIPS[t.due] = TIPS[t.due] || []).push((t.time ? t.time + ' ' : '') + (t.title || '')));
  let h = `<section class="card leavesum"><div class="leavebig"><b>${up.length}</b><span>${up.length === 1 ? 'предстоящ почивен ден' : 'предстоящи почивни дни'}</span></div>`;
  Object.keys(byM).sort().forEach(k => { const [yy, mm] = k.split('-').map(Number);
    h += `<div class="lmonth"><b>${ML[mm - 1]}</b><span class="lchips">${byM[k].map(d => `<span class="lchip">${WD[dt(d).getDay()]} ${dt(d).getDate()}</span>`).join('')}</span></div>`; });
  if (!dates.length) h += `<p class="hint">Още няма отпуски. Докосни ден в календара отдолу.</p>`;
  h += `</section><div class="legend"><span><i style="background:var(--accent)"></i>отпуска</span><span><i style="background:rgba(37,99,235,.35);border:1px solid rgba(37,99,235,.7)"></i>официален празник</span><span><i style="background:rgba(37,99,235,.1);border:1px dashed rgba(37,99,235,.7)"></i>почивен ден</span><span><i style="box-shadow:inset 0 0 0 2px var(--danger)"></i>днес</span><span><i style="background:var(--wait);border-radius:50%"></i>има задача</span>${S.readOnly ? '' : '<span>Докосни ден, за да го добавиш или махнеш.</span>'}</div><div class="cals">`;
  months.forEach(([yy, mm]) => {
    const first = (new Date(yy, mm - 1, 1).getDay() + 6) % 7, nd = new Date(yy, mm, 0).getDate();
    const cnt = (byM[`${yy}-${pad(mm)}`] || []).length;
    let cells = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'нд'].map(x => `<div class="wd">${x}</div>`).join('') + '<span class="day blank"></span>'.repeat(first);
    for (let d = 1; d <= nd; d++) {
      const k = `${yy}-${pad(mm)}-${pad(d)}`, wd = (first + d - 1) % 7, hol = HOL[k];
      if (hol) { cells += `<button class="day hol${hol[1] ? '' : ' off'}${k === tk ? ' today' : ''}" data-act="hday" data-n="${esc(hol[0])}" data-tip="1" data-d="${k}" aria-label="${d} ${ML[mm - 1]}, ${esc(hol[0])}">${d}${taskDays.has(k) ? '<span class="dot"></span>' : ''}${k === tk ? '<span class="tdy">днес</span>' : ''}</button>`; continue; }
      const gone = k < tk, on = !gone && !!S.leave[k];
      cells += `<button class="day${wd > 4 ? ' we' : ''}${k === tk ? ' today' : ''}${on ? ' leave' : ''}${gone ? ' gone' : ''}" data-act="vday" data-d="${k}"${taskDays.has(k) || on ? ' data-tip="1"' : ''} aria-pressed="${on}" aria-label="${d} ${ML[mm - 1]}${on ? ', отпуска' : ''}"${gone ? ' disabled' : dis}>${d}${taskDays.has(k) ? '<span class="dot"></span>' : ''}${k === tk ? '<span class="tdy">днес</span>' : ''}</button>`;
    }
    h += `<section class="cal"><h2>${ML[mm - 1]} ${yy}<small>${cnt ? cnt + (cnt === 1 ? ' ден' : ' дни') + ' отпуск' : ''}</small></h2><div class="cgrid">${cells}</div></section>`;
  });
  h += `</div><div><button class="chipbtn" data-act="moremonths">+ Още един месец</button></div>`;
  return h;
}

/* ----- money: per group two blocks (get / pay), each sorted and grouped by person ----- */
const mAmt = m => Number(m.amount) || 0;
const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n));
function moneyBlock(dir, entries, dis) {
  const ms = entries.map(x => x[1]), open = ms.filter(m => !m.settled), tot = open.reduce((a, m) => a + mAmt(m), 0);
  const label = dir === 'get' ? 'За взимане' : 'За даване';
  let h = `<div class="mblock ${dir}"><div class="mb-head"><span class="mb-t">${label}</span><span class="mb-s">${ms.length ? (dir === 'get' ? '+' : '−') + money(tot) : ''}</span></div>`;
  if (!entries.length) return h + `<div class="mb-empty">Няма редове.</div></div>`;
  const by = {};
  entries.forEach(e => { const w = (e[1].who || '').trim(); (by[w] = by[w] || []).push(e); });
  const keys = Object.keys(by).sort((x, y) => (!x) - (!y) || x.localeCompare(y, 'bg'));
  const grouped = keys.length > 1 || (keys[0] && keys[0] !== '');
  keys.forEach(k => {
    const rows = by[k].sort((p, q) => (!!p[1].settled - !!q[1].settled) || mAmt(q[1]) - mAmt(p[1]) || String(p[1].title).localeCompare(q[1].title, 'bg'));
    if (grouped) { const pt = rows.filter(r => !r[1].settled).reduce((a, r) => a + mAmt(r[1]), 0);
      h += `<div class="mperson"><span>${k ? esc(k) : 'Без посочено лице'}</span><span>${pt ? money(pt) : 'уредено'}</span></div>`; }
    h += rows.map(([id, m]) => moneyHtml(id, m, dis)).join('');
  });
  return h + `</div>`;
}
function moneyView(dis) {
  const all = Object.values(S.money);
  const open = d => all.filter(m => (m.dir || 'get') === d && !m.settled).reduce((a, m) => a + mAmt(m), 0);
  const g0 = open('get'), p0 = open('pay'), net0 = g0 - p0;
  let h = `<section class="card" style="display:grid;gap:10px"><div class="msum3">
    <div class="get"><span>За взимане</span><b>+${money(g0)}</b></div>
    <div class="pay"><span>За даване</span><b>−${money(p0)}</b></div>
    <div class="net ${net0 >= 0 ? 'get' : 'pay'}"><span>Баланс</span><b>${signed(net0)}</b></div></div>
    <div class="shopbar"><p class="hint">Броят се само неуредените. Отметни реда, когато парите са взети или дадени.</p>${S.readOnly ? '' : `<button class="chipbtn" data-act="selmode" aria-pressed="${!!S.sel}">${S.sel ? 'Спри избора' : 'Избери няколко'}</button>`}</div></section>`;
  const gs = groupsSorted();
  gs.forEach(([gid, g], idx) => {
    const items = Object.entries(S.money).filter(([, m]) => m.group === gid);
    const ms = items.map(x => x[1]);
    const gets = items.filter(([, m]) => (m.dir || 'get') === 'get'), pays = items.filter(([, m]) => m.dir === 'pay');
    const sumO = arr => arr.filter(([, m]) => !m.settled).reduce((a, [, m]) => a + mAmt(m), 0);
    const net = sumO(gets) - sumO(pays);
    const stated = Number(g.stated) || 0, calc = ms.reduce((a, m) => a + mAmt(m), 0);
    h += `<section class="sec"><div class="sec-head">
      <div style="display:flex;align-items:center;gap:6px;min-width:0"><h2>${esc(g.name)}</h2><button class="iconbtn" data-act="menu" data-id="g:${esc(gid)}" aria-label="Настройки на групата" aria-expanded="${S.menu === 'g:' + gid}">⋯</button></div>
      <div class="sec-meta net ${net >= 0 ? 'get' : 'pay'}">${ms.length ? (sumO(gets) || sumO(pays) ? 'баланс ' + signed(net) : 'всичко е уредено') : ''}</div></div>`;
    if (S.menu === 'g:' + gid) h += secMenu('g', gid, g, idx, gs.length, ms.length, dis);
    if (g.note) h += `<div class="gnote">${esc(g.note)}</div>`;
    if (stated && Math.abs(stated - calc) > 0.001) h += `<div class="gnote warn">В бележката пише общо ${money(stated)}, а редовете отдолу дават ${money(calc)}. Провери дали липсва сума.</div>`;
    h += `<div class="list">`;
    if (items.length) h += moneyBlock('get', gets, dis) + moneyBlock('pay', pays, dis) + `<div class="tfoot"><span>Уредени ${ms.filter(m => m.settled).length}/${ms.length}</span></div>`;
    else h += '<div class="empty">Празно.</div>';
    if (!S.readOnly) { const ad = (S.addDir && S.addDir[gid]) || 'get';
      h += `<form class="add addm" data-act="addmoney" data-group="${esc(gid)}"><div class="seg" role="group" aria-label="Посока">${[['get', 'За взимане'], ['pay', 'За даване']].map(([v, l]) => `<button type="button" data-act="adddir" data-id="${esc(gid)}" data-v="${v}" aria-pressed="${ad === v}">${l}</button>`).join('')}</div>
        <div class="addrow"><input id="am-${esc(gid)}" placeholder="За какво…" aria-label="Нов ред в ${esc(g.name)}" autocomplete="off"><input class="amt-in" id="ama-${esc(gid)}" inputmode="decimal" placeholder="€" aria-label="Сума"></div>
        <div class="addrow"><input id="amw-${esc(gid)}" placeholder="От кого / на кого (по желание)" aria-label="Лице" autocomplete="off"><button class="btn" type="submit">Добави</button></div></form>`; }
    h += `</div></section>`;
  });
  if (!gs.length) h += `<div class="card state">Още няма групи. Добави първата отдолу, напр. „Ноември“.</div>`;
  if (!S.readOnly) h += `<form class="addsec" data-act="addgroup"><input id="newgroup" placeholder="Нова група, напр. „Ноември“" aria-label="Нова група"><button class="btn" type="submit">Добави група</button></form>`;
  return h;
}
function moneyHtml(id, m, dis) {
  const open = S.open.has(id), dir = m.dir || 'get';
  const tags = m.settled ? '<span class="tag">уредено</span>' : '';
  if (S.sel) { const on = S.sel.has(id);
    return `<div class="item${m.settled ? ' is-done' : ''}${on ? ' picked' : ''}"><div class="item-row">
      <input type="checkbox" class="check pick" data-act="pick" data-id="${esc(id)}" ${on ? 'checked' : ''} aria-label="Избери: ${esc(m.title)}">
      <button class="item-main" data-act="pick" data-id="${esc(id)}" aria-pressed="${on}">
        <span class="item-name">${esc(m.title)}</span>
        ${m.notes ? `<span class="item-note">${esc(m.notes)}</span>` : ''}
        ${tags ? `<span class="tags">${tags}</span>` : ''}
      </button>
      <span class="amt ${dir}">${dir === 'get' ? '+' : '−'}${money(m.amount)}</span>
    </div></div>`; }
  let h = `<div class="item${m.settled ? ' is-done' : ''}">
    <div class="item-row">
      <input type="checkbox" class="check" id="mchk-${esc(id)}" data-act="settled" data-id="${esc(id)}" ${m.settled ? 'checked' : ''} aria-label="Уредено: ${esc(m.title)}"${dis}>
      <button class="item-main" data-act="toggle" data-id="${esc(id)}" aria-expanded="${open}">
        <span class="item-name">${esc(m.title)}</span>
        ${m.notes ? `<span class="item-note">${esc(m.notes)}</span>` : ''}
        ${tags ? `<span class="tags">${tags}</span>` : ''}
      </button>
      <span class="amt ${dir}">${dir === 'get' ? '+' : '−'}${money(m.amount)}</span>
    </div>`;
  if (open) {
    h += `<div class="edit">
      <div class="seg" role="group" aria-label="Посока">${[['get', 'Да взема'], ['pay', 'Да дам / платя']].map(([v, l]) => `<button data-act="dir" data-id="${esc(id)}" data-v="${v}" aria-pressed="${dir === v}"${dis}>${l}</button>`).join('')}</div>
      <label class="f">За какво<input id="m-title-${esc(id)}" data-mid="${esc(id)}" data-f="title" value="${esc(m.title)}"${dis}></label>
      <div class="row2"><label class="f">Сума, €<input id="m-amount-${esc(id)}" data-mid="${esc(id)}" data-f="amount" inputmode="decimal" value="${Number(m.amount) || ''}"${dis}></label>
      <label class="f">От кого / на кого<input id="m-who-${esc(id)}" data-mid="${esc(id)}" data-f="who" value="${esc(m.who)}" placeholder="напр. нашите"${dis}></label></div>
      <label class="f">Група<select id="m-group-${esc(id)}" data-mid="${esc(id)}" data-f="group"${dis}>${groupsSorted().map(([gid, g]) => `<option value="${esc(gid)}"${gid === m.group ? ' selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>
      <label class="f">Бележки<textarea id="m-notes-${esc(id)}" data-mid="${esc(id)}" data-f="notes"${dis}>${esc(m.notes)}</textarea></label>
      <div class="edit-foot"><button class="btn" data-act="toggle" data-id="${esc(id)}">Готово</button>
      <button class="btn danger${S.armed === 'm:' + id ? ' armed' : ''}" data-act="delmoney" data-id="${esc(id)}"${dis}>${S.armed === 'm:' + id ? 'Да, изтрий' : 'Изтрий'}</button></div>
    </div>`;
  }
  return h + `</div>`;
}

/* ---------- events ---------- */
function newTask(title, list, extra) {
  const id = uid('t'), order = Math.max(-1, ...Object.values(S.tasks).filter(t => t.list === list).map(t => t.order ?? 0)) + 1;
  create('tasks', id, Object.assign({ title, list, order, done: false, due: '', time: '', priority: 'normal', where: '', notes: '', created: new Date().toISOString() }, extra));
}
root.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'FORM' || (b.tagName === 'INPUT' && b.dataset.act !== 'pick')) return;
  const act = b.dataset.act, id = b.dataset.id;
  if (!['deltask', 'delmoney', 'secdel', 'clearbought', 'seldel'].includes(act)) S.armed = null;
  if (act === 'selmode') { S.sel = S.sel ? null : new Set(); S.open.clear(); S.menu = null; }
  else if (act === 'pick') { if (S.sel) S.sel.has(id) ? S.sel.delete(id) : S.sel.add(id); }
  else if (act === 'selall') { root.querySelectorAll('button[data-act="pick"]').forEach(x => S.sel.add(x.dataset.id)); }
  else if (act === 'selnone') S.sel.clear();
  else if (act === 'seldel') {
    if (S.armed === 'seldel') { S.armed = null; const col = S.tab === 'money' ? 'money' : 'tasks', src = S[KEYS[col]];
      const ids = [...S.sel].filter(x => src[x]); ids.forEach(x => { delete src[x]; remove(col, x); }); S.sel = null; toast('Изтрити: ' + ids.length); }
    else if (S.sel.size) S.armed = 'seldel';
  } else
  if (act === 'tab') { S.sel = null; S.tab = b.dataset.v; S.menu = null; try { localStorage.setItem('zad-tab', S.tab); } catch (err) {} window.scrollTo(0, 0); }
  else if (act === 'hday') { toast(b.dataset.n); }
  else if (act === 'view') { S.view = b.dataset.v; S.menu = null; try { localStorage.setItem('zad-view', S.view); } catch (err) {} }
  else if (act === 'jump') { S.view = 'agenda'; S.filter = 'open'; S.q = ''; render(); const map = { over: 'overdue', today: 'today', week: 'upcoming', nodate: 'nodate' };
    const el = document.getElementById('sec-' + map[b.dataset.v]); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  else if (act === 'filter') S.filter = b.dataset.v;
  else if (act === 'yearly') { const t = S.tasks[id]; if (t && !S.readOnly) { const on = !!b.dataset.v;
    if (on) setT(id, { yearly: true, done: false, doneAt: '', due: t.due || addYear(today()) });
    else { const ls = taskLists(), p = { yearly: false }; if (!S.lists[t.list] && ls.length) p.list = ls[0][0]; setT(id, p); } } }
  else if (act === 'qadate') { S.qa.due = b.dataset.v; if (!S.qa.due) S.qa.time = ''; }
  else if (act === 'qaprio') S.qa.prio = S.qa.prio === 'high' ? 'normal' : 'high';
  else if (act === 'toggle') { S.open.has(id) ? S.open.delete(id) : S.open.add(id); }
  else if (act === 'shopedit') { S.shopEdit = !S.shopEdit; }
  else if (act === 'shopchip') {
    if (S.shopEdit) { const was = S.open.has(id); shopEntries().forEach(([x]) => S.open.delete(x)); if (!was) S.open.add(id); }
    else if (!S.readOnly) { const t = S.tasks[id]; if (t) setT(id, { done: !t.done, doneAt: !t.done ? new Date().toISOString() : '' }); }
  }
  else if (act === 'clearbought') {
    if (S.armed === 'clr') { S.armed = null; const del = shopEntries().filter(([, t]) => t.done); del.forEach(([tid]) => { delete S.tasks[tid]; remove('tasks', tid); }); toast('Изтрити: ' + del.length); }
    else S.armed = 'clr';
  }
  else if (act === 'vday') {
    const d = b.dataset.d;
    if (d < today()) { /* past days are read-only */ }
    else if (S.leave[d]) { delete S.leave[d]; remove('vacation', d); toast('Махната отпуска: ' + fmtDateLong(d)); }
    else { create('vacation', d, { date: d, created: new Date().toISOString() }); toast('Отпуска: ' + fmtDateLong(d)); }
  }
  else if (act === 'moremonths') S.extraMonths++;
  else if (act === 'setdue') setT(id, b.dataset.v ? { due: b.dataset.v } : { due: '', time: '' });
  else if (act === 'prio') setT(id, { priority: b.dataset.v });
  else if (act === 'dir') { setM(id, { dir: b.dataset.v }); render(); }
  else if (act === 'adddir') { (S.addDir = S.addDir || {})[id] = b.dataset.v; render(); const a = document.getElementById('am-' + id); if (a) a.focus(); }
  else if (act === 'deltask' || act === 'delmoney') {
    const k = (act === 'deltask' ? 't:' : 'm:') + id;
    if (S.armed === k) { S.armed = null; S.open.delete(id); if (act === 'deltask') { const n = S.tasks[id].title; delete S.tasks[id]; remove('tasks', id); toast('Изтрито: ' + n); } else { const n = S.money[id].title; delete S.money[id]; remove('money', id); toast('Изтрито: ' + n); } }
    else S.armed = k;
  }
  else if (act === 'menu') S.menu = S.menu === id ? null : id;
  else if (act === 'move') {
    const k = b.dataset.k, arr = k === 'l' ? listsSorted() : groupsSorted(), set = k === 'l' ? setL : setG;
    const i = arr.findIndex(x => x[0] === id), j = i + Number(b.dataset.d);
    if (j >= 0 && j < arr.length) arr.forEach(([xid, x], n) => { const o = n === i ? j : n === j ? i : n; if (x.order !== o) set(xid, { order: o }); });
  }
  else if (act === 'secdel') {
    const k = b.dataset.k;
    if (S.armed === k + 'del:' + id) {
      S.armed = null; S.menu = null;
      if (k === 'l') { Object.entries(S.tasks).filter(([, t]) => t.list === id).forEach(([tid]) => { delete S.tasks[tid]; remove('tasks', tid); }); const n = S.lists[id].name; delete S.lists[id]; remove('lists', id); toast('Изтрит списък: ' + n); }
      else { Object.entries(S.money).filter(([, m]) => m.group === id).forEach(([mid]) => { delete S.money[mid]; remove('money', mid); }); const n = S.groups[id].name; delete S.groups[id]; remove('mgroups', id); toast('Изтрита група: ' + n); }
    } else S.armed = k + 'del:' + id;
  }
  render();
});
root.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.act === 'done' && t.checked && S.tasks[t.dataset.id] && S.tasks[t.dataset.id].yearly) {
    const id = t.dataset.id, x = S.tasks[id], tk = today(); let nd = addYear(x.due || tk); while (nd <= tk) nd = addYear(nd);
    setT(id, { due: nd, lastDone: tk, done: false, doneAt: '' }); toast(`Подновено: ${x.title}. Следващ срок ${fmtFull(nd)}`); render(); return;
  }
  if (t.dataset.act === 'done') { setT(t.dataset.id, { done: t.checked, doneAt: t.checked ? new Date().toISOString() : '' }); if (t.checked) toast('Готово: ' + S.tasks[t.dataset.id].title); render(); return; }
  if (t.dataset.act === 'settled') { setM(t.dataset.id, { settled: t.checked }); render(); return; }
  if (t.dataset.shoplist) { S.shopList = t.value; return; }
  if (t.dataset.yr) { S.yrDue = t.value; return; }
  if (t.dataset.qa) { S.qa[t.dataset.qa] = t.value; if (t.dataset.qa === 'time' && t.value && !S.qa.due) S.qa.due = today(); schedule(); return; }
  if (t.dataset.tid && S.tasks[t.dataset.tid]) {
    const id = t.dataset.tid, k = t.dataset.f; let v = t.value;
    if (k === 'title') { v = v.trim(); if (!v) { t.value = S.tasks[id].title; return; } } else if (k !== 'list') v = v.trim();
    const p = { [k]: v }; if (k === 'time' && v && !S.tasks[id].due) p.due = today(); if (k === 'due' && !v) p.time = '';
    setT(id, p); if (k === 'list' || k === 'due') render(); else schedule(); return;
  }
  if (t.dataset.mid && S.money[t.dataset.mid]) {
    const id = t.dataset.mid, k = t.dataset.f; let v = t.value;
    if (k === 'amount') v = parseNum(v) ?? 0; else if (k === 'title') { v = v.trim(); if (!v) { t.value = S.money[id].title; return; } } else if (k !== 'group') v = v.trim();
    setM(id, { [k]: v }); if (k === 'group') render(); else schedule(); return;
  }
  if (t.dataset.sec) { const v = t.value.trim(), id = t.dataset.sid, set = t.dataset.sec === 'l' ? setL : setG, o = t.dataset.sec === 'l' ? S.lists[id] : S.groups[id];
    if (!o) return; if (t.dataset.sf === 'name' && !v) { t.value = o.name; return; } set(id, { [t.dataset.sf]: v }); schedule(); }
});
root.addEventListener('input', e => { if (e.target.id === 'search') { S.q = e.target.value.trim().toLowerCase(); const pos = e.target.selectionStart; render(); const s = document.getElementById('search'); s.focus(); try { s.setSelectionRange(pos, pos); } catch (err) {} } });

/* ----- drag & drop of shopping chips (pointer events; mouse: move 6px, touch: long-press 350ms) ----- */
(function () {
  let D = null;
  const clear = () => { document.querySelectorAll('.dropt,.insb,.inse').forEach(e => e.classList.remove('dropt', 'insb', 'inse')); };
  const cancel = () => { if (!D) return; clearTimeout(D.timer); if (D.ghost) D.ghost.remove(); if (D.el) D.el.classList.remove('dragging'); document.body.classList.remove('dragmode'); clear(); D = null; };
  const target = (x, y) => {
    const card = (document.elementFromPoint(x, y) || document.body).closest('.shopcard'); clear(); if (!card) return null;
    card.classList.add('dropt');
    const list = card.querySelector('.sc-list'); let before = null;
    if (list) {
      const chips = [...list.querySelectorAll('.sc')].filter(c => c !== D.el);
      for (const c of chips) { const r = c.getBoundingClientRect(); if (y < r.top || (y <= r.bottom && x < r.left + r.width / 2)) { if (y < r.bottom) { before = c; break; } } }
      if (before) before.classList.add('insb'); else if (chips.length) list.classList.add('inse');
    }
    return { card, before };
  };
  const start = () => {
    D.on = true; const r = D.el.getBoundingClientRect();
    D.ghost = D.el.cloneNode(true); D.ghost.className = 'sc dragghost'; D.ghost.style.width = r.width + 'px'; D.ghost.style.left = r.left + 'px'; D.ghost.style.top = r.top + 'px';
    D.ox = D.x - r.left; D.oy = D.y - r.top; document.body.appendChild(D.ghost); D.el.classList.add('dragging'); document.body.classList.add('dragmode');
    try { D.el.setPointerCapture(D.pid); } catch (e) {}
    if (navigator.vibrate) try { navigator.vibrate(15); } catch (e) {}
    move();
  };
  const move = () => { D.ghost.style.left = (D.x - D.ox) + 'px'; D.ghost.style.top = (D.y - D.oy) + 'px'; D.t = target(D.x, D.y); };
  root.addEventListener('pointerdown', e => {
    const el = e.target.closest && e.target.closest('.sc'); if (!el || S.readOnly || S.sel || D || (e.pointerType === 'mouse' && e.button !== 0)) return;
    D = { el, id: el.dataset.id, pid: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, touch: e.pointerType !== 'mouse', on: false };
    if (D.touch) D.timer = setTimeout(() => { if (D && !D.on) start(); }, 350);
  });
  window.addEventListener('pointermove', e => {
    if (!D || e.pointerId !== D.pid) return; D.x = e.clientX; D.y = e.clientY;
    if (!D.on) { if (Math.hypot(D.x - D.sx, D.y - D.sy) > (D.touch ? 10 : 6)) { if (D.touch) cancel(); else start(); } return; }
    e.preventDefault(); move();
  });
  window.addEventListener('touchmove', e => { if (D && D.on && e.cancelable) e.preventDefault(); }, { passive: false });
  window.addEventListener('contextmenu', e => { if (D && (D.on || D.touch)) e.preventDefault(); });
  window.addEventListener('pointerup', e => {
    if (!D || e.pointerId !== D.pid) return;
    if (!D.on) { cancel(); return; }
    const t = D.t, id = D.id; cancel(); window.__noclick = Date.now();
    if (!t) return; const lid = t.card.dataset.lid, task = S.tasks[id]; if (!task || !lid) return;
    const ids = [...t.card.querySelectorAll('.sc')].map(c => c.dataset.id).filter(x => x !== id);
    const at = t.before ? ids.indexOf(t.before.dataset.id) : ids.length; ids.splice(at < 0 ? ids.length : at, 0, id);
    ids.forEach((x, i) => { const o = S.tasks[x]; if (!o) return; const p = {}; if (x === id && o.list !== lid) p.list = lid; if (x === id || o.order !== i * 10) p.order = i * 10; if (Object.keys(p).length && (x === id || o.order !== p.order)) setT(x, p); });
    render();
  });
  window.addEventListener('pointercancel', e => { if (D && e.pointerId === D.pid) cancel(); });
  root.addEventListener('click', e => { if (window.__noclick && Date.now() - window.__noclick < 400) { e.stopImmediatePropagation(); e.preventDefault(); window.__noclick = 0; } }, true);
})();
root.addEventListener('submit', e => {
  e.preventDefault(); if (S.readOnly) return;
  const f = e.target, input = f.querySelector('input'), name = input.value.trim(); if (!name) return;
  const act = f.dataset.act;
  if (act === 'quickadd') {
    if (!S.qa.list) { toast('Първо добави списък в изгледа „По списъци“.'); return; }
    newTask(name, S.qa.list, { due: S.qa.due, time: S.qa.due ? S.qa.time : '', priority: S.qa.prio });
    toast('Добавено' + (S.qa.due ? ' за ' + fmtDate(S.qa.due).toLowerCase() : ''));
    S.qa.prio = 'normal'; render(); const again = document.getElementById('qa-title'); if (again) again.focus();
  } else if (act === 'addyear') {
    const due = (document.getElementById('yr-due') || {}).value || S.yrDue;
    if (!due) { toast('Сложи срок, до кога трябва да е готово.'); return; }
    newTask(name, '', { due, yearly: true }); S.yrDue = ''; toast('Добавено до ' + fmtFull(due));
    render(); const again = document.getElementById('yr-title'); if (again) again.focus();
  } else if (act === 'addtask') {
    newTask(name, f.dataset.list, {}); render(); const again = document.getElementById('add-' + f.dataset.list); if (again) again.focus();
  } else if (act === 'addshop') {
    const lid = (document.getElementById('shop-list') || {}).value || S.shopList, where = (document.getElementById('shop-where').value || '').trim();
    if (!lid) { toast('Първо добави група за покупки.'); return; }
    const have = new Set(shopEntries().filter(([, t]) => !t.done).map(([, t]) => t.title.toLowerCase()));
    const parts = name.split(/[,\n;]+/).map(x => x.trim()).filter(Boolean); let n = 0, dup = 0;
    parts.forEach(p => { if (have.has(p.toLowerCase())) { dup++; return; } have.add(p.toLowerCase()); newTask(p, lid, { where }); n++; });
    S.shopList = lid; toast(n ? 'Добавено: ' + n + (dup ? ' (повторения пропуснати: ' + dup + ')' : '') : 'Вече е в списъка.');
    render(); const again = document.getElementById('shop-name'); if (again) again.focus();
  } else if (act === 'addshopgroup') {
    const id = uid('l'); create('lists', id, { name, kind: 'shop', order: Math.max(-1, ...Object.values(S.lists).map(x => x.order ?? 0)) + 1 }); render();
  } else if (act === 'addlist') {
    const id = uid('l'); create('lists', id, { name, order: Math.max(-1, ...Object.values(S.lists).map(x => x.order ?? 0)) + 1 }); render();
  } else if (act === 'addgroup') {
    const id = uid('g'); create('mgroups', id, { name, note: '', order: Math.max(-1, ...Object.values(S.groups).map(x => x.order ?? 0)) + 1 }); render();
  } else if (act === 'addmoney') {
    const gid = f.dataset.group, amt = parseNum(f.querySelector('.amt-in').value) ?? 0, id = uid('m'), who = ((document.getElementById('amw-' + gid) || {}).value || '').trim();
    const sib = Object.values(S.money).filter(m => m.group === gid);
    create('money', id, { title: name, amount: amt, dir: (S.addDir && S.addDir[gid]) || 'get', who, group: gid, settled: false, notes: '', order: Math.max(-1, ...sib.map(m => m.order ?? 0)) + 1 });
    render(); const again = document.getElementById('am-' + gid); if (again) again.focus();
  }
});
setInterval(() => { if (ready() && !typing()) render(); }, 60000);

/* ---------- data ---------- */
(async () => {
  db = window.claude && window.claude.use ? await window.claude.use('db') : null;
  if (!db) { S.noDb = true; render(); return; }
  const fail = e => { if (e && e.code === 'revoked') { S.noDb = true; render(); } };
  Object.keys(KEYS).forEach(col => db.collection(col).onSnapshot(s => {
    const m = {}; s.docs.forEach(d => m[d.id] = Object.assign({}, d.data()));
    Object.keys(LOCAL[col]).forEach(id => { if (!m[id]) m[id] = LOCAL[col][id]; });   // keep items still being saved
    S[KEYS[col]] = m; S.got[col] = 1; schedule();
  }, fail));
})();

/* day tooltip: hover (mouse) / long-press (touch); tap still toggles vacation */
(function () {
  const tip = document.createElement('div'); tip.id = 'daytip'; document.body.appendChild(tip);
  let timer = 0, swallow = false, hideT = 0;
  const hide = () => { tip.style.display = 'none'; clearTimeout(hideT); };
  function show(b) {
    const k = b.dataset.d, rows = [];
    if (HOL[k]) rows.push('<div class="th">' + esc(HOL[k][0]) + '</div>');
    if (S.leave[k] && !HOL[k] && k >= today()) rows.push('<div class="th">отпуска</div>');
    (TIPS[k] || []).forEach(x => rows.push('<div>• ' + esc(x) + '</div>'));
    if (!rows.length) return hide();
    tip.innerHTML = rows.join(''); tip.style.display = 'block';
    const r = b.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    let x = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    let y = r.top - h - 8; if (y < 8) y = r.bottom + 8;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  const dayOf = e => e.target.closest && e.target.closest('.day[data-tip]');
  document.addEventListener('mouseover', e => { if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return; const b = dayOf(e); if (b) show(b); });
  document.addEventListener('mouseout', e => { if (dayOf(e)) hide(); });
  document.addEventListener('touchstart', e => {
    swallow = false; const b = dayOf(e); clearTimeout(timer); if (!b) return hide();
    timer = setTimeout(() => { swallow = true; show(b); hideT = setTimeout(hide, 3500); }, 450);
  }, { passive: true });
  ['touchend', 'touchmove', 'touchcancel'].forEach(n => document.addEventListener(n, () => clearTimeout(timer), { passive: true }));
  document.addEventListener('contextmenu', e => { if (dayOf(e) && swallow) e.preventDefault(); });
  document.addEventListener('click', e => { if (swallow) { swallow = false; if (dayOf(e)) { e.stopPropagation(); e.preventDefault(); } } }, true);
  document.addEventListener('scroll', hide, true);
})();
