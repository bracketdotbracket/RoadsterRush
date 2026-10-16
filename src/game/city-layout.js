import { getTrack, nearest, atDistance, TRACK_LENGTH, TRACK_WIDTH } from '../../shared/track.js';

export function seededRandom(seed = 391) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// A repeatable city, with a clear runoff strip around the entire racing line.
export function createCityLayout() {
  const random = seededRandom(7126),
    buildings = [];
  for (let x = -245; x <= 535; x += 32) {
    for (let z = -365; z <= 405; z += 32) {
      const px = x + (random() - 0.5) * 5;
      const pz = z + (random() - 0.5) * 5;
      const width = 14 + random() * 10,
        depth = 14 + random() * 10;
      const road = nearest(px, pz);
      if (road.distance < TRACK_WIDTH / 2 + 22 + Math.hypot(width, depth) / 2) continue;
      if (random() < 0.17) continue; // Courtyards and cross streets break up the skyline.
      const central = px > 35 && px < 250 && pz > -95 && pz < 150;
      const height = 16 + random() ** 1.7 * (central ? 100 : 75);
      buildings.push({ x: px, z: pz, width, depth, height, style: Math.floor(random() * 4) });
    }
  }
  const streetlights = [];
  for (let s = 4; s < TRACK_LENGTH; s += 24) {
    const p = atDistance(s);
    for (const side of [-1, 1]) {
      streetlights.push({ ...p, x: p.x + p.tz * side * 15.6, z: p.z - p.tx * side * 15.6, side });
    }
  }
  return { buildings, streetlights };
}

// This camera stays behind the hero car. On tall windows it pulls back so the
// full rear remains visible; the menu occupies the upper left of the frame.
export function menuCameraPose(car, aspect, time = 0, reducedMotion = false) {
  const fx = Math.sin(car.yaw),
    fz = Math.cos(car.yaw);
  const sway = reducedMotion ? 0 : Math.sin(time * 0.12) * 0.13;
  const portrait = aspect < 1.25;
  const back = portrait ? 10.8 : 7.2 * Math.max(1, 1.68 / aspect);
  const side = portrait ? 3.2 : 3.0 + sway;
  const aimSide = portrait ? 1.6 : 1.5;
  return {
    position: [car.x - fx * back + fz * side, portrait ? 2.5 : 1.72, car.z - fz * back - fx * side],
    target: [
      car.x + fx * 1.4 + fz * aimSide,
      portrait ? 2.5 : 0.75,
      car.z + fz * 1.4 - fx * aimSide,
    ],
    fov: portrait ? 49 : 44,
  };
}

export function stageMenuCars(states, ownId) {
  const hero = states.find((c) => c.id === ownId) || states[0];
  let rival = 0;
  return states.map((car) => {
    const index = car === hero ? 0 : ++rival;
    const p = getTrack(car.trackId).atDistance(-32 + index * 12);
    const lane = index === 0 ? -2.6 : index % 2 ? 3.8 : -2;
    return {
      ...car,
      x: p.x + p.tz * lane,
      z: p.z - p.tx * lane,
      y: 0,
      yaw: Math.atan2(p.tx, p.tz),
      speed: 0,
    };
  });
}
