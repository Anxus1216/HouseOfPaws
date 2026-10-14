import test from 'node:test';
import assert from 'node:assert/strict';

test('game starts, adopts, navigates and renders each screen', async () => {
  const context = new Proxy({}, { get(target, key) {
    if (key in target) return target[key];
    return () => {};
  } });
  const saved = {};
  const handlers = {};
  const played = [];
  globalThis.GameGlobal = {};
  globalThis.requestAnimationFrame = () => 1;
  globalThis.wx = {
    createCanvas: () => ({ width: 0, height: 0, getContext: () => context }),
    getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844 }),
    getStorageSync: key => saved[key],
    setStorageSync: (key, value) => { saved[key] = structuredClone(value); },
    onTouchStart: callback => { handlers.touch = callback; },
    onTouchMove: callback => { handlers.move = callback; },
    onHide: callback => { handlers.hide = callback; },
    onShow: callback => { handlers.show = callback; },
    createInnerAudioContext: () => ({ src: '', volume: 1, stop() {}, play() { played.push(this.src); } }),
  };
  const { default: Main } = await import('../js/main.js');
  const game = new Main();
  const tap = (x, y) => handlers.touch({ touches: [{ clientX: x, clientY: y }] });
  const tapId = id => {
    game.scene.draw(game.state, game.ui);
    const button = game.scene.buttons.find(item => item.id === id);
    assert.ok(button, `button ${id} is visible`);
    tap(button.x + button.w / 2, button.y + button.h / 2);
  };
  assert.equal(typeof handlers.touch, 'function');
  tapId('adopt_selected');
  assert.equal(saved.paw_house_save_v1.active, 'cat');
  assert.ok(played.includes('audio/adopt.wav'));
  tapId('guide_skip');
  assert.equal(saved.paw_house_save_v1.guideStep, 0);
  tapId('feed');
  assert.equal(saved.paw_house_save_v1.pets.cat.hunger, 100);
  assert.equal(game.state.tasks.progress.care, 1);
  tapId('pet_tap');
  assert.equal(game.state.tasks.progress.interact, 1);
  tapId('nav_tasks');
  tapId('claim_care');
  tapId('claim_interact');
  tapId('nav_collection');
  tapId('select_cat');
  tapId('nav_game');
  tapId('start_game');
  assert.equal(game.ui.playing, true);
  tapId('pause_game');
  const remaining = game.ui.remaining;
  game.updateGame(5);
  assert.equal(game.ui.remaining, remaining);
  tapId('resume_game');
  tapId('settings');
  assert.equal(game.ui.paused, true);
  tapId('sound_toggle');
  assert.equal(game.state.soundEnabled, false);
  const playedBeforeMute = played.length;
  tapId('settings_close');
  tapId('resume_game');
  handlers.move({ touches: [{ clientX: 150, clientY: 600 }] });
  assert.equal(game.ui.basketX, 150);
  game.updateGame(21);
  assert.equal(played.length, playedBeforeMute);
  assert.equal(game.ui.playing, false);
  assert.match(game.ui.gameResult, /接到/);
  assert.equal(game.state.tasks.progress.game, 1);
  tapId('start_game');
  handlers.hide();
  assert.equal(game.ui.paused, true);
  handlers.show();
  assert.equal(game.ui.paused, true);
  assert.equal(saved.paw_house_save_v1.active, 'cat');
});

test('main actions stay reachable on a shorter portrait screen', async () => {
  const { default: Scene } = await import('../js/scene.js');
  const { initialState, adopt } = await import('../js/model.js');
  const context = new Proxy({}, { get(target, key) { return target[key] || (() => {}); } });
  const canvas = { width: 390, height: 680 };
  const scene = new Scene(context, canvas);
  const state = initialState();
  adopt(state, 'cat');
  const ui = { page: 'home', speech: '', expressionUntil: 0, action: '', statDelta: '' };
  for (const page of ['home', 'collection', 'tasks', 'game']) {
    ui.page = page;
    scene.draw(state, ui);
    assert.ok(scene.buttons.length > 0, `${page} has buttons`);
    for (const button of scene.buttons) {
      assert.ok(button.x >= 0 && button.x + button.w <= 390, `${page}:${button.id} fits width`);
      assert.ok(button.y >= 0 && button.y + button.h <= scene.h, `${page}:${button.id} fits height`);
    }
  }
});
