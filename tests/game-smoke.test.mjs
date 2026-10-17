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
  assert.ok(saved.paw_house_save_v1.pets.cat.hunger > 99.99);
  assert.ok(game.ui.expressionUntil - Date.now() > 2000);
  assert.equal(game.ui.speech, '吃饱啦！');
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

  game.ui.page = 'game';
  game.startGame();
  game.ui.spawnTimer = 100;
  game.ui.stars = [{ x: 195, y: game.scene.h - 320 + 160 - 60, speed: 250 }];
  game.updateGame(2);
  assert.equal(game.ui.remaining, 18, 'a dropped frame counts its real elapsed time');
  assert.equal(game.ui.score, 1, 'a star crossing the basket is caught');
  game.ui.paused = true;
  game.updateGame(10);
  assert.equal(game.ui.remaining, 18, 'paused time is excluded');
  game.ui.paused = false;
  game.updateGame(18);
  assert.equal(game.ui.remaining, 0);
  assert.equal(game.ui.playing, false);
  const coinsAfterPayout = game.state.coins;
  game.updateGame(20);
  assert.equal(game.state.coins, coinsAfterPayout, 'the round pays out only once');

  game.state.pets.cat.hunger = 80;
  game.state.lastSeen = Date.now() - 3600000;
  game.save();
  assert.ok(saved.paw_house_save_v1.pets.cat.hunger < 79,
    'saving settles foreground time before advancing lastSeen');
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

test('generated pet sprites load by character and state', async () => {
  const { default: Scene } = await import('../js/scene.js');
  const requested = [];
  const drawn = [];
  const images = [];
  globalThis.wx = { createImage: () => {
    const image = { width: 512, height: 512,
      set src(value) { requested.push(value); } };
    images.push(image);
    return image;
  } };
  const context = new Proxy({ drawImage: image => drawn.push(image) },
    { get(target, key) { return target[key] || (() => {}); } });
  const scene = new Scene(context, { width: 390, height: 844 });
  scene.pet('rabbit', 195, 300, 1, 0, 'happy');
  scene.pet('dog', 195, 300, 1, 0, 'happy', 'wash');
  assert.deepEqual(requested, [
    'assets/pets/sprites/pet_rabbit_happy.png',
    'assets/pets/sprites/pet_dog_wash.png',
  ]);
  assert.equal(drawn.length, 0, 'Canvas art is used while sprites load');
  images.forEach(image => image.onload());
  scene.pet('rabbit', 195, 300, 1, 0, 'happy');
  scene.pet('dog', 195, 300, 1, 0, 'happy', 'wash');
  assert.equal(drawn.length, 2);
  scene.pet('rabbit', 195, 300, 1, 0, 'happy');
  assert.equal(requested.length, 2, 'loaded sprites are cached');
  assert.equal(drawn.length, 3);
});

test('pet expression, action and bubble switch together when feedback ends', async () => {
  const { petDisplay, ACTION_SPEECH, FEEDBACK_MS } = await import('../js/pet-display.js');
  const pet = { hunger: 10, clean: 80, happy: 80, energy: 75 };
  const ui = { expression: 'sleepy', action: 'rest', speech: ACTION_SPEECH.rest,
    statDelta: '+27 精力', expressionUntil: 1000 + FEEDBACK_MS.rest };
  assert.deepEqual(petDisplay(pet, ui, 2000), {
    expression: 'sleepy', action: 'rest', speech: '休息中，补充精力～', statDelta: '+27 精力',
  });
  assert.deepEqual(petDisplay(pet, ui, 4000), {
    expression: 'need', action: '', speech: '肚子饿啦，想吃点东西', statDelta: '',
  });
  pet.hunger = 80;
  pet.energy = 27;
  assert.equal(petDisplay(pet, ui, 4000).expression, 'sleepy');
  assert.equal(petDisplay(pet, ui, 4000).speech, '有点困啦');
  pet.energy = 75;
  assert.equal(petDisplay(pet, ui, 4000).speech, '');
});

test('home renders matching care sprite and speech before and after expiry', async () => {
  const { default: Scene } = await import('../js/scene.js');
  const { initialState, adopt } = await import('../js/model.js');
  const context = new Proxy({}, { get: () => () => {} });
  const scene = new Scene(context, { width: 390, height: 844 });
  const state = initialState();
  adopt(state, 'cat');
  state.pets.cat.hunger = 10;
  const ui = { expression: 'sleepy', action: 'rest', speech: '休息中，补充精力～',
    statDelta: '+27 精力', expressionUntil: Date.now() + 3000 };
  const text = [];
  let pose;
  scene.text = value => text.push(value);
  scene.pet = (id, x, y, size, time, expression, action) => { pose = { expression, action }; };
  scene.home(state, ui);
  assert.deepEqual(pose, { expression: 'sleepy', action: 'rest' });
  assert.ok(text.includes('休息中，补充精力～'));
  ui.expressionUntil = Date.now() - 1;
  text.length = 0;
  scene.home(state, ui);
  assert.deepEqual(pose, { expression: 'need', action: '' });
  assert.ok(text.includes('肚子饿啦，想吃点东西'));
  assert.ok(!text.includes('休息中，补充精力～'));
});
