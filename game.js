/* Game engine. Pure logic, no networking.
   One Party holds everything about a session. The server calls its methods and
   sends each player the result of view(playerId), which never contains an
   object that player isn't allowed to see. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./public/words.js'));
  else root.GameEngine = factory(root.GameWords);
})(typeof self !== 'undefined' ? self : this, function (Words) {
  'use strict';

  const GRACE_MS = 60000; // in time mode, a round in progress may overrun the clock by this much
  const MAX_PLAYERS = 40;

  function userError(message) {
    const e = new Error(message);
    e.user = true;
    return e;
  }

  function shuffle(arr, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ---- loose answer matching -------------------------------------------------
  function norm(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/^(the|a|an) /, '')
      .replace(/\s+/g, ' ');
  }

  function lev(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  function tolerance(len) { return len <= 3 ? 0 : len <= 7 ? 1 : 2; }

  function matches(guess, target, extra) {
    const g = norm(guess);
    if (!g) return false;
    const gs = g.replace(/ /g, '');
    const candidates = [target].concat(extra || []).map(norm).filter(Boolean);
    for (const c of candidates) {
      const cs = c.replace(/ /g, '');
      if (g === c || gs === cs) return true;
      if (lev(gs, cs) <= tolerance(cs.length)) return true;
    }
    return false;
  }

  function cleanName(name) {
    return String(name == null ? '' : name).replace(/\s+/g, ' ').trim().slice(0, 16);
  }

  function cleanText(text, max) {
    return String(text == null ? '' : text).replace(/\s+/g, ' ').trim().slice(0, max);
  }

  // ---- the party -------------------------------------------------------------
  class Party {
    constructor(code, hostId, hostName, opts) {
      opts = opts || {};
      this.code = code;
      this.hostId = hostId;
      this.rnd = opts.rnd || Math.random;
      this.now = opts.now || Date.now;
      this.players = [];
      this.phase = 'lobby'; // lobby | playing | guessing | finished
      this.settings = { category: 'Food', knowers: 1, endMode: 'rounds', rounds: 8, minutes: 20, customList: [] };
      this.game = null;
      this.updated = this.now();
      this.addPlayer(hostId, hostName);
    }

    touch() { this.updated = this.now(); }
    get(id) { return this.players.find(p => p.id === id); }
    isKnower(id) { return !!(this.game && this.game.knowers.some(k => k.id === id)); }

    addPlayer(id, name) {
      const existing = this.get(id);
      if (existing) return existing;
      name = cleanName(name);
      if (!name) throw userError('Enter a name first.');
      if (this.phase !== 'lobby') throw userError('This game has already started.');
      if (this.players.length >= MAX_PLAYERS) throw userError('This party is full.');
      if (this.players.some(p => p.name.toLowerCase() === name.toLowerCase())) throw userError('That name is already taken in this party.');
      const p = { id, name, score: 0, wins: 0, connected: true };
      this.players.push(p);
      this.touch();
      return p;
    }

    setSettings(byId, s) {
      this.requireHost(byId);
      if (this.phase !== 'lobby') throw userError('Settings are locked once the game starts.');
      const cur = this.settings;
      if (s.category !== undefined) {
        if (s.category !== 'Custom' && !Words.categories.includes(s.category)) throw userError('Unknown category.');
        cur.category = s.category;
      }
      if (s.knowers !== undefined) cur.knowers = Math.max(1, Math.min(20, Math.floor(Number(s.knowers)) || 1));
      if (s.endMode !== undefined) {
        if (s.endMode !== 'rounds' && s.endMode !== 'time') throw userError('Unknown end mode.');
        cur.endMode = s.endMode;
      }
      if (s.rounds !== undefined) cur.rounds = Math.max(1, Math.min(99, Math.floor(Number(s.rounds)) || 1));
      if (s.minutes !== undefined) cur.minutes = Math.max(1, Math.min(180, Math.floor(Number(s.minutes)) || 1));
      if (s.customList !== undefined) {
        const seen = new Set();
        const out = [];
        for (const raw of [].concat(s.customList)) {
          const item = cleanText(raw, 40);
          const key = norm(item);
          if (item && !seen.has(key)) { seen.add(key); out.push(item); }
          if (out.length >= 200) break;
        }
        cur.customList = out;
      }
      this.touch();
    }

    maxKnowers() { return Math.max(1, Math.floor(this.players.length / 2)); }

    pool() {
      return this.settings.category === 'Custom' ? this.settings.customList : Words.lists[this.settings.category];
    }

    requireHost(id) {
      if (id !== this.hostId) throw userError('Only the host can do that.');
    }

    // ---- starting and rounds ----
    start(byId) {
      this.requireHost(byId);
      if (this.phase !== 'lobby') throw userError('The game has already started.');
      if (this.players.length < 2) throw userError('You need at least 2 players.');
      const k = Math.min(this.settings.knowers, this.maxKnowers());
      const pool = this.pool();
      if (pool.length < k) throw userError('The custom list needs at least ' + k + ' items (one per knower).');
      this.players.forEach(p => { p.score = 0; });
      const knowerPlayers = shuffle(this.players, this.rnd).slice(0, k);
      const objects = shuffle(pool, this.rnd).slice(0, k);
      const s = this.settings;
      this.game = {
        category: s.category === 'Custom' ? 'Custom list' : s.category,
        knowers: knowerPlayers.map((p, i) => ({ id: p.id, object: objects[i] })),
        guesserQueue: [],
        knowerQueue: [],
        lastGuesser: null,
        round: 0,
        roundsDone: 0,
        current: null,
        feed: [],
        endMode: s.endMode,
        roundsTotal: s.endMode === 'rounds' ? s.rounds : null,
        deadline: s.endMode === 'time' ? this.now() + s.minutes * 60000 : null,
        guesses: {},
        results: null
      };
      this.phase = 'playing';
      this.startRound();
      this.touch();
    }

    nextGuesser() {
      const g = this.game;
      const eligible = this.players.filter(p => p.connected && !this.isKnower(p.id));
      if (!eligible.length) return null;
      g.guesserQueue = g.guesserQueue.filter(id => eligible.some(p => p.id === id));
      if (!g.guesserQueue.length) {
        let order = shuffle(eligible, this.rnd).map(p => p.id);
        if (order.length > 1 && order[0] === g.lastGuesser) order.push(order.shift());
        g.guesserQueue = order;
      }
      g.lastGuesser = g.guesserQueue.shift();
      return g.lastGuesser;
    }

    nextKnower() {
      const g = this.game;
      let eligible = g.knowers.filter(k => this.get(k.id).connected);
      if (!eligible.length) eligible = g.knowers;
      g.knowerQueue = g.knowerQueue.filter(id => eligible.some(k => k.id === id));
      if (!g.knowerQueue.length) g.knowerQueue = shuffle(eligible, this.rnd).map(k => k.id);
      return g.knowerQueue.shift();
    }

    startRound() {
      const g = this.game;
      const guesserId = this.nextGuesser();
      if (!guesserId) { this.beginGuessing(); return; }
      g.round += 1;
      g.current = { guesserId, knowerId: this.nextKnower(), stage: 'ask', question: '' };
    }

    ended() {
      const g = this.game;
      return g.endMode === 'rounds' ? g.roundsDone >= g.roundsTotal : this.now() >= g.deadline;
    }

    afterTurn(counted) {
      const g = this.game;
      g.current = null;
      if (counted) g.roundsDone += 1;
      if (this.ended()) this.beginGuessing(); else this.startRound();
    }

    ask(pid, text) {
      const c = this.requireTurn('ask');
      if (pid !== c.guesserId) throw userError("It isn't your turn to ask.");
      text = cleanText(text, 200);
      if (!text) throw userError('Type a question first.');
      c.question = text;
      c.stage = 'answer';
      this.touch();
    }

    answer(pid, text) {
      const c = this.requireTurn('answer');
      if (pid !== c.knowerId) throw userError("You're not the one being asked.");
      text = cleanText(text, 200);
      if (!text) throw userError('Type an answer first.');
      this.game.feed.push({ type: 'qa', round: this.game.round, guesserId: c.guesserId, knowerId: c.knowerId, q: c.question, a: text });
      this.afterTurn(true);
      this.touch();
    }

    requireTurn(stage) {
      const c = this.phase === 'playing' && this.game.current;
      if (!c || c.stage !== stage) throw userError('That action is not available right now.');
      return c;
    }

    reroll(pid) {
      if (this.phase !== 'playing') throw userError('You can only draw a new object during play.');
      const k = this.game.knowers.find(x => x.id === pid);
      if (!k) throw userError('Only knowers can draw a new object.');
      const taken = new Set(this.game.knowers.map(x => x.object));
      const options = this.pool().filter(o => !taken.has(o));
      if (!options.length) throw userError('There are no other objects left in this list.');
      k.object = options[Math.floor(this.rnd() * options.length)];
      this.game.feed.push({ type: 'reroll', knowerId: pid });
      this.touch();
    }

    skipTurn(byId) {
      this.requireHost(byId);
      if (this.phase !== 'playing' || !this.game.current) throw userError('There is no turn to skip.');
      this.afterTurn(false);
      this.touch();
    }

    // ---- guessing and results ----
    beginGuessing() {
      this.phase = 'guessing';
      this.game.current = null;
      this.game.guesses = {};
      this.touch();
      this.maybeFinish();
    }

    endNow(byId) {
      this.requireHost(byId);
      if (this.phase === 'playing') this.beginGuessing();
      else if (this.phase === 'guessing') this.finish();
      else throw userError('Nothing to end right now.');
    }

    submitGuesses(pid, map) {
      if (this.phase !== 'guessing') throw userError('Guessing has not started.');
      if (!this.get(pid) || this.isKnower(pid)) throw userError('Knowers do not guess.');
      if (this.game.guesses[pid]) throw userError('You already locked in your guesses.');
      const entry = {};
      for (const k of this.game.knowers) entry[k.id] = cleanText(map && map[k.id], 60);
      this.game.guesses[pid] = entry;
      this.touch();
      this.maybeFinish();
    }

    maybeFinish() {
      if (this.phase !== 'guessing') return;
      const expected = this.players.filter(p => p.connected && !this.isKnower(p.id));
      if (expected.every(p => this.game.guesses[p.id])) this.finish();
    }

    finish() {
      const g = this.game;
      const perKnower = g.knowers.map(k => {
        const correct = [];
        for (const [gid, entry] of Object.entries(g.guesses)) {
          if (matches(entry[k.id], k.object, Words.aliasesFor(k.object))) correct.push(gid);
        }
        return { knowerId: k.id, object: k.object, correct };
      });
      for (const r of perKnower) {
        r.correct.forEach(gid => { this.get(gid).score += 1; });
        if (r.correct.length) this.get(r.knowerId).score += 1;
      }
      const top = Math.max(...this.players.map(p => p.score));
      const winners = top > 0 ? this.players.filter(p => p.score === top).map(p => p.id) : [];
      winners.forEach(id => { this.get(id).wins += 1; });
      g.results = { perKnower, winners, guesses: g.guesses };
      this.phase = 'finished';
      this.touch();
    }

    playAgain(byId) {
      this.requireHost(byId);
      if (this.phase !== 'finished') throw userError('The game is not finished yet.');
      this.players.forEach(p => { p.score = 0; });
      this.game = null;
      this.phase = 'lobby';
      this.touch();
    }

    // ---- time and connections ----
    tick() {
      if (this.phase !== 'playing') return false;
      const g = this.game;
      if (g.endMode === 'time' && this.now() >= g.deadline + GRACE_MS) {
        this.beginGuessing();
        return true;
      }
      return false;
    }

    setConnected(id, connected) {
      const p = this.get(id);
      if (!p) return;
      p.connected = connected;
      if (!connected && id === this.hostId) {
        const next = this.players.find(x => x.connected);
        if (next) this.hostId = next.id;
      }
      if (this.phase === 'playing' && !connected) {
        const c = this.game.current;
        if (c && c.stage === 'ask' && c.guesserId === id) this.afterTurn(false);
      }
      if (this.phase === 'guessing') this.maybeFinish();
      this.touch();
    }

    leave(id) {
      if (this.phase === 'lobby') {
        this.players = this.players.filter(p => p.id !== id);
        if (id === this.hostId && this.players.length) this.hostId = (this.players.find(p => p.connected) || this.players[0]).id;
        this.touch();
      } else {
        this.setConnected(id, false);
      }
    }

    // ---- what each player is allowed to see ----
    view(pid) {
      const g = this.game;
      const me = this.get(pid);
      const v = {
        code: this.code,
        phase: this.phase,
        me: pid,
        hostId: this.hostId,
        serverNow: this.now(),
        maxKnowers: this.maxKnowers(),
        settings: Object.assign({}, this.settings, { customList: this.settings.customList.slice() }),
        players: this.players.map(p => ({
          id: p.id, name: p.name, score: p.score, wins: p.wins, connected: p.connected,
          isKnower: this.isKnower(p.id)
        })),
        game: null
      };
      if (g) {
        const mine = g.knowers.find(k => k.id === pid);
        v.game = {
          category: g.category,
          knowerIds: g.knowers.map(k => k.id),
          round: g.round,
          roundsDone: g.roundsDone,
          roundsTotal: g.roundsTotal,
          endMode: g.endMode,
          deadline: g.deadline,
          current: g.current ? Object.assign({}, g.current) : null,
          feed: g.feed.slice(),
          myObject: mine ? mine.object : null,
          submitted: Object.keys(g.guesses),
          results: this.phase === 'finished' ? g.results : null
        };
      }
      v.isHost = !!me && pid === this.hostId;
      return v;
    }
  }

  return { Party, matches, norm, userError, GRACE_MS };
});
