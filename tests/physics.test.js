import test from 'node:test';
import { createBoostPickups } from '../shared/powerups.js';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createCar,
  stepCar,
  botInput,
  blankInput,
  cleanInput,
  resetCar,
  raceOrder,
  collideCars,
  DT,
} from '../shared/physics.js';
import {
  atDistance,
  nearest,
  gates,
  obstacles,
  gateCrossed,
  TRACK_LENGTH,
  BARRIER_OFFSET,
  LAPS,
} from '../shared/track.js';
const run = (c, input, seconds) => {
  for (let t = 0; t < seconds; t += DT)
    stepCar(c, typeof input === 'function' ? input(c) : input, DT, t);
};
function cross(c, g, forward = true) {
  c.x = g.x - g.tx * 0.2 * (forward ? 1 : -1);
  c.z = g.z - g.tz * 0.2 * (forward ? 1 : -1);
  c.yaw = Math.atan2(g.tx, g.tz) + (forward ? 0 : Math.PI);
  c.speed = 40;
  stepCar(c, blankInput(), DT, 10);
}
test('track is continuous and distance sampling agrees with nearest point', () => {
  assert.ok(TRACK_LENGTH > 950 && TRACK_LENGTH < 1100);
  for (let s = 0; s < TRACK_LENGTH; s += 11) {
    const p = atDistance(s),
      n = nearest(p.x, p.z);
    assert.ok(n.distance < 1e-8);
    assert.ok(Math.abs(p.tx * p.tx + p.tz * p.tz - 1) < 1e-8);
  }
  assert.deepEqual(atDistance(0), atDistance(TRACK_LENGTH));
  assert.equal(gates.length, 12);
});
test('malformed client inputs are harmless and controls are clamped', () => {
  for (const input of [null, undefined, 2, 'oops', []])
    assert.deepEqual(cleanInput(input), blankInput());
  assert.deepEqual(
    cleanInput({
      throttle: 500,
      brake: -2,
      steer: Infinity,
      boost: 'true',
      jump: true,
      roll: -9,
      x: 1e9,
    }),
    { ...blankInput(), throttle: 1, jump: true, roll: -1 },
  );
});
test('jump is a finite arc: holding or re-pressing jump cannot hover', () => {
  const c = createCar('jump', 'JUMP');
  let max = 0,
    jumpedTwice = false;
  for (let t = 0; t < 2.5; t += DT) {
    const jump = t < 0.05 || t > 0.3;
    const prev = c.vy;
    stepCar(c, { ...blankInput(), jump }, DT, t);
    max = Math.max(max, c.y);
    if (t > 0.1 && c.vy > 0 && c.vy > prev + 0.1) jumpedTwice = true;
  }
  assert.ok(max > 3.7 && max < 4);
  assert.equal(jumpedTwice, false);
  assert.equal(c.landings, 1);
  assert.equal(c.grounded, true);
  assert.equal(c.y, 0);
});
test('360 stunt rotates once and awards charge only after a clean landing', () => {
  const c = createCar('roll', 'ROLL');
  run(c, (car) => ({ ...blankInput(), jump: true, roll: car.y > 0.25 ? 1 : 0 }), 1.8);
  assert.equal(c.stunts, 1);
  assert.equal(c.landings, 1);
  assert.equal(c.rollAngle, 0);
  assert.equal(c.rollActive, false);
  assert.equal(c.grounded, true);
  const before = c.stunts;
  run(c, { ...blankInput(), roll: 1 }, 1);
  assert.equal(c.stunts, before);
});
test('a late airborne roll uses landing assist without awarding a stunt', () => {
  const c = createCar('late', 'LATE');
  run(c, (car) => ({ ...blankInput(), jump: true, roll: car.vy < 0 && car.y < 1 ? 1 : 0 }), 1.8);
  assert.equal(c.stunts, 0);
  assert.equal(c.rollAngle, 0);
  assert.equal(c.grounded, true);
  assert.equal(c.event, 'LANDING ASSIST');
});
test('jump reserve and cooldown block repeated launches', () => {
  const c = createCar('empty', 'EMPTY');
  c.charge = 10;
  stepCar(c, { ...blankInput(), jump: true }, DT, 0);
  assert.equal(c.grounded, true);
  c.charge = 100;
  c.previousJump = false;
  c.jumpCooldown = 1;
  stepCar(c, { ...blankInput(), jump: true }, DT, 0);
  assert.equal(c.grounded, true);
});
test('obstacles penalize ground hits and allow a high enough jump', () => {
  const o = obstacles[0];
  function approach(y) {
    const c = createCar('obstacle', 'TEST');
    Object.assign(c, {
      x: o.x - o.tx * 2,
      z: o.z - o.tz * 2,
      y,
      yaw: Math.atan2(o.tx, o.tz),
      speed: 40,
      grounded: y === 0,
      vy: 0,
    });
    stepCar(c, blankInput(), DT, 0);
    return c;
  }
  assert.ok(approach(0).speed < 10);
  assert.ok(approach(2).speed > 35);
});
test('out-of-order, backward and out-of-bounds checkpoint crossings never count', () => {
  const c = createCar('gate', 'GATE');
  cross(c, gates[3]);
  assert.equal(c.totalGates, 0);
  cross(c, gates[0], false);
  assert.equal(c.totalGates, 0);
  const g = gates[0],
    p = { x: g.x - g.tx, z: g.z - g.tz, y: 0 },
    q = { x: g.x + g.tx, z: g.z + g.tz, y: 0 };
  assert.equal(gateCrossed(g, p, q), true);
  assert.equal(gateCrossed(g, q, p), false);
  for (const v of [p, q]) {
    v.x += g.tz * 20;
    v.z -= g.tx * 20;
  }
  assert.equal(gateCrossed(g, p, q), false);
  cross(c, gates[0]);
  assert.equal(c.totalGates, 1);
  cross(c, gates[0]);
  assert.equal(c.totalGates, 1);
});
test('start/finish counts the full shoulder corridor while rejecting reverse and outside-wall crossings', () => {
  const g = gates[0];
  function crossing(gate, lateral, height = 0) {
    return [-1, 1].map((along) => ({
      x: gate.x + gate.tx * along + gate.tz * lateral,
      z: gate.z + gate.tz * along - gate.tx * lateral,
      y: height,
    }));
  }
  for (let lateral = -16.2; lateral <= 16.2; lateral += 0.2) {
    const [before, after] = crossing(g, lateral);
    assert.equal(gateCrossed(g, before, after), true, `Missed lane ${lateral}`);
    assert.equal(gateCrossed(g, after, before), false);
    assert.equal(gateCrossed(g, ...crossing(g, lateral, 4)), true);
  }
  for (const side of [-1, 1]) {
    assert.equal(gateCrossed(g, ...crossing(g, side * (BARRIER_OFFSET + 1))), false);
    assert.equal(gateCrossed(gates[1], ...crossing(gates[1], side * 13)), false);
  }
  assert.equal(gateCrossed(g, ...crossing(g, 0, 8)), false);
});
test('driving or jumping across either shoulder starts, completes a lap and finishes exactly once', () => {
  const g = gates[0];
  for (const lateral of [-16.2, 16.2]) {
    for (const height of [0, 2]) {
      for (const completedLaps of [-1, 0, LAPS - 1]) {
        const c = createCar('shoulder', 'SHOULDER');
        Object.assign(c, {
          x: g.x - g.tx * 0.025 + g.tz * lateral,
          z: g.z - g.tz * 0.025 - g.tx * lateral,
          y: height,
          grounded: height === 0,
          yaw: Math.atan2(g.tx, g.tz),
          speed: 6,
          completedLaps: Math.max(0, completedLaps),
          totalGates: completedLaps < 0 ? 0 : (completedLaps + 1) * gates.length,
        });
        const before = c.totalGates;
        stepCar(c, blankInput(), DT, 100);
        assert.equal(c.totalGates, before + 1, `Missed shoulder ${lateral}, height ${height}`);
        assert.equal(c.nextGate, 1);
        assert.equal(c.completedLaps, completedLaps + 1);
        assert.equal(c.finishTime, completedLaps === LAPS - 1 ? 100 : null);
        for (let i = 0; i < 5; i++) stepCar(c, blankInput(), DT, 100 + (i + 1) * DT);
        assert.equal(c.totalGates, before + 1, 'One crossing must not count twice');
      }
    }
  }
});
test('recovery returns to last validated checkpoint and adds one penalty per key press', () => {
  const c = createCar('reset', 'RESET');
  cross(c, gates[0]);
  cross(c, gates[1]);
  const progress = c.totalGates;
  run(c, { ...blankInput(), reset: true }, 0.3);
  assert.equal(c.penalty, 3);
  assert.equal(c.totalGates, progress);
  assert.equal(c.nextGate, 2);
  assert.ok(nearest(c.x, c.z).distance < 0.05);
  stepCar(c, blankInput());
  stepCar(c, { ...blankInput(), reset: true });
  assert.equal(c.penalty, 6);
});
test('a complete four-car simulation finishes three laps in order with obstacle stunts', () => {
  const cars = Array.from({ length: 4 }, (_, i) => createCar(String(i), 'BOT ' + i, i));
  const pickups = createBoostPickups();
  let t = 0;
  for (; t < 220; t += DT) {
    cars.forEach((c, i) => stepCar(c, botInput(c, i), DT, t, true, pickups));
    collideCars(cars);
    if (cars.every((c) => c.finishTime !== null)) break;
  }
  assert.ok(
    t < 220,
    JSON.stringify(cars.map((c) => ({ lap: c.lap, gates: c.totalGates, finished: c.finishTime }))),
  );
  for (const c of cars) {
    assert.equal(c.completedLaps, LAPS);
    assert.equal(c.totalGates, 37);
    assert.ok(c.stunts >= 4);
    assert.ok(c.finishTime > 50 && c.finishTime < 220);
    assert.ok(c.bestLap > 15);
  }
  const order = raceOrder(cars);
  for (let i = 1; i < 4; i++) assert.ok(order[i].finishTime >= order[i - 1].finishTime);
});
test('recovery time is included in final race time', () => {
  const c = createCar('penalty', 'PENALTY');
  c.penalty = 6;
  c.totalGates = 36;
  c.nextGate = 0;
  c.completedLaps = 2;
  cross(c, gates[0]);
  assert.equal(c.finishTime, 16);
  assert.equal(c.completedLaps, 3);
});
test('game asset contains the rig, geometry and embedded materials', async () => {
  const file = await readFile(new URL('../public/models/roadster.glb', import.meta.url));
  assert.equal(file.toString('ascii', 0, 4), 'glTF');
  assert.equal(file.readUInt32LE(4), 2);
  assert.equal(file.readUInt32LE(8), file.length);
  const json = JSON.parse(file.toString('utf8', 20, 20 + file.readUInt32LE(12)));
  for (const name of ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR', 'Steer_FL', 'Steer_FR'])
    assert.ok(
      json.nodes.some((n) => n.name === name),
      name,
    );
  assert.ok(json.meshes.length > 20);
  assert.ok(json.materials.length >= 5);
  assert.ok(!json.buffers.some((b) => b.uri));
  assert.ok(!(json.images || []).some((i) => i.uri));
});

test('close racing does not apply continuous contact drag, while impacts transfer speed', () => {
  const a = createCar('a', 'A'),
    b = createCar('b', 'B');
  Object.assign(a, { x: 0, z: 0, yaw: 0, speed: 30 });
  Object.assign(b, { x: 0, z: 2.2, yaw: 0, speed: 30 });
  collideCars([a, b]);
  assert.equal(a.speed, 30);
  assert.equal(b.speed, 30);
  assert.ok(Math.abs(a.z - b.z) >= 2.2999);
  Object.assign(a, { x: 0, z: 0, yaw: 0, speed: 40 });
  Object.assign(b, { x: 0, z: 2.2, yaw: 0, speed: 20 });
  collideCars([a, b]);
  assert.ok(a.speed < 40);
  assert.ok(b.speed > 20);
  assert.ok(Math.abs(a.speed + b.speed - 60) < 1e-8);
  a.finishTime = 90;
  a.speed = 0;
  b.speed = 30;
  a.z = 0;
  b.z = 1;
  collideCars([a, b]);
  assert.equal(b.speed, 30);
  assert.equal(b.z, 1);
});
