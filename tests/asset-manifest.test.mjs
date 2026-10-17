import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pets = ['cat', 'rabbit', 'dog'];
const states = ['normal', 'happy', 'sleepy', 'need', 'feed', 'wash', 'play', 'rest'];

test('all selected gouache sources have packaged RGBA sprites', () => {
  for (const pet of pets) {
    for (const state of states) {
      const name = `pet_${pet}_${state}.png`;
      const source = fileURLToPath(new URL(`../assets/pets/selected/${name}`, import.meta.url));
      const sprite = fileURLToPath(new URL(`../assets/pets/sprites/${name}`, import.meta.url));
      assert.ok(statSync(source).size > 0, `${name} source is empty`);
      const bytes = readFileSync(sprite);
      assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
      assert.equal(bytes.readUInt32BE(16), 320, `${name} width`);
      assert.equal(bytes.readUInt32BE(20), 320, `${name} height`);
      assert.equal(bytes[25], 6, `${name} must be RGBA`);
    }
  }
});
