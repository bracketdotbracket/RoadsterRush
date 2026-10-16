import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { barrierSegments, barrierContact } from '../shared/barriers.js';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function client(url) {
  const ws = new WebSocket(url);
  const messages = [];
  ws.on('message', (raw) => messages.push(JSON.parse(raw)));
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return {
    ws,
    messages,
    send: (m) => ws.send(JSON.stringify(m)),
    async wait(predicate, timeout = 7000) {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        const index = messages.findIndex(predicate);
        if (index >= 0) return messages.splice(index, 1)[0];
        await sleep(10);
      }
      throw Error('Timed out waiting for server message');
    },
  };
}
test(
  'private rooms enforce readiness, capacity, shared barrier impacts, two-tap stunts and server-owned race state',
  { timeout: 18000 },
  async (t) => {
    const child = spawn(process.execPath, ['server/index.js'], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, HOST: '127.0.0.1', PORT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const clients = [];
    t.after(async () => {
      clients.forEach((c) => c.ws.terminate());
      child.kill('SIGTERM');
      await new Promise((resolve) => {
        if (child.exitCode !== null) resolve();
        else child.once('exit', resolve);
      });
    });
    const port = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(Error('Server did not start: ' + output)), 5000);
      child.stdout.on('data', (d) => {
        output += d;
        const m = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
        if (m) {
          clearTimeout(timer);
          resolve(m[1]);
        }
      });
      child.stderr.on('data', (d) => (output += d));
      child.on('exit', (code) => {
        clearTimeout(timer);
        reject(Error('Server exited ' + code + ': ' + output));
      });
    });
    const address = 'http://127.0.0.1:' + port,
      health = await (await fetch(address + '/health')).json();
    assert.equal(health.ok, true);
    for (let i = 0; i < 5; i++)
      clients.push(await client(address.replace('http', 'ws') + '/race/ws'));
    const [a, b, c, d, e] = clients;
    a.send({ type: 'create', name: 'HOST' });
    const host = await a.wait((m) => m.type === 'welcome');
    assert.match(host.code, /^[A-F0-9]{5}$/);
    for (const [i, p] of [b, c, d].entries()) {
      p.send({ type: 'join', name: 'DRIVER ' + i, code: host.code });
      await p.wait((m) => m.type === 'welcome');
    }
    e.send({ type: 'join', code: host.code });
    assert.match((await e.wait((m) => m.type === 'error')).message, /full/);
    await a.wait((m) => m.type === 'lobby' && m.players.length === 4);
    a.send({ type: 'start' });
    await sleep(120);
    assert.equal(
      a.messages.some((m) => m.type === 'raceStart'),
      false,
    );
    for (const p of [a, b, c, d]) p.send({ type: 'ready', ready: true });
    await a.wait((m) => m.type === 'lobby' && m.players.every((p) => p.ready));
    b.send({ type: 'start' });
    await sleep(120);
    assert.equal(
      a.messages.some((m) => m.type === 'raceStart'),
      false,
    );
    a.send({ type: 'start' });
    const start = await a.wait((m) => m.type === 'raceStart');
    assert.equal(start.cars.length, 4);
    assert.equal(start.party.boxes.length, 18);
    assert.equal(start.party.traps.length, 0);
    assert.equal('rng' in start.party, false);
    assert.ok(start.cars.every((c) => c.item === null && c.itemsUsed === 0));
    await b.wait((m) => m.type === 'raceStart');
    a.ws.send('invalid json');
    a.send({ type: 'input', seq: 1, input: null });
    a.send({
      type: 'input',
      seq: 2,
      input: {
        throttle: 999,
        steer: 0,
        boost: true,
        boosts: 99,
        boostTime: 999,
        x: 1e9,
        z: 1e9,
        finishTime: 0,
        lap: 99,
        item: 'shockwave',
        shieldUntil: 999,
        partyHits: 100,
        useItem: true,
      },
    });
    const snap = await a.wait(
        (m) => m.type === 'snapshot' && m.phase === 'racing' && m.elapsed > 0.5,
        8000,
      ),
      car = snap.cars.find((c) => c.id === host.id);
    assert.ok(car.speed > 0 && car.speed <= 72);
    assert.ok(Math.abs(car.x) < 1000 && Math.abs(car.z) < 1000);
    assert.equal(car.lap, 1);
    assert.equal(car.finishTime, null);
    assert.equal(car.lastSeq, 2);
    assert.equal(car.charge, 100);
    assert.equal(car.boosts, 0);
    assert.equal(car.boostTime, 0);
    assert.equal(car.boosting, false);
    assert.equal(car.item, null);
    assert.equal(car.shieldUntil, 0);
    assert.equal(car.itemsUsed, 0);
    assert.equal(car.partyHits, 0);
    assert.equal(snap.pickups.length, 8);
    const peer = await b.wait((m) => m.type === 'snapshot' && m.serverNow === snap.serverNow);
    assert.deepEqual(peer.cars, snap.cars);
    assert.deepEqual(peer.pickups, snap.pickups);
    assert.deepEqual(peer.party, snap.party);
    a.send({ type: 'input', seq: 3, input: { throttle: 1, steer: 1 } });
    const hit = await a.wait(
      (m) =>
        m.type === 'snapshot' && m.cars.some((c) => c.id === host.id && c.event === 'BARRIER HIT'),
      8000,
    );
    const stopped = hit.cars.find((c) => c.id === host.id);
    assert.ok(Math.abs(stopped.speed) < 15);
    assert.equal(
      barrierSegments.some((b) => barrierContact(stopped, b)),
      false,
    );
    assert.ok(Number.isFinite(stopped.impactVX + stopped.impactVZ));
    const sharedHit = await b.wait((m) => m.type === 'snapshot' && m.serverNow === hit.serverNow);
    assert.deepEqual(sharedHit.cars, hit.cars);
    // The server resolves the same jump button context as the local client.
    a.send({ type: 'input', seq: 4, input: { jump: true, brake: 1 } });
    const airborne = await a.wait(
      (m) => m.type === 'snapshot' && m.cars.some((c) => c.id === host.id && !c.grounded),
    );
    assert.equal(airborne.cars.find((c) => c.id === host.id).rollActive, false);
    a.send({ type: 'input', seq: 5, input: { jump: false, brake: 1 } });
    await a.wait(
      (m) => m.type === 'snapshot' && m.cars.some((c) => c.id === host.id && c.lastSeq === 5),
    );
    a.send({ type: 'input', seq: 6, input: { jump: true, brake: 1 } });
    const flip = await a.wait(
      (m) => m.type === 'snapshot' && m.cars.some((c) => c.id === host.id && c.rollActive),
    );
    const sharedFlip = await b.wait((m) => m.type === 'snapshot' && m.serverNow === flip.serverNow);
    assert.deepEqual(sharedFlip.cars, flip.cars);
    const landed = await a.wait(
      (m) =>
        m.type === 'snapshot' &&
        m.cars.some((c) => c.id === host.id && c.grounded && c.stunts === 1),
    );
    assert.equal(landed.cars.find((c) => c.id === host.id).landings, 1);
    a.ws.close();
    const transfer = await b.wait(
      (m) => m.type === 'lobby' && m.players.length === 3 && m.phase === 'racing',
    );
    assert.notEqual(transfer.host, host.id);
    assert.equal(transfer.phase, 'racing');
    for (const p of [b, c, d]) p.ws.close();
    await sleep(100);
    assert.equal((await (await fetch(address + '/health')).json()).rooms, 0);
  },
);
