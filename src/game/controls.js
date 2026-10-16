import { blankInput } from '../../shared/physics.js';
// Positive steering means the driver's right in both keyboard and gamepad input.
export function drivingInput(keys, pad) {
  const i = {
    ...blankInput(),
    throttle: keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0,
    brake: keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0,
    steer:
      (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
      (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0),
    reverse: keys.has('KeyR'),
    boost: keys.has('ShiftLeft') || keys.has('ShiftRight'),
    jump: keys.has('Space'),
    drift: keys.has('KeyX'),
    reset: keys.has('KeyF'),
    useItem: keys.has('KeyE'),
  };
  if (pad) {
    i.throttle = Math.max(i.throttle, pad.buttons[7]?.value || 0);
    i.brake = Math.max(i.brake, pad.buttons[6]?.value || 0);
    if (Math.abs(pad.axes[0]) > 0.12) i.steer = pad.axes[0];
    i.jump ||= !!pad.buttons[0]?.pressed;
    i.boost ||= !!pad.buttons[5]?.pressed;
    i.drift ||= !!pad.buttons[4]?.pressed;
    i.reverse ||= !!pad.buttons[3]?.pressed;
    i.reset ||= !!pad.buttons[8]?.pressed;
    i.useItem ||= !!pad.buttons[1]?.pressed;
  }
  return i;
}
