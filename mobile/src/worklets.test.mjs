import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const babel = require('@babel/core');
test('native worklet unpackers have code metadata before runtime initialization', () => {
  const root = path.resolve(import.meta.dirname, '..');
  for (const file of ['valueUnpacker', 'synchronizableUnpacker', 'customSerializableUnpacker', 'remoteFunctionUnpacker']) {
    const filename = require.resolve(`react-native-worklets/src/memory/${file}.native.ts`);
    const source = fs.readFileSync(filename, 'utf8');
    const result = babel.transformSync(source, { filename, cwd: root, configFile: path.join(root, 'babel.config.js'), caller: { name: 'metro', platform: 'ios', isDev: true, supportsStaticESM: true } });
    assert.match(result.code, /\.__initData\s*=/, `${file} must receive __initData`);
    assert.match(result.code, /\.__workletHash\s*=/, `${file} must receive a worklet hash`);
  }
});
test('introduction gesture handlers are transformed for the UI runtime', () => {
  const root = path.resolve(import.meta.dirname, '..');
  const filename = path.join(import.meta.dirname, 'intro-screen.tsx');
  const result = babel.transformSync(fs.readFileSync(filename, 'utf8'), { filename, cwd: root, configFile: path.join(root, 'babel.config.js'), caller: { name: 'metro', platform: 'ios', isDev: true, supportsStaticESM: true } });
  assert.ok((result.code.match(/\.__initData\s*=/g) || []).length >= 5, 'intro pan, tap and animated-style callbacks need worklet metadata');
});

test('lens magnification and phase helpers also receive worklet metadata', () => {
  const root = path.resolve(import.meta.dirname, '..');
  for (const [file, count] of [['intro-lens.tsx', 1], ['intro-motion.ts', 7]]) {
    const filename = path.join(import.meta.dirname, file);
    const result = babel.transformSync(fs.readFileSync(filename, 'utf8'), { filename, cwd: root, configFile: path.join(root, 'babel.config.js'), caller: { name: 'metro', platform: 'ios', isDev: true, supportsStaticESM: true } });
    assert.ok((result.code.match(/\.__initData\s*=/g) || []).length >= count, `${file} must be compiled for the UI runtime`);
  }
});
