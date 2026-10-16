import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, PerspectiveCamera, Matrix4, Vector3 } from 'three';
import { createPartyVisuals } from '../src/game/party-visuals.js';
import { createPartyState, mysteryBoxes } from '../shared/party.js';
import { createCar } from '../shared/physics.js';

// Scene-graph checks only: these do not execute WebGL or substitute for visual QA.
function fixture() {
  const original = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => ({ fillText() {} }) }) };
  try {
    const scene = new Scene(),
      camera = new PerspectiveCamera(54, 16 / 9, 0.3, 1500);
    camera.position.set(0, 4, 130);
    camera.lookAt(0, 1, 100);
    const visuals = createPartyVisuals(scene);
    return { scene, camera, visuals, root: scene.children[0] };
  } finally {
    globalThis.document = original;
  }
}
test('mystery box batches preserve placement, hide collected boxes and restore them on respawn', () => {
  const { scene, camera, visuals, root } = fixture(),
    state = createPartyState();
  visuals.update([], state, 0, 0, camera, 'countdown');
  const meshes = root.children.filter((m) => m.isInstancedMesh);
  assert.equal(meshes.length, 4);
  for (const mesh of meshes) {
    assert.equal(mesh.count, mysteryBoxes.length);
    assert.ok([...mesh.instanceMatrix.array].every(Number.isFinite));
  }
  const matrix = new Matrix4(),
    position = new Vector3();
  meshes[0].getMatrixAt(0, matrix);
  position.setFromMatrixPosition(matrix);
  assert.ok(Math.abs(position.x - mysteryBoxes[0].x) < 0.0001);
  assert.ok(Math.abs(position.z - mysteryBoxes[0].z) < 0.0001);
  state.boxes[0].availableAt = 10;
  visuals.update([], state, 1, 1, camera, 'racing');
  for (const mesh of meshes) {
    mesh.getMatrixAt(0, matrix);
    assert.equal(matrix.determinant(), 0);
  }
  visuals.update([], state, 10, 10, camera, 'racing');
  meshes[0].getMatrixAt(0, matrix);
  assert.ok(matrix.determinant() > 0.9);
  let disposed = 0;
  meshes.forEach((m) => m.addEventListener('dispose', () => disposed++));
  visuals.dispose();
  assert.equal(disposed, 4);
  assert.equal(scene.children.length, 0);
});
test('temporary effect objects are removed between pickups, expiry and rematches instead of accumulating', () => {
  const { camera, visuals, root } = fixture(),
    c = createCar('a', 'A'),
    state = createPartyState();
  for (let i = 0; i < 100; i++) {
    state.pulses = [
      { id: i, type: 'shockwave', x: 0, y: 0, z: 0, at: i, until: i + 0.55, radius: 12 },
    ];
    state.traps = [{ id: i, ownerId: 'a', x: 0, z: 0, armedAt: i + 0.5, expiresAt: i + 10 }];
    c.shieldUntil = i + 4;
    visuals.update([c], state, i + 0.1, i + 0.1, camera, 'racing');
    assert.equal(root.children.length, 7, 'Four box batches, one pulse, one trap and one aura');
  }
  visuals.update([c], state, 101, 101, camera, 'menu');
  assert.equal(root.visible, false);
  visuals.update([], createPartyState(), 0, 0, camera, 'countdown');
  assert.equal(root.children.length, 4);
  assert.equal(root.visible, true);
  visuals.dispose();
});
