import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { createNeonCity } from './neon-city.js';
import { menuCameraPose, stageMenuCars } from './city-layout.js';
import { ChaseCameraMotion, damping } from './motion.js';
import { DEFAULT_QUALITY, renderPixelRatio } from './render-settings.js';
import { createPartyVisuals } from './party-visuals.js';
import { getTrack } from '../../shared/track.js';
import { createSpaceport } from './spaceport.js';

export async function createWorld(container, onProgress, quality = DEFAULT_QUALITY, trackId) {
  const track = getTrack(trackId);
  const { samples, atDistance, gates, obstacles, boostCanisters, TRACK_WIDTH, TRACK_LENGTH } =
    track;
  const spaceport = track.id === 'starport';
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(spaceport ? '#e6b39a' : '#102037');
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(
    renderPixelRatio(container.clientWidth, container.clientHeight, devicePixelRatio, quality),
  );
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = quality !== 'low';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-label', '3D Roadster racing circuit');
  container.appendChild(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(
    49,
    container.clientWidth / container.clientHeight,
    0.3,
    1500,
  );
  const hemi = new THREE.HemisphereLight(
    spaceport ? 0xffe0b4 : 0x9cbeef,
    spaceport ? 0x485764 : 0x142031,
    spaceport ? 1.8 : 0.95,
  );
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(spaceport ? 0xffd4a8 : 0xa5c6ff, spaceport ? 2.7 : 0.9);
  sun.position.set(-80, 120, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -27,
    right: 27,
    top: 27,
    bottom: -27,
    near: 1,
    far: 240,
  });
  sun.shadow.bias = -0.0001;
  sun.shadow.normalBias = 0.025;
  scene.add(sun, sun.target);
  const mat = (color, roughness = 0.7, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const asphalt = mat(
      spaceport ? '#303b43' : '#172333',
      spaceport ? 0.84 : 0.36,
      spaceport ? 0.08 : 0.18,
    ),
    edgeMat = mat('#e6e4ce'),
    lime = mat('#d7fc70'),
    white = mat('#e9efe9'),
    dark = mat('#18232b'),
    concrete = mat('#939e98'),
    glass = mat('#577682', 0.22, 0.6);
  function box(size, pos, material, parent = scene) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    m.position.set(...pos);
    parent.add(m);
    return m;
  }
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(2200, 2200),
    mat(spaceport ? '#93897b' : '#111d2c', 0.85),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.09;
  floor.receiveShadow = true;
  scene.add(floor);
  function ribbon(w0, w1, y, material) {
    if (w0 > w1) [w0, w1] = [w1, w0];
    const positions = [],
      uv = [],
      idx = [];
    for (let i = 0; i <= samples.length; i++) {
      const p = samples[i % samples.length];
      for (const w of [w0, w1]) {
        positions.push(p.x + p.tz * w, y, p.z - p.tx * w);
        uv.push(w === w0 ? 0 : 1, (i === samples.length ? TRACK_LENGTH : p.s) / 20);
      }
      if (i < samples.length) {
        const j = i * 2;
        idx.push(j, j + 2, j + 1, j + 1, j + 2, j + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, material);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  }
  ribbon(
    -TRACK_WIDTH / 2 - 2.8,
    TRACK_WIDTH / 2 + 2.8,
    -0.035,
    mat(spaceport ? '#8a877b' : '#253347', 0.8),
  );
  const road = ribbon(-TRACK_WIDTH / 2, TRACK_WIDTH / 2, 0.005, asphalt);
  const city = spaceport
    ? createSpaceport(scene, track)
    : createNeonCity(scene, renderer, road.geometry);
  const partyVisuals = createPartyVisuals(scene, track.id);
  // The reflective asphalt replaces this surface; overlapping road skins shimmer at distance.
  road.visible = spaceport || quality === 'low';
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(container.clientWidth, container.clientHeight),
    0.32,
    0.35,
    1.05,
  );
  composer.addPass(bloom);
  const outputPass = new OutputPass();
  composer.addPass(outputPass);
  // Canvas antialiasing does not cover the composer's offscreen targets.
  const antialiasPass = new ShaderPass(FXAAShader);
  composer.addPass(antialiasPass);
  let currentQuality = quality;
  city.setQuality(quality);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  for (const s of [-1, 1]) {
    ribbon(s * (TRACK_WIDTH / 2 - 0.28), s * (TRACK_WIDTH / 2 - 0.08), 0.015, edgeMat);
    ribbon(s * (TRACK_WIDTH / 2 + 0.08), s * (TRACK_WIDTH / 2 + 0.8), 0.012, mat('#173447'));
  }
  const curbGeo = new THREE.BoxGeometry(0.85, 0.06, 2.5);
  const curbCount = Math.floor(TRACK_LENGTH / 5) * 2;
  const curbs = new THREE.InstancedMesh(curbGeo, white, curbCount),
    matrix = new THREE.Matrix4(),
    dummy = new THREE.Object3D();
  let ci = 0;
  for (let s = 0; s < TRACK_LENGTH; s += 5)
    for (const side of [-1, 1]) {
      if (ci >= curbCount) break;
      const p = atDistance(s);
      dummy.position.set(
        p.x + p.tz * side * (TRACK_WIDTH / 2 + 0.45),
        0.02,
        p.z - p.tx * side * (TRACK_WIDTH / 2 + 0.45),
      );
      dummy.rotation.y = Math.atan2(p.tx, p.tz);
      dummy.updateMatrix();
      curbs.setMatrixAt(ci, dummy.matrix);
      curbs.setColorAt(ci, new THREE.Color(Math.floor(s / 5) % 2 ? '#9ab1c6' : '#1e2c3b'));
      ci++;
    }
  curbs.count = ci;
  scene.add(curbs);
  const dashGeo = new THREE.BoxGeometry(0.16, 0.015, 3),
    dashCount = Math.floor(TRACK_LENGTH / 10);
  const dashes = new THREE.InstancedMesh(dashGeo, mat('#7d8b8d'), dashCount);
  for (let i = 0; i < dashCount; i++) {
    const p = atDistance(i * 10);
    dummy.position.set(p.x, 0.02, p.z);
    dummy.rotation.y = Math.atan2(p.tx, p.tz);
    dummy.updateMatrix();
    dashes.setMatrixAt(i, dummy.matrix);
  }
  scene.add(dashes);
  function sign(text, color = '#d7fc70', width = 1024, height = 160) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#101b24';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${Math.round(height * 0.46)}px Arial`;
    ctx.fillText(text, width / 2, height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
  }
  const gateVisuals = [];
  for (const g of gates) {
    const group = new THREE.Group();
    group.position.set(g.x, 0, g.z);
    group.rotation.y = Math.atan2(g.tx, g.tz);
    scene.add(group);
    if (g.index === 0) group.visible = false; // The city supplies the starting gantry.
    const lightMat = new THREE.MeshStandardMaterial({
      color: '#8da5a0',
      emissive: '#2e665a',
      emissiveIntensity: 0.3,
    });
    for (const s of [-1, 1]) {
      box([0.4, 7.8, 0.55], [s * 12, 3.9, 0], dark, group);
      box([0.12, 6.2, 0.6], [s * 11.77, 4.4, 0], lightMat, group);
    }
    box([24.4, 0.36, 0.55], [0, 7.8, 0], dark, group);
    box([23.7, 0.09, 0.61], [0, 7.54, 0], lightMat, group);
    const label = box(
      [g.index === 0 ? 15 : 4, 1.0, 0.12],
      [0, 8.48, 0],
      sign(g.index === 0 ? 'ROADSTER / RUSH' : String(g.index).padStart(2, '0')),
      group,
    );
    gateVisuals.push(lightMat);
    if (g.index === 0) {
      for (let x = 0; x < 22; x++)
        for (let row = 0; row < 2; row++) {
          const square = box(
            [1, 0.012, 1],
            [x - 10.5, 0.028, row - 0.5],
            (x + row) % 2 ? dark : white,
            group,
          );
        }
      for (let i = 0; i < 4; i++) {
        const p = atDistance(-10 - Math.floor(i / 2) * 7),
          lane = i % 2 ? 2.6 : -2.6;
        const mark = box(
          [3.5, 0.012, 0.1],
          [p.x + p.tz * lane, 0.025, p.z - p.tx * lane + 2],
          white,
        );
        mark.rotation.y = Math.atan2(p.tx, p.tz);
      }
    }
  }
  for (const o of obstacles) {
    const group = new THREE.Group();
    group.position.set(o.x, 0, o.z);
    group.rotation.y = Math.atan2(o.tx, o.tz);
    scene.add(group);
    const block = box([o.width, o.height, o.depth], [0, o.height / 2, 0], dark, group);
    block.castShadow = true;
    for (let j = -2; j <= 2; j++)
      box([0.6, 0.04, o.depth + 0.05], [j * 1.15, o.height + 0.02, 0], lime, group);
    const p = atDistance(o.s - 32);
    const marker = new THREE.Group();
    marker.position.set(p.x, 0, p.z);
    marker.rotation.y = Math.atan2(p.tx, p.tz);
    scene.add(marker);
    for (const s of [-1, 1]) {
      box([0.12, 2, 0.12], [s * 9.6, 1, 0], dark, marker);
      box([3, 1, 0.1], [s * 9.6, 2.5, 0], sign('JUMP ↑', '#d7fc70', 512, 160), marker);
    }
    for (let j = 0; j < 4; j++) {
      const p = atDistance(o.s - 14 - j * 4),
        m = box([5, 0.014, 0.22], [p.x, 0.026, p.z], lime);
      m.rotation.y = Math.atan2(p.tx, p.tz);
    }
  }
  const pickupMetal = mat('#73818c', 0.25, 0.8);
  const pickupGlow = new THREE.MeshStandardMaterial({
    color: '#8ae8ff',
    emissive: '#37bddd',
    emissiveIntensity: 1.6,
    metalness: 0.3,
    roughness: 0.25,
  });
  const pickupLabel = sign('BOOST / 10s', '#8ae8ff', 512, 160);
  const boostVisuals = boostCanisters.map((point) => {
    const group = new THREE.Group();
    group.position.set(point.x, 0, point.z);
    scene.add(group);
    const canister = new THREE.Group();
    group.add(canister);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.8, 12), pickupMetal);
    canister.add(tank);
    tank.castShadow = true;
    for (const y of [-0.27, 0.27]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.1, 12), pickupGlow);
      band.position.y = y;
      canister.add(band);
    }
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.15, 12), pickupMetal);
    lid.position.y = 0.46;
    canister.add(lid);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1.0, 32),
      new THREE.MeshBasicMaterial({
        color: '#8ae8ff',
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.65,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.035;
    group.add(ring);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 0.5), pickupLabel);
    label.position.y = 2;
    group.add(label);
    return { group, canister, label, ring };
  });
  onProgress?.(40);
  const gltf = await new GLTFLoader().loadAsync('/models/roadster.glb', (e) => {
    if (e.total) onProgress?.(40 + (e.loaded / e.total) * 55);
  });
  const template = gltf.scene;
  let bodyColor = new THREE.Color('#bfc4c9');
  template.traverse((o) => {
    if (!o.isMesh) return;
    if (o.material.name === 'Titanium satin') {
      o.material.color.set('#bac2c8');
      o.material.roughness = 0.23;
      o.material.metalness = 0.72;
      bodyColor = o.material.color.clone();
    }
    if (o.material.name === 'Rear LED') o.material.emissiveIntensity = 4.5;
    if (o.material.name === 'Front LED') o.material.emissiveIntensity = 3.0;
    if (o.material.name === 'Obsidian glass') {
      o.material.metalness = 0.3;
      o.material.roughness = 0.12;
    }
  });
  onProgress?.(100);
  const cars = new Map();
  const vapourMat = new THREE.MeshBasicMaterial({
    color: 0xb6ecff,
    transparent: true,
    opacity: 0.27,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const jetGeo = new THREE.CylinderGeometry(0.26, 0.055, 1.65, 10, 1, true);
  function addCar(state) {
    const group = new THREE.Group(),
      body = template.clone(true),
      rig = new THREE.Group();
    rig.position.y = 0.6;
    body.position.y = -0.6;
    rig.add(body);
    group.add(rig);
    scene.add(group);
    body.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.material = o.material.clone();
        if (o.material.name === 'Titanium satin')
          o.material.color.lerp(new THREE.Color(state.color), 0.3);
      }
    });
    const wingPivot = new THREE.Group();
    wingPivot.position.set(0, 0.86, -1.84);
    body.add(wingPivot);
    box([1.65, 0.035, 0.34], [0, 0.06, -0.04], dark, wingPivot);
    for (const s of [-1, 1]) box([0.025, 0.15, 0.35], [s * 0.81, 0.13, -0.04], dark, wingPivot);
    const jets = new THREE.Group();
    body.add(jets);
    for (const x of [-0.48, -0.16, 0.16, 0.48]) {
      const jet = new THREE.Mesh(jetGeo, vapourMat);
      jet.rotation.x = -Math.PI / 2;
      jet.position.set(x, 0.47, -3.04);
      jets.add(jet);
    }
    const liftJets = new THREE.Group();
    body.add(liftJets);
    for (const x of [-0.65, 0.65])
      for (const z of [-1.25, 1.25]) {
        const jet = new THREE.Mesh(
          new THREE.CylinderGeometry(0.045, 0.25, 1, 8, 1, true),
          vapourMat,
        );
        jet.position.set(x, -0.4, z);
        liftJets.add(jet);
      }
    jets.visible = false;
    liftJets.visible = false;
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.5, 24),
      new THREE.MeshBasicMaterial({
        color: 0x101b24,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(0.78, 1.7, 1);
    shadow.position.y = 0.022;
    scene.add(shadow);
    const v = {
      group,
      body,
      rig,
      jets,
      liftJets,
      wingPivot,
      shadow,
      wheels: ['FL', 'FR', 'RL', 'RR'].map((n) => body.getObjectByName('Wheel_' + n)),
      steers: ['FL', 'FR'].map((n) => body.getObjectByName('Steer_' + n)),
      spin: 0,
      color: state.color,
      position: new THREE.Vector3(state.x, state.y, state.z),
      yaw: state.yaw,
    };
    cars.set(state.id, v);
    return v;
  }
  let time = 0;
  const cameraTarget = new THREE.Vector3(),
    desiredCam = new THREE.Vector3(),
    look = new THREE.Vector3(),
    forward = new THREE.Vector3(),
    base = new THREE.Vector3();
  const chase = new ChaseCameraMotion();
  const shadowDirection = new THREE.Vector3(-60, 100, 40),
    shadowRight = new THREE.Vector3()
      .crossVectors(new THREE.Vector3(0, 1, 0), shadowDirection)
      .normalize(),
    shadowUp = new THREE.Vector3().crossVectors(shadowDirection, shadowRight).normalize(),
    shadowAnchor = new THREE.Vector3();
  let cameraInitialized = false;
  let lastView = 0;
  function update(
    states,
    ownId,
    dt,
    phase,
    input = {},
    view = 0,
    pickups = [],
    elapsed = 0,
    party = null,
  ) {
    time += dt;
    if (phase === 'menu') states = stageMenuCars(states, ownId);
    for (const [id, visual] of boostVisuals.entries()) {
      visual.group.visible = (pickups[id]?.availableAt ?? 0) <= elapsed;
      visual.canister.position.y = 1.0 + Math.sin(time * 2.7 + id) * 0.15;
      visual.canister.rotation.z = 0.18;
      visual.canister.rotation.y = time * 1.5 + id;
      visual.label.quaternion.copy(camera.quaternion);
      visual.ring.material.opacity = 0.45 + Math.sin(time * 3 + id) * 0.15;
    }
    const ids = new Set(states.map((c) => c.id));
    for (const [id, v] of cars)
      if (!ids.has(id)) {
        scene.remove(v.group, v.shadow);
        v.body.traverse((o) => {
          if (o.isMesh) o.material.dispose();
        });
        v.shadow.material.dispose();
        cars.delete(id);
      }
    const own = states.find((c) => c.id === ownId) || states[0];
    if (!own) return;
    for (const c of states) {
      const v = cars.get(c.id) || addCar(c);
      if (v.color !== c.color) {
        v.body.traverse((o) => {
          if (o.isMesh && o.material.name === 'Titanium satin')
            o.material.color.copy(bodyColor).lerp(new THREE.Color(c.color), 0.3);
        });
        v.color = c.color;
      }
      v.position.set(c.x, c.y + 0.02, c.z);
      const delta = Math.atan2(Math.sin(c.yaw - v.yaw), Math.cos(c.yaw - v.yaw));
      v.yaw = c.yaw;
      v.group.position.copy(v.position);
      v.group.rotation.y = v.yaw;
      v.rig.rotation.z = c.rollAngle || 0;
      v.rig.rotation.x = c.grounded ? 0 : Math.max(-0.13, Math.min(0.13, -c.vy * 0.012));
      v.spin += (c.speed * dt) / 0.367;
      v.wheels.forEach((w) => {
        if (w) w.rotation.x = v.spin;
      });
      v.steers.forEach((w) => {
        if (w) {
          const target = c.drifting
            ? c.driftAngle * 0.65
            : (c.id === ownId
                ? -(input.steer || 0)
                : THREE.MathUtils.clamp((delta / Math.max(dt, 0.0001)) * 0.25, -1, 1)) * 0.38;
          w.rotation.y = THREE.MathUtils.lerp(w.rotation.y, target, damping(18, dt));
        }
      });
      v.jets.visible = c.boosting;
      v.jets.scale.z = 0.95 + Math.sin(time * 12) * 0.05;
      v.liftJets.visible = !c.grounded && c.vy > 1;
      v.liftJets.scale.y = 0.95 + Math.sin(time * 12) * 0.05;
      v.wingPivot.position.y = THREE.MathUtils.lerp(
        v.wingPivot.position.y,
        Math.abs(c.speed) > 12 ? 1.1 : 0.86,
        damping(5, dt),
      );
      v.wingPivot.rotation.x = THREE.MathUtils.lerp(
        v.wingPivot.rotation.x,
        c.id === ownId && input.brake > 0.1 ? -0.9 : 0,
        damping(6, dt),
      );
      v.shadow.position.set(c.x, 0.024, c.z);
      v.shadow.rotation.z = -c.yaw;
      v.shadow.material.opacity = 0.22 / (1 + c.y * 0.3);
    }
    for (let i = 0; i < gateVisuals.length; i++) {
      gateVisuals[i].color.set(i === own.nextGate ? '#d7fc70' : '#8da5a0');
      gateVisuals[i].emissiveIntensity = i === own.nextGate ? 1 : 0.18;
    }
    city.update(own, phase, time);
    forward.set(Math.sin(own.yaw), 0, Math.cos(own.yaw));
    base.set(own.x, own.y, own.z);
    if (view !== lastView) {
      chase.reset();
      cameraInitialized = false;
      lastView = view;
    }
    if (phase === 'menu') {
      const pose = menuCameraPose(own, camera.aspect, time, reducedMotion);
      desiredCam.fromArray(pose.position);
      look.fromArray(pose.target);
      camera.fov = pose.fov;
    } else if (view === 1) {
      desiredCam.copy(base).addScaledVector(forward, 0.4);
      desiredCam.y += 1.2;
      look.copy(base).addScaledVector(forward, 35);
      look.y += 0.9;
      camera.fov = 68;
    } else {
      const pose = chase.update(own, dt);
      desiredCam.fromArray(pose.position);
      look.fromArray(pose.target);
      camera.fov = pose.fov;
    }
    if (!cameraInitialized || phase !== 'menu') {
      camera.position.copy(desiredCam);
      cameraTarget.copy(look);
      cameraInitialized = true;
    } else {
      camera.position.lerp(desiredCam, damping(2.5, dt));
      cameraTarget.lerp(look, damping(2.5, dt));
    }
    camera.lookAt(cameraTarget);
    camera.updateProjectionMatrix();
    partyVisuals.update(states, party, elapsed, time, camera, phase);
    // Stabilize the shadow projection in light-space texels as the car moves.
    shadowAnchor.set(own.x, 0, own.z);
    const texel = 54 / sun.shadow.mapSize.x;
    for (const axis of [shadowRight, shadowUp]) {
      const coordinate = shadowAnchor.dot(axis);
      shadowAnchor.addScaledVector(axis, Math.round(coordinate / texel) * texel - coordinate);
    }
    sun.position.copy(shadowAnchor).add(shadowDirection);
    sun.target.position.copy(shadowAnchor);
    sun.target.updateMatrixWorld();
    if (currentQuality === 'low') renderer.render(scene, camera);
    else composer.render(dt);
  }
  const resize = () => {
    const w = Math.max(1, container.clientWidth),
      h = Math.max(1, container.clientHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(renderPixelRatio(w, h, devicePixelRatio, currentQuality));
    renderer.setSize(w, h);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    antialiasPass.uniforms.resolution.value.set(
      1 / Math.floor(w * renderer.getPixelRatio()),
      1 / Math.floor(h * renderer.getPixelRatio()),
    );
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  return {
    scene,
    renderer,
    camera,
    update,
    resetCamera: () => {
      cameraInitialized = false;
      chase.reset();
    },
    setQuality: (q) => {
      currentQuality = q;
      resize();
      city.setQuality(q);
      road.visible = spaceport || q === 'low';
      renderer.shadowMap.enabled = q !== 'low';
    },
    dispose: () => {
      observer.disconnect();
      partyVisuals.dispose();
      const geoms = new Set(),
        mats = new Set(),
        textures = new Set();
      scene.traverse((o) => {
        if (o.geometry) geoms.add(o.geometry);
        if (o.material) {
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
            mats.add(m);
            for (const value of Object.values(m)) if (value?.isTexture) textures.add(value);
          }
        }
      });
      geoms.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      city.dispose();
      bloom.dispose();
      outputPass.dispose();
      antialiasPass.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
