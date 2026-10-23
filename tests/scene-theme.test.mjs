import test from 'node:test';
import assert from 'node:assert/strict';
import Scene from '../js/scene.js';
import { adopt, initialState } from '../js/model.js';

function scene() {
  const context = new Proxy({}, { get: (target, key) => target[key] || (() => {}) });
  const result = new Scene(context, { width: 390, height: 844 });
  result.scale = 1;
  return result;
}

test('button faces react to a press while a completed state stays static', () => {
  const view = scene();
  const faces = [];
  view.box = (...args) => faces.push({ y: args[1], fill: args[5],
    shadowBlur: view.ctx.shadowBlur });
  view.readableText = () => {};
  view.pressedId = 'claim_care';
  view.button('claim_care', 0, 0, 80, 30, '领取', '#C25343', '#FFF',
    null, 14, { variant: 'primary' });
  assert.deepEqual(faces.at(-1), { y: 1, fill: '#A34339', shadowBlur: 2 });
  view.pressedId = 'completed';
  view.button('completed', 0, 0, 80, 30, '已领取', '#E4DED5', '#51372B',
    null, 14, { disabled: true });
  assert.deepEqual(faces.at(-1), { y: 0, fill: '#E4DED5', shadowBlur: 7 });
});

test('blocked care remains colored and tappable with its pressed shade', () => {
  const view = scene();
  const state = initialState();
  adopt(state, 'cat');
  state.pets.cat.hunger = 100;
  const circles = [];
  view.box = () => {};
  view.circle = (...args) => circles.push(args[3]);
  view.careIcon = () => {};
  view.readableText = () => {};
  view.pressedId = 'feed';
  view.homeActions(state, { dockX: 30, dockY: 400, dockW: 330 });
  assert.ok(circles.includes('#F4A38B'));
  assert.ok(view.buttons.some(button => button.id === 'feed'));
});

test('sound switch has separate on, off, and pressed colors', () => {
  const view = scene();
  const boxes = [];
  view.box = (...args) => boxes.push(args);
  view.button = () => {};
  view.text = () => {};
  view.circle = () => {};
  view.line = () => {};
  const track = () => boxes.find(args => args[0] === 281 && args[3] === 31)?.[5];
  view.settings({ soundEnabled: true }, { debugEnabled: false });
  assert.equal(track(), '#55B79B');
  boxes.length = 0;
  view.pressedId = 'sound_toggle';
  view.settings({ soundEnabled: true }, { debugEnabled: false });
  assert.equal(track(), '#2D8875');
  boxes.length = 0;
  view.pressedId = null;
  view.settings({ soundEnabled: false }, { debugEnabled: false });
  assert.equal(track(), '#D9D8D0');
});

test('linen background loads asynchronously and redraws when ready', () => {
  const draws = [];
  const context = new Proxy({}, { get: (_, key) => key === 'drawImage' ?
    (...args) => draws.push(args) : () => {} });
  const image = { width: 1024, height: 1536 };
  const view = new Scene(context, { width: 390, height: 844,
    createImage: () => image });
  view.h = 844;
  let invalidations = 0;
  view.onAssetReady = () => { invalidations += 1; };
  view.background();
  assert.equal(image.src, 'assets/ui/linen-ivory.jpg');
  assert.equal(draws.length, 0);
  image.onload();
  view.background();
  assert.equal(invalidations, 1);
  assert.equal(draws.length, 1);
  assert.deepEqual(draws[0].slice(1), [0, 0, 1024, 1536, 0, 0, 390, 844]);
});

test('basket sprite loads once and replaces its Canvas fallback when ready', () => {
  const draws = [];
  const context = new Proxy({}, { get: (_, key) => key === 'drawImage' ?
    (...args) => draws.push(args) : () => {} });
  const image = {};
  const view = new Scene(context, { width: 390, height: 844,
    createImage: () => image });
  let invalidations = 0;
  view.onAssetReady = () => { invalidations += 1; };
  assert.equal(view.drawUiSprite('basket', 100, 400, 96, 52), false);
  assert.equal(image.src, 'assets/ui/basket-felt.png');
  image.onload();
  assert.equal(view.drawUiSprite('basket', 100, 400, 96, 52), true);
  assert.equal(invalidations, 1);
  assert.equal(draws.length, 1);
});

test('partial background redraw keeps the same linen crop as the full screen', () => {
  const draws = [];
  const image = { width: 1024, height: 1536 };
  const context = new Proxy({}, { get: (_, key) => key === 'drawImage' ?
    (...args) => draws.push(args) : () => {} });
  const view = new Scene(context, { width: 390, height: 844,
    createImage: () => image });
  view.h = 844;
  view.background();
  image.onload();
  view.background(15, 100, 360, 200);
  const [source, sx, sy, sw, sh, dx, dy, dw, dh] = draws.at(-1);
  assert.equal(source, image);
  assert.deepEqual([dx, dy, dw, dh], [15, 100, 360, 200]);
  assert.ok(Math.abs(sx - 15 / 390 * image.width) < 0.001);
  assert.ok(Math.abs(sy - 100 / 844 * image.height) < 0.001);
  assert.ok(Math.abs(sw - 360 / 390 * image.width) < 0.001);
  assert.ok(Math.abs(sh - 200 / 844 * image.height) < 0.001);
});

test('care foreground requests its transparent asset and redraws when loaded', () => {
  const image = {};
  const view = new Scene(new Proxy({}, { get: () => () => {} }),
    { width: 390, height: 844, createImage: () => image });
  let invalidations = 0;
  view.onAssetReady = () => { invalidations += 1; };
  assert.equal(view.drawUiSprite('care-wash-front', 50, 330, 280, 97), false);
  assert.equal(image.src, 'assets/ui/care-wash-front.png');
  image.onload();
  assert.equal(view.drawUiSprite('care-wash-front', 50, 330, 280, 97), true);
  assert.equal(invalidations, 1);
});

test('felt care badges and gift replace fallbacks after image loading', () => {
  for (const name of ['care-feed-v2', 'care-wash-v2', 'care-play-v2',
    'care-rest-v2', 'gift-felt-v2']) {
    const image = {};
    const draws = [];
    const view = new Scene(new Proxy({}, { get: (_, key) => key === 'drawImage' ?
      (...args) => draws.push(args) : () => {} }),
    { width: 390, height: 844, createImage: () => image });
    let invalidations = 0;
    view.onAssetReady = () => { invalidations += 1; };
    assert.equal(view.drawUiSprite(name, 20, 30, 48, 48), false);
    assert.equal(image.src, `assets/ui/${name}.png`);
    image.onload();
    assert.equal(view.drawUiSprite(name, 20, 30, 48, 48), true);
    assert.equal(invalidations, 1);
    assert.equal(draws.length, 1);
  }
});
