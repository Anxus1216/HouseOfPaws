import { setDrawerOpen } from '../js/home-drawers.js';
import { recordDrawerGuideEvent, recordGuideEvent } from '../js/guide.js';
import { adopt, initialState } from '../js/model.js';
import Scene from '../js/scene.js';
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
  let transitionNow = Date.now();
  const game = new Main({ now: () => transitionNow });
  const visible = id => game.scene.buttons.find(button => button.id === id);
  const tap = id => {
    transitionNow = Math.max(transitionNow + 200, Date.now());
    game.loop();
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
  tap('home_care_toggle');
  setDrawerOpen(game.ui.homeDrawers,'care',true,0,true);
  game.ui.homeDrawers.care.from=1;
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

test('short-screen guide leaves the highlighted pet clear and advances on a center tap', async () => {
  const context = new Proxy({}, { get: () => () => {} });
  const handlers = {};
  const canvas = { width: 320, height: 568, getContext: () => context };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.wx = {
    createCanvas: () => canvas,
    getWindowInfo: () => ({ windowWidth: 320, windowHeight: 568, screenTop: 0,
      pixelRatio: 1, safeArea: { left: 0, right: 320, top: 24, bottom: 534 } }),
    getMenuButtonBoundingClientRect: () => ({ top: 32, bottom: 60 }),
    getStorageSync: () => '', setStorageSync() {},
    onTouchStart: callback => { handlers.start = callback; },
    onTouchEnd: callback => { handlers.end = callback; }, onTouchMove() {},
  };
  globalThis.GameGlobal = { canvas, viewport: { width: 320, height: 568,
    left: 0, right: 0, top: 24, bottom: 34, menuBottom: 60, pixelRatio: 1 } };
  const { default: Main } = await import('../js/main.js');
  const game = new Main();
  const findButton = id => game.scene.buttons.find(button => button.id === id);
  const tap = button => {
    assert.ok(button);
    const point = { clientX: game.scene.offsetX + (button.x + button.w / 2) * game.scene.scale,
      clientY: game.scene.offsetY + (button.y + button.h / 2) * game.scene.scale };
    handlers.start({ touches: [point] });
    handlers.end({ changedTouches: [point] });
  };

  game.draw();
  tap(findButton('adopt_selected'));
  assert.equal(game.state.guide.phase, 'interact');
  game.ui.guideHoldUntil = 0;
  game.draw();
  const pet = findButton('pet_tap');
  const guideCard = game.scene.buttons.findLast(button => button.id === 'home_panel');
  const status = findButton('home_status_toggle');
  assert.ok(guideCard.y + guideCard.h < pet.y, 'the card stays above the entire highlighted pet');
  assert.ok(guideCard.x + guideCard.w < status.x, 'the status entry remains clear');
  tap(pet);
  assert.equal(game.state.guide.phase, 'care');
});

test('guide starts each sentence on a new line without covering the controls', () => {
  const now = new Date(2026, 0, 1, 12).getTime();
  for (const [width, height] of [[320, 568], [390, 844]]) {
    const state = initialState(now);
    adopt(state, 'cat', now);
    recordGuideEvent(state, 'adopt', now);
    recordGuideEvent(state, 'pet_tap', now);
    const context = new Proxy({}, { get: () => () => {} });
    const scene = new Scene(context, { width, height });
    scene.setViewport({ width, height, top: 24, bottom: 34, menuBottom: 60, left: 0, right: 0 });
    const rendered = [];
    scene.readableText = (text, x, y) => rendered.push({ text, x, y });
    const draw = (page = 'home') => {
      rendered.length = 0;
      scene.draw(state, { page, frameNow: now });
    };
    const checkHomeCard = (firstSentence, secondSentence, targetId) => {
      const first = rendered.findIndex(({ text }) => text === firstSentence);
      assert.notEqual(first, -1, 'the first sentence fits on its own line');
      assert.equal(rendered[first + 1].text, secondSentence);
      assert.ok(rendered[first + 1].y > rendered[first].y);
      const skip = scene.buttons.find(({ id }) => id === 'guide_skip');
      const target = scene.buttons.find(({ id }) => id === targetId);
      assert.ok(skip.y > rendered[first + 1].y);
      assert.equal(scene.hit(target.x + target.w / 2, target.y + target.h / 2), targetId);
    };
    draw();
    checkHomeCard('照料篮里有喂食、清洁、玩耍和休息。', '点下方按钮，四种照料会向右展开。', 'home_care_toggle');
    recordDrawerGuideEvent(state, 'care');
    draw();
    checkHomeCard('小猫卡片里是奶糖的状态。', '点击向下展开四项数值，再点一次向上收回。', 'home_status_toggle');

    state.guide.phase = 'outro';
    draw('tasks');
    const question = rendered.findIndex(({ text }) => text === '想继续攒爪爪币？');
    assert.notEqual(question, -1);
    assert.equal(rendered[question + 1].text, '试试 20 秒接星星');
    assert.ok(rendered[question + 1].y > rendered[question].y);
    assert.ok(scene.buttons.find(({ id }) => id === 'guide_game').y > rendered[question + 1].y);
  }
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
