import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('white canvas and black primary actions also use light native navigation and controls', () => {
  const ui = fs.readFileSync(new URL('./ui.tsx', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const config = JSON.parse(fs.readFileSync(new URL('../app.json', import.meta.url)));
  assert.match(ui, /bg: '#FFFFFF'/);
  assert.match(ui, /accent: '#000000'/);
  assert.match(ui, /onAccent: '#FFFFFF'/);
  assert.match(ui, /export function NativeSegments/);
  assert.match(ui, /export function NativePicker/);
  assert.match(app, /Appearance.setColorScheme\('light'\)/);
  assert.match(app, /\.\.\.DefaultTheme/);
  assert.equal(config.expo.userInterfaceStyle, 'light');
});

test('work-email prototype accepts the company domain and OTP 123', () => {
  const app = fs.readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const intro = app.slice(app.indexOf('function Introduction('), app.indexOf('function Devices('));
  assert.match(intro, /navigation.navigate\('WorkEmail'\)/);
  assert.doesNotMatch(intro, /AsyncStorage|deviceRegisterState|navigation.reset/);
  const login = fs.readFileSync(new URL('./work-email-screen.tsx', import.meta.url), 'utf8');
  assert.match(login, /@equicomtech\.com/);
  assert.match(login, /setStep\('code'\)/);
  assert.match(login, /code\.trim\(\) !== '123'/);
  assert.match(login, /onAuthenticated\(email\.trim\(\)\.toLowerCase\(\)\)/);
  assert.match(login, /Use your Equicomtech work email/);
});
