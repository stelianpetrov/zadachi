/* Login and Supabase data layer for the separate Work app. Uses its own table (work_docs) and its own sign-in, apart from the personal pages. */
(function () {
  const st = document.createElement('style'); st.textContent = 'body.locked .wrap.app-wrap { display: none }\nbody:not(.locked) #gate { display: none }\n#gate { max-width: 420px; margin: 8vh auto 0; display: grid; gap: 14px }\n#gate form { display: grid; gap: 12px }\n#gate .msg { font-size: .9rem; color: var(--muted); margin: 0 }\n#gate .msg.err { color: var(--danger) }\n#gate .linkbtn { border: 0; background: none; padding: 0; color: var(--accent); font-weight: 500; text-align: left }\n.acct { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; font-size: .88rem; color: var(--muted) }' + '\n.appnav { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 15; display: flex; gap: 6px; justify-content: center; padding: 0; background: var(--bg) }\nbody.offline .appnav { padding: 8px 0 }\n.appnav a { text-decoration: none; color: var(--muted); font-weight: 500; padding: 7px 14px; border-radius: 99px; border: 1px solid var(--line); background: var(--surface); font-size: .92rem }\n.appnav a[aria-current="page"] { background: var(--accent); border-color: var(--accent); color: var(--on-accent) }\nbody.locked .appnav { display: none }\n.appnav { flex-wrap: wrap }\n.appnav::after { content: "Offline: showing the last saved data"; display: none; flex-basis: 100%; text-align: center; font-size: .8rem; color: var(--wait) }\nbody.offline .appnav::after { display: block }\n'; document.head.appendChild(st);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) addEventListener('load', () => { const had = !!navigator.serviceWorker.controller; let done = false; navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !done) { done = true; location.reload(); } }); navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' }).then(r => r.update()).catch(() => {}); });
  document.body.insertAdjacentHTML('afterbegin', '<div class="appnav" aria-live="polite"></div>');
  document.body.insertAdjacentHTML('beforeend', '<div id="gate" class="card" aria-live="polite">\n  <h2>Sign in</h2>\n  <div id="gate-body"><p class="msg">Loading…</p></div>\n</div>');
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
  const sb = window.supabase.createClient(ZAD_CONFIG.url, ZAD_CONFIG.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'rabota-auth' } });
  window.zadSb = sb;
  const TABLE = 'work_docs';
  const cache = {}, subs = {}, loaded = {};
  let resolveDb, started = false, recovering = false;
  const dbReady = new Promise(r => resolveDb = r);
  const clone = v => JSON.parse(JSON.stringify(v));
  const snap = col => ({ docs: Object.entries(cache[col] || {}).map(([id, d]) => ({ id, data: () => clone(d) })) });
  // last good copy of each collection on this device, so the lists still open without a connection
  const keep = col => { try { localStorage.setItem('rab-cache-' + col, JSON.stringify(cache[col] || {})); } catch (e) {} };
  const kept = col => { try { return JSON.parse(localStorage.getItem('rab-cache-' + col)); } catch (e) { return null; } };
  const emit = col => { if (loaded[col]) { keep(col); (subs[col] || []).forEach(fn => fn(snap(col))); } };
  const offline = on => document.body.classList.toggle('offline', !!on);
  const fail = (e) => { const err = new Error(e && e.message || 'error'); err.code = e && /JWT|permission|policy|auth/i.test(e.message || '') ? 'not_granted' : 'unavailable'; return err; };

  async function loadCol(col) {
    const { data, error } = await sb.from(TABLE).select('id,data').eq('col', col).limit(10000);
    if (error) {
      const old = !loaded[col] && kept(col);
      if (old && (!navigator.onLine || /fetch|network/i.test(error.message || ''))) { cache[col] = old; loaded[col] = true; offline(true); (subs[col] || []).forEach(fn => fn(snap(col))); return; }
      throw fail(error);
    }
    cache[col] = {}; data.forEach(r => cache[col][r.id] = r.data); loaded[col] = true; offline(false); emit(col);
  }
  const db = {
    collection: col => ({
      doc: id => ({
        set: async data => {
          const { error } = await sb.from(TABLE).upsert({ col, id, data: clone(data), updated_at: new Date().toISOString() });
          if (error) throw fail(error);
          (cache[col] = cache[col] || {})[id] = clone(data); emit(col);
        },
        update: async p => {
          const cur = cache[col] && cache[col][id]; if (!cur) throw { code: 'not_found' };
          const next = Object.assign(clone(cur), clone(p));
          Object.keys(next).forEach(k => { if (next[k] && next[k].__delete__) delete next[k]; });
          const { error } = await sb.from(TABLE).update({ data: next, updated_at: new Date().toISOString() }).eq('col', col).eq('id', id);
          if (error) throw fail(error);
          cache[col][id] = next; emit(col);
        },
        delete: async () => {
          const { error } = await sb.from(TABLE).delete().eq('col', col).eq('id', id);
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
    sb.channel('work-live').on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, ev => {
      const row = ev.eventType === 'DELETE' ? ev.old : ev.new; if (!row || !row.col) return;
      const col = row.col; cache[col] = cache[col] || {};
      if (ev.eventType === 'DELETE') delete cache[col][row.id]; else cache[col][row.id] = row.data;
      emit(col);
    }).subscribe();
    // catch up after the phone was asleep or offline
    const catchUp = () => Object.keys(subs).forEach(c => loadCol(c).catch(() => {}));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) catchUp(); });
    addEventListener('online', catchUp);
    addEventListener('offline', () => offline(true));
  }

  /* ----- login screens ----- */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const allowed = email => ZAD_CONFIG.allowed.includes(String(email || '').toLowerCase());
  const redirect = location.origin + location.pathname;
  function screen(kind, msg, err) {
    document.body.classList.add('locked');
    const m = msg ? `<p class="msg${err ? ' err' : ''}">${esc(msg)}</p>` : '';
    if (kind === 'login') gateBody.innerHTML = `<form id="f-login">
        <label class="f">Email<input id="g-email" type="email" autocomplete="username" autocapitalize="off" spellcheck="false" required></label>
        <label class="f">Password<input id="g-pass" type="password" autocomplete="current-password" required></label>
        ${m}<button class="btn primary" type="submit">Sign in</button>
        <button class="linkbtn" type="button" id="g-first">First sign-in or forgot your password?</button></form>`;
    else if (kind === 'link') gateBody.innerHTML = `<form id="f-link">
        <p class="msg">Enter your email and you will get a sign-in link. After that you will set a password.</p>
        <label class="f">Email<input id="g-email2" type="email" autocomplete="username" autocapitalize="off" spellcheck="false" required></label>
        ${m}<button class="btn primary" type="submit">Send link</button>
        <button class="linkbtn" type="button" id="g-back">Back to sign in</button></form>`;
    else if (kind === 'setpw') gateBody.innerHTML = `<form id="f-pw">
        <p class="msg">Create a password. You will use it to sign in on any device.</p>
        <label class="f">New password (at least 8 characters)<input id="g-p1" type="password" minlength="8" autocomplete="new-password" required></label>
        <label class="f">Repeat the password<input id="g-p2" type="password" minlength="8" autocomplete="new-password" required></label>
        ${m}<button class="btn primary" type="submit">Save password</button></form>`;
    else if (kind === 'denied') gateBody.innerHTML = `<p class="msg err">${esc(msg)}</p><button class="btn" id="g-out">Sign out</button>`;
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
        if (error) screen('login', 'Wrong email or password. If this is your first sign-in, use the link below.', true);
      } else if (f.id === 'f-link') {
        const email = f.querySelector('#g-email2').value.trim().toLowerCase();
        if (!allowed(email)) { screen('link', 'This email has no access to the app.', true); return; }
        const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirect } });
        let why = '';
        if (error) { const m = String(error.message || ''); why = /rate|limit|seconds/i.test(m) ? 'Too many emails were sent in a short time. Try again in about an hour or ask Stelian to set a temporary password for you.' : /signup|not allowed|not found|user/i.test(m) ? 'This email has no account yet. Stelian needs to add it in Supabase.' : 'Could not send the link (' + m + ').'; }
        screen('link', error ? why : 'Sent a link to ' + email + '. Open it on this device.', !!error);
      } else if (f.id === 'f-pw') {
        const p1 = f.querySelector('#g-p1').value, p2 = f.querySelector('#g-p2').value;
        if (p1 !== p2) { screen('setpw', 'The two passwords do not match.', true); return; }
        const { error } = await sb.auth.updateUser({ password: p1, data: { pw_set: true } });
        if (error) { screen('setpw', 'Password not saved: ' + error.message, true); return; }
        recovering = false; const { data } = await sb.auth.getSession(); enter(data.session);
      }
    } finally { if (document.body.contains(btn)) btn.disabled = false; }
  });

  function enter(session) {
    if (!session) { screen('login'); return; }
    const u = session.user, email = (u.email || '').toLowerCase();
    if (!allowed(email)) { screen('denied', 'The account ' + email + ' has no access to this app.'); return; }
    if (recovering || !(u.user_metadata && u.user_metadata.pw_set)) { screen('setpw'); return; }
    document.body.classList.remove('locked');
    const who = document.getElementById('acct-email'); if (who) who.textContent = email;
    if (!started) { started = true; live(); resolveDb(db); }
  }
  sb.auth.onAuthStateChange((ev, session) => {
    if (ev === 'PASSWORD_RECOVERY') recovering = true;
    if (ev === 'SIGNED_OUT') { try { Object.keys(localStorage).filter(k => k.startsWith('rab-cache-')).forEach(k => localStorage.removeItem(k)); } catch (e) {} location.reload(); return; }
    if (ev === 'INITIAL_SESSION' || ev === 'SIGNED_IN' || ev === 'PASSWORD_RECOVERY') setTimeout(() => enter(session), 0);
  });
  if (/error_description=/.test(location.hash)) { const p = new URLSearchParams(location.hash.slice(1)); history.replaceState(null, '', redirect); setTimeout(() => screen('link', 'The link has expired or was already used. Request a new one.', true), 0); }

  /* ----- backup ----- */
  window.zadBackup = {
    async exportFile() {
      const { data, error } = await sb.from(TABLE).select('col,id,data').limit(100000); if (error) return;
      const out = {}; data.forEach(r => (out[r.col] = out[r.col] || {})[r.id] = r.data);
      const blob = new Blob([JSON.stringify({ app: 'rabota', exported: new Date().toISOString(), data: out }, null, 1)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'rabota-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    },
    async importFile(file) {
      const note = document.getElementById('backup-msg');
      try {
        const j = JSON.parse(await file.text()), d = j && j.data; if (!d || typeof d !== 'object') throw 0;
        const rows = []; Object.entries(d).forEach(([col, docs]) => Object.entries(docs || {}).forEach(([id, data]) => rows.push({ col, id, data })));
        for (let i = 0; i < rows.length; i += 200) { const { error } = await sb.from(TABLE).upsert(rows.slice(i, i + 200)); if (error) throw error; }
        await Promise.all(Object.keys(subs).map(c => loadCol(c)));
        note.textContent = 'Loaded ' + rows.length + ' records.';
      } catch (e) { note.textContent = 'The file could not be loaded. Check that it is a backup from this app.'; }
    }
  };
})();
