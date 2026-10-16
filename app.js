/* Guess the Object: browser client.
 * The server (or the in-page demo) sends each player a personal view of the party;
 * this file only renders that view and sends the player's actions back. */
(function () {
  'use strict';

  const GTO = window.GTO;
  const DEMO = !!window.GTO_DEMO;

  /* ---------- helpers ---------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
  };

  /* ---------- networking: real server over WebSocket ---------- */
  function createWsNet() {
    const L = { state: [], gone: [], status: [] };
    let ws = null, ready = false, nextId = 1, retry = 0;
    const pending = new Map();
    let session = null;
    try { session = JSON.parse(store.get('gto-session') || 'null'); } catch (e) { session = null; }
    const saveSession = (s) => { session = s; store.set('gto-session', s ? JSON.stringify(s) : null); };

    function request(ev, data) {
      return new Promise((res, rej) => {
        if (!ready) return rej(new Error('Not connected yet. Try again in a moment.'));
        const id = nextId++;
        pending.set(id, { res, rej });
        ws.send(JSON.stringify({ id, ev, data }));
        setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('No response from the server. Try again.')); } }, 10000);
      });
    }

    function connect() {
      ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
      ws.onopen = () => {
        ready = true; retry = 0;
        L.status.forEach((f) => f(true));
        if (session) {
          request('resume', session).catch((e) => { saveSession(null); L.gone.forEach((f) => f(e.message)); });
        }
      };
      ws.onmessage = (ev) => {
        let m;
        try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.re) {
          const p = pending.get(m.re);
          if (p) { pending.delete(m.re); if (m.ok) p.res(m); else p.rej(new Error(m.error || 'Something went wrong.')); }
        } else if (m.ev === 'state') L.state.forEach((f) => f(m.data));
        else if (m.ev === 'gone') { saveSession(null); L.gone.forEach((f) => f(m.data)); }
      };
      ws.onclose = () => {
        ready = false;
        pending.forEach((p) => p.rej(new Error('Connection lost. Try again.')));
        pending.clear();
        L.status.forEach((f) => f(false));
        setTimeout(connect, Math.min(5000, 400 * Math.pow(2, retry++)));
      };
    }
    connect();

    return {
      hasSession: () => !!session,
      async create(name) { const r = await request('create', { name }); saveSession({ code: r.code, token: r.token }); return r; },
      async join(code, name) { const r = await request('join', { code, name }); saveSession({ code: r.code, token: r.token }); return r; },
      act: (type, data) => request('act', { type, data }),
      leave() { saveSession(null); },
      onState: (f) => L.state.push(f), onGone: (f) => L.gone.push(f), onStatus: (f) => L.status.push(f),
    };
  }

  const net = DEMO ? window.createLocalNet() : createWsNet();

  /* ---------- app state ---------- */
  let S = null;              // latest view for this player
  let offset = 0;            // server clock minus local clock
  let offline = false;
  const ui = { revealed: false, filter: 'all', confirmEnd: false, drafts: {}, homeError: '', busy: false };

  const nameOf = (id) => { const p = S && S.players.find((x) => x.id === id); return p ? p.name : '?'; };
  const hue = (id) => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const avatar = (p) => '<span class="av" style="--h:' + hue(p.id) + '">' + esc(p.name.slice(0, 1).toUpperCase()) + '</span>';
  const CATS = Object.keys(GTO.LISTS).map((k) => ({ key: k, name: GTO.LISTS[k].name, count: GTO.LISTS[k].items.length }));
  const PROMPTS = {
    food: 'Is it sweet?', animal: 'Does it live in water?', country: 'Is it in Europe?',
    videogame: 'Can you play it with friends?', movie: 'Is it animated?', custom: 'Can you hold it in your hand?',
  };

  /* ---------- toasts ---------- */
  function toast(msg, kind) {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast' + (kind === 'err' ? ' err' : '');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => el.remove(), 3400);
  }

  /* ---------- keyed areas: only rebuild what changed, never under a focused input ---------- */
  const cache = new Map();
  let deferred = false;
  function setArea(id, html, key) {
    const el = document.getElementById(id);
    if (!el) return;
    key = key == null ? html : key;
    const prev = cache.get(id);
    if (prev && prev.html === html) return;
    const a = document.activeElement;
    if (prev && prev.key === key && a && el.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName)) { deferred = true; return; }
    cache.set(id, { html, key });
    el.innerHTML = html;
    $$('[data-draft]', el).forEach((f) => { const v = ui.drafts[f.dataset.draft]; if (v != null) f.value = v; });
  }
  document.addEventListener('focusout', () => { if (deferred) { deferred = false; setTimeout(render, 0); } });

  /* ---------- screens ---------- */
  const SHELL = {
    home: `
      <div class="stack">
        <section class="hero">
          <h1>Guess the <span class="redact" tabindex="0">object</span></h1>
          <p>Some players secretly hold an object. Everyone else works out what it is, one question at a time.</p>
        </section>
        <ul class="how">
          <li class="k"><b>Knowers</b><span>Get a secret object and answer questions however they like.</span></li>
          <li class="g"><b>Guessers</b><span>Take turns asking one question each. Nobody asks twice before everyone has asked.</span></li>
          <li class="e"><b>Scoring</b><span>At the end everyone guesses every object. A right guess is 1 point. A knower gets 1 point if anyone got theirs.</span></li>
        </ul>
        <div class="card stack">
          <label class="field"><span class="label">Your name</span>
            <input id="h-name" class="input" maxlength="16" autocomplete="nickname" placeholder="Your name"></label>
          <button class="btn block" data-act="create">${DEMO ? 'Start a demo party' : 'Create a party'}</button>
          ${DEMO ? '<p class="muted small">Four bot players join you, so you can try every screen on your own.</p>' : `
          <div class="or">or join one</div>
          <input id="h-code" class="input codeinput" maxlength="4" placeholder="CODE" autocapitalize="characters" autocomplete="off" data-submit="join" aria-label="Party code">
          <button class="btn soft block" data-act="join">Join party</button>`}
          <div class="err" id="h-err" role="alert"></div>
        </div>
      </div>`,
    lobby: '<div class="stack"><div id="lb-code"></div><div id="lb-players"></div><div id="lb-settings"></div><div id="lb-start"></div></div>',
    playing: '<div class="stack"><div id="pl-status"></div><div id="pl-role"></div><div id="pl-turn"></div><div id="pl-ctl"></div><div id="pl-feed"></div></div>',
    guessing: '<div class="stack"><div id="gs-head"></div><div id="gs-role"></div><div id="gs-form"></div><div id="gs-feed"></div></div>',
    results: '<div class="stack" id="rs"></div>',
  };

  function renderTop() {
    const right = S
      ? `<div class="row"><button class="codechip" data-act="copyCode" title="Copy party code" aria-label="Party code ${esc(S.code)}">${esc(S.code)}</button><button class="btn ghost sm" data-act="leave">Leave</button></div>`
      : (DEMO ? '<span class="tag demo">Preview</span>' : (offline ? '<span class="tag">Reconnecting</span>' : ''));
    setArea('top', `<span class="brand"><i></i>Guess the Object</span>${right}${S && DEMO ? '' : ''}`);
  }

  function render() {
    renderTop();
    const main = $('#main');
    const screen = S ? S.phase : 'home';
    if (main.dataset.screen !== screen) {
      main.dataset.screen = screen;
      main.innerHTML = SHELL[screen];
      cache.forEach((_, k) => { if (k !== 'top') cache.delete(k); });
      if (screen === 'home') {
        const nm = $('#h-name'); nm.value = store.get('gto-name') || '';
        const q = new URLSearchParams(location.search).get('code');
        const c = $('#h-code'); if (c && q) c.value = q.toUpperCase().slice(0, 4);
        const err = $('#h-err'); if (err) err.textContent = ui.homeError;
      }
      window.scrollTo(0, 0);
    }
    if (!S) return;
    ({ lobby: renderLobby, playing: renderPlaying, guessing: renderGuessing, results: renderResults })[S.phase]();
  }

  /* ----- lobby ----- */
  function renderLobby() {
    const host = S.you.isHost;
    setArea('lb-code', `
      <div class="card stack" style="text-align:center">
        <span class="label">Party code</span>
        <div class="bigcode">${esc(S.code)}</div>
        ${DEMO ? '<p class="muted small">Demo party: Nora, Sam, Lea and Omar are bots who play for themselves.</p>'
          : '<div><button class="btn soft sm" data-act="copyLink">Copy invite link</button></div>'}
      </div>`);

    setArea('lb-players', `
      <div class="card">
        <div class="row between"><h3>Players</h3><span class="label">${S.players.length} in party</span></div>
        <div>${S.players.map((p) => `
          <div class="person${p.connected ? '' : ' off'}">${avatar(p)}
            <span class="nm grow">${esc(p.name)}</span>
            ${p.id === S.you.id ? '<span class="pill">You</span>' : ''}
            ${p.bot ? '<span class="pill">Bot</span>' : ''}
            ${p.id === S.hostId ? '<span class="pill host">Host</span>' : ''}
            ${p.wins ? `<span class="pill good">${p.wins} win${p.wins > 1 ? 's' : ''}</span>` : ''}
            ${host && p.id !== S.you.id ? `<button class="x" data-act="kick" data-id="${esc(p.id)}" aria-label="Remove ${esc(p.name)}">×</button>` : ''}
          </div>`).join('')}</div>
      </div>`);

    const s = S.settings;
    const max = S.maxKnowers;
    const knowers = Math.min(s.knowers, max);
    const catName = s.category === 'custom' ? (s.customName || 'Custom list') : GTO.LISTS[s.category].name;
    if (host) {
      const chips = CATS.map((c) => `<button class="chip" data-act="setCategory" data-v="${c.key}" aria-pressed="${s.category === c.key}">${esc(c.name)}<small>${c.count}</small></button>`).join('')
        + `<button class="chip" data-act="setCategory" data-v="custom" aria-pressed="${s.category === 'custom'}">Custom list</button>`;
      const custom = s.category === 'custom' ? `
        <div class="stack" style="gap:10px">
          <input id="c-name" class="input" data-custom="name" maxlength="24" placeholder="List name, e.g. Kitchen items" value="${esc(s.customName)}" aria-label="Custom list name">
          <textarea id="c-text" class="input" data-custom="text" rows="5" placeholder="One item per line. Add aliases with | (Pokémon|pokemon)" aria-label="Custom list items">${esc(s.customText || '')}</textarea>
          <span class="small muted">${s.customCount} item${s.customCount === 1 ? '' : 's'}. Needs at least ${knowers + 1}.</span>
        </div>` : '';
      const len = s.endMode === 'rounds'
        ? stepper('rounds', s.rounds, 1, 50, 1, 'rounds')
        : stepper('minutes', s.minutes, 5, 120, 5, 'minutes');
      setArea('lb-settings', `
        <div class="card">
          <div class="setting"><span class="label">Category</span><div class="chips">${chips}</div>${custom}</div>
          <div class="setting"><span class="label">Knowers</span>
            <div class="row">${stepper('knowers', knowers, 1, max, 1, knowers === 1 ? 'knower' : 'knowers')}</div>
            <span class="small muted">At most half the players (${max} with ${S.players.length} in the party).</span></div>
          <div class="setting"><span class="label">Game ends after</span>
            <div class="seg" role="group" aria-label="Game length">
              <button data-act="endMode" data-v="rounds" aria-pressed="${s.endMode === 'rounds'}">Rounds</button>
              <button data-act="endMode" data-v="time" aria-pressed="${s.endMode === 'time'}">Total time</button>
            </div>
            <div class="row">${len}</div>
            <span class="small muted">${s.endMode === 'rounds' ? 'No time limit. The game ends after the last round.' : 'Any number of rounds. The round in progress finishes when time is up.'}</span></div>
        </div>`, 'host-' + s.category + s.endMode);
    } else {
      setArea('lb-settings', `
        <div class="card">
          <h3>Game settings</h3>
          <div class="sumline"><span class="muted">Category</span><b>${esc(catName)}</b></div>
          <div class="sumline"><span class="muted">Knowers</span><b>${knowers}</b></div>
          <div class="sumline"><span class="muted">Game ends after</span><b>${s.endMode === 'rounds' ? s.rounds + ' rounds' : s.minutes + ' minutes'}</b></div>
        </div>`);
    }

    setArea('lb-start', host ? `
        <button class="btn block" data-act="start" ${S.players.length < 2 ? 'disabled' : ''}>Start game</button>
        ${S.players.length < 2 ? '<p class="muted small" style="text-align:center;margin-top:8px">Share the code. You need at least 2 players.</p>' : ''}`
      : `<div class="card wait">${dots()}<span>Waiting for ${esc(nameOf(S.hostId))} to start the game</span></div>`);
  }

  function stepper(field, value, min, max, step, unit) {
    return `<div class="stepper" role="group" aria-label="${esc(field)}">
      <button data-act="step" data-f="${field}" data-d="${-step}" data-min="${min}" data-max="${max}" ${value <= min ? 'disabled' : ''} aria-label="Decrease">−</button>
      <output>${value}</output>
      <button data-act="step" data-f="${field}" data-d="${step}" data-min="${min}" data-max="${max}" ${value >= max ? 'disabled' : ''} aria-label="Increase">+</button>
    </div><span class="muted">${unit}</span>`;
  }
  const dots = () => '<span class="dots"><i></i><i></i><i></i></span>';

  /* ----- shared bits for playing / guessing ----- */
  function roleHtml() {
    const g = S.game;
    if (S.you.isKnower) {
      const word = g.myObject == null ? '' : g.myObject;
      return `<div class="role k">
        <span class="label">You are a knower</span>
        <div class="secret">${ui.revealed ? `<span class="word">${esc(word)}</span>` : '<span class="bar" style="width:62%"></span>'}</div>
        <div class="row">
          <button class="btn ghost sm" data-act="toggleReveal">${ui.revealed ? 'Hide object' : 'Show object'}</button>
          ${S.phase === 'playing' ? '<button class="btn ghost sm" data-act="reroll">Reroll object</button>' : ''}
        </div>
        <p class="small" style="margin-top:10px">Only you can see this. Answer questions however you like.${S.phase === 'playing' ? ' Rerolling tells everyone.' : ''}</p>
      </div>`;
    }
    const names = g.knowers.map((k) => `<span class="pill k">${esc(nameOf(k.id))}${k.rerolls ? ' · rerolled ' + k.rerolls + '×' : ''}</span>`).join(' ');
    return `<div class="role g">
      <span class="label">You are a guesser</span>
      <p style="margin:8px 0 10px;font-weight:600">Question the knowers and work out what each one is holding.</p>
      <div class="row">${names}</div>
    </div>`;
  }

  function feedHtml(title) {
    const g = S.game;
    const entries = g.log.filter((e) => ui.filter === 'all' || e.knowerId === ui.filter).slice().reverse();
    const chips = g.knowers.length > 1 ? `<div class="chips">
        <button class="chip" data-act="filter" data-v="all" aria-pressed="${ui.filter === 'all'}">Everyone</button>
        ${g.knowers.map((k) => `<button class="chip" data-act="filter" data-v="${esc(k.id)}" aria-pressed="${ui.filter === k.id}">${esc(nameOf(k.id))}</button>`).join('')}
      </div>` : '';
    const body = entries.length ? entries.map((e) => {
      if (e.type === 'reroll') return `<div class="note">${esc(nameOf(e.knowerId))} rerolled their object</div>`;
      if (e.type === 'skip') return `<div class="note">${esc(nameOf(e.guesserId))}'s question to ${esc(nameOf(e.knowerId))} was skipped</div>`;
      return `<div class="qa">
        <div class="meta"><span>Round ${e.round}</span><span>${esc(nameOf(e.guesserId))} → ${esc(nameOf(e.knowerId))}</span></div>
        <div class="line q"><b>Q</b><span>${esc(e.q)}</span></div>
        <div class="line a"><b>A</b><span>${e.a ? esc(e.a) : '<span class="pending">waiting for an answer…</span>'}</span></div>
      </div>`;
    }).join('') : '<div class="empty">No questions yet. The first one shows up here.</div>';
    return `<div class="stack" style="gap:10px"><div class="row between"><h3>${title}</h3><span class="label">${g.log.filter((e) => e.type === 'qa').length} asked</span></div>${chips}<div class="log">${body}</div></div>`;
  }

  /* ----- playing ----- */
  function renderPlaying() {
    const g = S.game;
    const prog = g.totalRounds ? `Round ${g.round} of ${g.totalRounds}` : `Round ${g.round}`;
    setArea('pl-status', `
      <div class="status">
        <span class="cat"><span class="label">Category</span>${esc(g.categoryName)}</span>
        <span class="row" style="gap:12px"><span class="mono small">${prog}</span>${g.endsAt ? `<span class="clock mono" data-timer="${g.endsAt}"></span>` : ''}</span>
      </div>`);
    setArea('pl-role', roleHtml());

    const gn = esc(nameOf(g.guesserId)), kn = esc(nameOf(g.knowerId));
    const iAmG = S.you.id === g.guesserId, iAmK = S.you.id === g.knowerId;
    const open = g.log.slice().reverse().find((e) => e.type === 'qa' && e.a == null);
    const head = `<div class="who"><span class="g">${gn}</span><span class="mid">asks</span><span class="k">${kn}</span></div>`;
    const wait = (t) => `<div class="wait">${dots()}<span>${t}</span></div>`;
    let body;
    if (g.awaiting === 'question') {
      body = iAmG
        ? `<label class="field"><span class="label">Your one question for ${kn}</span>
            <textarea id="q-in" class="input" data-draft="q" data-submit="ask" maxlength="200" rows="2" placeholder="e.g. ${esc(PROMPTS[g.categoryKey] || PROMPTS.custom)}"></textarea></label>
           <button class="btn block" data-act="ask">Ask ${kn}</button>`
        : wait(`${gn} is thinking of a question for ${kn}`);
    } else {
      const quote = open ? `<div class="quote">${esc(open.q)}</div>` : '';
      body = quote + (iAmK
        ? `<label class="field"><span class="label">Your answer</span>
            <textarea id="a-in" class="input" data-draft="a" data-submit="answer" maxlength="200" rows="2" placeholder="Answer however you like"></textarea></label>
           <button class="btn block" data-act="answer">Send answer</button>`
        : wait(`${kn} is answering`));
    }
    setArea('pl-turn', `<div class="card turn">${head}${body}</div>`, g.round + g.awaiting + g.guesserId + g.knowerId + (open ? open.id : ''));

    setArea('pl-ctl', S.you.isHost ? `
      <div class="row">
        <button class="btn ghost sm" data-act="skip">Skip turn</button>
        <button class="btn ${ui.confirmEnd ? 'danger' : 'ghost'} sm" data-act="endNow">${ui.confirmEnd ? 'Tap again to go to guessing' : 'End game and guess'}</button>
      </div>` : '');
    setArea('pl-feed', feedHtml('Questions so far'));
  }

  /* ----- guessing ----- */
  function renderGuessing() {
    const g = S.game;
    const done = g.submitted.length, total = g.guesserCount;
    setArea('gs-head', `
      <div class="card stack" style="gap:10px">
        <span class="label">${esc(g.categoryName)}</span>
        <h2 style="font-size:1.9rem;line-height:1.05">Time to guess</h2>
        <p class="muted">Every guesser types one guess for each knower's object.</p>
        <div class="meter" aria-hidden="true"><i style="width:${total ? Math.round(done / total * 100) : 0}%"></i></div>
        <span class="small muted">${done} of ${total} guessers locked in</span>
      </div>`);
    setArea('gs-role', S.you.isKnower ? roleHtml() : '');

    let form;
    if (S.you.isKnower) {
      form = `<div class="card wait">${dots()}<span>The guessers are locking in their answers</span></div>`;
    } else if (g.mySubmitted) {
      form = `<div class="card"><div class="lock">Locked in. Waiting for the others.</div></div>`;
    } else {
      form = `<div class="card stack">
        ${g.knowers.map((k) => `<label class="gfield"><span>What is ${esc(nameOf(k.id))} holding?</span>
          <input id="guess-${esc(k.id)}" class="input" data-gk="${esc(k.id)}" data-draft="guess-${esc(k.id)}" data-submit="guess" maxlength="60" autocomplete="off" autocapitalize="words" placeholder="Your guess"></label>`).join('')}
        <button class="btn block" data-act="guess">Lock in my guesses</button>
        <span class="small muted">You can leave one blank. Spelling can be loose.</span>
      </div>`;
    }
    if (S.you.isHost) form += `<div style="margin-top:12px"><button class="btn ghost sm" data-act="reveal">Reveal results now</button></div>`;
    setArea('gs-form', form, 'form-' + g.mySubmitted + S.you.isKnower);
    setArea('gs-feed', feedHtml('What was asked'));
  }

  /* ----- results ----- */
  function renderResults() {
    const r = S.results, g = S.game;
    const winners = r.winners.map((id) => esc(nameOf(id)));
    const banner = `<div class="winner">
      <span class="label">${winners.length > 1 ? 'Tie for the win' : winners.length ? 'Winner' : 'Game over'}</span>
      <h2>${winners.length ? winners.join(' &amp; ') : 'No points scored'}</h2></div>`;
    const reveal = r.objects.map((o) => {
      const chips = r.rows.map((row) => {
        const c = row.byKnower[o.knowerId];
        const nm = esc(nameOf(row.playerId));
        if (!c.text) return `<span class="gv no"><em>${nm}</em> no guess</span>`;
        return `<span class="gv ${c.correct ? 'ok' : 'no'}"><em>${nm}</em> ${c.correct ? '✓ ' : ''}${esc(c.text)}</span>`;
      }).join('');
      return `<div class="obj"><span class="label">${o.knowerId === S.you.id ? 'Your' : esc(nameOf(o.knowerId)) + "'s"} object</span><h3>${esc(o.name)}</h3><div class="guesses">${chips}</div></div>`;
    }).join('');
    const ranked = S.players.slice().sort((a, b) => b.score - a.score);
    const board = ranked.map((p, i) => `
      <div class="rank${r.winners.includes(p.id) ? ' win' : ''}">
        <span class="n">${i + 1}</span>
        <span class="row" style="gap:8px;min-width:0">${avatar(p)}<span class="nm">${esc(p.name)}${p.id === S.you.id ? ' (you)' : ''}</span>${p.isKnower ? '<span class="pill k">Knower</span>' : ''}${p.wins ? `<span class="wins">${p.wins} win${p.wins > 1 ? 's' : ''}</span>` : ''}</span>
        <span class="gain">${r.gained[p.id] ? '+' + r.gained[p.id] : ''}</span>
        <span class="pts">${p.score}</span>
      </div>`).join('');
    const more = S.you.isHost
      ? '<button class="btn block" data-act="again">Play again</button>'
      : `<div class="card wait">${dots()}<span>Waiting for ${esc(nameOf(S.hostId))} to start another game</span></div>`;
    setArea('rs', `${banner}<div class="reveal">${reveal}</div>
      <div class="card"><div class="row between"><h3>Scores</h3><span class="label">Points</span></div>${board}</div>
      ${more}
      <details class="card flat"><summary style="cursor:pointer;font-weight:700">Full transcript (${g.log.filter((e) => e.type === 'qa').length} questions)</summary><div style="margin-top:12px">${feedHtml('Questions').replace(/<div class="chips">[\s\S]*?<\/div>/, '')}</div></details>`);
  }

  /* ---------- timer ---------- */
  setInterval(() => {
    $$('[data-timer]').forEach((el) => {
      const left = Number(el.dataset.timer) - (Date.now() + offset);
      if (left <= 0) { el.textContent = "Time's up · last round"; el.classList.add('up'); return; }
      const s = Math.ceil(left / 1000);
      el.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + ' left';
      el.classList.remove('up');
    });
  }, 500);

  /* ---------- actions ---------- */
  async function doAct(type, data) {
    try { await net.act(type, data); return true; }
    catch (e) { toast(e.message, 'err'); return false; }
  }
  let customTimer = null;

  const handlers = {
    async create() {
      const name = $('#h-name').value.trim();
      store.set('gto-name', name);
      try { await net.create(name); } catch (e) { homeErr(e.message); }
    },
    async join() {
      const name = $('#h-name').value.trim();
      store.set('gto-name', name);
      try { await net.join($('#h-code').value.trim().toUpperCase(), name); } catch (e) { homeErr(e.message); }
    },
    copyCode() { copy(S.code, 'Party code copied'); },
    copyLink() { copy(location.origin + location.pathname + '?code=' + S.code, 'Invite link copied'); },
    leave() { net.leave(); S = null; ui.homeError = ''; location.reload(); },
    kick(el) { doAct('kick', { id: el.dataset.id }); },
    setCategory(el) { doAct('setSettings', { category: el.dataset.v }); },
    endMode(el) { doAct('setSettings', { endMode: el.dataset.v }); },
    step(el) {
      const cur = S.settings[el.dataset.f];
      const base = el.dataset.f === 'knowers' ? Math.min(cur, S.maxKnowers) : cur;
      const v = Math.max(Number(el.dataset.min), Math.min(Number(el.dataset.max), base + Number(el.dataset.d)));
      doAct('setSettings', { [el.dataset.f]: v });
    },
    start() { doAct('start'); },
    async ask() {
      const text = (ui.drafts.q || '').trim();
      if (!text) { toast('Type a question first.', 'err'); return; }
      if (await doAct('ask', { text })) delete ui.drafts.q;
    },
    async answer() {
      const text = (ui.drafts.a || '').trim();
      if (!text) { toast('Type an answer first.', 'err'); return; }
      if (await doAct('answer', { text })) delete ui.drafts.a;
    },
    async reroll() {
      if (await doAct('reroll')) toast('Rerolled. Everyone has been told.');
    },
    toggleReveal() { ui.revealed = !ui.revealed; render(); },
    skip() { doAct('skip'); },
    endNow() {
      if (!ui.confirmEnd) { ui.confirmEnd = true; render(); setTimeout(() => { ui.confirmEnd = false; render(); }, 4000); return; }
      ui.confirmEnd = false; doAct('endNow');
    },
    filter(el) { ui.filter = el.dataset.v; render(); },
    guess() {
      const guesses = {};
      $$('[data-gk]').forEach((i) => { guesses[i.dataset.gk] = i.value; });
      doAct('guess', { guesses });
    },
    reveal() { doAct('reveal'); },
    again() { ui.revealed = false; doAct('playAgain'); },
  };

  function homeErr(msg) { ui.homeError = msg; const e = $('#h-err'); if (e) e.textContent = msg; }
  function copy(text, okMsg) {
    const fail = () => toast('Share this code: ' + S.code);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast(okMsg), fail);
    else fail();
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const h = handlers[el.dataset.act];
    if (h) h(el, e);
  });
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset && el.dataset.draft) ui.drafts[el.dataset.draft] = el.value;
    if (el.dataset && el.dataset.custom) {
      clearTimeout(customTimer);
      customTimer = setTimeout(() => {
        const n = $('#c-name'), t = $('#c-text');
        if (n && t) doAct('setSettings', { custom: { name: n.value, text: t.value } });
      }, 450);
    }
  });
  document.addEventListener('keydown', (e) => {
    const el = e.target;
    if (e.key === 'Enter' && !e.shiftKey && el.dataset && el.dataset.submit) {
      e.preventDefault();
      const btn = $('[data-act="' + el.dataset.submit + '"]');
      if (btn) btn.click();
    }
  });

  /* ---------- state from the server ---------- */
  net.onState((v) => {
    const prev = S;
    S = v;
    offset = v.serverNow - Date.now();
    if (prev && prev.phase !== v.phase) {
      ui.drafts = {}; ui.confirmEnd = false; ui.filter = 'all';
      if (v.phase === 'guessing') toast('Time to guess!');
    }
    if (prev && prev.game && v.game) {
      if (prev.game.round !== v.game.round) { delete ui.drafts.q; delete ui.drafts.a; }
      const lastSeen = prev.game.log.length ? prev.game.log[prev.game.log.length - 1].id : 0;
      v.game.log.filter((e) => e.id > lastSeen && e.type === 'reroll' && e.knowerId !== v.you.id)
        .forEach((e) => toast(nameOf(e.knowerId) + ' rerolled their object'));
      if (v.phase === 'playing') {
        const g = v.game, pg = prev.game;
        if (g.awaiting === 'question' && g.guesserId === v.you.id && !(pg.round === g.round && pg.awaiting === 'question' && pg.guesserId === v.you.id)) {
          toast('Your turn: ask ' + nameOf(g.knowerId) + ' one question');
        }
        if (g.awaiting === 'answer' && g.knowerId === v.you.id && pg.awaiting !== 'answer') toast(nameOf(g.guesserId) + ' asked you a question');
      }
    }
    if (!prev && v.phase === 'lobby') ui.revealed = false;
    render();
  });
  net.onGone((msg) => { S = null; ui.homeError = msg || 'You left the party.'; render(); });
  if (net.onStatus) net.onStatus((up) => { offline = !up; renderTop(); });

  render();
})();
