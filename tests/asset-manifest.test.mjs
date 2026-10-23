import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { UI_SPRITES } from '../js/ui-assets.js';

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

test('all approved scene backgrounds are packaged as compact JPEG assets', () => {
  const scenes = ['home_afternoon', 'wash_nook', 'play_garden', 'rest_evening', 'star_sky'];
  let totalBytes = 0;
  for (const name of scenes) {
    const path = fileURLToPath(new URL(`../assets/scenes/scene_${name}.jpg`, import.meta.url));
    const bytes = readFileSync(path);
    assert.equal(bytes[0], 0xff, `${name} JPEG marker`);
    assert.equal(bytes[1], 0xd8, `${name} JPEG marker`);
    assert.ok(bytes.length < 256 * 1024, `${name} remains suitable for the game package`);
    totalBytes += bytes.length;
  }
  assert.ok(totalBytes < 1024 * 1024, 'scene set stays under 1 MiB');
});

test('linen UI texture is packaged as a compact JPEG', () => {
  const path = fileURLToPath(new URL('../assets/ui/linen-ivory.jpg', import.meta.url));
  const bytes = readFileSync(path);
  assert.deepEqual([...bytes.subarray(0, 2)], [0xff, 0xd8]);
  assert.ok(bytes.length < 256 * 1024, 'linen texture stays within its asset budget');
});

test('every UI sprite name resolves to a packaged image', () => {
  assert.deepEqual(Object.keys(UI_SPRITES).sort(), [
    'basket', 'star', 'care-feed-v2', 'care-wash-v2', 'care-play-v2',
    'care-rest-v2', 'care-wash-front', 'care-rest-front', 'gift-felt-v2',
  ].sort());
  for (const [name, path] of Object.entries(UI_SPRITES)) {
    assert.match(path, /^assets\/ui\/[^/]+\.png$/, `${name} has a UI image path`);
    const bytes = readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)));
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10],
      `${name} resolves to a PNG`);
  }
});

test('felt scene variants are packaged without replacing original backgrounds', () => {
  const scenes = ['home_afternoon', 'wash_nook', 'play_garden', 'rest_evening', 'star_sky'];
  let totalBytes = 0;
  for (const name of scenes) {
    const path = fileURLToPath(new URL(`../assets/scenes/scene_${name}_felt.jpg`, import.meta.url));
    const bytes = readFileSync(path);
    assert.deepEqual([...bytes.subarray(0, 2)], [0xff, 0xd8], `${name} JPEG marker`);
    assert.ok(bytes.length < 256 * 1024, `${name} fits its scene budget`);
    totalBytes += bytes.length;
  }
  assert.ok(totalBytes < 1024 * 1024, 'felt scene set stays under 1 MiB');
});

test('felt game sprites keep compact alpha images', () => {
  for (const name of ['basket', 'star']) {
    const path = fileURLToPath(new URL(`../assets/ui/${name}-felt.png`, import.meta.url));
    const bytes = readFileSync(path);
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(bytes[25], 6, `${name} uses RGBA`);
    assert.ok(bytes.length < 128 * 1024, `${name} sprite stays compact`);
  }
});

test('care scenes include transparent foreground props', () => {
  for (const name of ['wash', 'rest']) {
    const path = fileURLToPath(new URL(`../assets/ui/care-${name}-front.png`, import.meta.url));
    const bytes = readFileSync(path);
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(bytes[25], 6, `${name} foreground uses RGBA`);
    assert.ok(bytes.length < 300 * 1024, `${name} foreground fits its asset budget`);
  }
});

test('felt care badges and gift are compact transparent sprites', () => {
  for (const name of ['care-feed-v2', 'care-wash-v2', 'care-play-v2',
    'care-rest-v2', 'gift-felt-v2']) {
    const path = fileURLToPath(new URL(`../assets/ui/${name}.png`, import.meta.url));
    const bytes = readFileSync(path);
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(bytes[25], 6, `${name} uses RGBA`);
    assert.ok(bytes.length < 150 * 1024, `${name} stays within its sprite budget`);
  }
});
