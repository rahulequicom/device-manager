import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bubbleLayout, bubbleSlots, openingBubbleLayout } from './intro-layout.ts';
import fs from 'node:fs';

test('photo bubbles stay above the copy and inside phone screens', () => {
  for (const [width, height] of [[280, 480], [320, 568], [393, 760], [430, 850], [760, 350]]) {
    bubbleSlots.forEach((_, i) => {
      const b = bubbleLayout(width, height, i);
      assert.ok(b.diameter > 0);
      assert.ok(b.left >= 0 && b.left + b.diameter <= width);
      assert.ok(b.top + b.diameter + 8 < height * .53);
    });
  }
});

test('opening bubble fits fully, including bounce and clearance for the prompt', () => {
  for (const [width, height] of [[280, 480], [320, 568], [393, 760], [430, 850], [760, 350]]) {
    for (const footer of [72, 96, 128]) {
      const b = openingBubbleLayout(width, height, footer);
      assert.ok(b.left >= 12);
      assert.ok(b.left + b.diameter <= width - 12);
      assert.ok(b.top - 12 >= 0);
      assert.ok(b.top + b.diameter + 16 <= height - footer - 12);
    }
  }
});

test('intro sources are downloaded portraits, not default avatars', () => {
  const members = JSON.parse(fs.readFileSync(new URL('../assets/members/members.json', import.meta.url)));
  const source = fs.readFileSync(new URL('./intro-screen.tsx', import.meta.url), 'utf8');
  const files = [...source.matchAll(/require\('\.\.\/assets\/members\/([^']+)'\)/g)].map(m => m[1]);
  assert.equal(files.length, bubbleSlots.length);
  for (const file of files) {
    assert.equal(members.find(m => m.photo === file)?.isPlaceholder, false);
    assert.ok(fs.statSync(new URL(`../assets/members/${file}`, import.meta.url)).size > 0);
  }
});
