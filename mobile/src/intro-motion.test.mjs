import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bubblePose, dragProgress, lensOffsetX, phaseOpacity, photoProgress } from './intro-motion.ts';
import { openingBubbleLayout } from './intro-layout.ts';

test('upward finger travel drives reversible progress without revealing photos early', () => {
  assert.equal(dragProgress(100, 760), 0);
  assert.ok(dragProgress(-150, 760) > dragProgress(-75, 760));
  assert.equal(dragProgress(-1000, 760), .62);
  assert.equal(photoProgress(.62, 0), 0);
  assert.equal(phaseOpacity(.62, .74, .9), 0);
});

test('sphere deforms, contracts and remains above the copy after release', () => {
  for (const [width, height] of [[280, 480], [393, 760], [430, 850]]) {
    const opening = openingBubbleLayout(width, height);
    const center = opening.top + opening.diameter / 2;
    const rest = bubblePose(0, height, opening.diameter, center);
    const deform = bubblePose(.18, height, opening.diameter, center);
    const lens = bubblePose(.38, height, opening.diameter, center);
    const contracted = bubblePose(.68, height, opening.diameter, center);
    const float = bubblePose(1, height, opening.diameter, center);
    assert.equal(rest.centerY, center);
    assert.equal(rest.scaleX, 1);
    assert.ok(deform.scaleY < deform.scaleX);
    assert.ok(lens.scaleX > contracted.scaleX);
    assert.ok(contracted.scaleX > 0);
    assert.equal(contracted.centerY, float.centerY);
    assert.ok(Math.abs(contracted.scaleX - float.scaleX) < 1e-9);
    assert.ok(Math.abs(contracted.scaleY - float.scaleY) < 1e-9);
    assert.ok(float.centerY + opening.diameter * float.scaleY / 2 + 3 < height * .53);
    let previousCenter = center;
    for (let i = 0; i <= 100; i++) {
      const pose = bubblePose(i / 100, height, opening.diameter, center);
      assert.ok(pose.centerY <= previousCenter + 1e-9, 'upward drag must never move the sphere downward');
      previousCenter = pose.centerY;
      for (const offset of [-200, 200]) {
        const x = width / 2 + lensOffsetX(offset, width, opening.diameter, pose.scaleX);
        assert.ok(x - opening.diameter * pose.scaleX / 2 >= 12 - .001);
        assert.ok(x + opening.diameter * pose.scaleX / 2 <= width - 12 + .001);
      }
    }
  }
});

test('photos release after contraction, stagger independently and finish before CTA unlock', () => {
  for (let i = 0; i < 20; i++) {
    assert.equal(photoProgress(.68, i), 0);
    assert.equal(photoProgress(1, i), 1);
  }
  assert.ok(photoProgress(.8, 0) > photoProgress(.8, 19));
  assert.equal(phaseOpacity(.68, .26, .68), 1);
  assert.equal(phaseOpacity(.68, .74, .90), 0);
  assert.equal(phaseOpacity(.9, .74, .90), 1);
});
