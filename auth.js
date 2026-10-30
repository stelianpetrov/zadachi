/* Shared login, navigation and Supabase data layer for every page of the site. */
(function () {
  const st = document.createElement('style'); st.textContent = 'body.locked .wrap.app-wrap { display: none }\nbody:not(.locked) #gate { display: none }\n#gate { max-width: 420px; margin: 8vh auto 0; display: grid; gap: 14px }\n#gate form { display: grid; gap: 12px }\n#gate .msg { font-size: .9rem; color: var(--muted); margin: 0 }\n#gate .msg.err { color: var(--danger) }\n#gate .linkbtn { border: 0; background: none; padding: 0; color: var(--accent); font-weight: 500; text-align: left }\n.acct { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; font-size: .88rem; color: var(--muted) }' + '\n.appnav { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 15; display: flex; gap: 6px; justify-content: center; padding: 8px 0; background: var(--bg) }\n.appnav a { text-decoration: none; color: var(--muted); font-weight: 500; padding: 7px 14px; border-radius: 99px; border: 1px solid var(--line); background: var(--surface); font-size: .92rem }\n.appnav a[aria-current="page"] { background: var(--accent); border-color: var(--accent); color: var(--on-accent) }\nbody.locked .appnav { display: none }\n'; document.head.appendChild(st);
  const ZAD_PAGE = (location.pathname.split('/').pop() || 'index.html');
  const pages = [['index.html', 'Задачи'], ['bebe.html', 'Покупки за бебка']];
  document.body.insertAdjacentHTML('afterbegin', '<nav class="appnav" aria-label="Раздели">' + pages.map(([h, l]) => '<a href="' + h + '"' + (ZAD_PAGE === h ? ' aria-current="page"' : '') + '>' + l + '</a>').join('') + '</nav>');
  document.body.insertAdjacentHTML('beforeend', '<div id="gate" class="card" aria-live="polite">\n  <h2>Задачи и <em style="color:var(--accent);font-weight:500">напомняния</em></h2>\n  <div id="gate-body"><p class="msg">Зареждане…</p></div>\n</div>');
})();
/* ===== Settings: fill these two from Supabase → Project Settings → Data API ===== */
const ZAD_CONFIG = {
  url: 'https://dhydrtoxydaqxdvprjlp.supabase.co',
  key: 'sb_publishable_nHF554DM_yLGw96BkUmmiw_IK-_rKhL',
  allowed: ['desinikolaevakoleva@gmail.com', 'stelian0660@outlook.com']
};

/* Shared data layer: replaces the claude.ai database with Supabase (login required, live sync). */
(function () {
  document.body.classList.add('locked');
  const gateBody = document.getElementById('gate-body');
  const sb = window.supabase.createClient(ZAD_CONFIG.url, ZAD_CONFIG.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  window.zadSb = sb;
  const cache = {}, subs = {}, loaded = {};
  let resolveDb, started = false, recovering = false;
  const dbReady = new Promise(r => resolveDb = r);
  const clone = v => JSON.parse(JSON.stringify(v));
  const snap = col => ({ docs: Object.entries(cache[col] || {}).map(([id, d]) => ({ id, data: () => clone(d) })) });
  const emit = col => { if (loaded[col]) (subs[col] || []).forEach(fn => fn(snap(col))); };
  const fail = (e) => { const err = new Error(e && e.message || 'error'); err.code = e && /JWT|permission|policy|auth/i.test(e.message || '') ? 'not_granted' : 'unavailable'; return err; };

  async function loadCol(col) {
    const { data, error } = await sb.from('docs').select('id,data').eq('col', col).limit(10000);
    if (error) throw fail(error);
    cache[col] = {}; data.forEach(r => cache[col][r.id] = r.data); loaded[col] = true; emit(col);
  }
  const db = {
    collection: col => ({
      doc: id => ({
        set: async data => {
          const { error } = await sb.from('docs').upsert({ col, id, data: clone(data), updated_at: new Date().toISOString() });
          if (error) throw fail(error);
          (cache[col] = cache[col] || {})[id] = clone(data); emit(col);
        },
        update: async p => {
          const cur = cache[col] && cache[col][id]; if (!cur) throw { code: 'not_found' };
          const next = Object.assign(clone(cur), clone(p));
          Object.keys(next).forEach(k => { if (next[k] && next[k].__delete__) delete next[k]; });
          const { error } = await sb.from('docs').update({ data: next, updated_at: new Date().toISOString() }).eq('col', col).eq('id', id);
          if (error) throw fail(error);
          cache[col][id] = next; emit(col);
        },
        delete: async () => {
          const { error } = await sb.from('docs').delete().eq('col', col).eq('id', id);
          if (error) throw fail(error);
          if (cache[col]) delete cache[col][id]; emit(col);
        }
      }),
      onSnapshot: (fn, onErr) => {
        (subs[col] = subs[col] || []).push(fn);
        if (loaded[col]) fn(snap(col)); else loadCol(col).catch(e => onErr && onErr(e));
        return () => {};
      }
    })
  };
  db.doc = path => {
    const [col, id] = path.split('/'), ref = db.collection(col).doc(id);
    ref.onSnapshot = (fn, onErr) => {
      const wrap = s => { const d = s.docs.find(x => x.id === id); fn({ id, exists: !!d, data: () => d ? d.data() : undefined }); };
      return db.collection(col).onSnapshot(wrap, onErr);
    };
    return ref;
  };
  window.claude = { use: async name => name === 'db' ? dbReady : null };

  function live() {
    sb.channel('docs-live').on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, ev => {
      const row = ev.eventType === 'DELETE' ? ev.old : ev.new; if (!row || !row.col) return;
      const col = row.col; cache[col] = cache[col] || {};
      if (ev.eventType === 'DELETE') delete cache[col][row.id]; else cache[col][row.id] = row.data;
      emit(col);
    }).subscribe();
    // catch up after the phone was asleep or offline
    document.addEventListener('visibilitychange', () => { if (!document.hidden) Object.keys(subs).forEach(c => loadCol(c).catch(() => {})); });
  }

  /* ----- login screens ----- */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const allowed = email => ZAD_CONFIG.allowed.includes(String(email || '').toLowerCase());
  const redirect = location.origin + location.pathname;
  function screen(kind, msg, err) {
    document.body.classList.add('locked');
    const m = msg ? `<p class="msg${err ? ' err' : ''}">${esc(msg)}</p>` : '';
    if (kind === 'login') gateBody.innerHTML = `<form id="f-login">
        <label class="f">Имейл<input id="g-email" type="email" autocomplete="username" required></label>
        <label class="f">Парола<input id="g-pass" type="password" autocomplete="current-password" required></label>
        ${m}<button class="btn primary" type="submit">Вход</button>
        <button class="linkbtn" type="button" id="g-first">Първо влизане или забравена парола?</button></form>`;
    else if (kind === 'link') gateBody.innerHTML = `<form id="f-link">
        <p class="msg">Въведи имейла си и ще получиш линк за вход. След него ще си създадеш парола.</p>
        <label class="f">Имейл<input id="g-email2" type="email" autocomplete="username" required></label>
        ${m}<button class="btn primary" type="submit">Изпрати линк</button>
        <button class="linkbtn" type="button" id="g-back">Назад към входа</button></form>`;
    else if (kind === 'setpw') gateBody.innerHTML = `<form id="f-pw">
        <p class="msg">Създай си парола. С нея ще влизаш от всяко устройство.</p>
        <label class="f">Нова парола (поне 8 знака)<input id="g-p1" type="password" minlength="8" autocomplete="new-password" required></label>
        <label class="f">Повтори паролата<input id="g-p2" type="password" minlength="8" autocomplete="new-password" required></label>
        ${m}<button class="btn primary" type="submit">Запази паролата</button></form>`;
    else if (kind === 'denied') gateBody.innerHTML = `<p class="msg err">${esc(msg)}</p><button class="btn" id="g-out">Изход</button>`;
    else gateBody.innerHTML = m;
  }
  gateBody.addEventListener('click', e => {
    if (e.target.id === 'g-first') screen('link');
    if (e.target.id === 'g-back') screen('login');
    if (e.target.id === 'g-out') sb.auth.signOut();
  });
  gateBody.addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target, btn = f.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      if (f.id === 'f-login') {
        const email = f.querySelector('#g-email').value.trim().toLowerCase();
        const { error } = await sb.auth.signInWithPassword({ email, password: f.querySelector('#g-pass').value });
        if (error) screen('login', 'Грешен имейл или парола. Ако влизаш за първи път, използвай линка отдолу.', true);
      } else if (f.id === 'f-link') {
        const email = f.querySelector('#g-email2').value.trim().toLowerCase();
        if (!allowed(email)) { screen('link', 'Този имейл няма достъп до приложението.', true); return; }
        const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirect } });
        let why = '';
        if (error) { const m = String(error.message || ''); why = /rate|limit|seconds/i.test(m) ? 'Изпратени са твърде много имейли за кратко. Опитай пак след около час или помоли Стелиан да ти зададе временна парола.' : /signup|not allowed|not found|user/i.test(m) ? 'Този имейл още няма профил. Стелиан трябва да го добави в Supabase.' : 'Не успях да изпратя линка (' + m + ').'; }
        screen('link', error ? why : 'Изпратих линк на ' + email + '. Отвори го от това устройство.', !!error);
      } else if (f.id === 'f-pw') {
        const p1 = f.querySelector('#g-p1').value, p2 = f.querySelector('#g-p2').value;
        if (p1 !== p2) { screen('setpw', 'Двете пароли не съвпадат.', true); return; }
        const { error } = await sb.auth.updateUser({ password: p1, data: { pw_set: true } });
        if (error) { screen('setpw', 'Паролата не се запази: ' + error.message, true); return; }
        recovering = false; const { data } = await sb.auth.getSession(); enter(data.session);
      }
    } finally { if (document.body.contains(btn)) btn.disabled = false; }
  });

  function enter(session) {
    if (!session) { screen('login'); return; }
    const u = session.user, email = (u.email || '').toLowerCase();
    if (!allowed(email)) { screen('denied', 'Профилът ' + email + ' няма достъп до това приложение.'); return; }
    if (recovering || !(u.user_metadata && u.user_metadata.pw_set)) { screen('setpw'); return; }
    document.body.classList.remove('locked');
    const who = document.getElementById('acct-email'); if (who) who.textContent = email;
    if (!started) { started = true; live(); resolveDb(db); }
  }
  sb.auth.onAuthStateChange((ev, session) => {
    if (ev === 'PASSWORD_RECOVERY') recovering = true;
    if (ev === 'SIGNED_OUT') { location.reload(); return; }
    if (ev === 'INITIAL_SESSION' || ev === 'SIGNED_IN' || ev === 'PASSWORD_RECOVERY') setTimeout(() => enter(session), 0);
  });
  if (/error_description=/.test(location.hash)) { const p = new URLSearchParams(location.hash.slice(1)); history.replaceState(null, '', redirect); setTimeout(() => screen('link', 'Линкът е изтекъл или вече е използван. Поискай нов.', true), 0); }

  /* ----- backup ----- */
  window.zadBackup = {
    async exportFile() {
      const { data, error } = await sb.from('docs').select('col,id,data').limit(100000); if (error) return;
      const out = {}; data.forEach(r => (out[r.col] = out[r.col] || {})[r.id] = r.data);
      const blob = new Blob([JSON.stringify({ app: 'zadachi', exported: new Date().toISOString(), data: out }, null, 1)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'zadachi-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    },
    async importFile(file) {
      const note = document.getElementById('backup-msg');
      try {
        const j = JSON.parse(await file.text()), d = j && j.data; if (!d || typeof d !== 'object') throw 0;
        const rows = []; Object.entries(d).forEach(([col, docs]) => Object.entries(docs || {}).forEach(([id, data]) => rows.push({ col, id, data })));
        for (let i = 0; i < rows.length; i += 200) { const { error } = await sb.from('docs').upsert(rows.slice(i, i + 200)); if (error) throw error; }
        await Promise.all(Object.keys(subs).map(c => loadCol(c)));
        note.textContent = 'Заредени ' + rows.length + ' записа.';
      } catch (e) { note.textContent = 'Файлът не се зареди. Провери, че е резервно копие от това приложение.'; }
    }
  };
})();
