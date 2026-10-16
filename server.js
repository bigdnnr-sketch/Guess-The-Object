'use strict';
/* Guess the Object: server.
 * All game state lives here. Each player is sent a personal view, so a knower's
 * secret object never reaches any other player's browser.
 *
 * Wire protocol (JSON over WebSocket):
 *   client -> server  { id, ev: 'create' | 'join' | 'resume' | 'act', data }
 *   server -> client  { re: id, ok: true, ... } | { re: id, ok: false, error }   (reply to a request)
 *   server -> client  { ev: 'state', data: <view> } | { ev: 'gone', data: <message> }
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const GTO = require('./public/engine.js');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json',
};

const server = http.createServer((req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent((req.url || '/').split('?')[0]); } catch (e) { res.writeHead(400); return res.end('Bad request'); }
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.normalize(path.join(PUBLIC, urlPath));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });
const store = GTO.createStore({ token: () => crypto.randomBytes(18).toString('hex') });

// party code -> Set of connection entries { ws, playerId }
const rooms = new Map();

const send = (ws, obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); };

function push(code) {
  const set = rooms.get(code);
  if (!set) return;
  for (const c of set) {
    try { send(c.ws, { ev: 'state', data: store.view(code, c.playerId) }); }
    catch (e) { send(c.ws, { ev: 'gone', data: e.message }); }
  }
}

function errorMessage(e) {
  if (!(e instanceof GTO.GameError)) console.error(e);
  return e instanceof GTO.GameError ? e.message : 'Something went wrong.';
}

wss.on('connection', (ws) => {
  let ctx = null; // { code, playerId, entry }
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  function leave() {
    if (!ctx) return;
    const { code, playerId, entry } = ctx;
    const set = rooms.get(code);
    if (set) {
      set.delete(entry);
      if (![...set].some((c) => c.playerId === playerId)) store.setConnected(code, playerId, false);
      if (!set.size) rooms.delete(code);
    }
    ctx = null;
    push(code);
  }

  function bind(code, player) {
    leave();
    const entry = { ws, playerId: player.id };
    if (!rooms.has(code)) rooms.set(code, new Set());
    rooms.get(code).add(entry);
    ctx = { code, playerId: player.id, entry };
    store.setConnected(code, player.id, true);
  }

  function handle(ev, d) {
    switch (ev) {
      case 'create': {
        const r = store.createParty(d.name);
        bind(r.code, r.player);
        return { code: r.code, token: r.player.token };
      }
      case 'join': {
        const r = store.join(d.code, d.name);
        bind(r.code, r.player);
        return { code: r.code, token: r.player.token };
      }
      case 'resume': {
        const r = store.resume(d.code, d.token);
        bind(r.code, r.player);
        return { code: r.code };
      }
      case 'act':
        if (!ctx) throw new GTO.GameError('You are not in a party.');
        store.act(ctx.code, ctx.playerId, d.type, d.data);
        return {};
      default:
        throw new GTO.GameError('Unknown request.');
    }
  }

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    if (!msg || typeof msg.ev !== 'string') return;
    let reply;
    try {
      reply = Object.assign({ ok: true }, handle(msg.ev, msg.data && typeof msg.data === 'object' ? msg.data : {}));
    } catch (e) {
      reply = { ok: false, error: errorMessage(e) };
    }
    send(ws, Object.assign({ re: msg.id }, reply));
    if (reply.ok && ctx) push(ctx.code);
  });

  ws.on('close', leave);
  ws.on('error', () => {});
});

// Drop dead connections, so a phone that lost signal is marked as disconnected.
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 25000);

// Skip absent players, hand over the host role, and clean up idle parties.
setInterval(() => {
  for (const code of store.tick()) push(code);
}, 1000);

server.listen(PORT, () => console.log('Guess the Object running on http://localhost:' + PORT));
