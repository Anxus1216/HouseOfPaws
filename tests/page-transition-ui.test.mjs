import test from 'node:test';
import assert from 'node:assert/strict';
import { transitionFrame } from '../js/page-transition.js';

async function fixture(width = 320, height = 568) {
  let now = Date.now();
  const handlers = {};
  const images = [];
  const labels = [];
  const stack = [];
  const context = new Proxy({
    globalAlpha: 1,
    save() { stack.push(this.globalAlpha); },
    restore() { this.globalAlpha = stack.pop() ?? 1; },
    fillText(value) { labels.push({ value: String(value), alpha: this.globalAlpha }); },
  }, { get: (target, key) => key in target ? target[key] : () => {} });
  const canvas = { width, height, getContext: () => context,
    createImage: () => {
      const image = { width: 256, height: 256 };
      images.push(image);
      return image;
    } };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.GameGlobal = { canvas, viewport: {
    width, height, top: 24, bottom: 34, left: 0, right: 0, pixelRatio: 1,
  } };
  globalThis.wx = {
    createCanvas: () => canvas,
    getWindowInfo: () => ({ windowWidth: width, windowHeight: height }),
    getStorageSync: () => '', setStorageSync() {},
    onTouchStart: callback => { handlers.start = callback; },
    onTouchEnd: callback => { handlers.end = callback; },
    onTouchMove: callback => { handlers.move = callback; },
    onHide: callback => { handlers.hide = callback; },
    onShow: callback => { handlers.show = callback; },
  };
  const { default: Main } = await import('../js/main.js');
  GameGlobal.canvas = canvas;
  const game = new Main({ now: () => now });
  game.completeAdoption('cat');
  game.state.guide.phase = 'skipped';
  const pointFor = button => ({
    clientX: game.scene.offsetX + (button.x + button.w / 2) * game.scene.scale,
    clientY: game.scene.offsetY + (button.y + button.h / 2) * game.scene.scale,
  });
  const tap = id => {
    game.draw();
    const button = game.scene.buttons.find(item => item.id === id);
    assert.ok(button, `${id} is visible`);
    const point = pointFor(button);
    handlers.start({ touches: [point] });
    handlers.end({ changedTouches: [point] });
  };
  const advance = duration => { now += duration; game.loop(); };
  return { game, tap, advance, pointFor, images, labels, handlers, context };
}

test('short and tall screens keep navigation opaque while latest target wins and completion restores content hits', async () => {
  for (const [width, height] of [[320, 568], [390, 844]]) {
    const { game, tap, advance, labels } = await fixture(width, height);
    const coins = game.state.coins;
    tap('nav_collection');
    assert.equal(game.ui.page, 'collection');
    assert.equal(transitionFrame(game.ui.pageTransition).displayPage, 'home');
    advance(45);
    assert.equal(game.ui.pageTransition.alpha, .5);
    assert.ok(game.scene.buttons.every(button => button.id.startsWith('nav_')));
    const navigation = game.scene.buttons.map(button => ({ ...button }));
    labels.length = 0;
    game.draw();
    assert.ok(labels.filter(label => ['小屋', '萌宠', '任务', '游戏'].includes(label.value))
      .every(label => label.alpha === 1));
    const startedAt = game.ui.pageTransition.startedAt;
    tap('nav_collection');
    assert.equal(game.ui.pageTransition.startedAt, startedAt, 'same target does not restart');
    tap('nav_tasks');
    assert.equal(game.ui.page, 'tasks');
    advance(135);
    assert.equal(game.ui.pageTransition.phase, 'idle');
    assert.equal(game.ui.pageTransition.alpha, 1);
    assert.ok(game.scene.buttons.some(button => button.id === 'task_go_care'), 'completion frame publishes business targets');
    assert.deepEqual(game.scene.buttons.filter(button => button.id.startsWith('nav_')), navigation);
    assert.equal(game.state.coins, coins);
    tap('task_go_care');
    assert.equal(game.ui.page, 'home', 'task route uses the same transition');
    advance(180);
    assert.ok(game.scene.buttons.some(button => button.id === 'home_care_toggle'));
  }
});

test('game departure pauses immediately, blocks old input and returns to its original paused overlay', async () => {
  const { game, tap, advance, pointFor, handlers } = await fixture();
  tap('nav_game');
  advance(180);
  tap('start_game');
  game.ui.score = 4;
  game.ui.remaining = 12;
  game.draw();
  const previousHelp = game.scene.buttons.find(button => button.id === 'game_help');
  const oldPoint = pointFor(previousHelp);
  tap('nav_tasks');
  assert.equal(game.ui.paused, true);
  const basketX = game.ui.basketX;
  const previousToast = game.ui.toast;
  handlers.start({ touches: [oldPoint] });
  handlers.move({ touches: [{ clientX: 0, clientY: 0 }] });
  handlers.end({ changedTouches: [oldPoint] });
  assert.equal(game.ui.basketX, basketX);
  assert.equal(game.ui.toast, previousToast, 'old help is not activated');
  advance(180);
  assert.equal(game.ui.remaining, 12);
  assert.equal(game.ui.score, 4);
  tap('nav_game');
  advance(90);
  assert.ok(!game.scene.buttons.some(button => button.id === 'resume_game'));
  advance(90);
  assert.ok(game.scene.buttons.some(button => button.id === 'resume_game'));
  assert.ok(!game.scene.buttons.some(button => button.id.startsWith('nav_')), 'paused overlay retains original modal priority');
  assert.equal(game.ui.paused, true);
});

test('image success and failure redraw without restarting transitions, and background return finishes the latest target', async () => {
  const { game, tap, advance, images, handlers } = await fixture();
  tap('nav_collection');
  advance(45);
  const startedAt = game.ui.pageTransition.startedAt;
  const careImage = images.find(image => image.src?.endsWith('care-drawer-felt.png'));
  const stateImage = images.find(image => image.src?.endsWith('state-drawer-felt.png'));
  assert.ok(careImage && stateImage);
  careImage.onload();
  stateImage.onerror(Error('failed image'));
  assert.equal(game.needsDraw, true);
  game.draw();
  assert.equal(game.ui.pageTransition.startedAt, startedAt);
  assert.equal(game.ui.pageTransition.targetPage, 'collection');
  handlers.hide();
  assert.equal(game.ui.pageTransition.phase, 'idle');
  assert.equal(game.ui.pageTransition.displayPage, 'collection');
  handlers.show();
  game.loop();
  assert.equal(game.ui.page, 'collection');
  assert.ok(game.scene.buttons.some(button => button.id === 'get_coins_rabbit'));
  assert.equal(game.scene.uiImages.get('state-drawer-felt').failed, true);
});
