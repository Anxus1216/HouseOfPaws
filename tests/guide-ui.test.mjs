import test from 'node:test';
import assert from 'node:assert/strict';

test('guide follows real taps while the home hint replaces growth details', async () => {
  const context = new Proxy({}, { get(target, key) { return target[key] || (() => {}); } });
  const saved = {};
  const handlers = {};
  globalThis.GameGlobal = {};
  globalThis.requestAnimationFrame = () => 1;
  globalThis.wx = {
    createCanvas: () => ({ width: 0, height: 0, getContext: () => context }),
    getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844 }),
    getStorageSync: key => saved[key],
    setStorageSync: (key, value) => { saved[key] = structuredClone(value); },
    onTouchStart: callback => { handlers.touch = callback; },
    onTouchMove() {},
    onTouchEnd: callback => { handlers.end = callback; },
  };
  const { default: Main } = await import('../js/main.js');
  const game = new Main();
  const visible = id => game.scene.buttons.find(button => button.id === id);
  const tap = id => {
    game.draw();
    const button = visible(id);
    assert.ok(button, `${id} is visible`);
    const point = { clientX: game.scene.offsetX + (button.x + button.w / 2) * game.scene.scale,
      clientY: game.scene.offsetY + (button.y + button.h / 2) * game.scene.scale };
    handlers.touch({ touches: [point] });
    handlers.end({ changedTouches: [point] });
  };
  const revealHint = () => { game.ui.guideHoldUntil = Date.now() - 1; game.draw(); };

  tap('adopt_selected');
  revealHint();
  assert.equal(game.state.guide.phase, 'interact');
  assert.equal(visible('home_growth_help'), undefined, 'growth details are fully replaced');
  assert.equal(visible('home_advice'), undefined, 'advice does not cover the pet focus');
  assert.ok(visible('pet_tap'), 'the highlighted pet remains tappable');
  assert.ok(visible('guide_skip'));

  const originalDraw = game.draw;
  let fullDraws = 0;
  game.draw = () => { fullDraws++; originalDraw.call(game); };
  game.ui.quitConfirm = true;
  game.ui.guideHoldUntil = 0;
  game.needsDraw = false;
  game.lastAnimationDraw = 0;
  game.lastViewportCheck = Date.now();
  game.loop();
  assert.equal(fullDraws, 0, 'a hidden guide does not force full redraws');
  game.ui.quitConfirm = false;
  game.draw = originalDraw;

  tap('pet_tap');
  assert.equal(game.state.guide.phase, 'care');
  assert.equal(game.ui.speech, '奶糖记住你啦');
  revealHint();
  tap('feed');
  assert.equal(game.state.guide.phase, 'claim');
  revealHint();
  tap('nav_tasks');
  tap('claim_care');
  assert.equal(game.state.guide.phase, 'outro');
  revealHint();
  assert.ok(visible('guide_finish'));
  tap('guide_finish');
  assert.equal(saved.paw_house_save_v1.guide.phase, 'done');
  game.ui.page = 'home';
  game.draw();
  assert.ok(visible('home_growth_help'), 'growth details return after completion');
  assert.equal(visible('guide_skip'), undefined);
});

test('WeChat empty storage is a new player, while an invalid stored value is not', async () => {
  const context = new Proxy({}, { get: () => () => {} });
  const { default: Main } = await import('../js/main.js');
  for (const [raw, phase] of [['', 'await_adoption'], [123, 'disabled']]) {
    globalThis.requestAnimationFrame = () => 1;
    globalThis.wx = {
      createCanvas: () => ({ width: 0, height: 0, getContext: () => context }),
      getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844 }),
      getStorageSync: () => raw,
      setStorageSync() {}, onTouchStart() {}, onTouchMove() {},
    };
    globalThis.GameGlobal = {
      canvas: wx.createCanvas(),
      viewport: { width: 390, height: 844, top: 24, bottom: 34, left: 0, right: 0, pixelRatio: 1 },
    };
    const game = new Main();
    assert.equal(game.state.guide.phase, phase);
    assert.equal(game.saveDisabled, raw !== '');
    game.ui.toast = '';
    game.save();
    if (raw !== '') assert.equal(game.ui.toast, '本机存档暂时不可用');
  }
});

test('first guided pet response survives a direct jump from interaction to reward', async () => {
  const context = new Proxy({}, { get: () => () => {} });
  globalThis.requestAnimationFrame = () => 1;
  globalThis.wx = {
    createCanvas: () => ({ width: 0, height: 0, getContext: () => context }),
    getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844 }),
    getStorageSync: () => '', setStorageSync() {},
    onTouchStart() {}, onTouchMove() {},
  };
  globalThis.GameGlobal = {
    canvas: wx.createCanvas(),
    viewport: { width: 390, height: 844, top: 24, bottom: 34, left: 0, right: 0, pixelRatio: 1 },
  };
  const { default: Main } = await import('../js/main.js');
  const game = new Main();
  game.completeAdoption('cat');
  game.state.coins = 0;
  Object.assign(game.state.pets.cat, { clean: 100, happy: 100, energy: 100 });
  game.ui.guideHoldUntil = 0;
  game.draw();
  const button = game.scene.buttons.find(item => item.id === 'pet_tap');
  const point = { clientX: game.scene.offsetX + (button.x + button.w / 2) * game.scene.scale,
    clientY: game.scene.offsetY + (button.y + button.h / 2) * game.scene.scale };
  game.touch({ touches: [point] });
  assert.equal(game.state.guide.phase, 'claim');
  assert.equal(game.ui.speech, '奶糖记住你啦');
});
