import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCar,
  stepCar,
  cleanInput,
  blankInput,
  resetCar,
  botInput,
  collideCars,
  DT,
} from '../shared/physics.js';
import { createBoostPickups } from '../shared/powerups.js';
import { atDistance, nearest, obstacles, TRACK_WIDTH } from '../shared/track.js';
import { barrierContact, barrierSegments } from '../shared/barriers.js';
import { drivingInput } from '../src/game/controls.js';
import {
  createPartyState,
  publicPartyState,
  beginPartyStep,
  endPartyStep,
  partyBotInput,
  mysteryBoxes,
  ITEMS,
  SHIELD_DURATION,
  HIT_PROTECTION,
  TRAP_CLEARANCE,
  BOX_RESPAWN,
} from '../shared/party.js';

const previous = (cars) => new Map(cars.map((c) => [c.id, { ...c }]));
const inputs = (cars, ids = []) =>
  new Map(cars.map((c) => [c.id, { ...blankInput(), useItem: ids.includes(c.id) }]));
function car(id = 'a', s = 100, lane = 0) {
  const p = atDistance(s),
    c = createCar(id, id.toUpperCase());
  Object.assign(c, {
    x: p.x + p.tz * lane,
    z: p.z - p.tx * lane,
    yaw: Math.atan2(p.tx, p.tz),
    speed: 30,
  });
  return c;
}
function use(state, cars, c, type, now = 1) {
  c.item = type;
  c.previousItem = false;
  beginPartyStep(cars, inputs(cars, [c.id]), state, now);
}
function onlyBox(state, id = 0) {
  state.boxes.forEach((b) => (b.availableAt = b.id === id ? 0 : 10000));
}

test('mystery boxes form six reachable three-lane rows clear of jump obstacles', () => {
  assert.equal(mysteryBoxes.length, 18);
  for (const b of mysteryBoxes) {
    assert.ok(nearest(b.x, b.z).distance < TRACK_WIDTH / 2 - 2);
    assert.ok(obstacles.every((o) => Math.hypot(b.x - o.x, b.z - o.z) > 25));
  }
});
test('E and controller B use items independently of boost and jump, and forged item fields are ignored', () => {
  assert.deepEqual(drivingInput(new Set(['KeyE'])), { ...blankInput(), useItem: true });
  assert.deepEqual(drivingInput(new Set(), { axes: [0], buttons: [{}, { pressed: true }] }), {
    ...blankInput(),
    useItem: true,
  });
  assert.deepEqual(
    cleanInput({ useItem: 'true', item: 'shockwave', shieldUntil: 999 }),
    blankInput(),
  );
  assert.deepEqual(cleanInput({ useItem: true, item: 'shockwave', shieldUntil: 999 }), {
    ...blankInput(),
    useItem: true,
  });
});
test('a shared swept pickup awards one item, respects inventory and respawns after ten seconds', () => {
  const state = createPartyState(123),
    p = mysteryBoxes[0],
    a = car('a'),
    b = car('b');
  onlyBox(state);
  for (const c of [a, b]) Object.assign(c, { x: p.x - p.tx * 3, z: p.z - p.tz * 3 });
  const prev = previous([a, b]);
  for (const c of [a, b]) Object.assign(c, { x: p.x + p.tx * 3, z: p.z + p.tz * 3 });
  endPartyStep([b, a], prev, state, 1);
  assert.ok(ITEMS[a.item]);
  assert.equal(b.item, null);
  assert.equal(state.boxes[0].availableAt, 1 + BOX_RESPAWN);
  assert.equal(a.boosts, 0);
  assert.equal(a.charge, 100);
  const held = a.item;
  Object.assign(a, { x: p.x, z: p.z });
  endPartyStep([a], previous([a]), state, 12);
  assert.equal(a.item, held);
  assert.equal(state.boxes[0].availableAt, 11);
  a.item = null;
  endPartyStep([a], previous([a]), state, 12);
  assert.ok(ITEMS[a.item]);
  assert.equal(state.boxes[0].availableAt, 22);
});
test('box draws are deterministic for simulation, include all items and keep the random seed out of network snapshots', () => {
  const draw = () => {
    const state = createPartyState(42),
      c = car(),
      p = mysteryBoxes[0],
      result = [];
    onlyBox(state);
    Object.assign(c, { x: p.x, z: p.z });
    for (let i = 0; i < 60; i++) {
      c.item = null;
      endPartyStep([c], previous([c]), state, i * 11);
      result.push(c.item);
    }
    assert.deepEqual(Object.keys(publicPartyState(state)).sort(), [
      'boxes',
      'pulses',
      'trackId',
      'traps',
    ]);
    return result;
  };
  const result = draw();
  assert.deepEqual(result, draw());
  assert.equal(new Set(result).size, 3);
});
test('airborne passes, recoveries, finishers and full inventories cannot steal a box', () => {
  for (const variant of ['air', 'reset', 'finished', 'full']) {
    const state = createPartyState(),
      p = mysteryBoxes[0],
      c = car();
    onlyBox(state);
    Object.assign(c, { x: p.x, z: p.z });
    if (variant === 'air') c.y = 2;
    if (variant === 'finished') c.finishTime = 90;
    if (variant === 'full') c.item = 'shield';
    const prev = previous([c]);
    if (variant === 'reset') c.penalty += 3;
    endPartyStep([c], prev, state, 1);
    assert.equal(state.boxes[0].availableAt, 0, variant);
  }
});
test('item activation consumes one held item and holding E cannot chain a newly collected item', () => {
  const state = createPartyState(),
    c = car();
  c.item = 'shield';
  beginPartyStep([c], inputs([c], ['a']), state, 1);
  assert.equal(c.item, null);
  assert.equal(c.itemsUsed, 1);
  assert.equal(c.shieldUntil, 1 + SHIELD_DURATION);
  c.item = 'shockwave';
  beginPartyStep([c], inputs([c], ['a']), state, 1.5);
  assert.equal(c.item, 'shockwave');
  assert.equal(state.pulses.length, 0);
  beginPartyStep([c], inputs([c]), state, 2);
  beginPartyStep([c], inputs([c], ['a']), state, 2.1);
  assert.equal(c.item, null);
  assert.equal(c.itemsUsed, 2);
  assert.equal(state.pulses[0].type, 'shockwave');
});
test('a same-tick shield blocks one shockwave regardless of player iteration order', () => {
  for (const reverse of [false, true]) {
    const state = createPartyState(),
      a = car('a'),
      b = car('b', 100, 4),
      cars = reverse ? [b, a] : [a, b];
    a.item = 'shockwave';
    b.item = 'shield';
    beginPartyStep(cars, inputs(cars, ['a', 'b']), state, 1);
    assert.equal(b.speed, 30);
    assert.equal(b.shieldUntil, 0);
    assert.equal(b.immuneUntil, 1 + HIT_PROTECTION);
    assert.equal(b.shieldBlocks, 1);
    assert.equal(a.partyHits, 0);
    assert.equal(b.item, null);
    assert.equal(a.item, null);
  }
});
test('a shield expires after four seconds and a later attack can hit', () => {
  const state = createPartyState(),
    a = car('a'),
    b = car('b', 100, 4);
  use(state, [a, b], b, 'shield', 1);
  use(state, [a, b], a, 'shockwave', 5);
  assert.ok(b.speed < 30);
  assert.equal(b.shieldBlocks, 0);
  assert.equal(a.partyHits, 1);
});
test('shockwaves respect range, height, recovery grace and finish state while never hitting the owner', () => {
  const state = createPartyState(),
    a = car('a'),
    hit = car('hit', 100, 4),
    far = car('far', 125),
    air = car('air', 100, -4),
    finished = car('done', 102),
    grace = car('grace', 98);
  air.y = 3;
  air.grounded = false;
  finished.finishTime = 90;
  grace.invulnerable = 1;
  const cars = [a, hit, far, air, finished, grace];
  use(state, cars, a, 'shockwave');
  assert.equal(a.partyHits, 1);
  assert.equal(a.speed, 30);
  assert.ok(hit.speed > 20 && hit.speed < 30);
  assert.ok(Math.hypot(hit.impactVX, hit.impactVZ) <= 4.001);
  for (const c of [far, air, finished, grace]) assert.equal(c.speed, 30, c.id);
});
test('two-second hit protection prevents stacking attacks while steering and braking remain available', () => {
  const state = createPartyState(),
    a = car('a', 100, -4),
    b = car('b');
  use(state, [a, b], a, 'shockwave', 1);
  const firstSpeed = b.speed;
  use(state, [a, b], a, 'shockwave', 2);
  assert.equal(b.speed, firstSpeed);
  assert.equal(a.partyHits, 1);
  const yaw = b.yaw;
  stepCar(b, { ...blankInput(), throttle: 1, steer: 1 }, DT, 2.1, false);
  assert.notEqual(b.yaw, yaw);
  assert.ok(b.speed > 0);
  const speed = b.speed;
  stepCar(b, { ...blankInput(), brake: 1 }, DT, 2.1 + DT, false);
  assert.ok(b.speed < speed);
  use(state, [a, b], a, 'shockwave', 3.1);
  assert.equal(a.partyHits, 2);
});
test('EMP traps drop behind on the road, need a grounded car and expire without accumulating', () => {
  const state = createPartyState(),
    a = car();
  use(state, [a], a, 'emp', 1);
  const first = state.traps[0];
  assert.ok((first.x - a.x) * Math.sin(a.yaw) + (first.z - a.z) * Math.cos(a.yaw) < -4);
  assert.equal(first.armedAt, 1.5);
  assert.equal(first.expiresAt, 11);
  for (let i = 0; i < 4; i++) use(state, [a], a, 'emp', 2 + i);
  assert.equal(state.traps.length, 3);
  assert.ok(!state.traps.some((t) => t.id === first.id));
  a.grounded = false;
  a.y = 2;
  use(state, [a], a, 'emp', 6);
  assert.equal(a.item, 'emp');
  assert.equal(state.traps.length, 3);
  beginPartyStep([a], inputs([a]), state, 20);
  assert.equal(state.traps.length, 0);
});
test('a trap ignores its owner and jumping cars but catches a fast ground pass', () => {
  for (const height of [0, TRAP_CLEARANCE + 0.1]) {
    const state = createPartyState(),
      a = car('a'),
      b = car('b');
    use(state, [a, b], a, 'emp', 1);
    const trap = state.traps[0],
      p = atDistance(100);
    Object.assign(b, {
      x: trap.x - p.tx * 3,
      z: trap.z - p.tz * 3,
      y: height,
      grounded: height === 0,
    });
    const prev = previous([a, b]);
    Object.assign(b, { x: trap.x + p.tx * 3, z: trap.z + p.tz * 3 });
    endPartyStep([a, b], prev, state, 1.4);
    assert.equal(b.empUntil, 0, 'Arming gives a warning');
    endPartyStep([a, b], prev, state, 1.6);
    assert.equal(state.traps.length, height === 0 ? 0 : 1);
    assert.equal(a.empUntil, 0);
    if (height === 0) {
      assert.equal(b.empUntil, 3.1);
      assert.equal(a.partyHits, 1);
    } else assert.equal(b.empUntil, 0);
  }
});
test('a shield absorbs a trap; a protected driver does not consume another trap', () => {
  const state = createPartyState(),
    a = car('a'),
    b = car('b');
  use(state, [a, b], a, 'emp', 1);
  const trap = state.traps[0];
  Object.assign(b, { x: trap.x, z: trap.z, shieldUntil: 5 });
  endPartyStep([a, b], previous([a, b]), state, 2);
  assert.equal(b.shieldBlocks, 1);
  assert.equal(b.empUntil, 0);
  assert.equal(state.traps.length, 0);
  use(state, [a, b], a, 'emp', 2.1);
  endPartyStep([a, b], previous([a, b]), state, 2.7);
  assert.equal(state.traps.length, 1);
  assert.equal(b.speed, 30);
});
test('EMP pauses active boost thrust, leaves the timer running and never consumes a stored boost while jammed', () => {
  const c = car();
  c.boostTime = 8;
  c.boosts = 1;
  c.empUntil = 2;
  c.slowUntil = 2;
  stepCar(c, { ...blankInput(), throttle: 1, boost: true }, DT, 1, false);
  assert.equal(c.boosting, false);
  assert.equal(c.boosts, 1);
  assert.ok(c.boostTime < 8);
  stepCar(c, blankInput(), DT, 2.1, false);
  assert.equal(c.boosting, true);
  c.boostTime = 0;
  c.empUntil = 4;
  stepCar(c, { ...blankInput(), boost: true }, DT, 3, false);
  assert.equal(c.boostTime, 0);
  assert.equal(c.boosts, 1);
});
test('recovery clears active attack effects; race reset clears items, stats and all party objects', () => {
  const c = car();
  Object.assign(c, {
    shieldUntil: 8,
    slowUntil: 5,
    empUntil: 5,
    item: 'shield',
    itemsUsed: 3,
    partyHits: 2,
  });
  resetCar(c);
  assert.equal(c.empUntil, 0);
  assert.equal(c.slowUntil, 0);
  assert.equal(c.shieldUntil, 0);
  assert.equal(c.item, 'shield', 'Recovery keeps an unspent pickup');
  const fresh = createCar('a', 'A'),
    state = createPartyState();
  assert.equal(fresh.item, null);
  assert.equal(fresh.partyHits, 0);
  assert.equal(fresh.itemsUsed, 0);
  assert.equal(state.traps.length, 0);
  assert.equal(state.pulses.length, 0);
  assert.ok(state.boxes.every((b) => b.availableAt === 0));
});
test('a shockwave cannot push a racer through a solid barrier', () => {
  const wall = barrierSegments.find((b) => b.s === 42 && b.side === 1),
    a = car('a'),
    b = car('b');
  Object.assign(b, {
    x: wall.x - wall.tz * 1.8,
    z: wall.z + wall.tx * 1.8,
    yaw: wall.yaw,
    speed: 12,
  });
  Object.assign(a, { x: b.x - wall.tz * 4, z: b.z + wall.tx * 4, yaw: wall.yaw, speed: 12 });
  const state = createPartyState();
  use(state, [a, b], a, 'shockwave', 1);
  for (let i = 0; i < 90; i++) {
    stepCar(b, blankInput(), DT, 1 + i * DT, false);
    assert.ok(!barrierSegments.some((w) => barrierContact(b, w)));
  }
});
test('four bots finish a party race, collect and use every item type, and retain bounded effects', () => {
  const cars = [0, 1, 2, 3].map((i) => createCar(String(i), 'BOT ' + i, i)),
    state = createPartyState(123),
    boosts = createBoostPickups(),
    seen = new Set();
  let elapsed = 0;
  for (; elapsed < 240; elapsed += DT) {
    const prev = previous(cars);
    const commands = new Map(
      cars.map((c, i) => [c.id, partyBotInput(botInput(c, i), c, cars, state, elapsed)]),
    );
    for (const c of cars) if (c.item && commands.get(c.id).useItem) seen.add(c.item);
    beginPartyStep(cars, commands, state, elapsed);
    cars.forEach((c) => stepCar(c, commands.get(c.id), DT, elapsed, true, boosts));
    collideCars(cars);
    endPartyStep(cars, prev, state, elapsed);
    assert.ok(state.traps.length <= 12);
    assert.ok(state.pulses.length <= 24);
    if (cars.every((c) => c.finishTime !== null)) break;
  }
  assert.ok(
    elapsed < 240,
    JSON.stringify(cars.map((c) => ({ id: c.id, lap: c.lap, gate: c.nextGate, item: c.item }))),
  );
  assert.deepEqual([...seen].sort(), ['emp', 'shield', 'shockwave']);
  assert.ok(cars.every((c) => c.itemsUsed >= 2));
  assert.ok(cars.reduce((sum, c) => sum + c.partyHits, 0) > 0);
});
