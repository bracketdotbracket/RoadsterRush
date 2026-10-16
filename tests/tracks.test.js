import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Matrix4, PerspectiveCamera, Vector3 } from 'three';
import { getTrack, TRACK_OPTIONS, isTrackId, BARRIER_OFFSET } from '../shared/track.js';
import { getBarrierSegments, barrierContact, CAR_HALF_LENGTH } from '../shared/barriers.js';
import {
  createCar,
  stepCar,
  resetCar,
  botInput,
  collideCars,
  blankInput,
  DT,
} from '../shared/physics.js';
import { createBoostPickups, collectBoostPickups } from '../shared/powerups.js';
import {
  createPartyState,
  getMysteryBoxes,
  beginPartyStep,
  endPartyStep,
  partyBotInput,
} from '../shared/party.js';
import { createSpaceport, spaceportLayout } from '../src/game/spaceport.js';
import { stageMenuCars, menuCameraPose } from '../src/game/city-layout.js';

// Numerical geometry and scene-graph checks; no browser or WebGL execution.
test('circuits have distinct closed layouts and independent pickup and barrier data', () => {
  assert.equal(TRACK_OPTIONS.length, 2);
  const a = getTrack('neon-city'),
    b = getTrack('starport');
  assert.ok(b.TRACK_LENGTH > 1250 && b.TRACK_LENGTH < 1400);
  assert.ok(b.TRACK_LENGTH > a.TRACK_LENGTH + 200);
  assert.equal(isTrackId('starport'), true);
  assert.equal(isTrackId('forged'), false);
  assert.equal(getTrack('forged'), a);
  assert.notEqual(a.samples, b.samples);
  assert.notEqual(getBarrierSegments(a.id), getBarrierSegments(b.id));
  assert.notEqual(getMysteryBoxes(a.id), getMysteryBoxes(b.id));
  for (const t of [a, b]) {
    assert.deepEqual(t.atDistance(0), t.atDistance(t.TRACK_LENGTH));
    for (let s = 0; s < t.TRACK_LENGTH; s += 13) {
      const p = t.atDistance(s);
      assert.ok(t.nearest(p.x, p.z).distance < 1e-8);
    }
    for (const p of [...t.boostCanisters, ...getMysteryBoxes(t.id)]) {
      assert.ok(t.nearest(p.x, p.z).distance < 5);
      for (const o of t.obstacles) assert.ok(Math.hypot(p.x - o.x, p.z - o.z) > 9);
    }
    const car = createCar('p', 'P', 0, undefined, t.id);
    assert.equal(car.trackId, t.id);
    assert.ok(t.nearest(car.x, car.z).distance < 3);
    car.x = 999;
    car.z = 999;
    resetCar(car);
    assert.ok(t.nearest(car.x, car.z).distance < 0.001);
  }
});
test('Starport pickups, item drops and shoulder finishes use its own coordinates', () => {
  const t = getTrack('starport'),
    car = createCar('p', 'P', 0, undefined, t.id),
    pickups = createBoostPickups(t.id),
    party = createPartyState(42, t.id);
  const p = t.boostCanisters[3];
  Object.assign(car, { x: p.x, z: p.z });
  collectBoostPickups(car, pickups, 0);
  assert.equal(car.boosts, 1);
  const b = getMysteryBoxes(t.id)[8];
  Object.assign(car, { x: b.x, z: b.z });
  endPartyStep([car], new Map([[car.id, { ...car }]]), party, 1);
  assert.ok(car.item);
  car.item = 'emp';
  car.yaw = Math.atan2(b.tx, b.tz);
  beginPartyStep([car], new Map([[car.id, { useItem: true }]]), party, 2);
  assert.equal(party.traps.length, 1);
  for (const side of [-1, 1]) {
    const c = createCar('finish', 'FINISH', 0, undefined, t.id),
      g = t.gates[0];
    Object.assign(c, {
      x: g.x - g.tx * 0.025 + g.tz * side * 16.2,
      z: g.z - g.tz * 0.025 - g.tx * side * 16.2,
      yaw: Math.atan2(g.tx, g.tz),
      speed: 6,
      nextGate: 0,
      totalGates: 36,
      completedLaps: 2,
    });
    stepCar(c, blankInput(), DT, 100);
    assert.equal(c.finishTime, 100);
    assert.equal(c.completedLaps, 3);
  }
});
test('Starport barriers stop boosted cars along the full circuit', () => {
  const barriers = getBarrierSegments('starport');
  for (let i = 0; i < barriers.length; i += 9) {
    const b = barriers[i],
      nx = b.tz * b.side,
      nz = -b.tx * b.side,
      c = createCar('wall', 'WALL', 0, undefined, 'starport');
    Object.assign(c, {
      x: b.x - nx * (b.halfWidth + CAR_HALF_LENGTH + 0.01),
      z: b.z - nz * (b.halfWidth + CAR_HALF_LENGTH + 0.01),
      yaw: Math.atan2(nx, nz),
      speed: 72,
      boostTime: 10,
    });
    stepCar(c, { ...blankInput(), throttle: 1 }, DT, 0, false);
    assert.equal(
      barriers.some((b) => barrierContact(c, b)),
      false,
      `Overlap at segment ${i}`,
    );
    assert.ok((c.x - b.x) * nx + (c.z - b.z) * nz < 0);
    assert.equal(c.event, 'BARRIER HIT');
  }
});
test('both four-car party races finish when simulated side by side without track state leaking', () => {
  const races = TRACK_OPTIONS.map((t) => ({
    id: t.id,
    cars: Array.from({ length: 4 }, (_, i) => createCar('bot' + i, 'BOT' + i, i, undefined, t.id)),
    pickups: createBoostPickups(t.id),
    party: createPartyState(42, t.id),
  }));
  for (let n = 0; n < 60 * 180; n++) {
    for (const r of races) {
      const now = n * DT,
        previous = new Map(r.cars.map((c) => [c.id, { ...c }]));
      const inputs = new Map(
        r.cars.map((c, i) => [c.id, partyBotInput(botInput(c, i), c, r.cars, r.party, now)]),
      );
      beginPartyStep(r.cars, inputs, r.party, now);
      for (const c of r.cars) stepCar(c, inputs.get(c.id), DT, now, true, r.pickups);
      collideCars(r.cars);
      endPartyStep(r.cars, previous, r.party, now);
    }
    if (races.every((r) => r.cars.every((c) => c.finishTime !== null))) break;
  }
  for (const r of races)
    for (const c of r.cars) {
      assert.equal(c.trackId, r.id);
      assert.equal(c.completedLaps, 3, JSON.stringify(c));
      assert.equal(c.totalGates, 37);
      assert.ok(c.finishTime > 50 && c.finishTime < 160);
      assert.equal(c.penalty, 0);
      assert.ok(c.itemsUsed > 0);
      assert.ok(c.stunts >= 4);
    }
});
test('factory, launch pads and hangars stay clear of the complete driving corridor', () => {
  const t = getTrack('starport');
  for (const values of Object.values(spaceportLayout()))
    for (const b of Array.isArray(values) ? values : [values]) {
      for (let x = -1; x <= 1; x += 0.1)
        for (let z = -1; z <= 1; z += 0.1) {
          if (b.radius && Math.hypot(x, z) > 1) continue;
          assert.ok(
            t.nearest(
              b.x + x * (b.radius || b.width / 2 || 8),
              b.z + z * (b.radius || b.depth / 2 || 8),
            ).distance >
              BARRIER_OFFSET + 8,
          );
        }
    }
});
test('Starport menu staging keeps the hero rear and full-width start visible', () => {
  const states = Array.from({ length: 4 }, (_, i) =>
    createCar('p' + i, 'P' + i, i, undefined, 'starport'),
  );
  const cars = stageMenuCars(states, 'p0'),
    g = getTrack('starport').gates[0];
  for (const aspect of [16 / 9, 4 / 3, 1.04, 21 / 9]) {
    const pose = menuCameraPose(cars[0], aspect),
      camera = new PerspectiveCamera(pose.fov, aspect, 0.1, 1500);
    camera.position.fromArray(pose.position);
    camera.lookAt(...pose.target);
    camera.updateMatrixWorld();
    const p = new Vector3(g.x, 8.6, g.z).project(camera);
    assert.ok(Math.abs(p.x) < 0.9 && p.y > 0.1 && p.y < 0.98);
    assert.ok(
      (camera.position.x - cars[0].x) * Math.sin(cars[0].yaw) +
        (camera.position.z - cars[0].z) * Math.cos(cars[0].yaw) <
        -6,
    );
  }
});
test('spaceport scenery constructs finite transforms, batches repeated details and releases them on track change', () => {
  const original = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({
        fillRect() {},
        fillText() {},
        createLinearGradient() {
          return { addColorStop() {} };
        },
      }),
    }),
  };
  try {
    const scene = new Scene(),
      world = createSpaceport(scene),
      matrix = new Matrix4();
    scene.updateMatrixWorld(true);
    let meshes = 0,
      instances = 0,
      disposed = 0;
    scene.traverse((o) => {
      assert.ok(o.matrixWorld.elements.every(Number.isFinite));
      if (o.isMesh) meshes++;
      if (o.isInstancedMesh) {
        instances += o.count;
        o.addEventListener('dispose', () => disposed++);
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, matrix);
          assert.ok(matrix.elements.every(Number.isFinite));
        }
      }
    });
    assert.ok(meshes < 250, `${meshes} draw objects`);
    assert.ok(instances > 3000);
    world.setQuality('low');
    world.update({}, 'countdown', 1);
    world.update({}, 'racing', 5);
    world.dispose();
    assert.equal(scene.children.length, 0);
    assert.ok(disposed >= 5);
  } finally {
    globalThis.document = original;
  }
});

test('menu track changes rebuild scenery, reset the grid and recover safely from a failed load', async () => {
  const { RaceEngine } = await import('../src/game/engine.js');
  const patches = [],
    built = [],
    disposed = [];
  const factory = async (container, progress, quality, id) => {
    if (id === 'neon-city' && built.length) throw Error('simulated unavailable scene');
    progress(90);
    built.push(id);
    return {
      resetCamera() {},
      dispose() {
        disposed.push(id);
      },
    };
  };
  const engine = new RaceEngine(null, (p) => patches.push(p), factory);
  engine.phase = 'menu';
  engine.world = {
    dispose() {
      disposed.push('original');
    },
    resetCamera() {},
  };
  await engine.selectTrack('starport');
  assert.equal(engine.trackId, 'starport');
  assert.deepEqual(built, ['starport']);
  assert.deepEqual(disposed, ['original']);
  assert.equal(engine.phase, 'menu');
  assert.equal(engine.cars.length, 4);
  assert.ok(engine.cars.every((c) => c.trackId === 'starport'));
  assert.equal(engine.party.trackId, 'starport');
  assert.ok(patches.some((p) => p.ready === false));
  assert.ok(patches.some((p) => p.ready === true && p.trackId === 'starport'));
  engine.startLocal(true, 'TEST');
  assert.equal(engine.cars.length, 1);
  assert.equal(engine.cars[0].trackId, 'starport');
  assert.equal(engine.phase, 'countdown');
  await engine.selectTrack('neon-city');
  assert.equal(engine.trackId, 'starport', 'Cannot change circuit during a race');
  engine.quit();
  await engine.selectTrack('neon-city');
  assert.equal(engine.trackId, 'starport');
  assert.equal(engine.switchingTrack, false);
  assert.match(patches.at(-1).error, /could not load/);
  assert.equal(patches.at(-1).ready, true);
  assert.deepEqual(disposed, ['original']);
});
