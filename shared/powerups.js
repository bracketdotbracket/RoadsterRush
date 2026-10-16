import { getTrack } from './track.js';
export const BOOST_DURATION = 10;
export const BOOST_CAPACITY = 3;
export const PICKUP_RESPAWN = 20;
export function createBoostPickups(trackId) {
  const { boostCanisters } = getTrack(trackId);
  return boostCanisters.map(({ id }) => ({ id, availableAt: 0 }));
}
export function collectBoostPickups(car, pickups, elapsed, previous = car) {
  if (!pickups || car.finishTime !== null || car.boosts >= BOOST_CAPACITY) return;
  const { boostCanisters } = getTrack(car.trackId);
  const dx = car.x - previous.x,
    dz = car.z - previous.z;
  const lengthSq = dx * dx + dz * dz;
  for (const pickup of pickups) {
    if (pickup.availableAt > elapsed || car.boosts >= BOOST_CAPACITY) continue;
    const point = boostCanisters[pickup.id];
    if (!point) continue;
    const t = lengthSq
      ? Math.max(
          0,
          Math.min(1, ((point.x - previous.x) * dx + (point.z - previous.z) * dz) / lengthSq),
        )
      : 0;
    const y = previous.y + (car.y - previous.y) * t;
    if (y > 1.6 || Math.hypot(previous.x + dx * t - point.x, previous.z + dz * t - point.z) > 2.5)
      continue;
    car.boosts++;
    pickup.availableAt = elapsed + PICKUP_RESPAWN;
    car.event = 'BOOST STORED · SHIFT TO ACTIVATE';
    car.eventTTL = 2;
  }
}
