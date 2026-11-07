import test from 'node:test';
import assert from 'node:assert/strict';
import Scene from '../js/scene.js';
import { initialState, adopt } from '../js/model.js';
import { gameIdleLayout } from '../js/game-idle-layout.js';

const viewports = [[320, 568], [390, 844], [430, 932], [390, 1000]];
function createScene(width, height) {
  const scene = new Scene(new Proxy({}, { get: () => () => {} }), { width, height });
  scene.setViewport({ width, height, top: 24, bottom: 34, menuBottom: 60 });
  scene.resize();
  return scene;
}

test('home pets grow with available area while staying centered and clear of advice and care', () => {
  const sides = [];
  for (const [width, height] of viewports) {
    const scene = createScene(width, height);
    const layout = scene.homeGeometry();
    const portrait = layout.pet;
    sides.push(portrait.w * scene.scale);
    assert.equal(portrait.w, portrait.h, 'source art retains its proportions');
    assert.ok(Math.abs(portrait.x + portrait.w / 2 - layout.scene.x - layout.scene.w / 2) < 1e-9);
    assert.ok(Math.abs(portrait.y + portrait.h / 2 - layout.scene.y - layout.scene.h / 2) < 1e-9);
    assert.ok(portrait.x >= layout.scene.x && portrait.x + portrait.w <= layout.scene.x + layout.scene.w);
    assert.ok(portrait.y + portrait.h < layout.carePanel.y, 'portrait does not cover the care controls');
    assert.ok(layout.feedback.y + layout.feedback.h < portrait.y + portrait.h / 2,
      'longest feedback leaves the centered face visible');
    for (const species of ['cat', 'rabbit', 'dog']) {
      const state = initialState();
      state.coins = 1000;
      assert.equal(adopt(state, species), true);
      state.guide.phase = 'skipped';
      const draws = [];
      scene.pet = (id, x, y, size) => draws.push({ id, x, y, size });
      scene.draw(state, { page: 'home', showHomeAdvice: false });
      assert.equal(draws[0].id, species);
      assert.ok(Math.abs(draws[0].size * 300 - portrait.w) < 1e-9);
    }
  }
  assert.ok(sides[1] > sides[0] * 1.4, 'long-screen home pet is no longer capped at 190px');
  assert.ok(sides[2] > sides[1]);
  assert.ok(sides[3] >= sides[1], 'very tall screens respect the available width cap');
});

test('idle game pets and props scale together without moving the playable field or start control', () => {
  const sides = [];
  for (const [width, height] of viewports) {
    const scene = createScene(width, height);
    const field = scene.gameField();
    const idle = gameIdleLayout(field);
    sides.push(idle.pet.w * scene.scale);
    assert.equal(idle.pet.w, idle.pet.h);
    assert.ok(idle.bubble.y >= field.y);
    assert.ok(idle.bubble.y + idle.bubble.h + 11 < idle.pet.y);
    assert.ok(idle.pet.y + idle.pet.h < idle.start.y);
    assert.ok(idle.basket.x + idle.basket.w < field.x + field.w);
    assert.equal(idle.start.y, field.bottom - 67);
    const state = initialState();
    adopt(state, 'cat');
    state.guide.phase = 'skipped';
    let draw;
    scene.pet = (id, x, y, size) => { draw = { x, y, size }; };
    scene.draw(state, { page: 'game' });
    assert.ok(Math.abs(draw.size * 300 - idle.pet.w) < 1e-9);
    assert.ok(Math.abs(draw.y - 170 * draw.size - idle.pet.y) < 1e-9);
    assert.equal(draw.x, field.x + field.w / 2);
    assert.deepEqual(scene.gameField(), field, 'display sizing does not alter collision geometry');
    const start = scene.buttons.find(item => item.id === 'start_game');
    assert.equal(scene.hit(start.x + start.w / 2, start.y + start.h / 2), 'start_game');
  }
  assert.ok(sides[1] > sides[0] * 1.4);
  assert.ok(sides[2] > sides[1]);
  assert.ok(sides[3] >= sides[1], 'very tall game scenes respect the available width cap');
});
