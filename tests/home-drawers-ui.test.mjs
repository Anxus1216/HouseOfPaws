import test from 'node:test';
import assert from 'node:assert/strict';

test('real entrance taps toggle independent drawers without care or persisted open state', async () => {
  const context = new Proxy({}, { get: (target, key) => target[key] || (() => {}) });
  const canvas = { width: 0, height: 0, getContext: () => context };
  const handlers = {};
  const saved = {};
  let now = 10000;
  const originalNow = Date.now;
  Date.now = () => now;
  globalThis.GameGlobal = {};
  globalThis.requestAnimationFrame = () => 1;
  globalThis.wx = {
    createCanvas: () => canvas,
    getWindowInfo: () => ({ windowWidth: 320, windowHeight: 568 }),
    getStorageSync: key => saved[key],
    setStorageSync: (key, value) => { saved[key] = structuredClone(value); },
    onTouchStart: callback => { handlers.start = callback; },
    onTouchEnd: callback => { handlers.end = callback; },
    onTouchMove() {},
  };
  try {
    const { default: Main } = await import('../js/main.js');
    const game = new Main();
    game.completeAdoption('cat');
    game.state.guide.phase = 'skipped';
    const pointFor = id => {
      const button = game.scene.buttons.find(item => item.id === id);
      assert.ok(button, `${id} is visible`);
      return {
        clientX: game.scene.offsetX + (button.x + button.w / 2) * game.scene.scale,
        clientY: game.scene.offsetY + (button.y + button.h / 2) * game.scene.scale,
      };
    };
    const tap = id => {
      game.draw();
      const point = pointFor(id);
      handlers.start({ touches: [point] });
      handlers.end({ changedTouches: [point] });
    };
    const finishAnimation = () => {
      now += 200;
      game.loop();
    };
    assert.equal(game.ui.homeDrawers.care.targetOpen, false);
    assert.equal(game.ui.homeDrawers.status.targetOpen, false);
    const coins = game.state.coins;
    const actions = game.state.pets.cat.actions;
    tap('home_care_toggle');
    assert.equal(game.ui.homeDrawers.care.targetOpen, true);
    finishAnimation();
    assert.ok(game.scene.buttons.some(button => button.id === 'feed'));
    tap('home_status_toggle');
    finishAnimation();
    assert.equal(game.ui.homeDrawers.status.targetOpen, true);
    assert.equal(game.ui.homeDrawers.care.targetOpen, true);
    const oldFeedPoint = pointFor('feed');
    tap('home_care_toggle');
    // The last frame can still contain the old feed target. Main also guards it.
    handlers.start({ touches: [oldFeedPoint] });
    assert.equal(game.state.pets.cat.actions, actions);
    assert.equal(game.state.coins, coins);
    finishAnimation();
    assert.ok(!game.scene.buttons.some(button => button.id === 'feed'));
    assert.equal(game.ui.homeDrawers.status.targetOpen, true);
    tap('nav_tasks');
    tap('nav_home');
    assert.equal(game.ui.homeDrawers.status.targetOpen, true);
    const restarted = new Main();
    assert.equal(restarted.ui.homeDrawers.status.targetOpen, false);
    assert.equal(restarted.ui.homeDrawers.care.targetOpen, false);
  } finally {
    Date.now = originalNow;
  }
});

test('entrance teaching records real opens while a failed save never repeats settled care', async () => {
  const context = new Proxy({}, { get: (target, key) => target[key] || (() => {}) });
  const canvas = { width: 320, height: 568, getContext: () => context };
  let now = 10000;
  let failStorage = false;
  const originalNow = Date.now;
  Date.now = () => now;
  globalThis.GameGlobal = { canvas, viewport: {
    width: 320, height: 568, top: 24, bottom: 34, left: 0, right: 0, pixelRatio: 1,
  } };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.wx = {
    createCanvas: () => canvas,
    getWindowInfo: () => ({ windowWidth: 320, windowHeight: 568 }),
    getStorageSync: () => '',
    setStorageSync: () => { if (failStorage) throw Error('storage unavailable'); },
    onTouchStart() {}, onTouchEnd() {}, onTouchMove() {},
  };
  try {
    const { default: Main } = await import('../js/main.js');
    const game = new Main();
    const tap = id => {
      game.draw();
      const button = game.scene.buttons.find(item => item.id === id);
      assert.ok(button, `${id} is visible`);
      const point = {
        clientX: game.scene.offsetX + (button.x + button.w / 2) * game.scene.scale,
        clientY: game.scene.offsetY + (button.y + button.h / 2) * game.scene.scale,
      };
      game.touch({ touches: [point] });
      game.touchEnd({ changedTouches: [point] });
    };
    const advance = duration => { now += duration; game.loop(); };
    game.completeAdoption('cat');
    advance(5000);
    tap('pet_tap');
    advance(5000);
    assert.equal(game.scene.visibleGuide(game.state, game.ui).substep, 1);
    const coins = game.state.coins;
    tap('home_care_toggle');
    assert.equal(game.state.guide.uiHints.careOpened, true);
    assert.equal(game.state.guide.facts.cared, false);
    assert.equal(game.state.coins, coins);
    advance(200);
    assert.equal(game.scene.visibleGuide(game.state, game.ui).substep, 2);
    tap('home_status_toggle');
    assert.equal(game.state.guide.uiHints.statusOpened, true);
    advance(200);
    failStorage = true;
    const beforeActions = game.state.pets.cat.actions;
    tap('feed');
    assert.equal(game.state.pets.cat.actions, beforeActions + 1);
    assert.equal(game.state.coins, coins - 5);
    assert.equal(game.state.guide.phase, 'claim');
    assert.equal(game.ui.persistenceWarning, '本机存档暂时不可用');
    assert.equal(game.ui.careFeedback.cost, 5);
    assert.equal(game.ui.careFeedback.growth, 10);
    game.save();
    assert.equal(game.state.pets.cat.actions, beforeActions + 1, 'save retry does not settle care again');
    assert.equal(game.state.coins, coins - 5);
    failStorage = false;
    game.save();
    assert.equal(game.ui.persistenceWarning, null);
  } finally {
    Date.now = originalNow;
  }
});
