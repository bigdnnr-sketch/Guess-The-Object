/* Guess the Object: game engine.
 * No dependencies. Runs in Node (the server) and in the browser (the demo).
 * The engine owns every rule; clients only send actions and render the view they are given.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GTO = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- Default lists ("Name|alias|alias" so guesses can be matched loosely) ---------- */
  const RAW = {
    food: ['Food', [
      'Pizza', 'Burger|hamburger|cheeseburger', 'Sushi', 'Pasta|spaghetti', 'Tacos|taco', 'French Fries|fries|chips',
      'Fried Chicken', 'Ice Cream', 'Chocolate', 'Pancakes|pancake', 'Bread', 'Cheese', 'Rice', 'Steak', 'Salad',
      'Sandwich', 'Hot Dog|hotdog', 'Donut|doughnut', 'Cake', 'Cookie|cookies', 'Soup', 'Omelette|omelet', 'Bacon',
      'Sausage', 'Popcorn', 'Apple', 'Banana', 'Orange', 'Strawberry', 'Watermelon', 'Grapes|grape', 'Pineapple',
      'Mango', 'Potato|potatoes', 'Tomato', 'Carrot', 'Onion', 'Mushroom', 'Couscous', 'Falafel', 'Kebab|kabab',
      'Lasagna|lasagne', 'Ramen', 'Curry', 'Dumplings|dumpling', 'Croissant', 'Waffles|waffle', 'Burrito',
      'Nachos|nacho', 'Yogurt|yoghurt']],
    animal: ['Animal', [
      'Dog|puppy', 'Cat|kitten', 'Horse', 'Cow', 'Pig', 'Sheep', 'Goat', 'Chicken', 'Duck', 'Rabbit|bunny', 'Lion',
      'Tiger', 'Elephant', 'Giraffe', 'Zebra', 'Monkey', 'Gorilla', 'Bear', 'Wolf', 'Fox', 'Deer', 'Camel',
      'Kangaroo', 'Koala', 'Panda', 'Hippo|hippopotamus', 'Rhino|rhinoceros', 'Crocodile|croc', 'Snake',
      'Turtle|tortoise', 'Frog', 'Lizard', 'Eagle', 'Owl', 'Parrot', 'Penguin', 'Flamingo', 'Dolphin', 'Whale',
      'Shark', 'Octopus', 'Jellyfish|jelly fish', 'Crab', 'Butterfly', 'Bee', 'Ant', 'Spider', 'Mouse|mice',
      'Squirrel', 'Bat']],
    country: ['Country', [
      'USA|united states|united states of america|us|america', 'Canada', 'Mexico', 'Brazil', 'Argentina', 'Colombia',
      'Peru', 'Chile', 'UK|united kingdom|britain|great britain|england', 'France', 'Germany', 'Italy', 'Spain',
      'Portugal', 'Netherlands|holland', 'Switzerland', 'Sweden', 'Norway', 'Greece', 'Turkey|turkiye', 'Russia',
      'Ukraine', 'Poland', 'Egypt', 'Morocco', 'Algeria', 'Tunisia', 'Nigeria', 'South Africa', 'Kenya', 'Ethiopia',
      'Saudi Arabia|ksa', 'UAE|united arab emirates|emirates', 'Iran', 'Iraq', 'Israel', 'India', 'Pakistan', 'China',
      'Japan', 'South Korea|korea', 'Thailand', 'Vietnam|viet nam', 'Indonesia', 'Philippines', 'Australia',
      'New Zealand', 'Cuba', 'Jamaica', 'Ireland']],
    videogame: ['Video Game', [
      'Minecraft', 'Fortnite', 'GTA V|gta 5|gta5|grand theft auto v|grand theft auto 5|grand theft auto|gta',
      'Super Mario Bros|mario|super mario|super mario bros.', 'The Legend of Zelda|zelda|legend of zelda',
      'Pokémon|pokemon', 'Tetris', 'Pac-Man|pacman|pac man', 'Call of Duty|cod', 'FIFA|ea fc|fc 24',
      'Roblox', 'Among Us', 'The Sims|sims', 'Red Dead Redemption 2|rdr2|red dead 2|red dead redemption|red dead',
      'The Witcher 3|witcher 3|witcher|the witcher 3 wild hunt', 'Skyrim|elder scrolls v skyrim|elder scrolls',
      'Sonic the Hedgehog|sonic', 'Halo', 'Mortal Kombat|mk', 'Counter-Strike|counter strike|cs|csgo|cs go|cs2']],
    movie: ['Movie', [
      'Titanic', 'Avatar', 'The Lion King|lion king', 'Star Wars', 'The Godfather|godfather', 'Jurassic Park',
      'The Dark Knight|dark knight', 'Forrest Gump', 'Inception', 'The Matrix|matrix', 'Frozen', 'Toy Story',
      'Harry Potter', 'The Lord of the Rings|lord of the rings|lotr', 'Avengers: Endgame|avengers endgame|endgame',
      'Finding Nemo', 'Shrek', 'Spider-Man|spiderman|spider man', 'Gladiator', 'Back to the Future']],
  };

  /* ---------- Loose matching ---------- */
  function norm(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/^(the|a|an) /, '')
      .replace(/ /g, '');
  }

  // Optimal string alignment distance: counts a swapped pair of letters as one typo.
  function distance(a, b) {
    const al = a.length, bl = b.length;
    if (!al) return bl;
    if (!bl) return al;
    const d = [];
    for (let i = 0; i <= al; i++) { d[i] = [i]; }
    for (let j = 0; j <= bl; j++) d[0][j] = j;
    for (let i = 1; i <= al; i++) {
      for (let j = 1; j <= bl; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
      }
    }
    return d[al][bl];
  }

  function parseItem(str) {
    const parts = String(str).split('|').map(function (x) { return x.trim(); }).filter(Boolean);
    const keys = [];
    parts.forEach(function (p) { const k = norm(p); if (k && keys.indexOf(k) < 0) keys.push(k); });
    return { name: parts[0], keys: keys };
  }

  function isMatch(guess, item) {
    const g = norm(guess);
    if (!g) return false;
    for (let i = 0; i < item.keys.length; i++) {
      const key = item.keys[i];
      if (g === key) return true;
      const tol = key.length <= 4 ? 0 : key.length <= 9 ? 1 : 2;
      if (tol && Math.abs(g.length - key.length) <= tol && distance(g, key) <= tol) return true;
    }
    return false;
  }

  const LISTS = {};
  Object.keys(RAW).forEach(function (key) {
    LISTS[key] = { key: key, name: RAW[key][0], items: RAW[key][1].map(parseItem) };
  });

  class GameError extends Error {}

  /* ---------- Store ---------- */
  function createStore(opts) {
    opts = opts || {};
    const now = opts.now || Date.now;
    const rand = opts.random || Math.random;
    const grace = opts.grace == null ? 20000 : opts.grace;
    const IDLE_MS = 4 * 60 * 60 * 1000;
    const MAX_PLAYERS = 100;
    const parties = new Map();

    const randInt = function (n) { return Math.floor(rand() * n); };
    const pick = function (arr) { return arr[randInt(arr.length)]; };
    function shuffle(a) {
      a = a.slice();
      for (let i = a.length - 1; i > 0; i--) { const j = randInt(i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; }
      return a;
    }
    function rid(n) {
      const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
      let s = '';
      for (let i = 0; i < n; i++) s += chars[randInt(chars.length)];
      return s;
    }
    const makeToken = opts.token || function () { return rid(24); };
    const clean = function (s, max) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max); };
    const clampInt = function (v, lo, hi, fallback) {
      v = parseInt(v, 10);
      if (isNaN(v)) return fallback;
      return Math.max(lo, Math.min(hi, v));
    };

    function newCode() {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
      for (;;) {
        let c = '';
        for (let i = 0; i < 4; i++) c += chars[randInt(chars.length)];
        if (!parties.has(c)) return c;
      }
    }
    function getParty(code) {
      const p = parties.get(String(code || '').toUpperCase().trim());
      if (!p) throw new GameError('Party not found. Check the code.');
      return p;
    }
    const touch = function (p) { p.version++; p.lastActive = now(); };
    const playerOf = function (p, id) { return p.players.find(function (x) { return x.id === id; }); };
    const isKnower = function (g, id) { return !!g && g.knowers.some(function (k) { return k.id === id; }); };

    function makePlayer(p, name, o) {
      name = clean(name, 16);
      if (!name) throw new GameError('Enter your name first.');
      if (p.players.some(function (x) { return x.name.toLowerCase() === name.toLowerCase(); })) {
        throw new GameError('That name is already taken in this party.');
      }
      if (p.players.length >= MAX_PLAYERS) throw new GameError('This party is full.');
      const player = {
        id: rid(8), token: makeToken(), name: name, score: 0,
        connected: true, discAt: null, bot: !!(o && o.bot),
      };
      p.players.push(player);
      return player;
    }

    /* ---- party lifecycle ---- */
    function createParty(name, o) {
      const p = {
        code: newCode(), version: 0, createdAt: now(), lastActive: now(),
        hostId: null, players: [], wins: {}, phase: 'lobby', game: null, results: null,
        settings: {
          category: 'food', knowers: 1, endMode: 'rounds', rounds: 6, minutes: 10,
          custom: { name: '', text: '' },
        },
      };
      const player = makePlayer(p, name, o);
      p.hostId = player.id;
      parties.set(p.code, p);
      return { code: p.code, player: player };
    }

    function join(code, name, o) {
      const p = getParty(code);
      if (p.phase !== 'lobby') throw new GameError('That game has already started. Ask the host to play again.');
      const player = makePlayer(p, name, o);
      touch(p);
      return { code: p.code, player: player };
    }

    function resume(code, token) {
      const p = getParty(code);
      const player = p.players.find(function (x) { return x.token === token; });
      if (!player) throw new GameError('You are no longer in this party.');
      return { code: p.code, player: player };
    }

    function setConnected(code, playerId, connected) {
      const p = parties.get(code);
      if (!p) return;
      const pl = playerOf(p, playerId);
      if (!pl || pl.connected === connected) return;
      pl.connected = connected;
      pl.discAt = connected ? null : now();
      touch(p);
    }

    /* ---- custom list ---- */
    function customItems(s) {
      const seen = {};
      const out = [];
      String(s.custom.text || '').split(/[\n,;]+/).forEach(function (line) {
        const t = clean(line, 40);
        const k = norm(t.split('|')[0]);
        if (t && k && !seen[k] && out.length < 200) { seen[k] = 1; out.push(parseItem(t)); }
      });
      return out;
    }

    function applySettings(p, d) {
      const s = p.settings;
      if (d.category != null) {
        if (d.category !== 'custom' && !LISTS[d.category]) throw new GameError('Unknown category.');
        s.category = d.category;
      }
      if (d.knowers != null) s.knowers = clampInt(d.knowers, 1, 50, s.knowers);
      if (d.endMode != null) {
        if (d.endMode !== 'rounds' && d.endMode !== 'time') throw new GameError('Unknown game length.');
        s.endMode = d.endMode;
      }
      if (d.rounds != null) s.rounds = clampInt(d.rounds, 1, 100, s.rounds);
      if (d.minutes != null) s.minutes = clampInt(d.minutes, 1, 180, s.minutes);
      if (d.custom) {
        if (d.custom.name != null) s.custom.name = clean(d.custom.name, 24);
        if (d.custom.text != null) s.custom.text = String(d.custom.text).slice(0, 6000);
      }
    }

    /* ---- game flow ---- */
    function startGame(p) {
      const s = p.settings;
      const n = p.players.length;
      if (n < 2) throw new GameError('You need at least 2 players to start.');
      const k = Math.max(1, Math.min(s.knowers, Math.floor(n / 2)));
      let items, catName;
      if (s.category === 'custom') {
        items = customItems(s);
        catName = s.custom.name || 'Custom list';
        if (items.length < k + 1) throw new GameError('Your custom list needs at least ' + (k + 1) + ' items.');
      } else {
        items = LISTS[s.category].items;
        catName = LISTS[s.category].name;
      }
      const chosen = shuffle(p.players).slice(0, k);
      const pool = shuffle(items);
      p.players.forEach(function (x) { x.score = 0; });
      p.results = null;
      p.game = {
        categoryKey: s.category, categoryName: catName, items: items,
        knowers: chosen.map(function (pl, i) { return { id: pl.id, object: pool[i], rerolls: 0 }; }),
        rotation: [], lastGuesser: null, round: 0,
        totalRounds: s.endMode === 'rounds' ? s.rounds : null,
        endsAt: s.endMode === 'time' ? now() + s.minutes * 60000 : null,
        guesserId: null, knowerId: null, awaiting: null,
        askCounts: {}, log: [], logSeq: 0, guesses: {},
      };
      chosen.forEach(function (pl) { p.game.askCounts[pl.id] = 0; });
      p.phase = 'playing';
      nextRound(p);
    }

    function pushLog(g, entry) {
      entry.id = ++g.logSeq;
      g.log.push(entry);
      return entry;
    }

    function nextRound(p) {
      const g = p.game;
      const finished = (g.totalRounds && g.round >= g.totalRounds) || (g.endsAt && now() >= g.endsAt);
      if (finished) { toGuessing(p); return; }
      g.round++;
      if (!g.rotation.length) {
        const ids = p.players.filter(function (x) { return !isKnower(g, x.id); }).map(function (x) { return x.id; });
        g.rotation = shuffle(ids);
        if (g.rotation.length > 1 && g.rotation[0] === g.lastGuesser) {
          const last = g.rotation.length - 1;
          const t = g.rotation[0]; g.rotation[0] = g.rotation[last]; g.rotation[last] = t;
        }
      }
      g.guesserId = g.rotation.shift();
      g.lastGuesser = g.guesserId;
      const min = Math.min.apply(null, g.knowers.map(function (k) { return g.askCounts[k.id]; }));
      const least = g.knowers.filter(function (k) { return g.askCounts[k.id] === min; });
      g.knowerId = pick(least).id;
      g.askCounts[g.knowerId]++;
      g.awaiting = 'question';
    }

    function toGuessing(p) {
      const g = p.game;
      p.phase = 'guessing';
      g.guesserId = null; g.knowerId = null; g.awaiting = null;
      g.guesses = {};
    }

    function skipTurn(p) {
      const g = p.game;
      if (g.awaiting === 'question') {
        pushLog(g, { type: 'skip', round: g.round, guesserId: g.guesserId, knowerId: g.knowerId });
      } else if (g.awaiting === 'answer') {
        for (let i = g.log.length - 1; i >= 0; i--) {
          if (g.log[i].type === 'qa' && g.log[i].a == null) { g.log[i].a = '(no answer)'; g.log[i].skipped = true; break; }
        }
      }
      nextRound(p);
    }

    function guessersPending(p) {
      const g = p.game;
      return p.players.filter(function (x) {
        if (isKnower(g, x.id)) return false;
        if (g.guesses[x.id]) return false;
        const gone = !x.connected && x.discAt && now() - x.discAt > grace;
        return !gone;
      });
    }

    function finalize(p) {
      const g = p.game;
      const guessers = p.players.filter(function (x) { return !isKnower(g, x.id); });
      const gained = {};
      p.players.forEach(function (x) { gained[x.id] = 0; });
      const hit = {};
      const rows = guessers.map(function (gp) {
        const sub = g.guesses[gp.id];
        const byKnower = {};
        g.knowers.forEach(function (k) {
          const text = sub && sub[k.id] ? sub[k.id] : '';
          const ok = text ? isMatch(text, k.object) : false;
          byKnower[k.id] = { text: text, correct: ok };
          if (ok) { gained[gp.id]++; hit[k.id] = true; }
        });
        return { playerId: gp.id, submitted: !!sub, byKnower: byKnower };
      });
      g.knowers.forEach(function (k) { if (hit[k.id]) gained[k.id] = 1; });
      p.players.forEach(function (x) { x.score += gained[x.id]; });
      const max = Math.max.apply(null, p.players.map(function (x) { return x.score; }));
      const winners = max > 0 ? p.players.filter(function (x) { return x.score === max; }).map(function (x) { return x.id; }) : [];
      winners.forEach(function (id) { p.wins[id] = (p.wins[id] || 0) + 1; });
      p.results = {
        objects: g.knowers.map(function (k) { return { knowerId: k.id, name: k.object.name }; }),
        rows: rows, gained: gained, winners: winners,
      };
      p.phase = 'results';
    }

    /* ---- actions ---- */
    function act(code, playerId, type, data) {
      const p = getParty(code);
      const me = playerOf(p, playerId);
      if (!me) throw new GameError('You are not in this party.');
      data = data || {};
      const g = p.game;
      const host = p.hostId === me.id;
      const needHost = function () { if (!host) throw new GameError('Only the host can do that.'); };
      const needPhase = function (ph) { if (p.phase !== ph) throw new GameError('That is not possible right now.'); };

      switch (type) {
        case 'setSettings':
          needHost(); needPhase('lobby');
          applySettings(p, data);
          break;
        case 'kick': {
          needHost(); needPhase('lobby');
          if (data.id === p.hostId) throw new GameError('You cannot remove yourself.');
          p.players = p.players.filter(function (x) { return x.id !== data.id; });
          break;
        }
        case 'start':
          needHost(); needPhase('lobby');
          startGame(p);
          break;
        case 'ask': {
          needPhase('playing');
          if (g.awaiting !== 'question' || g.guesserId !== me.id) throw new GameError('It is not your turn to ask.');
          const q = clean(data.text, 200);
          if (!q) throw new GameError('Type a question first.');
          pushLog(g, { type: 'qa', round: g.round, guesserId: g.guesserId, knowerId: g.knowerId, q: q, a: null });
          g.awaiting = 'answer';
          break;
        }
        case 'answer': {
          needPhase('playing');
          if (g.awaiting !== 'answer' || g.knowerId !== me.id) throw new GameError('You are not being asked right now.');
          const a = clean(data.text, 200);
          if (!a) throw new GameError('Type an answer first.');
          for (let i = g.log.length - 1; i >= 0; i--) {
            if (g.log[i].type === 'qa' && g.log[i].a == null) { g.log[i].a = a; break; }
          }
          g.awaiting = null;
          nextRound(p);
          break;
        }
        case 'reroll': {
          needPhase('playing');
          const k = g.knowers.find(function (x) { return x.id === me.id; });
          if (!k) throw new GameError('Only knowers can reroll.');
          const used = g.knowers.map(function (x) { return x.object.name; });
          const options = g.items.filter(function (it) { return used.indexOf(it.name) < 0; });
          if (!options.length) throw new GameError('No other objects left in this list.');
          k.object = pick(options);
          k.rerolls++;
          pushLog(g, { type: 'reroll', round: g.round, knowerId: me.id });
          break;
        }
        case 'skip':
          needHost(); needPhase('playing');
          skipTurn(p);
          break;
        case 'endNow':
          needHost(); needPhase('playing');
          toGuessing(p);
          break;
        case 'guess': {
          needPhase('guessing');
          if (isKnower(g, me.id)) throw new GameError('Knowers do not guess.');
          if (g.guesses[me.id]) throw new GameError('You already locked in your guesses.');
          const input = data.guesses || {};
          const sub = {};
          g.knowers.forEach(function (k) { sub[k.id] = clean(input[k.id], 60); });
          g.guesses[me.id] = sub;
          if (!guessersPending(p).length) finalize(p);
          break;
        }
        case 'reveal':
          needHost(); needPhase('guessing');
          finalize(p);
          break;
        case 'playAgain':
          needHost(); needPhase('results');
          p.phase = 'lobby'; p.game = null; p.results = null;
          p.players.forEach(function (x) { x.score = 0; });
          break;
        default:
          throw new GameError('Unknown action.');
      }
      touch(p);
    }

    /* ---- periodic housekeeping: dropped players, idle parties ---- */
    function tick() {
      const changed = [];
      const t = now();
      parties.forEach(function (p, code) {
        if (p.players.every(function (x) { return !x.connected; }) && t - p.lastActive > IDLE_MS) {
          parties.delete(code);
          return;
        }
        let ch = false;
        const gone = function (x) { return x && !x.connected && x.discAt && t - x.discAt > grace; };
        const host = playerOf(p, p.hostId);
        if (gone(host)) {
          const nh = p.players.find(function (x) { return x.connected; });
          if (nh) { p.hostId = nh.id; ch = true; }
        }
        if (p.phase === 'playing') {
          const g = p.game;
          if (g.awaiting === 'question' && gone(playerOf(p, g.guesserId))) { skipTurn(p); ch = true; }
          else if (g.awaiting === 'answer' && gone(playerOf(p, g.knowerId))) { skipTurn(p); ch = true; }
        } else if (p.phase === 'guessing') {
          if (!guessersPending(p).length) { finalize(p); ch = true; }
        }
        if (ch) { touch(p); changed.push(code); }
      });
      return changed;
    }

    /* ---- per-player view: a knower's object is only ever included for that knower ---- */
    function view(code, playerId) {
      const p = getParty(code);
      const me = playerOf(p, playerId);
      if (!me) throw new GameError('You are not in this party.');
      const g = p.game;
      const s = p.settings;
      const host = p.hostId === me.id;
      const out = {
        v: p.version, serverNow: now(), code: p.code, phase: p.phase, hostId: p.hostId,
        you: { id: me.id, name: me.name, isHost: host, isKnower: isKnower(g, me.id) },
        players: p.players.map(function (x) {
          return {
            id: x.id, name: x.name, score: x.score, connected: x.connected, bot: x.bot,
            wins: p.wins[x.id] || 0, isKnower: isKnower(g, x.id),
          };
        }),
        maxKnowers: Math.max(1, Math.floor(p.players.length / 2)),
        settings: {
          category: s.category, knowers: s.knowers, endMode: s.endMode, rounds: s.rounds, minutes: s.minutes,
          customName: s.custom.name, customCount: customItems(s).length,
          customText: host ? s.custom.text : undefined,
        },
      };
      if (g) {
        const k = g.knowers.find(function (x) { return x.id === me.id; });
        out.game = {
          categoryKey: g.categoryKey, categoryName: g.categoryName,
          round: g.round, totalRounds: g.totalRounds, endsAt: g.endsAt,
          knowers: g.knowers.map(function (x) { return { id: x.id, rerolls: x.rerolls }; }),
          guesserId: g.guesserId, knowerId: g.knowerId, awaiting: g.awaiting,
          log: g.log,
          myObject: k && p.phase !== 'results' ? k.object.name : null,
          submitted: Object.keys(g.guesses),
          mySubmitted: !!g.guesses[me.id],
          pending: p.phase === 'guessing' ? guessersPending(p).length : 0,
          guesserCount: p.players.length - g.knowers.length,
        };
      }
      if (p.phase === 'results') out.results = p.results;
      return out;
    }

    return {
      parties: parties, createParty: createParty, join: join, resume: resume, setConnected: setConnected,
      act: act, view: view, tick: tick,
    };
  }

  return { LISTS: LISTS, createStore: createStore, GameError: GameError, isMatch: isMatch, norm: norm, parseItem: parseItem };
});
