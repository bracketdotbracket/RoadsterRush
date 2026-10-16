import { getTrack, BARRIER_OFFSET, BARRIER_WIDTH } from './track.js';
export { BARRIER_OFFSET, BARRIER_WIDTH } from './track.js';
export const BARRIER_LENGTH = 3.95;
export const BARRIER_BODY_HEIGHT = 1.22;
export const BARRIER_HEIGHT = 3.22; // Concrete plus catch fencing, including on low graphics.
export const CAR_HALF_WIDTH = 1.04;
export const CAR_HALF_LENGTH = 2.32;
const SKIN = 0.018;
const CELL = 12;

// The renderer and both physics runtimes consume exactly the same segments.
const cache = new Map();
function barrierData(trackId) {
  const track = getTrack(trackId);
  if (cache.has(track.id)) return cache.get(track.id);
  const { atDistance, TRACK_LENGTH } = track;
  const barrierSegments = [];
  for (let s = 0; s < TRACK_LENGTH; s += 4) {
    if (s % 80 > 64) continue;
    const p = atDistance(s + 2);
    for (const side of [-1, 1]) {
      barrierSegments.push({
        id: barrierSegments.length,
        s: s + 2,
        side,
        x: p.x + p.tz * side * BARRIER_OFFSET,
        z: p.z - p.tx * side * BARRIER_OFFSET,
        tx: p.tx,
        tz: p.tz,
        yaw: Math.atan2(p.tx, p.tz),
        halfWidth: (BARRIER_WIDTH + 0.06) / 2, // Include the slightly wider top rail.
        halfLength: BARRIER_LENGTH / 2,
        height: BARRIER_HEIGHT,
      });
    }
  }

  // A spatial hash keeps repeated collision checks local to the car.
  const cells = new Map();
  for (const b of barrierSegments) {
    const radius = Math.hypot(b.halfWidth, b.halfLength);
    for (let x = Math.floor((b.x - radius) / CELL); x <= Math.floor((b.x + radius) / CELL); x++) {
      for (let z = Math.floor((b.z - radius) / CELL); z <= Math.floor((b.z + radius) / CELL); z++) {
        const key = `${x},${z}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(b);
      }
    }
  }
  cache.set(track.id, { barrierSegments, cells });
  return cache.get(track.id);
}
export function getBarrierSegments(trackId) {
  return barrierData(trackId).barrierSegments;
}
export const barrierSegments = getBarrierSegments();
function nearby(x, z, trackId) {
  const { cells } = barrierData(trackId);
  const radius = Math.hypot(CAR_HALF_WIDTH, CAR_HALF_LENGTH) + 0.1;
  const found = new Set();
  for (let ix = Math.floor((x - radius) / CELL); ix <= Math.floor((x + radius) / CELL); ix++) {
    for (let iz = Math.floor((z - radius) / CELL); iz <= Math.floor((z + radius) / CELL); iz++) {
      for (const b of cells.get(`${ix},${iz}`) || []) found.add(b);
    }
  }
  return found;
}

// Separating-axis contact between the whole oriented car footprint and a wall.
export function barrierContact(car, barrier) {
  const rollAllowance = car.rollActive ? 0.6 : 0;
  if (car.y - rollAllowance >= barrier.height || car.y + 1.3 < 0) return null;
  const fx = Math.sin(car.yaw),
    fz = Math.cos(car.yaw);
  const axes = [
    [barrier.tz, -barrier.tx],
    [barrier.tx, barrier.tz],
    [fz, -fx],
    [fx, fz],
  ];
  const dx = car.x - barrier.x,
    dz = car.z - barrier.z;
  let depth = Infinity,
    normal;
  for (const [nx, nz] of axes) {
    const carRadius =
      CAR_HALF_WIDTH * Math.abs(fz * nx - fx * nz) + CAR_HALF_LENGTH * Math.abs(fx * nx + fz * nz);
    const wallRadius =
      barrier.halfWidth * Math.abs(barrier.tz * nx - barrier.tx * nz) +
      barrier.halfLength * Math.abs(barrier.tx * nx + barrier.tz * nz);
    const distance = dx * nx + dz * nz;
    const overlap = carRadius + wallRadius - Math.abs(distance);
    if (overlap <= 0) return null;
    if (overlap < depth) {
      depth = overlap;
      const sign = distance < 0 ? -1 : 1;
      normal = { x: nx * sign, z: nz * sign };
    }
  }
  return { depth, ...normal };
}

function respond(car, contact) {
  const fx = Math.sin(car.yaw + (car.driftAngle || 0)),
    fz = Math.cos(car.yaw + (car.driftAngle || 0));
  let vx = fx * car.speed + (car.impactVX || 0),
    vz = fz * car.speed + (car.impactVZ || 0);
  const intoWall = vx * contact.x + vz * contact.z;
  if (intoWall >= 0) return 0;
  const impact = -intoWall;
  // Only a new impact gets a bounce. Resting contact cannot gain energy or
  // repeatedly kick the car while the driver is steering away from the wall.
  const rebound = car.impactCooldown > 0 ? 0 : Math.min(4, impact * 0.22);
  vx += (rebound - intoWall) * contact.x;
  vz += (rebound - intoWall) * contact.z;
  car.speed = vx * fx + vz * fz;
  car.impactVX = vx - fx * car.speed;
  car.impactVZ = vz - fz * car.speed;
  if (impact > 1 && car.impactCooldown <= 0) car.impactCooldown = 0.18;
  return impact;
}

export function moveWithBarriers(car, previous) {
  const end = { x: car.x, z: car.z, y: car.y, yaw: car.yaw };
  const oldYaw = previous.yaw ?? car.yaw;
  const turn = Math.atan2(Math.sin(end.yaw - oldYaw), Math.cos(end.yaw - oldYaw));
  const distance = Math.hypot(end.x - previous.x, end.z - previous.z);
  // Substeps catch boost-speed crossings, glancing corners and rotation into a
  // thin barrier. They also account for jumping through the fence's height.
  const steps = Math.max(
    1,
    Math.ceil((distance + Math.abs(turn) * 2.6) / 0.3),
    Math.ceil(Math.abs(end.y - previous.y) / 0.3),
  );
  let dx = (end.x - previous.x) / steps,
    dz = (end.z - previous.z) / steps;
  car.x = previous.x;
  car.z = previous.z;
  let strongest = 0;
  for (let step = 1; step <= steps; step++) {
    car.x += dx;
    car.z += dz;
    car.y = previous.y + ((end.y - previous.y) * step) / steps;
    car.yaw = oldYaw + (turn * step) / steps;
    // Multiple passes settle seams between adjacent curved wall segments.
    for (let pass = 0; pass < 5; pass++) {
      let contact = null;
      for (const b of nearby(car.x, car.z, car.trackId)) {
        const candidate = barrierContact(car, b);
        if (candidate && (!contact || candidate.depth > contact.depth)) contact = candidate;
      }
      if (!contact) break;
      car.x += contact.x * (contact.depth + SKIN);
      car.z += contact.z * (contact.depth + SKIN);
      strongest = Math.max(strongest, respond(car, contact));
      const inward = dx * contact.x + dz * contact.z;
      if (inward < 0) {
        dx -= inward * contact.x;
        dz -= inward * contact.z;
      }
    }
  }
  car.y = end.y;
  car.yaw = end.yaw;
  return strongest;
}
