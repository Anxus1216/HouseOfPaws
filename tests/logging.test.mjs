import test from 'node:test';
import assert from 'node:assert/strict';

test('failed scene and pet images log once and keep Canvas fallback', async () => {
  const { default: Scene } = await import('../js/scene.js');
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args);
  try {
    const images = [];
    const canvas = { width: 390, height: 844, createImage: () => {
      const image = { width: 320, height: 320, set src(value) { this.path = value; } };
      images.push(image);
      return image;
    } };
    const context = new Proxy({}, { get: () => () => {} });
    const scene = new Scene(context, canvas);
    assert.equal(scene.sceneBackdrop('home_afternoon', 0, 0, 390, 300, 0, '#fff'), false);
    assert.equal(scene.petSprite('cat', 195, 300, 1, 0, 'normal', ''), false);
    images[0].onerror(new Error('missing background'));
    images[1].onerror(new Error('missing sprite'));
    assert.equal(scene.sceneBackdrop('home_afternoon', 0, 0, 390, 300, 0, '#fff'), false);
    assert.equal(scene.petSprite('cat', 195, 300, 1, 0, 'normal', ''), false);
    assert.equal(images.length, 2, 'failed assets are not retried on every draw');
    assert.deepEqual(errors.map(([event]) => event), [
      '[爪爪小屋] scene.image_load_failed', '[爪爪小屋] pet.image_load_failed',
    ]);
    assert.equal(errors[0][1].name, 'home_afternoon');
    assert.equal(errors[1][1].key, 'cat_normal');
  } finally { console.error = originalError; }
});

test('storage failures log the operation and preserve the local fallback', async () => {
  const errors = [];
  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = (...args) => errors.push(args);
  console.warn = () => {};
  try {
    const context = new Proxy({}, { get: () => () => {} });
    globalThis.GameGlobal = {};
    globalThis.requestAnimationFrame = () => 1;
    globalThis.wx = {
      createCanvas: () => ({ width: 0, height: 0, getContext: () => context }),
      getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844 }),
      getStorageSync: () => { throw new Error('read unavailable'); },
      setStorageSync: () => { throw new Error('write unavailable'); },
      onTouchStart() {}, onTouchMove() {},
    };
    const { default: Main } = await import('../js/main.js');
    const game = new Main();
    assert.equal(game.state.active, null);
    game.save();
    assert.equal(game.ui.toast, '本机存档暂时不可用');
    assert.deepEqual(errors.map(([event]) => event), [
      '[爪爪小屋] save.load_failed', '[爪爪小屋] save.write_failed',
    ]);
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
  }
});
