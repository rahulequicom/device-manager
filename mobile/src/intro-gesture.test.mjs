import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldEnterRegister } from './intro-gesture.ts';
test('intentional upward swipes and short upward flicks enter the register', () => {
  assert.equal(shouldEnterRegister(4, -90, -100), true);
  assert.equal(shouldEnterRegister(4, -30, -900), true);
});
test('small drags, downward and horizontal swipes do not enter the register', () => {
  assert.equal(shouldEnterRegister(0, -15, -1000), false);
  assert.equal(shouldEnterRegister(0, -40, -200), false);
  assert.equal(shouldEnterRegister(0, 100, 900), false);
  assert.equal(shouldEnterRegister(120, -80, -800), false);
});
