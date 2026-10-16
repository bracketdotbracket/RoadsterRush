export const TRACK_WIDTH = 22;
// Shared by the city, collision walls and start/finish detection.
export const BARRIER_OFFSET = 17.8;
export const BARRIER_WIDTH = 0.65;
export const START_FINISH_POST_WIDTH = 0.8;
export const START_FINISH_CLEAR_WIDTH = BARRIER_OFFSET * 2 - START_FINISH_POST_WIDTH;
export const LAPS = 3;
const neonPoints = [
  [0, 120],
  [0, 10],
  [40, -90],
  [150, -130],
  [250, -100],
  [290, -10],
  [270, 110],
  [175, 170],
  [55, 180],
  [0, 160],
];
const mod = (a, n) => ((a % n) + n) % n;
function catmull(p0, p1, p2, p3, t) {
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t)
  );
}

export const DEFAULT_TRACK_ID = 'neon-city';
export const TRACK_OPTIONS = [
  {
    id: 'neon-city',
    name: 'Neon City',
    number: '01',
    tag: 'NIGHT CIRCUIT',
    description: 'City lights. Fast streets. Two jump zones.',
    accent: '#85e5ff',
  },
  {
    id: 'starport',
    name: 'Starport Circuit',
    number: '02',
    tag: 'COASTAL SPACEPORT',
    description: 'Factory straight. Launch-pad sweep. Sunset coast.',
    accent: '#ffb87c',
  },
];
const starportPoints = [
  [0, 140],
  [0, 10],
  [25, -120],
  [125, -190],
  [270, -175],
  [340, -90],
  [350, 30],
  [270, 80],
  [190, 55],
  [150, 130],
  [95, 215],
  [15, 210],
];
function createTrack(points, meta) {
  const samples = Array.from({ length: 600 }, (_, i) => {
    const u = (i / 600) * points.length,
      j = Math.floor(u),
      t = u - j;
    return {
      x: catmull(
        points[mod(j - 1, points.length)][0],
        points[j][0],
        points[(j + 1) % points.length][0],
        points[(j + 2) % points.length][0],
        t,
      ),
      z: catmull(
        points[mod(j - 1, points.length)][1],
        points[j][1],
        points[(j + 1) % points.length][1],
        points[(j + 2) % points.length][1],
        t,
      ),
      s: 0,
    };
  });
  let length = 0;
  for (let i = 0; i < samples.length; i++) {
    samples[i].s = length;
    const next = samples[(i + 1) % samples.length];
    length += Math.hypot(next.x - samples[i].x, next.z - samples[i].z);
  }
  const TRACK_LENGTH = length;
  for (let i = 0; i < samples.length; i++) {
    const a = samples[mod(i - 1, samples.length)],
      b = samples[(i + 1) % samples.length],
      d = Math.hypot(b.x - a.x, b.z - a.z);
    Object.assign(samples[i], { tx: (b.x - a.x) / d, tz: (b.z - a.z) / d });
  }
  function atDistance(s) {
    s = mod(s, length);
    let lo = 0,
      hi = samples.length - 1;
    while (lo < hi) {
      const m = Math.ceil((lo + hi) / 2);
      if (samples[m].s <= s) lo = m;
      else hi = m - 1;
    }
    const a = samples[lo],
      b = samples[(lo + 1) % samples.length],
      span = (lo === samples.length - 1 ? length : b.s) - a.s,
      t = (s - a.s) / span;
    const tx = a.tx * (1 - t) + b.tx * t,
      tz = a.tz * (1 - t) + b.tz * t,
      d = Math.hypot(tx, tz);
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, tx: tx / d, tz: tz / d, s };
  }
  function nearest(x, z) {
    let best = Infinity,
      result;
    for (let i = 0; i < samples.length; i++) {
      const a = samples[i],
        b = samples[(i + 1) % samples.length],
        dx = b.x - a.x,
        dz = b.z - a.z,
        span = dx * dx + dz * dz,
        t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / span)),
        px = a.x + t * dx,
        pz = a.z + t * dz,
        dist = (x - px) ** 2 + (z - pz) ** 2;
      if (dist < best) {
        best = dist;
        result = {
          x: px,
          z: pz,
          s: a.s + t * Math.sqrt(span),
          tx: dx / Math.sqrt(span),
          tz: dz / Math.sqrt(span),
          distance: Math.sqrt(dist),
          lateral: ((x - px) * dz) / Math.sqrt(span) - ((z - pz) * dx) / Math.sqrt(span),
        };
      }
    }
    return result;
  }
  const gates = Array.from({ length: 12 }, (_, i) => ({
    ...atDistance((i * length) / 12),
    index: i,
    halfWidth: i === 0 ? START_FINISH_CLEAR_WIDTH / 2 : TRACK_WIDTH / 2 + 1,
  }));
  const obstacles = [0.23, 0.64].map((f, i) => ({
    ...atDistance(f * length),
    width: 6,
    height: 1.05,
    depth: 2.3,
    id: i,
  }));
  function gateCrossed(g, previous, current) {
    const d0 = (previous.x - g.x) * g.tx + (previous.z - g.z) * g.tz,
      d1 = (current.x - g.x) * g.tx + (current.z - g.z) * g.tz;
    if (!(d0 < 0 && d1 >= 0)) return false;
    const t = -d0 / (d1 - d0),
      x = previous.x + (current.x - previous.x) * t,
      z = previous.z + (current.z - previous.z) * t,
      y = previous.y + (current.y - previous.y) * t;
    return Math.abs((x - g.x) * g.tz - (z - g.z) * g.tx) < g.halfWidth && y < 7;
  }

  const boostCanisters = [0.055, 0.16, 0.32, 0.44, 0.56, 0.73, 0.84, 0.94].map((fraction, id) => {
    const p = atDistance(fraction * TRACK_LENGTH);
    const lane = [0, -2, 2, 0][id % 4];
    return { ...p, id, x: p.x + p.tz * lane, z: p.z - p.tx * lane };
  });

  return {
    ...meta,
    samples,
    TRACK_WIDTH,
    TRACK_LENGTH,
    LAPS,
    atDistance,
    nearest,
    gates,
    obstacles,
    gateCrossed,
    boostCanisters,
  };
}

const tracks = new Map(
  TRACK_OPTIONS.map((meta) => [
    meta.id,
    createTrack(meta.id === 'starport' ? starportPoints : neonPoints, meta),
  ]),
);
export function getTrack(id = DEFAULT_TRACK_ID) {
  return tracks.get(id) || tracks.get(DEFAULT_TRACK_ID);
}
export function isTrackId(id) {
  return tracks.has(id);
}
export const {
  samples,
  TRACK_LENGTH,
  atDistance,
  nearest,
  gates,
  obstacles,
  gateCrossed,
  boostCanisters,
} = getTrack();
