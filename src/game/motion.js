const clamp01 = (n) => Math.max(0, Math.min(1, n));
export const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
export const damping = (rate, dt) => 1 - Math.exp(-rate * Math.max(0, dt));

export function discontinuity(a, b) {
  return !a || a.penalty !== b.penalty || Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) > 12;
}

// Interpolate only presentation values. Lap timing, collisions and controls stay at 60 Hz.
export function interpolateCar(a, b, alpha) {
  if (discontinuity(a, b)) return { ...b };
  const t = clamp01(alpha),
    result = { ...b };
  for (const key of ['x', 'y', 'z', 'speed', 'vy']) result[key] = a[key] + (b[key] - a[key]) * t;
  for (const key of ['yaw', 'rollAngle', 'driftAngle'])
    result[key] = (a[key] || 0) + angleDelta(a[key] || 0, b[key] || 0) * t;
  return result;
}

export class RenderMotion {
  constructor() {
    this.reset([]);
  }
  reset(cars) {
    this.previous = new Map(cars.map((c) => [c.id, { ...c }]));
    this.snapshots = [];
    this.correction = null;
  }
  beforeStep(cars) {
    this.previous = new Map(cars.map((c) => [c.id, { ...c }]));
  }
  pushSnapshot(cars, now) {
    this.snapshots.push({ at: now, cars: new Map(cars.map((c) => [c.id, { ...c }])) });
    // Two seconds of snapshots is ample for the 100 ms presentation buffer.
    while (this.snapshots.length > 40) this.snapshots.shift();
  }
  reconcile(old, next) {
    if (
      !old ||
      discontinuity(old, next) ||
      Math.hypot(next.x - old.x, next.y - old.y, next.z - old.z) > 2.5
    ) {
      this.previous.set(next.id, { ...next });
      this.correction = null;
      return;
    }
    const offset =
      this.correction?.id === next.id ? this.correction : { id: next.id, x: 0, y: 0, z: 0, yaw: 0 };
    const previous = this.previous.get(next.id);
    for (const key of ['x', 'y', 'z', 'yaw']) {
      const delta = key === 'yaw' ? angleDelta(old.yaw, next.yaw) : next[key] - old[key];
      if (previous) previous[key] += delta;
      offset[key] -= delta;
    }
    // Large accumulated corrections should snap rather than drift through walls.
    this.correction = Math.hypot(offset.x, offset.y, offset.z) <= 2.5 ? offset : null;
  }
  sample(cars, alpha, dt, now, online, ownId) {
    const target = now - 100;
    while (this.snapshots.length > 2 && this.snapshots[1].at <= target) this.snapshots.shift();
    const a = this.snapshots[0],
      b = this.snapshots[1] || a;
    const remoteAlpha = a && b.at > a.at ? (target - a.at) / (b.at - a.at) : 1;
    if (this.correction) {
      const decay = Math.exp(-18 * dt);
      for (const key of ['x', 'y', 'z', 'yaw']) this.correction[key] *= decay;
    }
    return cars.map((c) => {
      if (online && c.id !== ownId && b?.cars.has(c.id)) {
        return interpolateCar(a.cars.get(c.id), b.cars.get(c.id), remoteAlpha);
      }
      const result = interpolateCar(this.previous.get(c.id), c, alpha);
      if (this.correction?.id === c.id) {
        if (discontinuity(this.previous.get(c.id), c)) this.correction = null;
        else for (const key of ['x', 'y', 'z', 'yaw']) result[key] += this.correction[key];
      }
      return result;
    });
  }
}

// The camera follows translation exactly; only its orbit and zoom are damped.
// This keeps the car stable in frame instead of chasing a separate lagging target.
export class ChaseCameraMotion {
  reset() {
    this.pose = null;
  }
  update(car, dt) {
    const snap = discontinuity(this.lastCar, car) || !this.pose;
    const travelYaw = car.yaw + (car.driftAngle || 0);
    const p = this.pose || { yaw: travelYaw, speed: Math.abs(car.speed), fov: 54 };
    p.yaw = snap ? travelYaw : p.yaw + angleDelta(p.yaw, travelYaw) * damping(10, dt);
    p.speed = snap
      ? Math.abs(car.speed)
      : p.speed + (Math.abs(car.speed) - p.speed) * damping(5, dt);
    const fov = car.boosting ? 62 : 54;
    p.fov = snap ? fov : p.fov + (fov - p.fov) * damping(3, dt);
    this.pose = p;
    this.lastCar = { ...car };
    const x = Math.sin(p.yaw),
      z = Math.cos(p.yaw),
      distance = 8 + p.speed * 0.035;
    return {
      position: [car.x - x * distance, car.y + 3.4 + p.speed * 0.012, car.z - z * distance],
      target: [car.x + x * 10, car.y + 0.8, car.z + z * 10],
      fov: p.fov,
    };
  }
}
