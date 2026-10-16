import test from 'node:test';
import assert from 'node:assert/strict';
import {
  barrierSegments,
  barrierContact,
  moveWithBarriers,
  CAR_HALF_LENGTH,
  CAR_HALF_WIDTH,
} from '../shared/barriers.js';
import { createCar, stepCar, resetCar, collideCars, blankInput, DT } from '../shared/physics.js';
import { atDistance, nearest, TRACK_WIDTH } from '../shared/track.js';

function approach({
  side = 1,
  reverse = false,
  speed = 52,
  angle = 0,
  distance = 0.2,
  height = 0,
} = {}) {
  const wall = barrierSegments.find((b) => b.s === 42 && b.side === side);
  const nx = wall.tz * side,
    nz = -wall.tx * side;
  const car = createCar('test', 'TEST');
  const yaw = Math.atan2(nx, nz) + angle + (reverse ? Math.PI : 0);
  const extent =
    Math.abs(Math.cos(angle)) * CAR_HALF_LENGTH + Math.abs(Math.sin(angle)) * CAR_HALF_WIDTH;
  Object.assign(car, {
    x: wall.x - nx * (wall.halfWidth + extent + distance),
    z: wall.z - nz * (wall.halfWidth + extent + distance),
    yaw,
    speed: reverse ? -speed : speed,
    y: height,
    grounded: height === 0,
  });
  return { car, wall, nx, nz };
}
function clear(car) {
  assert.equal(
    barrierSegments.some((b) => barrierContact(car, b)),
    false,
    'Car body overlaps a barrier',
  );
}
function velocity(car) {
  return {
    x: Math.sin(car.yaw + car.driftAngle) * car.speed + car.impactVX,
    z: Math.cos(car.yaw + car.driftAngle) * car.speed + car.impactVZ,
  };
}

test('front and reverse impacts on both sides stop at the visible barrier and rebound gently', () => {
  for (const side of [-1, 1])
    for (const reverse of [false, true]) {
      const { car, nx, nz } = approach({ side, reverse, speed: reverse ? 10 : 72, distance: 0.08 });
      const old = { ...car };
      car.invulnerable = 5; // Recovery grace must never turn off barrier collisions.
      stepCar(car, { ...blankInput(), reverse }, DT);
      clear(car);
      const v = velocity(car),
        outwardSpeed = v.x * nx + v.z * nz;
      assert.ok(outwardSpeed < -0.5 && outwardSpeed >= -4.001, 'Small bounce away from the wall');
      assert.equal(car.event, 'BARRIER HIT');
      assert.equal(car.penalty, 0);
      assert.equal(car.totalGates, old.totalGates);
      const hit = { ...car };
      stepCar(car, blankInput(), DT);
      assert.ok(
        (car.x - hit.x) * nx + (car.z - hit.z) * nz < 0,
        'Rebound moves away on the next step',
      );
    }
});

test('glancing contact sheds normal velocity but keeps motion along the wall', () => {
  const { car, wall, nx, nz } = approach({ angle: Math.PI / 3, speed: 40, distance: 0.01 });
  const before = velocity(car),
    tangentBefore = before.x * wall.tx + before.z * wall.tz;
  stepCar(car, blankInput(), DT);
  const after = velocity(car);
  clear(car);
  assert.ok(after.x * nx + after.z * nz <= 0.05);
  assert.ok(Math.abs(after.x * wall.tx + after.z * wall.tz) > Math.abs(tangentBefore) * 0.7);
  assert.ok(Math.hypot(after.x, after.z) < Math.hypot(before.x, before.z));
});

test('a sideways drift impact rebounds using the travel direction and cannot pass through a barrier', () => {
  for (const side of [-1, 1]) {
    const { car, nx, nz } = approach({ side, angle: Math.PI / 3, speed: 40, distance: 0.01 });
    car.driftAngle = side * 0.25;
    stepCar(car, blankInput(), DT);
    clear(car);
    const v = velocity(car);
    assert.ok(v.x * nx + v.z * nz <= 0.05);
    assert.ok(v.x * nx + v.z * nz >= -4.001);
    assert.equal(car.event, 'BARRIER HIT');
  }
});

test('boost-speed movement and continued throttle cannot tunnel through a wall', () => {
  for (const dt of [1 / 60, 1 / 30]) {
    const { car, wall, nx, nz } = approach({ speed: 72, distance: 0.01 });
    car.boostTime = 10;
    for (let frame = 0; frame < 180; frame++) {
      stepCar(car, { ...blankInput(), throttle: 1 }, dt, frame * dt, false);
      clear(car);
      assert.ok((car.x - wall.x) * nx + (car.z - wall.z) * nz < -wall.halfWidth);
      assert.ok(Math.abs(car.speed) <= 72 && Number.isFinite(car.x + car.z));
    }
  }
});

test('corners and rotation are blocked before the car centre reaches a barrier', () => {
  const { car, wall, nx, nz } = approach({ angle: Math.PI / 2, distance: 0.01, speed: 0 });
  const previous = { ...car };
  car.yaw = Math.atan2(nx, nz);
  moveWithBarriers(car, previous);
  clear(car);
  assert.ok((car.x - wall.x) * nx + (car.z - wall.z) * nz <= -(wall.halfWidth + CAR_HALF_LENGTH));
  assert.equal(car.speed, 0, 'Turning against a wall must not generate momentum');
});

test('low airborne cars hit the fencing while cars fully above it can clear it', () => {
  for (const height of [0, 2, 4]) {
    const { car, nx, nz, wall } = approach({ height, speed: 30, distance: 0.1 });
    const previous = { ...car };
    car.x += nx * 8;
    car.z += nz * 8;
    const impact = moveWithBarriers(car, previous);
    clear(car);
    const side = (car.x - wall.x) * nx + (car.z - wall.z) * nz;
    if (height < wall.height) {
      assert.ok(impact > 0);
      assert.ok(side < 0);
    } else {
      assert.equal(impact, 0);
      assert.ok(side > 0);
    }
  }
});

test('visible openings allow slow forward and reverse returns from outside the fence', () => {
  const p = atDistance(74); // The centre of a 12 metre gap in the shared geometry.
  for (const side of [-1, 1])
    for (const reverse of [false, true]) {
      const nx = p.tz * side,
        nz = -p.tx * side;
      const car = createCar('return', 'RETURN');
      Object.assign(car, {
        x: p.x + nx * 25,
        z: p.z + nz * 25,
        yaw: Math.atan2(-nx, -nz) + (reverse ? Math.PI : 0),
      });
      for (
        let frame = 0;
        frame < 420 && nearest(car.x, car.z).distance > TRACK_WIDTH / 2;
        frame++
      ) {
        stepCar(
          car,
          { ...blankInput(), throttle: reverse ? 0 : 1, reverse },
          DT,
          frame * DT,
          false,
        );
        clear(car);
      }
      assert.ok(
        nearest(car.x, car.z).distance <= TRACK_WIDTH / 2,
        'Can drive back through an opening',
      );
      assert.equal(car.penalty, 0);
    }
});

test('other cars cannot push a car through a wall and post-finish coasting still collides', () => {
  const { car, nx, nz } = approach({ distance: 0.01, speed: 0 });
  const rival = createCar('rival', 'RIVAL');
  Object.assign(rival, { x: car.x - nx * 1.5, z: car.z - nz * 1.5, yaw: car.yaw, speed: 30 });
  collideCars([car, rival]);
  clear(car);
  const finish = approach({ speed: 40, distance: 0.01 }).car;
  finish.finishTime = 90;
  stepCar(finish, blankInput());
  clear(finish);
  assert.ok(finish.speed < 0);
});

test('recovering clears rebound momentum and returns to a clear road position', () => {
  const { car } = approach({ angle: Math.PI / 3, distance: 0.01, speed: 40 });
  stepCar(car, blankInput());
  assert.ok(Math.hypot(car.impactVX, car.impactVZ) > 0);
  resetCar(car);
  assert.equal(car.impactVX, 0);
  assert.equal(car.impactVZ, 0);
  assert.equal(car.impactCooldown, 0);
  clear(car);
  assert.ok(nearest(car.x, car.z).distance < 0.01);
});

test('all curved segments and seams stop fast approaches without leaving body overlap', () => {
  for (const wall of barrierSegments)
    for (const side of [-1, 1])
      for (const angle of [-0.6, 0, 0.6]) {
        const nx = wall.tz * side,
          nz = -wall.tx * side;
        const extent =
          Math.abs(Math.cos(angle)) * CAR_HALF_LENGTH + Math.abs(Math.sin(angle)) * CAR_HALF_WIDTH;
        const car = createCar('sweep', 'SWEEP');
        Object.assign(car, {
          x: wall.x - nx * (wall.halfWidth + extent + 0.2),
          z: wall.z - nz * (wall.halfWidth + extent + 0.2),
          yaw: Math.atan2(nx, nz) + angle,
          speed: 72,
        });
        const previous = { ...car };
        car.x += Math.sin(car.yaw) * 8;
        car.z += Math.cos(car.yaw) * 8;
        moveWithBarriers(car, previous);
        clear(car);
        const along = (car.x - wall.x) * wall.tx + (car.z - wall.z) * wall.tz;
        if (angle === 0 && Math.abs(along) < wall.halfLength) {
          assert.ok(
            (car.x - wall.x) * nx + (car.z - wall.z) * nz < 0,
            'Cannot cross through a segment',
          );
        }
      }
});
