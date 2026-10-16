import * as THREE from 'three';
import {
  getTrack,
  BARRIER_OFFSET,
  START_FINISH_POST_WIDTH,
  START_FINISH_CLEAR_WIDTH,
} from '../../shared/track.js';
import {
  getBarrierSegments,
  BARRIER_WIDTH,
  BARRIER_LENGTH,
  BARRIER_BODY_HEIGHT,
} from '../../shared/barriers.js';

// An imagined Tesla / SpaceX campus, rather than a survey of a real facility.
export function spaceportLayout() {
  return {
    factory: { x: -99, z: 15, width: 114, depth: 160, height: 23 },
    hangar: { x: 95, z: -57, width: 58, depth: 68, height: 35 },
    pads: [
      { x: 152, z: -104, radius: 30, height: 79 },
      { x: 231, z: -88, radius: 23, height: 44 },
    ],
    control: { x: 261, z: 8, width: 38, depth: 28, height: 14 },
    tanks: [
      { x: 310, z: -240 },
      { x: 333, z: -240 },
      { x: 356, z: -240 },
    ],
  };
}

export function createSpaceport(scene, track = getTrack('starport')) {
  const root = new THREE.Group();
  root.name = 'Starport — Tesla factory and SpaceX launch campus';
  scene.add(root);
  scene.fog = new THREE.FogExp2('#d7ac9c', 0.00105);
  const geometries = [],
    materials = [],
    textures = [],
    batches = new Map();
  const cube = new THREE.BoxGeometry(1, 1, 1);
  geometries.push(cube);
  const material = (color, roughness = 0.7, metalness = 0) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    materials.push(m);
    return m;
  };
  const white = material('#e4e3dc'),
    steel = material('#a8b1b5', 0.32, 0.8),
    black = material('#1a232b', 0.75),
    concrete = material('#b3b3a6'),
    asphalt = material('#343b42'),
    glass = material('#345d72', 0.24, 0.5),
    orange = material('#ef8a47'),
    navy = material('#122e45', 0.35, 0.65);
  const glow = new THREE.MeshBasicMaterial({ color: '#ffbd7b', toneMapped: false });
  const cyan = new THREE.MeshBasicMaterial({ color: '#a4f3ff', toneMapped: false });
  materials.push(glow, cyan);
  function mesh(geometry, mat, position, parent = root) {
    geometries.push(geometry);
    const m = new THREE.Mesh(geometry, mat);
    m.position.set(...position);
    parent.add(m);
    return m;
  }
  function box(size, position, mat, parent = root, yaw = 0) {
    const m = new THREE.Mesh(cube, mat);
    m.scale.set(...size);
    m.position.set(...position);
    m.rotation.y = yaw;
    parent.add(m);
    return m;
  }
  function batch(size, position, mat, yaw = 0) {
    if (!batches.has(mat)) batches.set(mat, []);
    batches.get(mat).push({ size, position, yaw });
  }
  function label(text, subtitle, size, position, yaw = 0, parent = root) {
    const canvas = document.createElement('canvas');
    canvas.width = 1536;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#14232b';
    ctx.fillRect(0, 0, 1536, 256);
    ctx.fillStyle = '#fff1dc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 112px Arial';
    ctx.fillText(text, 768, 100, 1450);
    ctx.fillStyle = '#ffbd7b';
    ctx.font = '600 30px Arial';
    ctx.fillText(subtitle, 768, 208, 1400);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.push(texture);
    const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    materials.push(mat);
    return box(size, position, mat, parent, yaw);
  }
  // Soft sunset sky; dry tarmac and a distant coast give this circuit its own identity.
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d'),
    gradient = ctx.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, '#243a5a');
  gradient.addColorStop(0.43, '#c28a8b');
  gradient.addColorStop(0.57, '#f5c38c');
  gradient.addColorStop(1, '#8e9b9e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1024, 512);
  const sky = new THREE.CanvasTexture(canvas);
  sky.colorSpace = THREE.SRGBColorSpace;
  sky.mapping = THREE.EquirectangularReflectionMapping;
  textures.push(sky);
  scene.background = sky;
  scene.environment = sky;
  scene.environmentIntensity = 0.5;
  const ocean = mesh(
    new THREE.PlaneGeometry(900, 1800),
    material('#477c8a', 0.3, 0.32),
    [850, -0.07, 0],
  );
  ocean.rotation.x = -Math.PI / 2;
  batch([15, 0.05, 1600], [395, -0.045, 0], concrete);
  for (let i = 0; i < 32; i++)
    batch([2, 0.03, 12 + (i % 3) * 4], [414 + (i % 4) * 13, -0.04, -600 + i * 39], white);
  // Every concrete block below is the same segment used by the collision solver.
  for (const b of getBarrierSegments(track.id)) {
    batch(
      [BARRIER_WIDTH, BARRIER_BODY_HEIGHT, BARRIER_LENGTH],
      [b.x, BARRIER_BODY_HEIGHT / 2, b.z],
      concrete,
      b.yaw,
    );
    batch([BARRIER_WIDTH + 0.06, 0.065, BARRIER_LENGTH], [b.x, 1.24, b.z], black, b.yaw);
    batch([0.09, 2, 0.09], [b.x, 2.22, b.z], steel, b.yaw);
    for (const y of [1.5, 2.15, 2.8, 3.18]) batch([0.045, 0.045, 4], [b.x, y, b.z], steel, b.yaw);
  }
  const { factory: f, hangar: h, pads, control: c, tanks } = spaceportLayout();
  const building = (b, mat) => {
    box([b.width, b.height, b.depth], [b.x, b.height / 2, b.z], mat).castShadow = true;
    box([b.width + 2, 0.8, b.depth + 2], [b.x, b.height, b.z], black);
  };
  building(f, white);
  // Factory facade, solar roof, loading bays and charging plaza.
  for (let z = f.z - f.depth / 2 + 5; z < f.z + f.depth / 2; z += 9) {
    batch([0.2, 9, 6.8], [f.x + f.width / 2 + 0.12, 9, z], glass);
    batch([0.22, 20, 0.4], [f.x + f.width / 2 + 0.25, 10, z + 4], steel);
  }
  for (let x = -143; x < -55; x += 12)
    for (let z = -49; z < 88; z += 13) batch([10, 0.4, 10], [x, f.height + 0.8, z], navy);
  label(
    'T E S L A',
    'ELECTRIC PERFORMANCE / FACTORY STRAIGHT',
    [48, 7, 0.3],
    [f.x + f.width / 2 + 0.4, 19, 18],
    Math.PI / 2,
  );
  for (let i = 0; i < 10; i++) {
    const z = -48 + i * 13;
    batch([1, 3.5, 1.6], [-31, 1.75, z], white);
    batch([1.03, 2, 0.9], [-31, 1.7, z], orange);
    batch([4, 0.65, 2], [-35, 0.6, z], i % 2 ? steel : black);
  }
  building(h, steel);
  box([h.width - 5, h.height - 5, 0.3], [h.x, h.height / 2 - 1, h.z + h.depth / 2 + 0.2], black);
  for (let x = h.x - h.width / 2 + 3; x < h.x + h.width / 2; x += 5)
    batch([0.3, 30, 0.5], [x, 16, h.z + h.depth / 2 + 0.4], steel);
  label(
    'SPACEX',
    'FLIGHT HARDWARE / ASSEMBLY HANGAR',
    [49, 6, 0.35],
    [h.x, 31, h.z + h.depth / 2 + 0.5],
  );
  building(c, white);
  box([c.width + 1, 6, c.depth + 1], [c.x, 10, c.z], glass);
  label(
    'MISSION CONTROL',
    'STARPORT / RACE OPERATIONS',
    [30, 4, 0.3],
    [c.x, 14, c.z + c.depth / 2 + 0.3],
  );
  const windsocks = [];
  for (const [index, p] of pads.entries()) {
    mesh(new THREE.CylinderGeometry(p.radius, p.radius, 0.3, 64), concrete, [p.x, 0.08, p.z]);
    mesh(new THREE.CylinderGeometry(7, 9, 5, 24), black, [p.x, 2.5, p.z]);
    const boosterH = p.height - 31;
    mesh(new THREE.CylinderGeometry(3.8, 3.8, boosterH, 32), steel, [p.x, 5 + boosterH / 2, p.z]);
    const bodyBottom = 5 + boosterH;
    mesh(new THREE.CylinderGeometry(3.8, 3.8, 22, 32), steel, [p.x, bodyBottom + 11, p.z]);
    mesh(new THREE.CylinderGeometry(3.84, 3.84, 22, 24, 1, false, 0, Math.PI), black, [
      p.x,
      bodyBottom + 11,
      p.z,
    ]);
    mesh(new THREE.ConeGeometry(3.8, 10, 32), steel, [p.x, bodyBottom + 27, p.z]);
    for (let y = 6; y < bodyBottom + 22; y += 4) {
      const band = mesh(new THREE.TorusGeometry(3.81, 0.055, 4, 32), black, [p.x, y, p.z]);
      band.rotation.x = Math.PI / 2;
    }
    for (const side of [-1, 1]) {
      box([3, 8, 0.5], [p.x + side * 4.7, bodyBottom + 5, p.z], black).rotation.z = side * 0.3;
      box([2, 5, 0.45], [p.x + side * 4.2, bodyBottom + 21, p.z], black).rotation.z = side * -0.2;
    }
    label(
      index ? 'FLIGHT TEST' : 'SPACEX',
      'STARPORT LAUNCH COMPLEX',
      [14, 3, 0.2],
      [p.x, 3, p.z + p.radius - 1],
    );
    if (index === 0) {
      const tx = p.x + 17,
        height = 94;
      for (const dx of [-5, 5])
        for (const dz of [-5, 5]) batch([1.5, height, 1.5], [tx + dx, height / 2, p.z + dz], steel);
      for (let y = 7; y < height; y += 8) {
        batch([12, 0.9, 12], [tx, y, p.z], black);
        batch([0.6, 7.8, 0.6], [tx, y + 4, p.z - 5], orange, 0);
      }
      box([23, 2, 4], [tx - 6, 70, p.z], steel);
      box([16, 2, 4], [tx - 4, 52, p.z], steel);
      box([13, 1.2, 13], [tx, 94, p.z], white);
      windsocks.push(box([0.35, 0.8, 0.35], [tx, 96, p.z], glow));
    }
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      batch(
        [0.4, 0.3, 0.4],
        [p.x + Math.sin(a) * (p.radius - 1), 0.3, p.z + Math.cos(a) * (p.radius - 1)],
        orange,
      );
    }
  }
  for (const t of tanks) {
    mesh(new THREE.CylinderGeometry(8, 8, 28, 24), white, [t.x, 14, t.z]);
    mesh(new THREE.SphereGeometry(8, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), white, [
      t.x,
      28,
      t.z,
    ]);
    box([2, 2, 50], [t.x, 2, t.z + 25], steel);
  }
  // Fixed scenic hardware is kept outside the full road/shoulder corridor.
  for (let s = 12; s < track.TRACK_LENGTH; s += 32) {
    const p = track.atDistance(s),
      yaw = Math.atan2(p.tx, p.tz);
    for (const side of [-1, 1]) {
      const x = p.x + p.tz * side * 20.5,
        z = p.z - p.tx * side * 20.5;
      batch([0.18, 9, 0.18], [x, 4.5, z], black, yaw);
      batch([3, 0.15, 0.6], [x - p.tz * side, 9, z + p.tx * side], cyan, yaw);
    }
  }
  for (const [fraction, title, sub] of [
    [0.13, 'FACTORY STRAIGHT', 'TESLA / ELECTRIC PERFORMANCE'],
    [0.4, 'LAUNCH COMPLEX', 'SPACEX / STARPORT'],
    [0.59, 'COASTAL SWEEP', 'KEEP THE OCEAN ON YOUR RIGHT'],
    [0.82, 'RETURN TO BASE', 'FINAL SECTOR'],
  ]) {
    const p = track.atDistance(track.TRACK_LENGTH * fraction),
      x = p.x + p.tz * 23,
      z = p.z - p.tx * 23,
      yaw = Math.atan2(p.tx, p.tz);
    label(title, sub, [12, 3, 0.2], [x, 6, z], yaw);
    for (const side of [-1, 1])
      batch([0.3, 6, 0.3], [x + p.tz * side * 4, 3, z - p.tx * side * 4], black, yaw);
  }
  const start = track.atDistance(0),
    gantry = new THREE.Group();
  gantry.name = 'Starport start / finish';
  gantry.position.set(start.x, 0, start.z);
  gantry.rotation.y = Math.atan2(start.tx, start.tz);
  root.add(gantry);
  for (const side of [-1, 1]) {
    box([START_FINISH_POST_WIDTH, 9.3, 0.7], [side * BARRIER_OFFSET, 4.65, 0], black, gantry);
    box([0.15, 8, 0.8], [side * (START_FINISH_CLEAR_WIDTH / 2 - 0.075), 4.8, 0], glow, gantry);
  }
  box([BARRIER_OFFSET * 2 + START_FINISH_POST_WIDTH, 3, 0.6], [0, 8.6, 0], black, gantry);
  label(
    'STARPORT CIRCUIT',
    'TESLA × SPACEX / ROADSTER RUSH',
    [28, 2.5, 0.7],
    [0, 8.6, 0],
    0,
    gantry,
  );
  const cell = START_FINISH_CLEAR_WIDTH / 36;
  for (let x = 0; x < 36; x++)
    for (let row = 0; row < 2; row++)
      box(
        [cell, 0.012, 1],
        [(x + 0.5) * cell - START_FINISH_CLEAR_WIDTH / 2, 0.027, row - 0.5],
        (x + row) % 2 ? black : white,
        gantry,
      );
  const startLamps = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.MeshBasicMaterial({ color: '#72ffc4' });
    materials.push(m);
    startLamps.push(m);
    mesh(new THREE.SphereGeometry(0.25, 12, 8), m, [(i - 2) * 1.3, 6.8, -0.45], gantry);
  }
  const dummy = new THREE.Object3D();
  for (const [mat, items] of batches) {
    const m = new THREE.InstancedMesh(cube, mat, items.length);
    items.forEach((v, i) => {
      dummy.position.set(...v.position);
      dummy.scale.set(...v.size);
      dummy.rotation.set(0, v.yaw, 0);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.computeBoundingSphere();
    root.add(m);
  }
  return {
    update(own, phase, time) {
      startLamps.forEach((m) => m.color.set(phase === 'countdown' ? '#ff6246' : '#72ffc4'));
      windsocks.forEach((m) => (m.visible = Math.sin(time * 2) > -0.4));
    },
    setQuality() {},
    dispose() {
      for (const t of textures) t.dispose();
      for (const g of new Set(geometries)) g.dispose();
      for (const m of materials) m.dispose();
      root.traverse((o) => {
        if (o.isInstancedMesh) o.dispose();
      });
      scene.remove(root);
    },
  };
}
