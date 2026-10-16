import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { drivingInput } from '../src/game/controls.js';
import { createCar, stepCar, resetCar, blankInput, DT, wrap } from '../shared/physics.js';
import { atDistance, boostCanisters, nearest, TRACK_WIDTH } from '../shared/track.js';
import {
  createBoostPickups,
  collectBoostPickups,
  BOOST_DURATION,
  BOOST_CAPACITY,
  PICKUP_RESPAWN,
} from '../shared/powerups.js';
const advance = (c, i, n = 1, pickups = null) => {
  for (let t = 0; t < n; t++) stepCar(c, i, DT, t * DT, false, pickups);
};
function onRoad() {
  const c = createCar('test', 'TEST'),
    p = atDistance(60);
  Object.assign(c, { x: p.x, z: p.z, yaw: Math.atan2(p.tx, p.tz) });
  return c;
}
test('A/left and D/right turn toward the correct side of the chase-camera screen at every heading', () => {
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2])
    for (const [key, side] of [
      ['KeyA', -1],
      ['ArrowLeft', -1],
      ['KeyD', 1],
      ['ArrowRight', 1],
    ]) {
      const c = onRoad();
      c.yaw = yaw;
      c.speed = 25;
      const straight = { ...c };
      const f = new Vector3(Math.sin(yaw), 0, Math.cos(yaw)),
        origin = new Vector3(c.x, 0.6, c.z);
      const camera = new PerspectiveCamera(54, 16 / 9, 0.1, 1000);
      camera.position.copy(origin).addScaledVector(f, -8);
      camera.position.y += 3;
      camera.lookAt(origin.clone().addScaledVector(f, 10));
      camera.updateMatrixWorld();
      stepCar(c, drivingInput(new Set([key])));
      stepCar(straight, blankInput());
      const turnX = new Vector3(c.x, 0.6, c.z).project(camera).x,
        straightX = new Vector3(straight.x, 0.6, straight.z).project(camera).x;
      assert.ok((turnX - straightX) * side > 0, `${key} at heading ${yaw}`);
    }
  const pad = { axes: [1], buttons: [] };
  assert.equal(drivingInput(new Set(), pad).steer, 1);
  pad.axes[0] = -1;
  assert.equal(drivingInput(new Set(), pad).steer, -1);
});
test('R reverses smoothly without resetting; F is the separate recovery action', () => {
  const c = onRoad(),
    start = { ...c },
    i = drivingInput(new Set(['KeyR']));
  assert.equal(i.reverse, true);
  assert.equal(i.reset, false);
  advance(c, i, 100);
  assert.equal(c.speed, -10);
  assert.equal(c.penalty, 0);
  assert.ok((c.x - start.x) * Math.sin(start.yaw) + (c.z - start.z) * Math.cos(start.yaw) < -5);
  const before = Math.abs(c.speed);
  advance(c, { ...blankInput(), brake: 1 }, 10);
  assert.ok(Math.abs(c.speed) < before);
  c.speed = 30;
  stepCar(c, i);
  assert.ok(c.speed > 0 && c.speed < 30);
  stepCar(c, drivingInput(new Set(['KeyF'])));
  assert.equal(c.speed, 0);
  assert.equal(c.penalty, 3);
});
test('steering remains effective in midair and changes the flight path', () => {
  for (const [key, sign] of [
    ['KeyA', 1],
    ['KeyD', -1],
  ]) {
    const c = onRoad();
    Object.assign(c, { speed: 20, y: 3, vy: 2, grounded: false });
    const yaw = c.yaw,
      start = { ...c };
    advance(c, drivingInput(new Set([key])), 24);
    assert.equal(c.grounded, false);
    assert.ok(wrap(c.yaw - yaw) * sign > 0.45);
    const lateral = (c.x - start.x) * Math.cos(yaw) - (c.z - start.z) * Math.sin(yaw);
    assert.ok(lateral * sign > 0.5);
  }
});
function offRoad() {
  const c = onRoad(),
    p = atDistance(60);
  c.x += p.tz * 25;
  c.z -= p.tx * 25;
  return c;
}
test('holding Space makes one jump with no automatic flip or repeat launch', () => {
  const c = onRoad(),
    input = drivingInput(new Set(['Space']));
  advance(c, input, 180);
  assert.equal(c.landings, 1);
  assert.equal(c.stunts, 0);
  assert.equal(c.rollActive, false);
  assert.equal(c.grounded, true);
});
test('a separate second Space press triggers one full 360 without adding lift', () => {
  for (const [direction, key] of [
    [-1, 'KeyA'],
    [1, 'KeyD'],
    [1, null],
  ]) {
    const c = onRoad();
    advance(c, drivingInput(new Set(['Space'])), 5);
    assert.equal(c.rollActive, false);
    stepCar(c, blankInput());
    const vy = c.vy,
      charge = c.charge;
    const input = drivingInput(new Set(['Space', key].filter(Boolean)));
    stepCar(c, input);
    assert.equal(c.rollActive, true);
    assert.equal(c.rollDirection, direction);
    assert.ok(c.vy < vy, 'The second tap cannot add upward thrust');
    assert.ok(Math.abs(c.charge - (charge - 6)) < 1e-7);
    stepCar(c, blankInput());
    stepCar(c, input);
    assert.ok(Math.abs(c.charge - (charge - 6)) < 1e-7, 'Extra taps cannot spend charge mid-roll');
    advance(c, input, 120);
    assert.equal(c.stunts, 1);
    assert.equal(c.landings, 1);
    assert.equal(c.grounded, true);
    assert.equal(c.rollAngle, 0);
  }
});
test('Space respects roll reserve and gives landing assist for a late second tap', () => {
  const empty = onRoad();
  advance(empty, drivingInput(new Set(['Space'])), 5);
  stepCar(empty, blankInput());
  empty.charge = 5;
  stepCar(empty, drivingInput(new Set(['Space'])));
  assert.equal(empty.rollActive, false);
  const late = onRoad();
  stepCar(late, drivingInput(new Set(['Space'])));
  advance(late, blankInput(), 75);
  assert.equal(late.grounded, false);
  stepCar(late, drivingInput(new Set(['Space'])));
  advance(late, blankInput(), 30);
  assert.equal(late.grounded, true);
  assert.equal(late.stunts, 0);
  assert.equal(late.event, 'LANDING ASSIST');
});
test('Q/E no longer flip and controller A has the same two-press jump/flip action', () => {
  for (const key of ['KeyQ', 'KeyE']) {
    assert.equal(drivingInput(new Set([key])).roll, 0);
    assert.equal(drivingInput(new Set([key])).jump, false);
  }
  const pad = { axes: [0], buttons: [{ pressed: true }] },
    c = onRoad();
  advance(c, drivingInput(new Set(), pad), 4);
  assert.equal(c.rollActive, false);
  pad.buttons[0].pressed = false;
  stepCar(c, drivingInput(new Set(), pad));
  pad.buttons[0].pressed = true;
  stepCar(c, drivingInput(new Set(), pad));
  assert.equal(c.rollActive, true);
});
test('X gives stronger left/right cornering with a visible, bounded slide and speed retention', () => {
  for (const key of ['KeyA', 'KeyD']) {
    const regular = onRoad(),
      drift = onRoad(),
      startYaw = regular.yaw;
    regular.speed = drift.speed = 32;
    advance(regular, drivingInput(new Set([key])), 30);
    advance(drift, drivingInput(new Set([key, 'KeyX'])), 30);
    const regularTurn = Math.abs(wrap(regular.yaw - startYaw));
    const travelTurn = Math.abs(wrap(drift.yaw + drift.driftAngle - startYaw));
    assert.ok(travelTurn > regularTurn * 1.3, 'Drift must actually turn the travel path tighter');
    assert.ok(Math.abs(drift.driftAngle) > 0.2 && Math.abs(drift.driftAngle) <= 0.48);
    assert.ok(Math.sign(drift.driftAngle) === (key === 'KeyD' ? 1 : -1));
    assert.ok(drift.speed > regular.speed * 0.95, 'Drifting should retain useful cornering speed');
    assert.equal(drift.drifting, true);
  }
});
test('releasing X restores grip quickly and recoveries clear all drift state', () => {
  const c = onRoad();
  c.speed = 24;
  advance(c, drivingInput(new Set(['KeyX', 'KeyD'])), 25);
  const slip = Math.abs(c.driftAngle);
  stepCar(c, blankInput());
  assert.equal(c.drifting, false);
  assert.ok(Math.abs(c.driftAngle) < slip && Math.abs(c.driftAngle) > 0);
  advance(c, blankInput(), 30);
  assert.ok(Math.abs(c.driftAngle) < 0.001);
  c.drifting = true;
  c.driftAngle = 0.3;
  resetCar(c);
  assert.equal(c.drifting, false);
  assert.equal(c.driftAngle, 0);
});
test('drift needs forward speed, a steering input and road contact', () => {
  for (const setup of [
    { speed: 0 },
    { speed: -10 },
    { speed: 30, grounded: false, y: 2 },
    { speed: 30, off: true },
  ]) {
    const c = setup.off ? offRoad() : onRoad();
    Object.assign(c, setup);
    stepCar(c, drivingInput(new Set(['KeyX', 'KeyD'])));
    assert.equal(c.drifting, false);
  }
  const c = onRoad();
  c.speed = 30;
  stepCar(c, drivingInput(new Set(['KeyX'])));
  assert.equal(c.drifting, false);
  assert.equal(c.driftAngle, 0);
});
test('off-road driving and reverse can move from rest at reduced speeds', () => {
  for (const [key, expected] of [
    ['KeyW', 6],
    ['KeyR', -4],
  ]) {
    const c = offRoad(),
      start = { x: c.x, z: c.z };
    advance(c, drivingInput(new Set([key])), 180);
    assert.ok(nearest(c.x, c.z).distance > TRACK_WIDTH / 2);
    assert.equal(c.speed, expected);
    assert.ok(Math.hypot(c.x - start.x, c.z - start.z) > 8);
    assert.equal(c.penalty, 0);
    advance(c, blankInput(), 120);
    assert.equal(c.speed, 0);
  }
});
test('entering grass at speed slows progressively to crawl instead of locking the car', () => {
  const c = offRoad();
  c.speed = 52;
  const drive = drivingInput(new Set(['KeyW']));
  stepCar(c, drive);
  assert.ok(c.speed < 52 && c.speed > 45);
  advance(c, drive, 240);
  assert.equal(c.speed, 6);
  assert.equal(c.offroad, true);
  assert.equal(c.penalty, 0);
});
test('a stored boost activates off-road and gives a modest speed increase, with braking still available', () => {
  const normal = offRoad(),
    boosted = offRoad(),
    start = { x: normal.x, z: normal.z };
  boosted.boosts = 1;
  stepCar(boosted, drivingInput(new Set(['ShiftLeft'])));
  assert.equal(boosted.boosts, 0);
  assert.equal(boosted.boostTime, 10);
  advance(normal, drivingInput(new Set(['KeyW'])), 180);
  advance(boosted, blankInput(), 180);
  assert.equal(normal.speed, 6);
  assert.equal(boosted.speed, 9);
  assert.equal(boosted.boosting, true);
  assert.ok(boosted.boostTime > 6.9 && boosted.boostTime < 7.1);
  assert.ok(
    Math.hypot(boosted.x - start.x, boosted.z - start.z) >
      Math.hypot(normal.x - start.x, normal.z - start.z),
  );
  advance(boosted, drivingInput(new Set(['KeyS'])), 60);
  assert.equal(boosted.speed, 0);
  assert.equal(boosted.boosting, false);
});
test('a stranded driver can steer and drive or reverse back onto the circuit without recovery', () => {
  for (const reversing of [false, true]) {
    const c = offRoad(),
      p = atDistance(60);
    // With solid barriers, the shoulder remains directly accessible; a car
    // outside the fence must use an opening (covered by the barrier tests).
    c.x = p.x + p.tz * 14;
    c.z = p.z - p.tx * 14;
    const toward = Math.atan2(p.x - c.x, p.z - c.z);
    // Begin facing along the verge, so reaching the circuit requires steering too.
    const desired = wrap(toward + (reversing ? Math.PI : 0));
    let returned = false;
    for (let t = 0; t < 600; t++) {
      const error = wrap(desired - c.yaw),
        steer = Math.max(-1, Math.min(1, error * 2)) * (reversing ? 1 : -1);
      stepCar(
        c,
        { ...blankInput(), throttle: reversing ? 0 : 1, reverse: reversing, steer },
        DT,
        t * DT,
      );
      if (nearest(c.x, c.z).distance <= TRACK_WIDTH / 2) {
        returned = true;
        break;
      }
    }
    assert.equal(returned, true, reversing ? 'reverse return' : 'forward return');
    assert.equal(c.penalty, 0);
    assert.equal(c.totalGates, 0);
    const speed = Math.abs(c.speed);
    stepCar(c, { ...blankInput(), throttle: reversing ? 0 : 1, reverse: reversing });
    assert.equal(c.offroad, false);
    assert.ok(Math.abs(c.speed) > speed);
  }
});
test('canisters are shared pickups, respect capacity and height, and respawn after 20 seconds', () => {
  const pickups = createBoostPickups(),
    p = boostCanisters[0],
    a = onRoad(),
    b = onRoad();
  Object.assign(a, { x: p.x, z: p.z });
  Object.assign(b, { x: p.x, z: p.z });
  collectBoostPickups(a, pickups, 0);
  assert.equal(a.boosts, 1);
  assert.equal(pickups[0].availableAt, PICKUP_RESPAWN);
  collectBoostPickups(b, pickups, 0);
  assert.equal(b.boosts, 0);
  collectBoostPickups(b, pickups, PICKUP_RESPAWN);
  assert.equal(b.boosts, 1);
  a.boosts = BOOST_CAPACITY;
  const free = createBoostPickups();
  collectBoostPickups(a, free, 0);
  assert.equal(a.boosts, BOOST_CAPACITY);
  assert.equal(free[0].availableAt, 0);
  a.boosts = 0;
  a.y = 3;
  collectBoostPickups(a, free, 0);
  assert.equal(a.boosts, 0);
  a.y = 0;
  a.x = p.x + 4;
  collectBoostPickups(a, free, 0, { x: p.x - 4, z: p.z, y: 0 });
  assert.equal(a.boosts, 1);
});
test('Shift spends one stored canister for exactly ten seconds and holding it cannot chain boosts', () => {
  const empty = onRoad();
  stepCar(empty, { ...blankInput(), boost: true, throttle: 1 });
  assert.equal(empty.boostTime, 0);
  assert.equal(empty.boosting, false);
  const c = onRoad();
  c.boosts = 2;
  stepCar(c, { ...blankInput(), boost: true });
  assert.equal(c.boosts, 1);
  assert.equal(c.boostTime, BOOST_DURATION);
  assert.equal(c.boosting, true);
  // Braking keeps the car stationary while the independent timed boost runs out.
  advance(c, { ...blankInput(), boost: true, brake: 1 }, 599);
  assert.ok(c.boostTime > 0 && c.boostTime < 0.02);
  assert.equal(c.boosts, 1);
  stepCar(c, { ...blankInput(), boost: true, brake: 1 });
  assert.equal(c.boostTime, 0);
  advance(c, { ...blankInput(), boost: true, brake: 1 }, 90);
  assert.equal(c.boosts, 1);
  assert.equal(c.boostTime, 0);
  assert.equal(c.charge, 100);
  stepCar(c, blankInput());
  stepCar(c, { ...blankInput(), boost: true });
  assert.equal(c.boosts, 0);
  assert.equal(c.boostTime, 10);
});
