import { getTrack, isTrackId } from '../shared/track.js';
import { createBoostPickups } from '../shared/powerups.js';
import {
  createPartyState,
  publicPartyState,
  beginPartyStep,
  endPartyStep,
} from '../shared/party.js';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import {
  createCar,
  stepCar,
  blankInput,
  cleanInput,
  DT,
  collideCars,
  raceOrder,
} from '../shared/physics.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const PORT = Number(process.env.PORT || 2567),
  HOST = process.env.HOST || '127.0.0.1';
const allowed = process.env.ALLOWED_ORIGINS?.split(',')
  .map((x) => x.trim())
  .filter(Boolean);
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.glb': 'model/gltf-binary',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://local');
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    }
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';
    const target = path.resolve(root, '.' + pathname);
    if (!target.startsWith(root + path.sep)) {
      res.writeHead(403);
      return res.end();
    }
    const data = await readFile(target);
    res.writeHead(200, {
      'Content-Type': mime[path.extname(target)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Game files not found. Run npm run build first.');
  }
});
const wss = new WebSocketServer({
  server,
  path: '/race/ws',
  maxPayload: 4096,
  verifyClient: ({ origin, req }, done) => {
    if (allowed) return done(!origin || allowed.includes(origin));
    if (!origin) return done(true);
    try {
      const u = new URL(origin);
      done(['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) || u.host === req.headers.host);
    } catch {
      done(false);
    }
  },
});
const rooms = new Map(),
  colors = ['#d7fc70', '#8ad4ff', '#ff946c', '#c9abff'];
const send = (ws, data) => {
  if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 1e6) ws.send(JSON.stringify(data));
};
const broadcast = (r, data) => r.players.forEach((p) => send(p.ws, data));
function lobby(r) {
  broadcast(r, {
    type: 'lobby',
    trackId: r.trackId,
    code: r.code,
    host: r.host,
    phase: r.phase,
    players: [...r.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      ready: p.ready,
    })),
    serverNow: Date.now(),
  });
}
function leave(ws) {
  const r = rooms.get(ws.room);
  if (!r) return;
  const wasHost = r.host === ws.id;
  r.players.delete(ws.id);
  ws.room = null;
  if (!r.players.size) {
    rooms.delete(r.code);
    return;
  }
  if (wasHost) r.host = r.players.keys().next().value;
  lobby(r);
}
function newPlayer(ws, r, name) {
  const p = {
    id: ws.id,
    ws,
    name:
      String(name || 'Driver')
        .replace(/[\x00-\x1F\x7F]/g, '')
        .trim()
        .slice(0, 18) || 'Driver',
    color:
      colors[
        [...Array(4).keys()].find(
          (i) => ![...r.players.values()].some((p) => p.color === colors[i]),
        )
      ],
    ready: false,
    input: blankInput(),
    queue: [],
    lastSeq: 0,
    car: null,
  };
  r.players.set(p.id, p);
  ws.room = r.code;
  r.updated = Date.now();
  send(ws, { type: 'welcome', id: ws.id, code: r.code });
  lobby(r);
}
wss.on('connection', (ws) => {
  if (wss.clients.size > 100) {
    ws.close(1013, 'Server full');
    return;
  }
  ws.id = randomBytes(8).toString('hex');
  ws.room = null;
  ws.alive = true;
  ws.rateAt = Date.now();
  ws.rateCount = 0;
  ws.on('pong', () => (ws.alive = true));
  ws.on('message', (raw) => {
    if (Date.now() - ws.rateAt > 1000) {
      ws.rateAt = Date.now();
      ws.rateCount = 0;
    }
    if (++ws.rateCount > 150) {
      ws.close(1008, 'Rate limit');
      return;
    }
    let m;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (!m || typeof m !== 'object') return;
    const r = rooms.get(ws.room),
      p = r?.players.get(ws.id);
    if (m.type === 'create') {
      if (m.trackId !== undefined && !isTrackId(m.trackId))
        return send(ws, { type: 'error', message: 'Choose an available circuit.' });
      if (r) leave(ws);
      if (rooms.size >= 25)
        return send(ws, { type: 'error', message: 'All race rooms are busy. Try again shortly.' });
      let code;
      do {
        code = randomBytes(4).toString('hex').slice(0, 5).toUpperCase();
      } while (rooms.has(code));
      const nr = {
        code,
        trackId: getTrack(m.trackId).id,
        host: ws.id,
        players: new Map(),
        phase: 'lobby',
        ticks: 0,
        startTick: 0,
        updated: Date.now(),
        firstFinish: null,
      };
      rooms.set(code, nr);
      newPlayer(ws, nr, m.name);
    } else if (m.type === 'join') {
      const dest = rooms.get(
        String(m.code || '')
          .toUpperCase()
          .replace(/[^A-F0-9]/g, ''),
      );
      if (!dest)
        return send(ws, { type: 'error', message: 'That room was not found. Check the code.' });
      if (dest === r) return send(ws, { type: 'error', message: 'You are already in this room.' });
      if (dest.phase !== 'lobby')
        return send(ws, { type: 'error', message: 'That race is already running.' });
      if (dest.players.size >= 4) return send(ws, { type: 'error', message: 'That room is full.' });
      if (r) leave(ws);
      newPlayer(ws, dest, m.name);
    } else if (
      m.type === 'track' &&
      r?.phase === 'lobby' &&
      r.host === ws.id &&
      isTrackId(m.trackId)
    ) {
      r.trackId = m.trackId;
      for (const player of r.players.values()) player.ready = false;
      r.updated = Date.now();
      lobby(r);
    } else if (m.type === 'ready' && r?.phase === 'lobby' && p) {
      p.ready = m.ready === true;
      r.updated = Date.now();
      lobby(r);
    } else if (
      m.type === 'start' &&
      r?.host === ws.id &&
      r.phase === 'lobby' &&
      r.players.size >= 2 &&
      [...r.players.values()].every((p) => p.ready)
    ) {
      r.phase = 'countdown';
      r.pickups = createBoostPickups(r.trackId);
      r.party = createPartyState(randomBytes(4).readUInt32LE(), r.trackId);
      r.ticks = 0;
      r.startTick = 180;
      r.firstFinish = null;
      r.updated = Date.now();
      let index = 0;
      for (const p of r.players.values()) {
        p.car = createCar(p.id, p.name, index++, p.color, r.trackId);
        p.queue = [];
        p.input = blankInput();
        p.lastSeq = 0;
      }
      broadcast(r, {
        type: 'raceStart',
        trackId: r.trackId,
        pickups: r.pickups,
        party: publicPartyState(r.party),
        code: r.code,
        serverNow: Date.now(),
        cars: [...r.players.values()].map((p) => p.car),
      });
    } else if (m.type === 'input' && p?.car && ['countdown', 'racing'].includes(r.phase)) {
      if (
        !Number.isSafeInteger(m.seq) ||
        m.seq <= p.lastSeq ||
        m.seq > (p.queue.at(-1)?.seq ?? p.lastSeq) + 120
      )
        return;
      if (p.queue.some((x) => x.seq === m.seq)) return;
      p.queue.push({ seq: m.seq, input: cleanInput(m.input) });
      if (p.queue.length > 12) p.queue.splice(0, p.queue.length - 12);
    } else if (m.type === 'rematch' && r?.host === ws.id && r.phase === 'finished') {
      r.phase = 'lobby';
      r.updated = Date.now();
      for (const p of r.players.values()) {
        p.ready = false;
        p.car = null;
      }
      lobby(r);
    } else if (m.type === 'leave') leave(ws);
  });
  ws.on('close', () => leave(ws));
  ws.on('error', () => {});
});
let tickCounter = 0;
function tick() {
  for (const r of rooms.values()) {
    if (r.phase === 'lobby' || r.phase === 'finished') {
      if (Date.now() - r.updated > 30 * 60 * 1000) {
        broadcast(r, { type: 'error', message: 'Room closed after inactivity.' });
        for (const p of r.players.values()) p.ws.close();
        rooms.delete(r.code);
      }
      continue;
    }
    if (r.phase === 'finished') continue;
    r.ticks++;
    if (r.ticks >= r.startTick) r.phase = 'racing';
    const elapsed = Math.max(0, (r.ticks - r.startTick) * DT);
    for (const p of r.players.values()) {
      const next = p.queue.shift();
      if (next) {
        p.input = next.input;
        p.lastSeq = next.seq;
      }
      p.car.lastSeq = p.lastSeq;
    }
    const cars = [...r.players.values()].map((p) => p.car).filter(Boolean);
    if (r.phase === 'racing') {
      const previous = new Map(cars.map((c) => [c.id, { ...c }]));
      const inputs = new Map([...r.players.values()].map((p) => [p.id, p.input]));
      beginPartyStep(cars, inputs, r.party, elapsed);
      for (const p of r.players.values()) stepCar(p.car, p.input, DT, elapsed, true, r.pickups);
      collideCars(cars);
      endPartyStep(cars, previous, r.party, elapsed);
    }
    if (cars.some((c) => c.finishTime !== null) && r.firstFinish === null) r.firstFinish = elapsed;
    if (
      cars.every((c) => c.finishTime !== null) ||
      elapsed > 300 ||
      (r.firstFinish !== null && elapsed - r.firstFinish > 30)
    ) {
      r.phase = 'finished';
      r.updated = Date.now();
      broadcast(r, {
        type: 'finished',
        trackId: r.trackId,
        cars: raceOrder(cars),
        party: publicPartyState(r.party),
        elapsed,
        serverNow: Date.now(),
      });
    } else if (tickCounter % 3 === 0)
      broadcast(r, {
        type: 'snapshot',
        trackId: r.trackId,
        pickups: r.pickups,
        party: publicPartyState(r.party),
        cars,
        phase: r.phase,
        elapsed,
        countdown: Math.max(0, (r.startTick - r.ticks) * DT),
        serverNow: Date.now(),
      });
  }
  tickCounter++;
}
let previous = performance.now(),
  accumulator = 0;
const timer = setInterval(() => {
  const now = performance.now();
  accumulator += Math.min((now - previous) / 1000, 0.25);
  previous = now;
  while (accumulator >= DT) {
    tick();
    accumulator -= DT;
  }
}, 8);
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) {
      ws.terminate();
      continue;
    }
    ws.alive = false;
    ws.ping();
  }
}, 15000);
server.listen(PORT, HOST, () =>
  console.log(`Roadster Rush: http://${HOST}:${server.address().port} · race socket /race/ws`),
);
function shutdown() {
  clearInterval(timer);
  clearInterval(heartbeat);
  for (const ws of wss.clients) ws.close(1001, 'Server restarting');
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
