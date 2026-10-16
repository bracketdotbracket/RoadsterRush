import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { createCar, DT } from '../shared/physics.js';
import { RenderMotion, ChaseCameraMotion, interpolateCar, angleDelta } from '../src/game/motion.js';
import { renderPixelRatio } from '../src/game/render-settings.js';
import { RaceEngine } from '../src/game/engine.js';

const close = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const car = (x = 0) => ({ ...createCar('you', 'YOU'), x, y: 0, z: 0, yaw: 0, speed: 30 });

test('fixed-step motion is continuous at 30–144 Hz and uneven render intervals', () => {
  for (const intervals of [
    [1 / 30],
    [1 / 60],
    [1 / 90],
    [1 / 120],
    [1 / 144],
    [1 / 144, 1 / 50, 1 / 90, 1 / 70],
  ]) {
    const motion = new RenderMotion(),
      c = car();
    motion.reset([c]);
    let time = 0,
      accumulator = 0;
    for (let frame = 0; frame < 500; frame++) {
      const dt = intervals[frame % intervals.length];
      time += dt;
      accumulator += dt;
      while (accumulator + 1e-12 >= DT) {
        motion.beforeStep([c]);
        c.x += c.speed * DT;
        accumulator -= DT;
      }
      const [rendered] = motion.sample([c], accumulator / DT, dt, time * 1000, false, c.id);
      close(rendered.x, Math.max(0, time - DT) * 30);
    }
  }
});

test('steering across angle wrap and completing a roll do not flip the model backwards', () => {
  const a = { ...car(), yaw: Math.PI - 0.02, rollAngle: Math.PI * 2 - 0.1 };
  const b = { ...car(0.5), yaw: -Math.PI + 0.02, rollAngle: 0 };
  const p = interpolateCar(a, b, 0.5);
  close(angleDelta(a.yaw, p.yaw), 0.02);
  close(angleDelta(a.rollAngle, p.rollAngle), 0.05);
});

test('recoveries, race resets and distant teleports clear presentation history', () => {
  const a = car(1),
    b = { ...car(4), penalty: 3 };
  assert.deepEqual(interpolateCar(a, b, 0.1), b);
  assert.deepEqual(interpolateCar(a, car(100), 0.1), car(100));
  const motion = new RenderMotion();
  motion.reset([a]);
  motion.pushSnapshot([a], 0);
  motion.reconcile(a, car(0.8));
  motion.reset([b]);
  assert.equal(motion.snapshots.length, 0);
  assert.equal(motion.correction, null);
  assert.deepEqual(motion.sample([b], 0.3, DT, 200, false, b.id)[0], b);
});

test('20 Hz opponents interpolate at display cadence and stop at the last received state on packet loss', () => {
  const motion = new RenderMotion();
  let sent = -50,
    latest;
  for (let frame = 0; frame < 240; frame++) {
    const now = (frame * 1000) / 120;
    while (sent + 50 <= now + 1e-7) {
      sent += 50;
      latest = { ...car((sent / 1000) * 30), id: 'rival' };
      motion.pushSnapshot([latest], sent);
    }
    const [result] = motion.sample([latest], 0, 1 / 120, now, true, 'you');
    if (now >= 100) close(result.x, ((now - 100) / 1000) * 30);
  }
  const [stalled] = motion.sample([latest], 0, DT, 3000, true, 'you');
  close(stalled.x, latest.x);
});

test('small server corrections settle smoothly without moving the physics car', () => {
  const motion = new RenderMotion(),
    old = car(5),
    next = car(4.7);
  motion.reset([car(4.5)]);
  const before = motion.sample([old], 0.5, 0, 0, true, 'you')[0];
  const nextCopy = structuredClone(next);
  motion.reconcile(old, next);
  const after = motion.sample([next], 0.5, 0, 0, true, 'you')[0];
  close(before.x, after.x);
  motion.beforeStep([next]);
  for (let i = 0; i < 60; i++) motion.sample([next], 1, DT, (i * 1000) / 60, true, 'you');
  close(motion.sample([next], 1, 0, 1000, true, 'you')[0].x, next.x);
  assert.deepEqual(next, nextCopy);
  motion.reconcile(next, { ...car(20), penalty: 3 });
  assert.equal(motion.correction, null);
});

test('chase camera holds the car steady during translation and jumps, at every refresh rate', () => {
  for (const hz of [30, 60, 120, 144]) {
    const chase = new ChaseCameraMotion(),
      camera = new PerspectiveCamera(54, 16 / 9, 0.3, 1500);
    let first;
    for (let frame = 0; frame < hz * 2; frame++) {
      const t = frame / hz,
        c = { ...car(t * 30), y: Math.sin(t) * 3 };
      const pose = chase.update(c, 1 / hz);
      camera.position.fromArray(pose.position);
      camera.lookAt(...pose.target);
      camera.updateMatrixWorld();
      const projected = new Vector3(c.x, c.y + 0.6, c.z).project(camera);
      first ||= projected.clone();
      close(projected.x, first.x);
      close(projected.y, first.y);
    }
  }
});

test('camera steering and boost zoom settle consistently at different frame rates', () => {
  const results = [];
  for (const hz of [30, 60, 120, 144]) {
    const chase = new ChaseCameraMotion();
    chase.update(car(), 0);
    let result;
    for (let i = 0; i < hz; i++)
      result = chase.update({ ...car(), yaw: 0.8, speed: 50, boosting: true }, 1 / hz);
    results.push(result);
  }
  for (const r of results.slice(1)) {
    close(r.fov, results[0].fov);
    r.position.forEach((v, i) => close(v, results[0].position[i]));
  }
});

test('large displays stay within the graphics budget while ordinary screens keep native pixels', () => {
  close(renderPixelRatio(1280, 720, 2, 'medium'), 1);
  for (const [q, budget] of [
    ['high', 2600000],
    ['medium', 1600000],
    ['low', 1000000],
  ]) {
    for (const [w, h, dpr] of [
      [3436, 3306, 2],
      [2190, 2334, 2],
      [3840, 2160, 1],
      [1280, 720, 1],
    ]) {
      const r = renderPixelRatio(w, h, dpr, q);
      assert.ok(w * h * r * r <= budget + 1);
      assert.ok(r <= dpr && r > 0);
    }
  }
});

test('the actual engine draws interpolated poses, including frames without a physics step', () => {
  const originalRAF = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = () => 1;
  try {
    const engine = new RaceEngine({}, () => {}),
      poses = [];
    engine.cars = [car()];
    engine.motion.reset(engine.cars);
    engine.phase = 'racing';
    engine.last = 0;
    engine.world = { update: (cars) => poses.push(cars[0].x) };
    engine.tick = () => {
      engine.cars[0].x += 0.5;
    };
    for (let frame = 1; frame <= 13; frame++) engine.loop((frame * 1000) / 120);
    for (let i = 2; i < poses.length; i++) close(poses[i] - poses[i - 1], 0.25);
    assert.ok(engine.cars[0].x > poses.at(-1), 'Rendering must not overwrite the simulation');
  } finally {
    globalThis.requestAnimationFrame = originalRAF;
  }
});
