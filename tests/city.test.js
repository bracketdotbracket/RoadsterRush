import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { createCityLayout, menuCameraPose, stageMenuCars } from '../src/game/city-layout.js';
import { createCar } from '../shared/physics.js';
import { nearest, TRACK_WIDTH, atDistance } from '../shared/track.js';

test('Neon City surrounds the complete circuit without buildings on the road or runoff', () => {
  const city = createCityLayout();
  assert.ok(city.buildings.length > 350);
  assert.ok(city.streetlights.length > 70);
  for (const b of city.buildings) {
    for (const x of [-1, 1])
      for (const z of [-1, 1]) {
        const road = nearest(b.x + (x * b.width) / 2, b.z + (z * b.depth) / 2);
        assert.ok(road.distance > TRACK_WIDTH / 2 + 20, 'Building footprint must clear runoff');
      }
  }
  for (const [sx, sz] of [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ]) {
    assert.ok(
      city.buildings.filter((b) => Math.sign(b.x - 145) === sx && Math.sign(b.z - 25) === sz)
        .length > 40,
    );
  }
  assert.deepEqual(city, createCityLayout(), 'Reloading must preserve city placement');
});

test('home camera shows the full rear of the hero car and leaves the menu clear', () => {
  for (const aspect of [16 / 9, 4 / 3, 1.25, 1.04, 21 / 9]) {
    for (const time of [0, 12, 36]) {
      const car = createCar('you', 'YOU');
      const forward = new Vector3(Math.sin(car.yaw), 0, Math.cos(car.yaw));
      const right = new Vector3(forward.z, 0, -forward.x);
      const pose = menuCameraPose(car, aspect, time);
      const camera = new PerspectiveCamera(pose.fov, aspect, 0.1, 1500);
      camera.position.fromArray(pose.position);
      camera.lookAt(...pose.target);
      camera.updateMatrixWorld();
      const behind = camera.position
        .clone()
        .sub(new Vector3(car.x, 0, car.z))
        .dot(forward);
      assert.ok(behind < -6, 'Camera must stay behind the car');
      for (const x of [-1.02, 1.02])
        for (const z of [-2.304, 2.304])
          for (const y of [0, 1.24]) {
            const p = new Vector3(car.x, y, car.z)
              .addScaledVector(right, x)
              .addScaledVector(forward, z)
              .project(camera);
            assert.ok(
              p.x > -0.05 && p.x < 0.94,
              `Car clipped or covering menu at aspect ${aspect}: ${p.x}`,
            );
            assert.ok(
              p.y > -0.85 && p.y < 0.5,
              `Car clipped vertically at aspect ${aspect}: ${p.y}`,
            );
          }
    }
  }
});

test('reduced-motion setting keeps the home camera still', () => {
  const car = createCar('you', 'YOU');
  assert.deepEqual(menuCameraPose(car, 16 / 9, 0, true), menuCameraPose(car, 16 / 9, 120, true));
});

test('home staging frames the gantry and rivals without moving the real starting grid', () => {
  const cars = [0, 1, 2, 3].map((i) => createCar('car' + i, 'Driver', i));
  const original = structuredClone(cars);
  const staged = stageMenuCars(cars, 'car0');
  assert.deepEqual(cars, original);
  const pose = menuCameraPose(staged[0], 16 / 9);
  const camera = new PerspectiveCamera(pose.fov, 16 / 9, 0.1, 1500);
  camera.position.fromArray(pose.position);
  camera.lookAt(...pose.target);
  camera.updateMatrixWorld();
  const gate = atDistance(0);
  for (const y of [6.5, 8.6, 10.1]) {
    const p = new Vector3(gate.x, y, gate.z).project(camera);
    assert.ok(Math.abs(p.x) < 0.8 && p.y > 0.3 && p.y < 0.95, 'Gantry must remain in frame');
  }
  for (const car of staged.slice(1)) {
    const p = new Vector3(car.x, 0.6, car.z).project(camera);
    assert.ok(Math.abs(p.x) < 0.9 && Math.abs(p.y) < 0.9, 'Rival must remain in frame');
    assert.ok(nearest(car.x, car.z).distance < TRACK_WIDTH / 2);
  }
});
