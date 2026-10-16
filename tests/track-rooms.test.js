import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { getTrack } from '../shared/track.js';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
test(
  'host-selected circuits synchronize guests, reset readiness and isolate simultaneous online rooms',
  { timeout: 20000 },
  async (t) => {
    const child = spawn(process.execPath, ['server/index.js'], {
        cwd: new URL('..', import.meta.url),
        env: { ...process.env, HOST: '127.0.0.1', PORT: '0' },
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
      clients = [];
    t.after(async () => {
      clients.forEach((c) => c.ws.terminate());
      child.kill('SIGTERM');
      await new Promise((resolve) => {
        if (child.exitCode !== null) resolve();
        else child.once('exit', resolve);
      });
    });
    const port = await new Promise((resolve, reject) => {
      let out = '';
      const timer = setTimeout(() => reject(Error(out)), 5000);
      child.stdout.on('data', (d) => {
        out += d;
        const match = out.match(/127\.0\.0\.1:(\d+)/);
        if (match) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      });
      child.stderr.on('data', (d) => (out += d));
    });
    async function connect() {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/race/ws`),
        messages = [];
      ws.on('message', (r) => messages.push(JSON.parse(r)));
      await new Promise((r, j) => {
        ws.once('open', r);
        ws.once('error', j);
      });
      const c = {
        ws,
        messages,
        send: (m) => ws.send(JSON.stringify(m)),
        async wait(pred) {
          const end = Date.now() + 7000;
          while (Date.now() < end) {
            const i = messages.findIndex(pred);
            if (i >= 0) return messages.splice(i, 1)[0];
            await sleep(10);
          }
          throw Error('Missing track message');
        },
      };
      clients.push(c);
      return c;
    }
    const a = await connect(),
      b = await connect(),
      c = await connect(),
      d = await connect();
    a.send({ type: 'create', trackId: 'neon-city' });
    const wa = await a.wait((m) => m.type === 'welcome');
    b.send({ type: 'join', code: wa.code });
    await b.wait((m) => m.type === 'welcome');
    c.send({ type: 'create', trackId: 'starport' });
    const wc = await c.wait((m) => m.type === 'welcome');
    d.send({ type: 'join', code: wc.code });
    await d.wait((m) => m.type === 'welcome');
    await c.wait((m) => m.type === 'lobby' && m.players.length === 2 && m.trackId === 'starport');
    d.send({ type: 'track', trackId: 'neon-city' });
    d.send({ type: 'ready', ready: true });
    assert.equal(
      (await c.wait((m) => m.type === 'lobby' && m.players.some((p) => p.ready))).trackId,
      'starport',
    );
    c.send({ type: 'track', trackId: 'neon-city' });
    const changed = await d.wait((m) => m.type === 'lobby' && m.trackId === 'neon-city');
    assert.ok(changed.players.every((p) => !p.ready));
    c.send({ type: 'track', trackId: 'starport' });
    await c.wait(
      (m) => m.type === 'lobby' && m.trackId === 'starport' && m.players.every((p) => !p.ready),
    );
    for (const client of clients) client.send({ type: 'ready', ready: true });
    for (const host of [a, c])
      await host.wait(
        (m) => m.type === 'lobby' && m.players.length === 2 && m.players.every((p) => p.ready),
      );
    a.send({ type: 'start' });
    c.send({ type: 'start' });
    for (const [host, guest, id] of [
      [a, b, 'neon-city'],
      [c, d, 'starport'],
    ]) {
      const start = await host.wait((m) => m.type === 'raceStart');
      assert.equal(start.trackId, id);
      assert.equal(start.party.trackId, id);
      assert.ok(start.cars.every((car) => car.trackId === id));
      assert.deepEqual(await guest.wait((m) => m.type === 'raceStart'), start);
      host.send({
        type: 'input',
        seq: 1,
        input: { throttle: 1, trackId: id === 'starport' ? 'neon-city' : 'starport' },
      });
      host.send({ type: 'track', trackId: id === 'starport' ? 'neon-city' : 'starport' });
    }
    for (const [host, guest, id] of [
      [a, b, 'neon-city'],
      [c, d, 'starport'],
    ]) {
      const snap = await host.wait(
        (m) => m.type === 'snapshot' && m.phase === 'racing' && m.elapsed > 0.7,
      );
      assert.equal(snap.trackId, id);
      assert.equal(snap.party.trackId, id);
      for (const car of snap.cars) {
        assert.equal(car.trackId, id);
        assert.ok(getTrack(id).nearest(car.x, car.z).distance < 4);
      }
      assert.deepEqual(
        await guest.wait((m) => m.type === 'snapshot' && m.serverNow === snap.serverNow),
        snap,
      );
    }
  },
);
