import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { createCityLayout, seededRandom } from './city-layout.js';
import {
  atDistance,
  TRACK_LENGTH,
  TRACK_WIDTH,
  BARRIER_OFFSET,
  START_FINISH_POST_WIDTH,
  START_FINISH_CLEAR_WIDTH,
} from '../../shared/track.js';
import {
  barrierSegments,
  BARRIER_WIDTH,
  BARRIER_LENGTH,
  BARRIER_BODY_HEIGHT,
} from '../../shared/barriers.js';

const CYAN = '#49d9ff';
function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createNeonCity(scene, renderer, roadGeometry) {
  const resources = [],
    detail = new THREE.Group();
  detail.name = 'Neon City — street furniture';
  scene.add(detail);
  const random = seededRandom(20261016);
  const layout = createCityLayout();
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const dummy = new THREE.Object3D();
  const metal = new THREE.MeshStandardMaterial({
    color: '#182330',
    metalness: 0.75,
    roughness: 0.35,
  });
  const concrete = new THREE.MeshStandardMaterial({
    color: '#55616e',
    metalness: 0.15,
    roughness: 0.72,
  });
  const cyan = new THREE.MeshStandardMaterial({
    color: CYAN,
    emissive: CYAN,
    emissiveIntensity: 3.4,
  });
  const white = new THREE.MeshStandardMaterial({
    color: '#c9e5ff',
    emissive: '#c9e5ff',
    emissiveIntensity: 3.2,
  });
  const red = new THREE.MeshStandardMaterial({
    color: '#ff385e',
    emissive: '#ff1641',
    emissiveIntensity: 3,
  });
  const lime = new THREE.MeshStandardMaterial({
    color: '#d7fc70',
    emissive: '#d7fc70',
    emissiveIntensity: 2.1,
  });

  function box(size, position, material, parent = scene, yaw = 0) {
    const mesh = new THREE.Mesh(cube, material);
    mesh.scale.set(...size);
    mesh.position.set(...position);
    mesh.rotation.y = yaw;
    parent.add(mesh);
    return mesh;
  }
  function instances(items, material, parent = scene) {
    const mesh = new THREE.InstancedMesh(cube, material, items.length);
    items.forEach((p, i) => {
      dummy.position.set(...p.position);
      dummy.scale.set(...p.scale);
      dummy.rotation.set(0, p.yaw || 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    parent.add(mesh);
    return mesh;
  }
  function sign(text, subtitle = '', width = 1024, height = 256) {
    const texture = canvasTexture(width, height, (ctx, w, h) => {
      ctx.fillStyle = '#09131f';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#d7fc70';
      ctx.fillRect(0, 0, 12, h);
      ctx.fillStyle = '#f1f6ff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 ${Math.round(h * (subtitle ? 0.42 : 0.55))}px Arial`;
      ctx.fillText(text, w / 2, h * (subtitle ? 0.4 : 0.5), w * 0.88);
      if (subtitle) {
        ctx.fillStyle = '#86cadd';
        ctx.font = `600 ${Math.round(h * 0.12)}px Arial`;
        ctx.fillText(subtitle, w / 2, h * 0.77, w * 0.86);
      }
    });
    return new THREE.MeshBasicMaterial({ map: texture });
  }

  // A dark blue sky and a separate studio-like night environment keep the
  // silver body readable while the surrounding city remains convincingly dark.
  const sky = canvasTexture(1024, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#030810');
    g.addColorStop(0.38, '#10233d');
    g.addColorStop(0.51, '#344b66');
    g.addColorStop(0.65, '#101b29');
    g.addColorStop(1, '#050a10');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 100; i++) {
      ctx.fillStyle = `rgba(187,213,245,${random() * 0.25})`;
      ctx.fillRect(random() * w, random() * h * 0.3, 1, 1);
    }
  });
  sky.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = sky;
  scene.fog = new THREE.FogExp2('#182b42', 0.0031);
  resources.push(sky);
  const environment = new THREE.Scene();
  environment.background = new THREE.Color('#304459');
  const envPanel = new THREE.MeshBasicMaterial({
    color: new THREE.Color(2.2, 2.8, 3.5),
    side: THREE.DoubleSide,
  });
  const softPanel = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.8, 1.9, 1.8),
    side: THREE.DoubleSide,
  });
  box([25, 0.1, 5], [0, 9, 0], envPanel, environment);
  box([0.1, 10, 28], [-13, 4, 0], softPanel, environment);
  box([0.1, 6, 18], [12, 3, -8], envPanel, environment);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentTarget = pmrem.fromScene(environment, 0.08);
  scene.environment = environmentTarget.texture;
  scene.environmentIntensity = 0.85;
  pmrem.dispose();
  envPanel.dispose();
  softPanel.dispose();

  // Four facade atlases, shared by hundreds of instanced buildings.
  for (let style = 0; style < 4; style++) {
    const texture = canvasTexture(512, 1024, (ctx, w, h) => {
      ctx.fillStyle = ['#101b29', '#142131', '#0d1926', '#1c2733'][style];
      ctx.fillRect(0, 0, w, h);
      for (let y = 12; y < h; y += 24)
        for (let x = 10; x < w; x += 28) {
          const on = random();
          ctx.fillStyle =
            on > 0.73 ? '#bacbd0' : on > 0.56 ? '#6b99b7' : on > 0.48 ? '#b4a079' : '#162839';
          ctx.fillRect(x, y, 13 + (style === 2 ? 5 : 0), 9);
          ctx.fillStyle = '#34465a';
          ctx.fillRect(x - 2, y + 14, 22, 1);
        }
      for (let x = 0; x < w; x += 128) {
        ctx.fillStyle = '#09131e';
        ctx.fillRect(x, 0, 5, h);
      }
    });
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const facade = new THREE.MeshStandardMaterial({
      map: texture,
      emissiveMap: texture,
      emissive: '#aacfff',
      emissiveIntensity: 0.85,
      metalness: 0.35,
      roughness: 0.48,
    });
    const buildings = layout.buildings.filter((b) => b.style === style);
    const batch = instances(
      buildings.map((b) => ({
        position: [b.x, b.height / 2, b.z],
        scale: [b.width, b.height, b.depth],
      })),
      facade,
    );
    batch.name = `City blocks ${style + 1}`;
    batch.castShadow = true;
    batch.receiveShadow = true;
    instances(
      buildings.map((b) => ({
        position: [b.x, b.height + 0.2, b.z],
        scale: [b.width + 0.45, 0.55, b.depth + 0.45],
      })),
      metal,
    );
    instances(
      buildings
        .filter((_, i) => i % 3 === 0)
        .map((b) => ({
          position: [b.x, b.height + 1.4, b.z],
          scale: [b.width * 0.3, 2.4, b.depth * 0.3],
        })),
      concrete,
      detail,
    );
    const towers = buildings.filter((b) => b.height > 65);
    instances(
      towers.map((b) => ({ position: [b.x, b.height + 3, b.z], scale: [0.18, 5, 0.18] })),
      metal,
      detail,
    );
    instances(
      towers.map((b) => ({ position: [b.x, b.height + 5.5, b.z], scale: [0.4, 0.35, 0.4] })),
      red,
    );
    if (style === 1) {
      instances(
        towers.map((b) => ({
          position: [b.x + b.width / 2 + 0.05, b.height * 0.6, b.z - b.depth / 2],
          scale: [0.13, b.height * 0.8, 0.13],
        })),
        cyan,
      );
    }
  }

  // Runoff, sidewalks, modular crash barriers and catch fencing. Regular breaks
  // in the barriers provide visible routes back from the slower off-road strip.
  const barriers = [],
    rails = [],
    posts = [],
    luminousEdges = [],
    fencePanels = [];
  for (let s = 0; s < TRACK_LENGTH; s += 4) {
    const p = atDistance(s + 2),
      yaw = Math.atan2(p.tx, p.tz);
    for (const side of [-1, 1]) {
      const at = (d) => [p.x + p.tz * side * d, 0, p.z - p.tx * side * d];
      const edge = at(TRACK_WIDTH / 2 + 0.82);
      luminousEdges.push({ position: [edge[0], 0.09, edge[2]], scale: [0.12, 0.075, 3.55], yaw });
    }
  }
  for (const b of barrierSegments) {
    const pos = [b.x, 0, b.z],
      yaw = b.yaw;
    barriers.push({
      position: [pos[0], BARRIER_BODY_HEIGHT / 2, pos[2]],
      scale: [BARRIER_WIDTH, BARRIER_BODY_HEIGHT, BARRIER_LENGTH],
      yaw,
    });
    rails.push({
      position: [pos[0], 1.24, pos[2]],
      scale: [BARRIER_WIDTH + 0.06, 0.065, BARRIER_LENGTH],
      yaw,
    });
    posts.push({ position: [pos[0], 2.2, pos[2]], scale: [0.09, 2.0, 0.09], yaw });
    fencePanels.push({ position: [pos[0], 2.22, pos[2]], yaw });
  }
  instances(barriers, concrete).receiveShadow = true;
  instances(rails, metal);
  instances(posts, metal, detail);
  instances(luminousEdges, cyan);
  const fenceTexture = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#65788a';
    ctx.lineWidth = 1.3;
    for (let x = -128; x < 256; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 128, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x - 128, h);
      ctx.stroke();
    }
  });
  fenceTexture.wrapS = fenceTexture.wrapT = THREE.RepeatWrapping;
  fenceTexture.repeat.set(2, 1);
  const fences = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(4, 2),
    new THREE.MeshStandardMaterial({
      map: fenceTexture,
      transparent: true,
      alphaTest: 0.3,
      side: THREE.DoubleSide,
      roughness: 0.85,
    }),
    fencePanels.length,
  );
  fencePanels.forEach((p, i) => {
    dummy.position.set(...p.position);
    dummy.scale.set(1, 1, 1);
    dummy.rotation.set(0, p.yaw + Math.PI / 2, 0);
    dummy.updateMatrix();
    fences.setMatrixAt(i, dummy.matrix);
  });
  fences.computeBoundingSphere();
  detail.add(fences);

  // Physical lamp models and inexpensive light pools repeat along both sides.
  const poles = [],
    arms = [],
    lamps = [],
    cyanPosts = [];
  for (const p of layout.streetlights) {
    const yaw = Math.atan2(p.tx, p.tz);
    poles.push({ position: [p.x, 5.8, p.z], scale: [0.16, 11.6, 0.16], yaw });
    arms.push({
      position: [p.x - p.tz * p.side * 1.1, 11.5, p.z + p.tx * p.side * 1.1],
      scale: [2.4, 0.13, 0.18],
      yaw,
    });
    lamps.push({
      position: [p.x - p.tz * p.side * 2.1, 11.39, p.z + p.tx * p.side * 2.1],
      scale: [0.8, 0.12, 1.6],
      yaw,
    });
    cyanPosts.push({ position: [p.x, 3.3, p.z], scale: [0.2, 3.1, 0.2], yaw });
  }
  instances(poles, metal);
  instances(arms, metal);
  instances(lamps, white);
  instances(cyanPosts, cyan);
  const glow = canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(96,182,255,0.24)');
    g.addColorStop(0.4, 'rgba(56,135,223,0.10)');
    g.addColorStop(1, 'rgba(30,97,180,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  const poolMat = new THREE.MeshBasicMaterial({
    map: glow,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pools = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(15, 22),
    poolMat,
    layout.streetlights.length,
  );
  layout.streetlights.forEach((p, i) => {
    dummy.position.set(p.x - p.tz * p.side * 5, 0.023, p.z + p.tx * p.side * 5);
    dummy.scale.set(1, 1, 1);
    dummy.rotation.set(-Math.PI / 2, 0, -Math.atan2(p.tx, p.tz));
    dummy.updateMatrix();
    pools.setMatrixAt(i, dummy.matrix);
  });
  pools.computeBoundingSphere();
  scene.add(pools);

  // Trackside advertising and a recognisable, oversized starting structure.
  for (let i = 0; i < 15; i++) {
    const p = atDistance(15 + (i * TRACK_LENGTH) / 15),
      side = i % 2 ? 1 : -1;
    const g = new THREE.Group();
    g.position.set(p.x + p.tz * side * 19.5, 0, p.z - p.tx * side * 19.5);
    g.rotation.y = Math.atan2(p.tx, p.tz) + (side * Math.PI) / 2;
    scene.add(g);
    box([6.4, 4, 0.25], [0, 4.7, 0], metal, g);
    box(
      [6.1, 3.6, 0.28],
      [0, 4.7, 0],
      sign(
        i % 3 === 0 ? 'R / R' : i % 3 === 1 ? 'NEON CITY' : 'DRIVE FURTHER',
        'ROADSTER RUSH · NIGHT SERIES',
        1024,
        512,
      ),
      g,
    );
    box([0.2, 3, 0.2], [-2.4, 1.5, 0], metal, g);
    box([0.2, 3, 0.2], [2.4, 1.5, 0], metal, g);
  }
  const start = atDistance(0),
    gantry = new THREE.Group();
  gantry.name = 'Start / finish — barrier to barrier';
  gantry.position.set(start.x, 0, start.z);
  gantry.rotation.y = Math.atan2(start.tx, start.tz);
  scene.add(gantry);
  const paint = new THREE.MeshStandardMaterial({ color: '#d4e0ed', roughness: 0.46 });
  const finishColumns = 36,
    finishCellWidth = START_FINISH_CLEAR_WIDTH / finishColumns;
  for (let x = 0; x < finishColumns; x++)
    for (let row = 0; row < 2; row++) {
      box(
        [finishCellWidth, 0.012, 1],
        [(x + 0.5) * finishCellWidth - START_FINISH_CLEAR_WIDTH / 2, 0.027, row - 0.5],
        (x + row) % 2 ? metal : paint,
        gantry,
      );
    }
  for (let i = 0; i < 8; i++) {
    const p = atDistance(-8 - Math.floor(i / 2) * 8),
      lane = i % 2 ? 2.6 : -2.6;
    const yaw = Math.atan2(p.tx, p.tz);
    const position = [p.x + p.tz * lane, 0.026, p.z - p.tx * lane];
    box([3.2, 0.014, 0.12], position, paint, scene, yaw);
  }
  for (const side of [-1, 1]) {
    box([START_FINISH_POST_WIDTH, 9.3, 0.7], [side * BARRIER_OFFSET, 4.65, 0], metal, gantry);
    box([0.13, 7.4, 0.8], [side * (START_FINISH_CLEAR_WIDTH / 2 - 0.065), 4.8, 0], cyan, gantry);
    const flagOffset = BARRIER_OFFSET - 2.4;
    box([3.3, 2.6, 0.35], [side * flagOffset, 8.65, 0], metal, gantry);
    for (let x = 0; x < 5; x++)
      for (let y = 0; y < 4; y++) {
        box(
          [0.58, 0.58, 0.08],
          [side * flagOffset - 1.16 + x * 0.58, 7.78 + y * 0.58, -0.23],
          (x + y) % 2 ? white : metal,
          gantry,
        );
      }
  }
  box([BARRIER_OFFSET * 2 + START_FINISH_POST_WIDTH, 3, 0.45], [0, 8.6, 0.16], metal, gantry);
  box(
    [BARRIER_OFFSET * 2 - 10, 2.6, 0.55],
    [0, 8.6, 0.1],
    sign('R / R', 'ROADSTER RUSH  /  NEON CITY', 1792, 256),
    gantry,
  );
  box([8, 0.75, 0.7], [0, 6.8, 0], metal, gantry);
  const startLights = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.MeshStandardMaterial({
      color: '#72ffc4',
      emissive: '#32ff99',
      emissiveIntensity: 4,
    });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 8), m);
    lamp.position.set((i - 2) * 1.3, 6.8, -0.42);
    gantry.add(lamp);
    startLights.push(m);
  }

  // Two grandstands alongside the straight, with stepped terraces, a canopy,
  // support beams and an instanced crowd behind the fencing.
  for (const side of [-1, 1]) {
    const p = atDistance(42),
      yaw = Math.atan2(p.tx, p.tz);
    const group = new THREE.Group();
    group.position.set(p.x + p.tz * side * 26, 0, p.z - p.tx * side * 26);
    group.rotation.y = yaw;
    scene.add(group);
    for (let row = 0; row < 6; row++) {
      box(
        [1.4, 0.55 + row * 0.55, 32],
        [side * row * 1.3, (0.55 + row * 0.55) / 2, 0],
        concrete,
        group,
      );
    }
    box([11, 0.25, 35], [side * 3.4, 7.6, 0], metal, group);
    box([10.5, 0.06, 0.15], [side * 3.4, 7.42, -17], cyan, group);
    for (const z of [-15, 0, 15]) box([0.22, 7.4, 0.22], [side * 7.5, 3.7, z], metal, group);
    const people = [];
    for (let row = 1; row < 6; row++)
      for (let z = -14; z <= 14; z += 0.85) {
        if (random() < 0.12) continue;
        people.push({
          position: [side * row * 1.3, 0.7 + row * 0.55 + 0.5, z],
          scale: [0.34, 0.8 + random() * 0.2, 0.3],
        });
      }
    const crowd = instances(
      people,
      new THREE.MeshStandardMaterial({ color: '#62778e', roughness: 0.9 }),
      group,
    );
    people.forEach((_, i) =>
      crowd.setColorAt(i, new THREE.Color().setHSL(random(), 0.2, 0.25 + random() * 0.3)),
    );
  }

  // One planar reflection pass for the whole circuit, with asphalt grain,
  // puddle variation and a softened reflection instead of a perfect mirror.
  const reflectorGeometry = roadGeometry.clone();
  reflectorGeometry.translate(0, -0.005, 0);
  reflectorGeometry.rotateX(Math.PI / 2);
  const shader = {
    uniforms: {
      tDiffuse: { value: null },
      textureMatrix: { value: null },
      color: { value: new THREE.Color('#182536') },
      texel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
    },
    vertexShader: `uniform mat4 textureMatrix;
      varying vec4 vMirror; varying vec3 vWorld;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){
        vMirror = textureMatrix * vec4(position,1.0);
        vWorld = (modelMatrix * vec4(position,1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec3 color; uniform vec2 texel;
      varying vec4 vMirror; varying vec3 vWorld;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      float noise(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float softNoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(noise(i),noise(i+vec2(1,0)),f.x),mix(noise(i+vec2(0,1)),noise(i+vec2(1,1)),f.x),f.y); }
      void main(){
        #include <logdepthbuf_fragment>
        vec2 uv = vMirror.xy / vMirror.w;
        // Fade details below a pixel's footprint instead of sparkling in motion.
        float footprint = max(length(dFdx(vWorld.xz)),length(dFdy(vWorld.xz)));
        float grainFilter = 1.0-smoothstep(0.35,1.0,footprint*65.0);
        float grain = mix(0.5,softNoise(vWorld.xz*65.0),grainFilter);
        float puddle = smoothstep(0.30,0.75,softNoise(vWorld.xz*0.38));
        vec2 distortion = vec2(softNoise(vWorld.xz*18.0),softNoise(vWorld.zx*21.0))-0.5;
        uv += distortion*0.0008*(1.0-smoothstep(0.35,1.0,footprint*21.0));
        vec3 reflection = texture2D(tDiffuse,uv).rgb*0.4;
        reflection += texture2D(tDiffuse,uv+texel*vec2(1.5,0)).rgb*0.15;
        reflection += texture2D(tDiffuse,uv-texel*vec2(1.5,0)).rgb*0.15;
        reflection += texture2D(tDiffuse,uv+texel*vec2(0,2.5)).rgb*0.15;
        reflection += texture2D(tDiffuse,uv-texel*vec2(0,2.5)).rgb*0.15;
        float fresnel = pow(1.0-abs(normalize(cameraPosition-vWorld).y),3.0);
        vec3 asphalt = color*(0.78+grain*0.42);
        vec3 result = mix(asphalt,reflection,(0.13+puddle*0.22+fresnel*0.18));
        float fog = 1.0-exp(-pow(length(cameraPosition-vWorld)*0.0031,2.0));
        gl_FragColor = vec4(mix(result,vec3(0.0091,0.0242,0.0545),fog),1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  };
  const reflection = new Reflector(reflectorGeometry, {
    textureWidth: 512,
    textureHeight: 512,
    multisample: 0,
    color: '#1e3045',
    clipBias: 0.003,
    shader,
  });
  reflection.rotation.x = -Math.PI / 2;
  reflection.position.y = 0.01;
  reflection.name = 'Wet asphalt reflections';
  scene.add(reflection);

  // A small fixed light budget follows the racer instead of adding hundreds
  // of expensive point lights. Lamp meshes remain visible throughout the city.
  const followLights = [
    new THREE.PointLight('#a3d4ff', 95, 35, 2),
    new THREE.PointLight('#39c9ff', 60, 28, 2),
    new THREE.PointLight('#d4e4ff', 70, 30, 2),
  ];
  followLights.forEach((l) => scene.add(l));
  const heroLight = new THREE.DirectionalLight('#d8e8ff', 1.9);
  scene.add(heroLight, heroLight.target);
  // Refresh reflection and its projection together on every rendered frame.
  let currentQuality = 'medium';
  const f = new THREE.Vector3(),
    r = new THREE.Vector3();
  function update(own, phase, t) {
    f.set(Math.sin(own.yaw), 0, Math.cos(own.yaw));
    r.set(f.z, 0, -f.x);
    followLights[0].position.set(own.x, 6.8, own.z).addScaledVector(f, -3);
    followLights[1].position.set(own.x, 3.8, own.z).addScaledVector(r, -8);
    followLights[2].position.set(own.x, 7, own.z).addScaledVector(f, 14);
    heroLight.position.set(own.x, 9, own.z).addScaledVector(r, 8).addScaledVector(f, -6);
    heroLight.target.position.set(own.x, 0.5, own.z);
    heroLight.target.updateMatrixWorld();
    const countdown = phase === 'countdown';
    for (const light of startLights) {
      light.color.set(countdown ? '#ff424a' : '#81ffbb');
      light.emissive.set(countdown ? '#ff1e32' : '#22ff88');
      light.emissiveIntensity = countdown ? 2.5 + Math.sin(t * 9) * 0.8 : 3.2;
    }
  }
  function setQuality(q) {
    currentQuality = q;
    reflection.visible = q !== 'low';
    detail.visible = q !== 'low';
    const size = q === 'high' ? 768 : 512;
    reflection.getRenderTarget().setSize(size, size);
    reflection.material.uniforms.texel.value.set(1 / size, 1 / size);
    followLights[1].visible = q !== 'low';
  }
  return {
    layout,
    update,
    setQuality,
    dispose() {
      reflection.dispose();
      environmentTarget.dispose();
      resources.forEach((r) => r.dispose());
    },
    get quality() {
      return currentQuality;
    },
  };
}
