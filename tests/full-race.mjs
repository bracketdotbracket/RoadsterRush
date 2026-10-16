// Run against a locally running built game: npm run server, then node tests/full-race.mjs.
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { botInput, DT } from '../shared/physics.js';
import { partyBotInput } from '../shared/party.js';
const trackId = process.env.RACE_TEST_TRACK || 'neon-city';
const origin = process.env.RACE_TEST_URL || 'http://127.0.0.1:2567';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const html = await (await fetch(origin)).text();
assert.ok(html.includes('<div id="root"></div>'));
for (const match of html.matchAll(/(?:src|href)="(\/[^" ]+)"/g)) {
  const response = await fetch(origin + match[1]);
  assert.equal(response.status, 200, match[1]);
}
const asset = await fetch(origin + '/models/roadster.glb');
assert.equal(asset.status, 200);
assert.equal(asset.headers.get('content-type'), 'model/gltf-binary');
const racers = [];
const sharedSnapshots = new Map();
let matchedSnapshots = 0,
  comparisonError = null;
async function waitFor(condition, timeout = 10000) {
  const end = Date.now() + timeout;
  while (!condition()) {
    if (comparisonError) throw comparisonError;
    if (Date.now() > end) throw Error('Race check timed out');
    await pause(20);
  }
}
let clock, report;
try {
  for (let i = 0; i < 2; i++) {
    const player = {
      ws: new WebSocket(origin.replace(/^http/, 'ws') + '/race/ws'),
      id: null,
      state: null,
      seq: 0,
      phase: 'lobby',
      result: null,
      collectedBoost: false,
      usedBoost: false,
      collectedItem: false,
      party: null,
      cars: [],
      elapsed: 0,
      room: null,
      index: i,
    };
    racers.push(player);
    player.ws.on('close', (code, reason) =>
      console.log('Socket closed', player.index, code, String(reason)),
    );
    player.ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.type === 'welcome') {
        player.id = m.id;
        player.code = m.code;
      }
      if (m.type === 'lobby') {
        player.room = m;
        player.phase = m.phase;
      }
      if (m.type === 'raceStart') {
        player.phase = 'countdown';
        player.seq = 0;
        player.state = m.cars.find((c) => c.id === player.id);
        player.party = m.party;
        player.cars = m.cars;
        player.elapsed = 0;
      }
      if (m.type === 'snapshot') {
        player.phase = m.phase;
        player.state = m.cars.find((c) => c.id === player.id);
        player.party = m.party;
        player.cars = m.cars;
        player.elapsed = m.elapsed;
        const payload = JSON.stringify({ cars: m.cars, party: m.party });
        const other = sharedSnapshots.get(m.serverNow);
        if (other) {
          if (other !== payload) comparisonError = Error('Clients received different party state');
          sharedSnapshots.delete(m.serverNow);
          matchedSnapshots++;
        } else sharedSnapshots.set(m.serverNow, payload);
        if (sharedSnapshots.size > 100) sharedSnapshots.delete(sharedSnapshots.keys().next().value);
      }
      player.collectedBoost ||= player.state?.boosts > 0;
      player.usedBoost ||= player.state?.boostTime > 0;
      player.collectedItem ||= !!player.state?.item;
      if (m.type === 'finished') {
        player.phase = 'finished';
        player.result = m;
      }
    });
    await new Promise((resolve, reject) => {
      player.ws.once('open', resolve);
      player.ws.once('error', reject);
    });
    player.ws.send(
      JSON.stringify(
        i === 0
          ? { type: 'create', name: 'TEST HOST', trackId }
          : { type: 'join', code: racers[0].code, name: 'TEST GUEST' },
      ),
    );
    await waitFor(() => player.id);
  }
  for (const p of racers) p.ws.send(JSON.stringify({ type: 'ready', ready: true }));
  await waitFor(
    () => racers[0].room?.players.length === 2 && racers[0].room.players.every((p) => p.ready),
  );
  racers[0].ws.send(JSON.stringify({ type: 'start' }));
  let previous = performance.now(),
    accumulator = 0;
  clock = setInterval(() => {
    const now = performance.now();
    accumulator += (now - previous) / 1000;
    previous = now;
    while (accumulator >= DT) {
      for (const p of racers)
        if (p.state && ['countdown', 'racing'].includes(p.phase)) {
          p.ws.send(
            JSON.stringify({
              type: 'input',
              seq: ++p.seq,
              input: partyBotInput(botInput(p.state, p.index), p.state, p.cars, p.party, p.elapsed),
            }),
          );
        }
      accumulator -= DT;
    }
  }, 8);
  report = setInterval(
    () =>
      console.log(
        JSON.stringify(
          racers.map((p) => ({
            phase: p.phase,
            seq: p.seq,
            ack: p.state?.lastSeq,
            x: p.state?.x,
            z: p.state?.z,
            lap: p.state?.lap,
            gates: p.state?.totalGates,
            speed: p.state?.speed,
            penalty: p.state?.penalty,
            item: p.state?.item,
            used: p.state?.itemsUsed,
            hits: p.state?.partyHits,
          })),
        ),
      ),
    10000,
  );
  console.log(`Two real WebSocket clients are driving a full three-lap party race on ${trackId}.`);
  await waitFor(() => racers.every((p) => p.result), 190000);
  assert.deepEqual(racers[0].result, racers[1].result);
  if (comparisonError) throw comparisonError;
  assert.ok(matchedSnapshots > 100, 'Party snapshots matched for both clients throughout the race');
  assert.ok(
    racers.every((p) => p.collectedItem),
    'Both players collected mystery boxes over the real socket',
  );
  assert.ok(
    racers.some((p) => p.collectedBoost),
    'A canister was collected over the real socket',
  );
  assert.ok(
    racers.some((p) => p.usedBoost),
    'A stored boost was activated over the real socket',
  );
  for (const car of racers[0].result.cars) {
    assert.equal(car.trackId, trackId);
    assert.equal(car.completedLaps, 3);
    assert.equal(car.totalGates, 37);
    assert.ok(car.finishTime > 50 && car.finishTime < 180);
    assert.ok(car.stunts >= 4);
    assert.ok(car.itemsUsed > 0);
  }
  console.log(
    JSON.stringify(
      racers[0].result.cars.map((c) => ({
        name: c.name,
        time: c.finishTime,
        laps: c.completedLaps,
        stunts: c.stunts,
        itemsUsed: c.itemsUsed,
        hits: c.partyHits,
        blocks: c.shieldBlocks,
      })),
      null,
      2,
    ),
  );
  racers[0].ws.send(JSON.stringify({ type: 'rematch' }));
  await waitFor(() => racers.every((p) => p.phase === 'lobby'));
  assert.ok(racers[0].room.players.every((p) => p.ready === false));
  for (const p of racers) p.ws.send(JSON.stringify({ type: 'ready', ready: true }));
  await waitFor(() => racers[0].room.players.every((p) => p.ready));
  racers[0].ws.send(JSON.stringify({ type: 'start' }));
  await waitFor(() => racers.every((p) => p.phase === 'countdown'));
  for (const p of racers) {
    assert.equal(p.state.trackId, trackId);
    assert.equal(p.party.trackId, trackId);
    assert.equal(p.state.item, null);
    assert.equal(p.state.itemsUsed, 0);
    assert.equal(p.party.traps.length, 0);
    assert.equal(p.party.pulses.length, 0);
    assert.ok(p.party.boxes.every((b) => b.availableAt === 0));
  }
  console.log(
    `PASS: hosted assets, ${matchedSnapshots} matching party snapshots, item pickups/use, full lap results and fresh rematch state.`,
  );
} finally {
  clearInterval(clock);
  clearInterval(report);
  racers.forEach((p) => p.ws.close());
}
