import { getTrack } from './track.js';

export const ITEMS = {
  shield: {
    name: 'SHIELD',
    hint: 'Block one attack · lasts 4 seconds',
    color: '#70f5d6',
    icon: 'shield',
  },
  shockwave: {
    name: 'SHOCKWAVE',
    hint: 'Push nearby rivals away · 12 metre range',
    color: '#ce9bff',
    icon: 'pulse',
  },
  emp: {
    name: 'EMP TRAP',
    hint: 'Drop behind you · rivals can jump over it',
    color: '#ffad76',
    icon: 'trap',
  },
};
export const SHIELD_DURATION = 4;
export const HIT_PROTECTION = 2;
export const WAVE_RADIUS = 12;
export const TRAP_LIFETIME = 10;
export const TRAP_ARM_DELAY = 0.5;
export const TRAP_RADIUS = 2.1;
export const TRAP_CLEARANCE = 1.2;
export const BOX_RESPAWN = 10;
export const MAX_TRAPS_PER_CAR = 3;
export const MAX_TRAPS = 12;
const boxCache = new Map();
export function getMysteryBoxes(trackId) {
  const track = getTrack(trackId);
  if (boxCache.has(track.id)) return boxCache.get(track.id);
  const { atDistance, TRACK_LENGTH } = track;
  const boxes = [0.085, 0.285, 0.405, 0.525, 0.705, 0.865].flatMap((fraction, row) =>
    [-4, 0, 4].map((lane, col) => {
      const p = atDistance(fraction * TRACK_LENGTH);
      return { ...p, lane, id: row * 3 + col, x: p.x + p.tz * lane, z: p.z - p.tx * lane };
    }),
  );
  boxCache.set(track.id, boxes);
  return boxes;
}
export const mysteryBoxes = getMysteryBoxes();
export function createPartyState(seed = 20261016, trackId) {
  const track = getTrack(trackId);
  return {
    trackId: track.id,
    boxes: getMysteryBoxes(track.id).map(({ id }) => ({ id, availableAt: 0 })),
    traps: [],
    pulses: [],
    nextId: 1,
    rng: seed >>> 0,
  };
}
export function publicPartyState(state) {
  return { trackId: state.trackId, boxes: state.boxes, traps: state.traps, pulses: state.pulses };
}
function message(car, text, now) {
  car.partyEvent = text;
  car.partyEventUntil = now + 2.2;
}
function pulse(state, point, type, now, radius) {
  state.pulses.push({
    id: state.nextId++,
    x: point.x,
    y: point.y || 0,
    z: point.z,
    type,
    at: now,
    until: now + 0.55,
    radius,
  });
  if (state.pulses.length > 24) state.pulses.shift();
}
function hit(victim, source, kind, now) {
  if (victim.finishTime !== null || victim.invulnerable > 0 || victim.immuneUntil > now)
    return false;
  victim.immuneUntil = now + HIT_PROTECTION;
  if (victim.shieldUntil > now) {
    victim.shieldUntil = 0;
    victim.shieldBlocks++;
    message(victim, 'SHIELD BLOCKED THE ATTACK', now);
    return 'blocked';
  }
  victim.speed *= 0.78;
  victim.slowUntil = now + (kind === 'emp' ? 1.5 : 1.2);
  if (kind === 'emp') {
    victim.empUntil = now + 1.5;
    victim.boosting = false;
  } else {
    const dx = victim.x - source.x,
      dz = victim.z - source.z,
      distance = Math.hypot(dx, dz);
    // A bounded impulse goes through the existing barrier solver on the next movement step.
    const nx = distance > 0.001 ? dx / distance : Math.cos(victim.yaw);
    const nz = distance > 0.001 ? dz / distance : -Math.sin(victim.yaw);
    victim.impactVX += nx * 4;
    victim.impactVZ += nz * 4;
    const scale = Math.min(1, 6 / Math.max(0.001, Math.hypot(victim.impactVX, victim.impactVZ)));
    victim.impactVX *= scale;
    victim.impactVZ *= scale;
  }
  source.partyHits++;
  message(
    victim,
    kind === 'emp' ? 'EMP HIT · BOOST PAUSED · KEEP DRIVING' : 'SHOCKWAVE HIT · KEEP DRIVING',
    now,
  );
  return 'hit';
}

// Called before movement in both solo and the authoritative server. Shield
// activations are resolved first so a same-tick defensive press is always useful.
export function beginPartyStep(cars, inputs, state, now) {
  const { nearest, TRACK_WIDTH } = getTrack(state.trackId);
  const liveIds = new Set(cars.filter((c) => c.finishTime === null).map((c) => c.id));
  state.traps = state.traps.filter((t) => t.expiresAt > now && liveIds.has(t.ownerId));
  state.pulses = state.pulses.filter((p) => p.until > now);
  const uses = [];
  for (const c of cars) {
    const input = inputs.get(c.id) || {};
    const pressed = input.useItem === true && !c.previousItem;
    c.previousItem = input.useItem === true;
    if (!pressed || c.finishTime !== null || input.reset || !ITEMS[c.item]) continue;
    uses.push({ car: c, item: c.item });
  }
  const spend = (c) => {
    c.item = null;
    c.itemsUsed++;
  };
  for (const { car: c, item } of uses) {
    if (item !== 'shield') continue;
    spend(c);
    c.shieldUntil = now + SHIELD_DURATION;
    message(c, 'SHIELD UP · READY TO BLOCK', now);
  }
  for (const { car: c, item } of uses) {
    if (item === 'shield') continue;
    if (item === 'shockwave') {
      spend(c);
      pulse(state, c, 'shockwave', now, WAVE_RADIUS);
      let hits = 0,
        blocks = 0;
      for (const rival of cars) {
        if (
          rival.id === c.id ||
          Math.hypot(rival.x - c.x, rival.z - c.z) > WAVE_RADIUS ||
          Math.abs(rival.y - c.y) > 2
        )
          continue;
        const outcome = hit(rival, c, item, now);
        if (outcome === 'hit') hits++;
        if (outcome === 'blocked') blocks++;
      }
      message(
        c,
        hits
          ? `SHOCKWAVE · ${hits} ${hits === 1 ? 'RIVAL' : 'RIVALS'} HIT`
          : blocks
            ? 'SHOCKWAVE BLOCKED BY SHIELD'
            : 'SHOCKWAVE RELEASED',
        now,
      );
    } else if (item === 'emp') {
      const x = c.x - Math.sin(c.yaw) * 4.5,
        z = c.z - Math.cos(c.yaw) * 4.5;
      if (!c.grounded || nearest(x, z).distance > TRACK_WIDTH / 2 - 0.6) {
        message(c, c.grounded ? 'RETURN TO THE ROAD TO DROP TRAP' : 'LAND TO DROP YOUR TRAP', now);
        continue;
      }
      spend(c);
      const owned = state.traps.filter((t) => t.ownerId === c.id);
      if (owned.length >= MAX_TRAPS_PER_CAR)
        state.traps = state.traps.filter((t) => t.id !== owned[0].id);
      if (state.traps.length >= MAX_TRAPS) state.traps.shift();
      state.traps.push({
        id: state.nextId++,
        ownerId: c.id,
        x,
        z,
        armedAt: now + TRAP_ARM_DELAY,
        expiresAt: now + TRAP_LIFETIME,
      });
      message(c, 'EMP TRAP DROPPED · WATCH YOUR MIRRORS', now);
    }
  }
}

// Sweep the movement path, including height at contact, so high-speed cars
// cannot skip pickups or traps and airborne cars can clear them cleanly.
export function sweptContact(previous, car, point, radius, maxHeight) {
  if (
    !previous ||
    previous.penalty !== car.penalty ||
    Math.hypot(car.x - previous.x, car.z - previous.z) > 8
  )
    return null;
  const dx = car.x - previous.x,
    dz = car.z - previous.z,
    lengthSq = dx * dx + dz * dz;
  const t = lengthSq
    ? Math.max(
        0,
        Math.min(1, ((point.x - previous.x) * dx + (point.z - previous.z) * dz) / lengthSq),
      )
    : 0;
  if (
    previous.y + (car.y - previous.y) * t > maxHeight ||
    Math.hypot(previous.x + dx * t - point.x, previous.z + dz * t - point.z) > radius
  )
    return null;
  return t;
}
export function endPartyStep(cars, previous, state, now) {
  const mysteryBoxes = getMysteryBoxes(state.trackId);
  const active = cars.filter((c) => c.finishTime === null);
  const contacts = (point, radius, height, filter = () => true) =>
    active
      .filter(filter)
      .map((c) => ({ car: c, t: sweptContact(previous.get(c.id), c, point, radius, height) }))
      .filter((hit) => hit.t !== null)
      .sort((a, b) => a.t - b.t || a.car.id.localeCompare(b.car.id));
  for (const box of state.boxes) {
    if (box.availableAt > now) continue;
    const point = mysteryBoxes[box.id];
    const winner = contacts(point, 2, 1.6, (c) => !c.item)[0]?.car;
    if (!winner) continue;
    state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0;
    winner.item = ['shield', 'shockwave', 'emp'][Math.floor((state.rng / 4294967296) * 3)];
    winner.itemAcquiredAt = now;
    box.availableAt = now + BOX_RESPAWN;
    pulse(state, point, 'pickup', now, 2.8);
    message(winner, `${ITEMS[winner.item].name} STORED · USE YOUR POWER-UP`, now);
  }
  state.traps = state.traps.filter((trap) => {
    if (trap.expiresAt <= now) return false;
    if (trap.armedAt > now) return true;
    const owner = active.find((c) => c.id === trap.ownerId);
    if (!owner) return false;
    const victim = contacts(
      trap,
      TRAP_RADIUS,
      TRAP_CLEARANCE,
      (c) => c.id !== trap.ownerId && c.immuneUntil <= now && c.invulnerable <= 0,
    )[0]?.car;
    if (!victim) return true;
    const outcome = hit(victim, owner, 'emp', now);
    if (!outcome) return true;
    pulse(state, trap, 'emp', now, 3.5);
    message(
      owner,
      outcome === 'hit' ? `EMP TRAP HIT · ${victim.name}` : 'EMP TRAP BLOCKED BY SHIELD',
      now,
    );
    return false;
  });
}

// Bots obey the same pickup inventory, press edges and attack rules as players.
export function partyBotInput(base, car, cars, state, now) {
  const { nearest, TRACK_LENGTH } = getTrack(car.trackId);
  const mysteryBoxes = getMysteryBoxes(car.trackId);
  const input = { ...base, useItem: false };
  if (car.finishTime !== null) return input;
  const forward = { x: Math.sin(car.yaw), z: Math.cos(car.yaw) };
  const nearby = cars.filter(
    (c) => c.id !== car.id && c.finishTime === null && Math.hypot(c.x - car.x, c.z - car.z) < 28,
  );
  const danger = state.traps.some((t) => {
    const dx = t.x - car.x,
      dz = t.z - car.z,
      along = dx * forward.x + dz * forward.z;
    return (
      t.ownerId !== car.id &&
      t.expiresAt > now &&
      along > 0 &&
      along < Math.max(7, car.speed * 0.45) &&
      Math.abs(dx * forward.z - dz * forward.x) < 2.5
    );
  });
  if (danger && car.grounded && car.shieldUntil <= now) input.jump = true;
  const held = now - car.itemAcquiredAt;
  if (!car.previousItem && held > 0.45) {
    if (car.item === 'shield') input.useItem = danger || nearby.length > 0 || held > 7;
    if (car.item === 'shockwave')
      input.useItem =
        nearby.some(
          (c) => Math.hypot(c.x - car.x, c.z - car.z) < WAVE_RADIUS && Math.abs(c.y - car.y) < 2,
        ) || held > 12;
    if (car.item === 'emp')
      input.useItem =
        car.grounded &&
        (nearby.some((c) => (c.x - car.x) * forward.x + (c.z - car.z) * forward.z < -2) ||
          held > 8);
  }
  if (!car.item && car.grounded && !car.offroad && !base.jump && !danger) {
    const road = nearest(car.x, car.z);
    const preferredLane = [-4, 0, 4][
      [...car.id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 3
    ];
    const choices = state.boxes
      .filter((b) => b.availableAt <= now)
      .map((b) => {
        const p = mysteryBoxes[b.id],
          ahead = (p.s - road.s + TRACK_LENGTH) % TRACK_LENGTH;
        const distance = Math.hypot(p.x - car.x, p.z - car.z);
        const contested = cars.some(
          (rival) =>
            rival.id !== car.id &&
            !rival.item &&
            rival.finishTime === null &&
            Math.hypot(p.x - rival.x, p.z - rival.z) < distance - 2 &&
            Math.abs((rival.x - p.x) * p.tz - (rival.z - p.z) * p.tx) < 2,
        );
        return {
          p,
          ahead,
          score: distance + Math.abs(p.lane - preferredLane) * 2 + (contested ? 18 : 0),
        };
      })
      .filter((b) => b.ahead > 3 && b.ahead < 42)
      .sort((a, b) => a.score - b.score);
    if (choices.length) {
      const target = choices[0].p,
        delta = Math.atan2(target.x - car.x, target.z - car.z) - car.yaw;
      input.steer = Math.max(-1, Math.min(1, -Math.atan2(Math.sin(delta), Math.cos(delta)) * 2.8));
    }
  }
  return input;
}
