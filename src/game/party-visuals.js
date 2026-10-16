import * as THREE from 'three';
import { getMysteryBoxes, ITEMS, TRAP_ARM_DELAY } from '../../shared/party.js';

// Shared geometries, small bounded pools and no extra lights keep party effects cheap.
export function createPartyVisuals(scene, trackId) {
  const mysteryBoxes = getMysteryBoxes(trackId);
  const root = new THREE.Group();
  root.name = 'Party pickups and effects';
  scene.add(root);
  const resources = [];
  const keep = (x) => (resources.push(x), x);
  const glow = (color, opacity = 1) =>
    keep(
      new THREE.MeshBasicMaterial({
        color,
        transparent: opacity < 1,
        opacity,
        depthWrite: opacity === 1,
        toneMapped: false,
      }),
    );
  const boxGeometry = keep(new THREE.BoxGeometry(1.25, 1.25, 1.25));
  const ringGeometry = keep(new THREE.RingGeometry(0.86, 1, 40));
  const planeGeometry = keep(new THREE.PlaneGeometry(0.8, 0.8));
  const diskGeometry = keep(new THREE.CylinderGeometry(0.7, 0.9, 0.16, 16));
  const domeGeometry = keep(new THREE.SphereGeometry(1, 20, 10));
  const boxMaterial = keep(
    new THREE.MeshStandardMaterial({
      color: '#5c287e',
      emissive: '#b34dff',
      emissiveIntensity: 0.65,
      metalness: 0.3,
      roughness: 0.25,
    }),
  );
  const edgeMaterial = keep(
    new THREE.MeshBasicMaterial({ color: '#e5b3ff', toneMapped: false, wireframe: true }),
  );
  const boxRingMaterial = glow('#bd70ff', 0.6);
  const trapMaterial = keep(
    new THREE.MeshStandardMaterial({ color: '#261c2c', metalness: 0.65, roughness: 0.35 }),
  );
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff1ff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 106px Arial';
  ctx.fillText('?', 64, 68);
  const texture = keep(new THREE.CanvasTexture(canvas));
  texture.colorSpace = THREE.SRGBColorSpace;
  const labelMaterial = keep(
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    }),
  );
  const instanced = (geometry, material) => {
    const mesh = new THREE.InstancedMesh(geometry, material, mysteryBoxes.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    root.add(mesh);
    return mesh;
  };
  // All 18 boxes use four batches, including their frames, labels and rings.
  const cubes = instanced(boxGeometry, boxMaterial),
    edges = instanced(boxGeometry, edgeMaterial),
    labels = instanced(planeGeometry, labelMaterial),
    rings = instanced(ringGeometry, boxRingMaterial),
    dummy = new THREE.Object3D();
  const traps = new Map(),
    pulses = new Map(),
    auras = new Map();
  const facing = new THREE.Vector3();
  function removeStale(pool, ids) {
    for (const [id, v] of pool)
      if (!ids.has(id)) {
        root.remove(v.group);
        v.material?.dispose();
        pool.delete(id);
      }
  }
  function update(states, party, elapsed, animationTime, camera, phase) {
    root.visible = phase !== 'menu';
    if (!root.visible || !party) return;
    facing.set(0, 0, 1).applyQuaternion(camera.quaternion);
    for (const point of mysteryBoxes) {
      const id = point.id;
      const visible = (party.boxes[id]?.availableAt ?? 0) <= elapsed;
      const y = 1.15 + Math.sin(animationTime * 2 + id) * 0.1;
      dummy.position.set(point.x, y, point.z);
      dummy.rotation.set(0.12, animationTime * 0.7 + id, 0.12);
      dummy.scale.setScalar(visible ? 1 : 0);
      dummy.updateMatrix();
      cubes.setMatrixAt(id, dummy.matrix);
      dummy.scale.multiplyScalar(1.01);
      dummy.updateMatrix();
      edges.setMatrixAt(id, dummy.matrix);
      dummy.position.set(point.x, y + 0.1, point.z).addScaledVector(facing, 0.95);
      dummy.quaternion.copy(camera.quaternion);
      dummy.scale.setScalar(visible ? 1 : 0);
      dummy.updateMatrix();
      labels.setMatrixAt(id, dummy.matrix);
      dummy.position.set(point.x, 0.045, point.z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.setScalar(visible ? 1.25 : 0);
      dummy.updateMatrix();
      rings.setMatrixAt(id, dummy.matrix);
    }
    for (const mesh of [cubes, edges, labels, rings]) mesh.instanceMatrix.needsUpdate = true;
    removeStale(traps, new Set(party.traps.map((t) => t.id)));
    for (const t of party.traps) {
      let v = traps.get(t.id);
      if (!v) {
        const group = new THREE.Group(),
          material = new THREE.MeshBasicMaterial({
            color: '#ffad76',
            transparent: true,
            opacity: 0.8,
            depthWrite: false,
            toneMapped: false,
            side: THREE.DoubleSide,
          });
        const disk = new THREE.Mesh(diskGeometry, trapMaterial);
        disk.position.y = 0.13;
        group.add(disk);
        const ring = new THREE.Mesh(ringGeometry, material);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.055;
        ring.scale.setScalar(2.1);
        group.add(ring);
        const core = new THREE.Mesh(ringGeometry, material);
        core.rotation.x = -Math.PI / 2;
        core.position.y = 0.23;
        core.scale.setScalar(0.55);
        group.add(core);
        root.add(group);
        v = { group, material, ring };
        traps.set(t.id, v);
      }
      v.group.position.set(t.x, 0, t.z);
      const armed = elapsed >= t.armedAt;
      v.material.color.set(armed ? '#ff875e' : '#ffd47d');
      v.material.opacity = armed ? 0.65 + Math.sin(animationTime * 6) * 0.12 : 0.35;
      const arming = THREE.MathUtils.clamp(1 - (t.armedAt - elapsed) / TRAP_ARM_DELAY, 0, 1);
      v.ring.scale.setScalar(1.3 + arming * 0.8);
    }
    removeStale(pulses, new Set(party.pulses.filter((p) => p.until > elapsed).map((p) => p.id)));
    for (const p of party.pulses) {
      if (p.until <= elapsed) continue;
      let v = pulses.get(p.id);
      if (!v) {
        const group = new THREE.Group(),
          material = new THREE.MeshBasicMaterial({
            color: p.type === 'emp' ? '#ffad76' : '#dba4ff',
            transparent: true,
            opacity: 1,
            depthWrite: false,
            toneMapped: false,
            side: THREE.DoubleSide,
          });
        const ring = new THREE.Mesh(ringGeometry, material);
        ring.rotation.x = -Math.PI / 2;
        group.add(ring);
        root.add(group);
        v = { group, material };
        pulses.set(p.id, v);
      }
      const progress = THREE.MathUtils.clamp((elapsed - p.at) / (p.until - p.at), 0, 1);
      v.group.position.set(p.x, p.y + 0.3, p.z);
      v.group.scale.setScalar(Math.max(0.05, p.radius * (1 - (1 - progress) ** 2)));
      v.material.opacity = (1 - progress) * 0.8;
    }
    removeStale(auras, new Set(states.map((c) => c.id)));
    for (const c of states) {
      let v = auras.get(c.id);
      if (!v) {
        const group = new THREE.Group(),
          material = new THREE.MeshBasicMaterial({
            color: ITEMS.shield.color,
            transparent: true,
            opacity: 0.1,
            depthWrite: false,
            toneMapped: false,
            side: THREE.FrontSide,
          });
        const dome = new THREE.Mesh(domeGeometry, material);
        dome.scale.set(1.4, 1.15, 2.8);
        dome.position.y = 0.75;
        group.add(dome);
        const ring = new THREE.Mesh(ringGeometry, material);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.15;
        ring.scale.set(1.6, 2.95, 1);
        group.add(ring);
        root.add(group);
        v = { group, material };
        auras.set(c.id, v);
      }
      const shield = c.shieldUntil > elapsed,
        protection = c.immuneUntil > elapsed;
      v.group.visible = (shield || protection) && c.finishTime === null;
      v.group.position.set(c.x, c.y, c.z);
      v.group.rotation.y = c.yaw;
      v.material.color.set(shield ? ITEMS.shield.color : '#fff0b0');
      v.material.opacity = shield ? 0.13 : 0.065;
    }
  }
  function dispose() {
    scene.remove(root);
    for (const mesh of [cubes, edges, labels, rings]) mesh.dispose();
    for (const pool of [traps, pulses, auras]) removeStale(pool, new Set());
    resources.forEach((r) => r.dispose());
  }
  return { update, dispose };
}
