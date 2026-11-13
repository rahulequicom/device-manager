import test from 'node:test';
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
import { readFileSync } from 'node:fs';
const code=stripTypeScriptTypes(readFileSync(new URL('../src/lib/password-policy.ts',import.meta.url),'utf8'));
const {newPasswordError}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
test('new passwords require exactly six digits, preserve leading zeros and require matching confirmation',()=>{
  for(const password of ['482915','004217'])assert.equal(newPasswordError(password,password),null);
  for(const password of ['', '1234', '12345', '1234567','12345a',' 12345','１２３４５６'])assert.match(newPasswordError(password,password),/exactly six digits/);
  assert.match(newPasswordError('482915','482916'),/do not match/);
});
