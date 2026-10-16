import { moveWithBarriers } from './barriers.js';
import { BOOST_DURATION, collectBoostPickups } from './powerups.js';
import { getTrack, LAPS, gateCrossed } from './track.js';
export const DT = 1 / 60;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const blankInput = () => ({
  throttle: 0,
  brake: 0,
  reverse: false,
  steer: 0,
  boost: false,
  jump: false,
  roll: 0,
  drift: false,
  reset: false,
  useItem: false,
});
export function cleanInput(i = {}) {
  if (!i || typeof i !== 'object') i = {};
  const num = (v, a, b) => (Number.isFinite(v) ? clamp(v, a, b) : 0);
  return {
    throttle: num(i.throttle, 0, 1),
    brake: num(i.brake, 0, 1),
    reverse: i.reverse === true,
    steer: num(i.steer, -1, 1),
    boost: i.boost === true,
    jump: i.jump === true,
    roll: num(i.roll, -1, 1),
    drift: i.drift === true,
    reset: i.reset === true,
    useItem: i.useItem === true,
  };
}
export function createCar(id, name, index = 0, color = '#d7fc70', trackId) {
  const track = getTrack(trackId),
    { atDistance } = track;
  const p = atDistance(-10 - Math.floor(index / 2) * 7),
    lane = (index % 2 ? 1 : -1) * 2.6;
  return {
    id,
    trackId: track.id,
    name,
    color,
    x: p.x + p.tz * lane,
    z: p.z - p.tx * lane,
    y: 0,
    yaw: Math.atan2(p.tx, p.tz),
    speed: 0,
    impactVX: 0,
    impactVZ: 0,
    impactCooldown: 0,
    vy: 0,
    charge: 100,
    boosts: 0,
    boostTime: 0,
    previousBoost: false,
    grounded: true,
    jumpCooldown: 0,
    regenDelay: 0,
    rollAngle: 0,
    rollProgress: 0,
    rollDirection: 0,
    rollActive: false,
    rollDone: false,
    landings: 0,
    stunts: 0,
    boosting: false,
    drifting: false,
    driftAngle: 0,
    nextGate: 0,
    totalGates: 0,
    lap: 1,
    completedLaps: 0,
    bestLap: null,
    lastLapAt: 0,
    finishTime: null,
    penalty: 0,
    raceTime: 0,
    lastSeq: 0,
    invulnerable: 0,
    wrongWay: false,
    offroad: false,
    event: '',
    eventTTL: 0,
    previousJump: false,
    previousRoll: false,
    previousReset: false,
    item: null,
    itemAcquiredAt: 0,
    previousItem: false,
    shieldUntil: 0,
    immuneUntil: 0,
    slowUntil: 0,
    empUntil: 0,
    itemsUsed: 0,
    partyHits: 0,
    shieldBlocks: 0,
    partyEvent: '',
    partyEventUntil: 0,
  };
}
function event(c, text) {
  c.event = text;
  c.eventTTL = 2;
}
export function resetCar(c, penalty = true) {
  const { atDistance, gates } = getTrack(c.trackId);
  const p = atDistance(
    c.totalGates ? gates[(c.nextGate + gates.length - 1) % gates.length].s + 5 : -10,
  );
  c.x = p.x;
  c.z = p.z;
  c.y = 0;
  c.yaw = Math.atan2(p.tx, p.tz);
  c.speed = 0;
  c.impactVX = 0;
  c.impactVZ = 0;
  c.impactCooldown = 0;
  c.vy = 0;
  c.grounded = true;
  c.rollAngle = 0;
  c.rollActive = false;
  c.rollDone = false;
  c.invulnerable = 1.5;
  c.boostTime = 0;
  c.boosting = false;
  c.offroad = false;
  c.drifting = false;
  c.driftAngle = 0;
  c.shieldUntil = 0;
  c.slowUntil = 0;
  c.empUntil = 0;
  c.immuneUntil = c.raceTime + 1.5;
  c.partyEvent = '';
  c.partyEventUntil = 0;
  if (penalty) c.penalty += 3;
  event(c, penalty ? 'RECOVERED · +3 SEC' : 'READY');
}
export function stepCar(c, raw, dt = DT, raceTime = 0, allowProgress = true, pickups = null) {
  const { nearest, gates, obstacles, TRACK_WIDTH } = getTrack(c.trackId);
  const i = cleanInput(raw);
  dt = clamp(dt, 0, 1 / 30);
  c.raceTime = raceTime;
  c.impactCooldown = Math.max(0, (c.impactCooldown || 0) - dt);
  c.impactVX = (c.impactVX || 0) * Math.exp(-5 * dt);
  c.impactVZ = (c.impactVZ || 0) * Math.exp(-5 * dt);
  c.boostTime = Math.max(0, c.boostTime - dt);
  if (c.boostTime < 1e-8) c.boostTime = 0;
  c.eventTTL = Math.max(0, c.eventTTL - dt);
  c.jumpCooldown = Math.max(0, c.jumpCooldown - dt);
  c.invulnerable = Math.max(0, c.invulnerable - dt);
  c.regenDelay = Math.max(0, c.regenDelay - dt);
  if (c.finishTime !== null) {
    const previous = { x: c.x, y: c.y, z: c.z, yaw: c.yaw };
    c.speed *= Math.exp(-2 * dt);
    c.drifting = false;
    c.driftAngle = (c.driftAngle || 0) * Math.exp(-12 * dt);
    c.x += (Math.sin(c.yaw + c.driftAngle) * c.speed + c.impactVX) * dt;
    c.z += (Math.cos(c.yaw + c.driftAngle) * c.speed + c.impactVZ) * dt;
    if (!c.grounded) {
      c.vy -= 14 * dt;
      c.y = Math.max(0, c.y + c.vy * dt);
      if (c.y === 0) {
        c.grounded = true;
        c.vy = 0;
      }
      c.rollAngle *= Math.exp(-8 * dt);
    }
    moveWithBarriers(c, previous);
    return;
  }
  if (i.reset && !c.previousReset) {
    resetCar(c);
    c.previousReset = true;
    return;
  }
  c.previousReset = i.reset;
  const prev = { x: c.x, y: c.y, z: c.z, yaw: c.yaw },
    road = nearest(c.x, c.z);
  c.offroad = road.distance > TRACK_WIDTH / 2;
  c.wrongWay =
    Math.abs(c.speed) > 5 &&
    (Math.sin(c.yaw) * road.tx + Math.cos(c.yaw) * road.tz) * Math.sign(c.speed) < -0.25;
  if (
    i.boost &&
    !c.previousBoost &&
    c.boosts > 0 &&
    c.boostTime === 0 &&
    raceTime >= c.empUntil &&
    !i.reverse &&
    c.speed >= 0
  ) {
    c.boosts--;
    c.boostTime = BOOST_DURATION;
    event(c, 'BOOST ACTIVATED · 10 SECONDS');
  }
  c.previousBoost = i.boost;
  c.boosting =
    c.boostTime > 0 && !i.reverse && c.speed >= 0 && i.brake < 0.1 && raceTime >= c.empUntil;
  const jumpPressed = i.jump && !c.previousJump;
  // Resolve the press using the state BEFORE takeoff, so one press cannot do both actions.
  const airbornePress = jumpPressed && !c.grounded;
  if (c.regenDelay <= 0) c.charge = Math.min(100, c.charge + 9 * dt);
  if (jumpPressed && c.grounded && c.jumpCooldown <= 0 && c.charge >= 24) {
    c.vy = 10.5;
    c.grounded = false;
    c.charge -= 24;
    c.jumpCooldown = 1.9;
    c.regenDelay = 1.2;
    c.rollDone = false;
    event(c, 'THRUSTER JUMP');
  }
  c.previousJump = i.jump;
  if (
    (airbornePress || (i.roll && !c.previousRoll)) &&
    !c.grounded &&
    c.y > 0.15 &&
    !c.rollActive &&
    !c.rollDone &&
    c.charge >= 6
  ) {
    c.rollActive = true;
    c.rollProgress = 0;
    // Steering selects the roll direction; a neutral second tap defaults to the right.
    c.rollDirection = Math.sign(i.roll || i.steer || 1);
    c.charge -= 6;
  }
  c.previousRoll = !!i.roll;
  c.drifting = i.drift && c.grounded && !c.offroad && c.speed > 8 && Math.abs(i.steer) > 0.12;
  if (c.offroad) {
    // Low grip slows a fast entry, but always leaves enough drive to get back on track.
    // Forward crawl: 22 km/h; boosted crawl: 32 km/h; reverse: 14 km/h.
    const target = i.brake > 0 ? 0 : i.reverse ? -4 : c.boosting ? 9 : i.throttle * 6;
    const slowing = Math.abs(c.speed) > Math.abs(target) || c.speed * target < 0 || i.brake > 0;
    const rate = slowing ? 8 + Math.abs(c.speed) * 0.5 + i.brake * 30 : c.boosting ? 8 : 5;
    c.speed += clamp(target - c.speed, -rate * dt, rate * dt);
  } else {
    const slowed = raceTime < c.slowUntil;
    const drive = (i.reverse ? -24 : c.boosting ? 35 : i.throttle * 20) * (slowed ? 0.7 : 1);
    const drag = (c.drifting ? 2.6 : 1.5) + Math.abs(c.speed) * 0.009;
    // Brake and drag oppose motion and cannot accidentally push the car into reverse.
    let speed = c.speed + drive * dt;
    speed = Math.sign(speed) * Math.max(0, Math.abs(speed) - (i.brake * 38 + drag) * dt);
    c.speed = clamp(speed, -10, (c.boosting ? 72 : 52) * (slowed ? 0.78 : 1));
  }
  if (Math.abs(c.speed) < 1e-8) c.speed = 0;
  const speed = Math.abs(c.speed);
  const steerRate = c.grounded
    ? (1.35 / (1 + (speed / 42) ** 1.7)) *
      clamp(speed / 7, 0, 1) *
      Math.sign(c.speed) *
      (c.drifting ? 2.15 : 1)
    : 1.2;
  const travelYaw = c.yaw + (c.driftAngle || 0);
  // With +Z forward, a right turn is a negative rotation about +Y.
  c.yaw = wrap(c.yaw - i.steer * steerRate * dt);
  // The nose turns into the corner while momentum briefly carries the tail out.
  // Limit the slip angle to 28 degrees, then restore grip quickly on release.
  c.driftAngle = c.drifting
    ? clamp(wrap(travelYaw - c.yaw) * Math.exp(-5 * dt), -0.48, 0.48)
    : (c.driftAngle || 0) * Math.exp(-12 * dt);
  if (Math.abs(c.driftAngle) < 0.0001) c.driftAngle = 0;
  c.x += (Math.sin(c.yaw + c.driftAngle) * c.speed + c.impactVX) * dt;
  c.z += (Math.cos(c.yaw + c.driftAngle) * c.speed + c.impactVZ) * dt;
  if (!c.grounded) {
    c.vy -= 14 * dt;
    c.y += c.vy * dt;
    if (c.rollActive) {
      c.rollProgress = Math.min(1, c.rollProgress + dt / 1.05);
      const t = c.rollProgress;
      c.rollAngle = c.rollDirection * Math.PI * 2 * (t * t * (3 - 2 * t));
      if (t >= 1) {
        c.rollActive = false;
        c.rollDone = true;
        c.rollAngle = 0;
      }
    }
    if (c.y <= 0) {
      c.y = 0;
      c.vy = 0;
      c.grounded = true;
      c.landings++;
      if (c.rollDone) {
        c.stunts++;
        c.charge = Math.min(100, c.charge + 10);
        event(c, '360 LANDED · +10 CHARGE');
      } else if (c.rollActive) {
        c.speed *= 0.8;
        event(c, 'LANDING ASSIST');
      } else event(c, 'CLEAN LANDING');
      c.rollActive = false;
      c.rollAngle = 0;
    }
  }
  for (const o of obstacles) {
    const along = (c.x - o.x) * o.tx + (c.z - o.z) * o.tz,
      across = (c.x - o.x) * o.tz - (c.z - o.z) * o.tx;
    if (
      Math.abs(along) < o.depth / 2 + 1.6 &&
      Math.abs(across) < o.width / 2 + 0.9 &&
      c.y < o.height &&
      c.invulnerable <= 0
    ) {
      c.x -= o.tx * 3;
      c.z -= o.tz * 3;
      c.speed *= 0.18;
      c.invulnerable = 1;
      event(c, 'OBSTACLE HIT');
    }
  }
  if (!Number.isFinite(c.x + c.z + c.y)) {
    resetCar(c);
    return;
  }
  const impact = moveWithBarriers(c, prev);
  if (impact > 1) event(c, 'BARRIER HIT');
  if (c.speed < 0) c.boosting = false;
  collectBoostPickups(c, pickups, raceTime, prev);
  if (allowProgress && gateCrossed(gates[c.nextGate], prev, c)) {
    const crossed = c.nextGate;
    c.totalGates++;
    c.nextGate = (c.nextGate + 1) % gates.length;
    if (crossed === 0) {
      if (c.totalGates > 1) {
        c.completedLaps++;
        const lapTime = raceTime - c.lastLapAt;
        c.bestLap = c.bestLap === null ? lapTime : Math.min(c.bestLap, lapTime);
        if (c.completedLaps >= LAPS) {
          c.finishTime = raceTime + c.penalty;
          event(c, 'RACE COMPLETE');
        } else {
          c.lap = c.completedLaps + 1;
          event(c, 'LAP ' + c.lap + ' / ' + LAPS);
        }
      }
      c.lastLapAt = raceTime;
    }
  }
}
export function raceOrder(cars) {
  return [...cars].sort((a, b) => {
    if (a.finishTime !== null || b.finishTime !== null) {
      if (a.finishTime === null) return 1;
      if (b.finishTime === null) return -1;
      return a.finishTime - b.finishTime;
    }
    if (a.totalGates !== b.totalGates) return b.totalGates - a.totalGates;
    const g = getTrack(a.trackId).gates[a.nextGate];
    return Math.hypot(a.x - g.x, a.z - g.z) - Math.hypot(b.x - g.x, b.z - g.z);
  });
}
export function botInput(c, index = 0) {
  const { nearest, atDistance, obstacles, TRACK_LENGTH } = getTrack(c.trackId);
  const road = nearest(c.x, c.z),
    look = atDistance(road.s + 12 + c.speed * 0.65),
    desired = Math.atan2(look.x - c.x, look.z - c.z),
    error = wrap(desired - c.yaw);
  const further = atDistance(road.s + 42);
  const curve = Math.abs(wrap(Math.atan2(further.tx, further.tz) - Math.atan2(road.tx, road.tz)));
  const target = clamp(42 - curve * 24 - index, 17, 42);
  let jump = false;
  for (const o of obstacles) {
    const d = (o.s - road.s + TRACK_LENGTH) % TRACK_LENGTH;
    if (d > 0 && d < Math.max(10, c.speed * 0.42) && Math.abs(road.lateral) < 5) jump = true;
  }
  return {
    throttle: c.speed < target ? 1 : 0.1,
    brake: c.speed > target + 3 ? 0.45 : 0,
    steer: clamp(-error * 2.8, -1, 1),
    jump,
    roll: !c.grounded && c.y > 1 ? 1 : 0,
    boost: curve < 0.15 && c.boosts > 0 && c.boostTime === 0 && c.speed > 30,
    reverse: false,
    reset: c.offroad && Math.abs(c.speed) < 1,
    drift: false,
  };
}
export function collideCars(cars) {
  const previous = cars.map((c) => ({ x: c.x, y: c.y, z: c.z, yaw: c.yaw }));
  for (let i = 0; i < cars.length; i++)
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i],
        b = cars[j];
      if (
        a.finishTime !== null ||
        b.finishTime !== null ||
        a.invulnerable > 0 ||
        b.invulnerable > 0 ||
        Math.abs(a.y - b.y) > 1.4
      )
        continue;
      const dx = a.x - b.x,
        dz = a.z - b.z,
        d = Math.hypot(dx, dz);
      if (d > 0 && d < 2.3) {
        const push = (2.3 - d) * 0.5;
        a.x += (dx / d) * push;
        a.z += (dz / d) * push;
        b.x -= (dx / d) * push;
        b.z -= (dz / d) * push;
        // Only an approaching impact changes speed. Resting contact must not
        // apply drag every frame and lock a close pack at walking speed.
        const nx = dx / d,
          nz = dz / d;
        const afx = Math.sin(a.yaw + (a.driftAngle || 0)),
          afz = Math.cos(a.yaw + (a.driftAngle || 0));
        const bfx = Math.sin(b.yaw + (b.driftAngle || 0)),
          bfz = Math.cos(b.yaw + (b.driftAngle || 0));
        const closing = (afx * a.speed - bfx * b.speed) * nx + (afz * a.speed - bfz * b.speed) * nz;
        if (closing < 0) {
          const impulse = -closing * 0.55;
          a.speed = clamp(a.speed + impulse * (afx * nx + afz * nz), -10, 72);
          b.speed = clamp(b.speed - impulse * (bfx * nx + bfz * nz), -10, 72);
        }
      }
    }
  for (let i = 0; i < cars.length; i++) moveWithBarriers(cars[i], previous[i]);
}
