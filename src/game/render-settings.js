export const DEFAULT_QUALITY = 'medium';

// Cap GPU pixels independently of the CSS/UI size, particularly on Retina displays.
export function renderPixelRatio(width, height, deviceRatio = 1, quality = DEFAULT_QUALITY) {
  const budget = quality === 'high' ? 2600000 : quality === 'low' ? 1000000 : 1600000;
  return Math.min(
    deviceRatio,
    quality === 'high' ? 1.5 : 1,
    Math.sqrt(budget / Math.max(1, width * height)),
  );
}
