export function shouldEnterRegister(translationX: number, translationY: number, velocityY: number) {
  'worklet';
  const upward = -translationY;
  return upward > Math.abs(translationX) && (upward >= 72 || (upward >= 24 && velocityY <= -700));
}
