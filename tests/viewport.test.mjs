import test from 'node:test';
import assert from 'node:assert/strict';
import { readViewport, sameViewport } from '../js/viewport.js';
import { canvasBacking } from '../js/canvas-resolution.js';
import Scene from '../js/scene.js';
import { initialState, adopt } from '../js/model.js';

test('safe area and capsule are converted from screen to window coordinates', () => {
  const viewport = readViewport({
    getWindowInfo: () => ({ windowWidth: 390, windowHeight: 760, screenHeight: 844,
      screenTop: 44, safeArea: { top: 44, bottom: 810 } }),
    getMenuButtonBoundingClientRect: () => ({ top: 52, bottom: 84 }),
  });
  assert.deepEqual(viewport, { width: 390, height: 760, top: 0, bottom: 0, left: 0, right: 0,
    menuBottom: 40, pixelRatio: 1 });
});

test('pixel ratio uses window info, legacy fallback and a safe default', () => {
  const window = { windowWidth: 390, windowHeight: 844, pixelRatio: 2.75 };
  assert.equal(readViewport({ getWindowInfo: () => window }).pixelRatio, 2.75);
  assert.equal(readViewport({ getWindowInfo: () => ({ ...window, pixelRatio: NaN }),
    getSystemInfoSync: () => ({ pixelRatio: 3 }) }).pixelRatio, 3);
  assert.equal(readViewport({ getWindowInfo: () => ({ ...window, pixelRatio: 0 }),
    getSystemInfoSync: () => ({ pixelRatio: -1 }) }).pixelRatio, 1);
  assert.equal(sameViewport({ ...window, pixelRatio: 2 },
    { ...window, pixelRatio: 3 }), false);
});

test('canvas backing grows for density but stays within the mobile pixel budget', () => {
  const logical = { width: 390, height: 844 };
  assert.deepEqual(canvasBacking({ ...logical, pixelRatio: 1 }),
    { width: 390, height: 844, scaleX: 1, scaleY: 1 });
  assert.deepEqual(canvasBacking({ ...logical, pixelRatio: 2 }),
    { width: 780, height: 1688, scaleX: 2, scaleY: 2 });
  assert.deepEqual(canvasBacking({ ...logical, pixelRatio: 3 }),
    { width: 1170, height: 2532, scaleX: 3, scaleY: 3 });
  const large = canvasBacking({ width: 1024, height: 768, pixelRatio: 4 });
  assert.ok(large.width * large.height <= 4_000_000);
  assert.ok(large.scaleX >= 1 && large.scaleX < 3);
});

test('density changes redraw at physical resolution without moving touch targets or pausing play', async () => {
  const transforms = [];
  const context = new Proxy({ setTransform: (...args) => transforms.push(args) },
    { get(target, key) { return target[key] || (() => {}); } });
  const canvas = { width: 0, height: 0, getContext: () => context };
  const handlers = {};
  let metrics = { windowWidth: 390, windowHeight: 844, pixelRatio: 2 };
  globalThis.GameGlobal = {};
  globalThis.requestAnimationFrame = () => 1;
  globalThis.wx = {
    createCanvas: () => canvas,
    getWindowInfo: () => metrics,
    getStorageSync: () => null,
    setStorageSync() {},
    onTouchStart: callback => { handlers.touch = callback; },
    onTouchMove() {},
    onWindowResize: callback => { handlers.resize = callback; },
  };
  const { default: Main } = await import('../js/main.js');
  GameGlobal.canvas = canvas;
  GameGlobal.viewport = readViewport(wx, canvas);
  const game = new Main();
  assert.equal(canvas.width, 780, 'initial backing width uses 2x density');
  assert.equal(canvas.height, 1688);
  adopt(game.state, 'cat');
  game.ui.guideStep = 0;
  game.scene.draw(game.state, game.ui);
  assert.deepEqual(transforms.at(-1), [game.scene.scale * 2, 0, 0,
    game.scene.scale * 2, game.scene.offsetX * 2, game.scene.offsetY * 2]);
  const tap = id => {
    game.scene.draw(game.state, game.ui);
    const button = game.scene.buttons.find(item => item.id === id);
    assert.ok(button, `${id} is visible`);
    handlers.touch({ touches: [{
      clientX: game.scene.offsetX + (button.x + button.w / 2) * game.scene.scale,
      clientY: game.scene.offsetY + (button.y + button.h / 2) * game.scene.scale,
    }] });
  };
  tap('nav_tasks');
  assert.equal(game.ui.page, 'tasks', '2x density keeps logical touch coordinates');

  game.ui.page = 'game';
  game.ui.playing = true;
  game.ui.paused = false;
  game.ui.score = 4;
  game.scene.draw(game.state, game.ui);
  metrics = { ...metrics, pixelRatio: 3 };
  handlers.resize();
  assert.equal(canvas.width, 1170);
  assert.equal(canvas.height, 2532);
  assert.equal(game.ui.paused, false, 'a density-only change does not pause the game');
  assert.equal(game.ui.score, 4);
  assert.deepEqual(transforms.at(-1), [game.scene.scale * 3, 0, 0,
    game.scene.scale * 3, game.scene.offsetX * 3, game.scene.offsetY * 3]);
  game.scene.drawAnimation(game.state, game.ui);
  assert.deepEqual(transforms.at(-1), [game.scene.scale * 3, 0, 0,
    game.scene.scale * 3, game.scene.offsetX * 3, game.scene.offsetY * 3]);
  game.ui.playing = false;
  game.ui.page = 'home';
  tap('nav_tasks');
  assert.equal(game.ui.page, 'tasks', '3x density keeps logical touch coordinates');
});

test('asymmetric side insets keep every main control inside the horizontal safe area', () => {
  const viewport = readViewport({ getWindowInfo: () => ({
    windowWidth: 390, windowHeight: 844, screenWidth: 390, screenHeight: 844,
    screenTop: 0, safeArea: { left: 32, right: 378, top: 0, bottom: 810 },
  }) });
  assert.equal(viewport.left, 32);
  assert.equal(viewport.right, 12);
  assert.equal(sameViewport(viewport, { ...viewport, left: 31 }), false);
  const context = new Proxy({}, { get: () => () => {} });
  const scene = new Scene(context, { width: 390, height: 844 });
  scene.setViewport(viewport);
  const state = initialState();
  adopt(state, 'cat');
  const ui = { page: 'home', expressionUntil: 0 };
  for (const page of ['home', 'collection', 'tasks', 'game']) {
    ui.page = page;
    scene.draw(state, ui);
    for (const button of scene.buttons) {
      const left = scene.offsetX + button.x * scene.scale;
      const right = scene.offsetX + (button.x + button.w) * scene.scale;
      assert.ok(left >= viewport.left, `${page}:${button.id} clears left inset`);
      assert.ok(right <= viewport.width - viewport.right,
        `${page}:${button.id} clears right inset`);
    }
  }
});

test('missing or malformed safe area reserves a bottom margin', () => {
  for (const safeArea of [undefined, { top: 60, bottom: 20 }]) {
    const viewport = readViewport({ getWindowInfo: () => ({
      windowWidth: 320, windowHeight: 568, statusBarHeight: 24, safeArea,
    }) });
    assert.equal(viewport.top, 24);
    assert.equal(viewport.bottom, 34);
  }
  const legacy = readViewport({ getWindowInfo: () => ({ windowWidth: 320,
    windowHeight: 568, safeArea: { top: -1, bottom: 550 } }),
  getSystemInfoSync: () => ({ screenHeight: 568, safeArea: { top: 20, bottom: 540 } }) });
  assert.equal(legacy.top, 20);
  assert.equal(legacy.bottom, 28);
});

test('a temporary metrics failure does not replace the known viewport', () => {
  const viewport = readViewport({ getWindowInfo: () => { throw Error('unavailable'); },
    getSystemInfoSync: () => { throw Error('unavailable'); } },
  { width: 320, height: 568 });
  assert.equal(viewport, null);
});

test('all main-page hit areas remain above the fallback bottom margin', () => {
  const context = new Proxy({}, { get: () => () => {} });
  const canvas = { width: 320, height: 568 };
  const viewport = readViewport({ getWindowInfo: () => ({
    windowWidth: 320, windowHeight: 568, statusBarHeight: 24,
  }) });
  const scene = new Scene(context, canvas);
  scene.setViewport(viewport);
  const state = initialState();
  const ui = { page: 'home', guideStep: 0, expressionUntil: 0 };
  scene.draw(state, ui);
  adopt(state, 'cat');
  for (const page of ['home', 'collection', 'tasks', 'game']) {
    ui.page = page;
    scene.draw(state, ui);
    for (const button of scene.buttons) {
      const top = scene.offsetY + button.y * scene.scale;
      const bottom = scene.offsetY + (button.y + button.h) * scene.scale;
      assert.ok(top >= viewport.top, `${page}:${button.id} clears top inset`);
      assert.ok(bottom <= viewport.height - viewport.bottom,
        `${page}:${button.id} clears bottom inset`);
    }
  }
});

test('runtime window and safe-area changes redraw before accepting touch', async () => {
  const context = new Proxy({}, { get(target, key) { return target[key] || (() => {}); } });
  const canvas = { width: 0, height: 0, getContext: () => context };
  const handlers = {};
  const stored = {};
  let metrics = { windowWidth: 390, windowHeight: 844, screenHeight: 844,
    screenTop: 0, safeArea: { top: 0, bottom: 810 } };
  let menuBottom = 82;
  globalThis.GameGlobal = {};
  globalThis.requestAnimationFrame = () => 1;
  globalThis.wx = {
    createCanvas: () => canvas,
    getWindowInfo: () => metrics,
    getMenuButtonBoundingClientRect: () => ({ top: menuBottom - 32, bottom: menuBottom }),
    getStorageSync: key => stored[key],
    setStorageSync: (key, value) => { stored[key] = structuredClone(value); },
    onTouchStart: callback => { handlers.touch = callback; },
    onTouchMove: callback => { handlers.move = callback; },
    onTouchEnd: callback => { handlers.end = callback; },
    onWindowResize: callback => { handlers.resize = callback; },
    onShow: callback => { handlers.show = callback; },
    onHide() {},
  };
  const { default: Main } = await import('../js/main.js');
  GameGlobal.canvas = canvas;
  GameGlobal.viewport = readViewport(wx, canvas);
  const game = new Main();
  const tap = id => {
    game.scene.draw(game.state, game.ui);
    const b = game.scene.buttons.find(button => button.id === id);
    assert.ok(b, `${id} is visible`);
    const point = { clientX: game.scene.offsetX +
      (b.x + b.w / 2) * game.scene.scale, clientY: game.scene.offsetY +
      (b.y + b.h / 2) * game.scene.scale };
    handlers.touch({ touches: [point] });
    return point;
  };
  tap('adopt_selected');
  tap('guide_skip');
  game.ui.page = 'game';
  game.startGame();
  game.ui.score = 4;
  game.ui.remaining = 12;
  menuBottom = 83;
  game.syncViewport();
  assert.equal(game.ui.paused, false, 'capsule movement alone does not pause the game');
  game.scene.draw(game.state, game.ui);
  const oldField = game.scene.gameField();
  game.ui.stars = [{ x: 195, y: oldField.y + oldField.h / 2, speed: 210 }];
  metrics = { windowWidth: 320, windowHeight: 568, screenHeight: 568,
    screenTop: 0, safeArea: { top: 20, bottom: 534 } };
  handlers.resize();
  assert.equal(canvas.width, 320);
  assert.equal(canvas.height, 568);
  assert.equal(game.ui.paused, true);
  assert.equal(game.ui.score, 4);
  assert.equal(game.ui.remaining, 12);
  const newField = game.scene.gameField();
  assert.equal(game.ui.stars[0].y, newField.y + newField.h / 2);
  assert.ok(game.scene.buttons.some(button => button.id === 'resume_game'));
  tap('resume_game');
  assert.equal(game.ui.paused, false);

  // Insets may change without resizing the Canvas.
  const originalCanvasWidth = canvas.width;
  metrics = { ...metrics, safeArea: { top: 26, bottom: 528 } };
  game.syncViewport();
  assert.equal(canvas.width, originalCanvasWidth);
  assert.equal(game.scene.offsetY, 26);
  game.ui.page = 'home';
  game.ui.playing = false;
  game.scene.draw(game.state, game.ui);
  const nav = game.scene.buttons.find(button => button.id === 'nav_home');
  assert.ok(game.scene.offsetY + (nav.y + nav.h) * game.scene.scale <= 528);
  tap('nav_tasks');
  assert.equal(game.ui.page, 'tasks');

  // A side inset can change without resizing the Canvas or changing vertical bounds.
  metrics = { ...metrics, screenWidth: 320,
    safeArea: { left: 18, right: 310, top: 26, bottom: 528 } };
  game.syncViewport();
  assert.equal(canvas.width, originalCanvasWidth);
  assert.equal(game.viewport.left, 18);
  assert.equal(game.viewport.right, 10);
  assert.ok(game.scene.offsetX >= game.viewport.left);
  assert.ok(game.scene.offsetX + 390 * game.scene.scale <=
    game.viewport.width - game.viewport.right);
  tap('nav_home');
  assert.equal(game.ui.page, 'home');
  tap('nav_tasks');
  assert.equal(game.ui.page, 'tasks');

  // A runtime without a resize event still refreshes when shown.
  metrics = { ...metrics, windowHeight: 650, screenHeight: 650,
    safeArea: { top: 26, bottom: 616 } };
  handlers.show();
  assert.equal(canvas.height, 650);
  assert.equal(game.ui.page, 'tasks');
  metrics = { ...metrics, windowHeight: 700, screenHeight: 700,
    safeArea: { top: 26, bottom: 666 } };
  game.lastViewportCheck = 0;
  game.loop();
  assert.equal(canvas.height, 700, 'foreground check handles a missed resize event');

  // When touch discovers an inset change, retain it if both layouts hit the same control.
  game.ui.page = 'home';
  metrics = { ...metrics, safeArea: { top: 26, bottom: 656 } };
  const retainedPoint = tap('nav_tasks');
  assert.equal(game.scene.hit((retainedPoint.clientX - game.scene.offsetX) / game.scene.scale,
    (retainedPoint.clientY - game.scene.offsetY) / game.scene.scale), 'nav_tasks');
  assert.equal(game.ui.page, 'tasks', 'first touch is processed after a safe-area change');

  // A large resize moves the old target away; the stale touch must not activate another one.
  game.ui.page = 'home';
  metrics = { ...metrics, windowHeight: 568, screenHeight: 568,
    safeArea: { top: 26, bottom: 534 } };
  const stalePoint = tap('nav_tasks');
  assert.notEqual(game.scene.hit((stalePoint.clientX - game.scene.offsetX) / game.scene.scale,
    (stalePoint.clientY - game.scene.offsetY) / game.scene.scale), 'nav_tasks');
  assert.equal(game.ui.page, 'home');
  tap('nav_tasks');
  assert.equal(game.ui.page, 'tasks');

  // A capsule-only refresh during touchend must still finish a debug-editor tap.
  game.ui.debugEnabled = true;
  game.openDebugEditor();
  game.scene.draw(game.state, game.ui);
  const fieldButton = game.scene.buttons.find(button => button.id === 'debug_field:hunger');
  assert.ok(fieldButton);
  const fieldPoint = { clientX: game.scene.offsetX +
    (fieldButton.x + fieldButton.w / 2) * game.scene.scale,
  clientY: game.scene.offsetY + (fieldButton.y + fieldButton.h / 2) * game.scene.scale };
  handlers.touch({ touches: [fieldPoint] });
  menuBottom += 1;
  handlers.end({ changedTouches: [fieldPoint] });
  assert.ok(game.ui.debugKeyboard, 'a capsule-only change must not discard touchend');
  assert.equal(game.debugTouch, null);
});
