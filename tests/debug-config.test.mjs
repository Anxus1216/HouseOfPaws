import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { debugEnabledFromText } from '../scripts/debug-config-value.mjs';

test('only boolean debug.enable=true enables the developer entry', () => {
  for (const value of [undefined, '', '{}', '{"debug":{}}',
    '{"debug":{"enable":false}}', '{"debug":{"enable":"true"}}',
    '{"debug":{"enable":1}}', '{invalid json']) {
    assert.equal(debugEnabledFromText(value), false, String(value));
  }
  assert.equal(debugEnabledFromText('{"debug":{"enable":true}}'), true);
});

test('checked-in development config enables debug without copying a file', () => {
  const config = readFileSync(new URL('../config/debug.json', import.meta.url), 'utf8');
  assert.equal(debugEnabledFromText(config), true);
});
