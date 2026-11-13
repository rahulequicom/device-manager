export function clamp(value: number, min = 0, max = 1) {
  'worklet';
  return Math.max(min, Math.min(max, value));
}

function stops(p: number, values: number[]) {
  'worklet';
  const points = [0, .18, .38, .55, .68, 1];
  for (let i = 1; i < points.length; i++) {
    if (p <= points[i]) return values[i - 1] + (values[i] - values[i - 1]) * clamp((p - points[i - 1]) / (points[i] - points[i - 1]));
  }
  return values[values.length - 1];
}

export function dragProgress(translationY: number, height: number) {
  'worklet';
  return clamp(-translationY / Math.max(1, height * .38), 0, .62);
}

export function bubblePose(progress: number, height: number, diameter: number, openingCenter: number) {
  'worklet';
  const p = clamp(progress);
  const small = Math.min(88, height * .115) / diameter;
  const target = Math.min(openingCenter, height * .46);
  const travel = openingCenter - target;
  return {
    centerY: stops(p, [openingCenter, openingCenter - travel * .20, openingCenter - travel * .48, openingCenter - travel * .78, target, target]),
    scaleX: stops(p, [1, 1.035, .87, .50, small, small]),
    scaleY: stops(p, [1, .76, .98, .54, small, small]),
  };
}

export function phaseOpacity(progress: number, start: number, end: number) {
  'worklet';
  return clamp((progress - start) / (end - start));
}

export function lensOffsetX(raw: number, width: number, diameter: number, scaleX: number) {
  'worklet';
  const limit = Math.max(0, (width - diameter * scaleX) / 2 - 12);
  return clamp(raw, -limit, limit);
}

export function photoProgress(progress: number, index: number) {
  'worklet';
  return phaseOpacity(progress, .70 + index * .006, .87 + index * .006);
}
