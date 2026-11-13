export const bubbleSlots = [
  [.14, .02, .12], [.38, .03, .15], [.63, .02, .10], [.86, .02, .13],
  [.06, .23, .09], [.27, .27, .16], [.50, .23, .13], [.73, .27, .17], [.94, .23, .09],
  [.10, .52, .12], [.30, .54, .14], [.52, .53, .18], [.75, .52, .12], [.93, .50, .09],
  [.18, .78, .12], [.40, .80, .13], [.66, .79, .16], [.86, .80, .10],
  [.38, 1.08, .08], [.62, 1.10, .10],
] as const;

export function bubbleLayout(width: number, height: number, index: number) {
  const [x, y, size] = bubbleSlots[index % bubbleSlots.length];
  const diameter = Math.min(width * size, height * .095, 76);
  const left = Math.max(0, Math.min(width - diameter, x * width - diameter / 2));
  return { left, top: 12 + y * height * .34, diameter };
}

export function openingBubbleLayout(width: number, height: number, footerHeight = 96) {
  const diameter = Math.max(1, Math.min(width - 48, height * .52, height - footerHeight - 64));
  const left = (width - diameter) / 2;
  const top = Math.max(28, height - footerHeight - diameter - 32);
  return { diameter, left, top };
}
