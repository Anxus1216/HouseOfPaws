import test from 'node:test';
import assert from 'node:assert/strict';
import { coinWays } from '../js/coin-ways.js';
import { coinWaysLayout } from '../js/coin-ways-layout.js';

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
    onTouchEnd: callback => { handlers.end = callback; },
    onHide: callback => { handlers.hide = callback; },
    onShow: callback => { handlers.show = callback; },
    createInnerAudioContext: () => ({ src: '', volume: 1, stop() {}, play() { played.push(this.src); } }),
  };
  const { default: Main } = await import('../js/main.js');
  const game = new Main();
  const tap = (x, y) => handlers.touch({ touches: [{ clientX: x, clientY: y }] });
  const clientPoint = (x, y) => ({ clientX: game.scene.offsetX + x * game.scene.scale,
    clientY: game.scene.offsetY + y * game.scene.scale });
  const tapId = id => {
    game.draw();
    const button = game.scene.buttons.find(item => item.id === id);
    assert.ok(button, `button ${id} is visible`);
    const point = clientPoint(button.x + button.w / 2, button.y + button.h / 2);
    tap(point.clientX, point.clientY);
    handlers.end({ changedTouches: [point] });
  };
  assert.equal(typeof handlers.touch, 'function');
  tapId('adopt_selected');
  assert.equal(saved.paw_house_save_v1.active, 'cat');
  assert.ok(played.includes('audio/adopt.wav'));
  tapId('guide_skip');
  assert.equal(saved.paw_house_save_v1.guideStep, 0);
  tapId('nav_tasks');
  assert.equal(game.ui.page, 'tasks');
  tapId('task_go_care');
  assert.equal(game.ui.page, 'home');
  tapId('feed');
  assert.ok(saved.paw_house_save_v1.pets.cat.hunger > 99.99);
  assert.match(game.ui.statDelta, /饱腹 \+24 · 快乐 \+3/);
  assert.match(game.ui.statDelta, /成长 \+10 · 爪爪币 -5/);
  assert.ok(game.ui.expressionUntil - Date.now() > 2000);
  assert.equal(game.ui.speech, '吃饱啦！');
  assert.equal(game.state.tasks.progress.care, 1);
  game.state.pets.cat.dailyGrowth.earned = 96;
  game.lastCareAt = 0;
  tapId('play');
  assert.match(game.ui.statDelta, /成长 \+4（今日已满）/);
  game.lastCareAt = 0;
  tapId('wash');
  assert.match(game.ui.statDelta, /成长 \+0（今日已满）/);
  tapId('pet_tap');
  assert.equal(game.state.tasks.progress.interact, 1);
  tapId('nav_tasks');
  tapId('claim_care');
  tapId('claim_interact');
  tapId('task_go_game');
  assert.equal(game.ui.page, 'game');
  tapId('nav_collection');
  tapId('get_coins_rabbit');
  assert.equal(game.ui.coinWaysForId, 'rabbit');
  assert.equal(game.ui.page, 'collection');
  const tasksBeforeScroll = structuredClone(game.state.tasks);
  const growthBeforeScroll = structuredClone(game.state.pets.cat.dailyGrowth);
  const xpBeforeScroll = game.state.pets.cat.xp;
  game.state.tasks.claimed.care = false;
  game.state.tasks.progress.care = 1;
  game.state.tasks.claimed.interact = false;
  game.state.tasks.progress.interact = 0;
  game.state.pets.cat.xp = game.state.pets.cat.level * 40 - 5;
  game.state.pets.cat.dailyGrowth.earned = 0;
  game.draw();
  const list = coinWaysLayout(game.scene.h, coinWays(game.state, 'rabbit').ways.length);
  assert.ok(list.maxScroll > 0, 'five routes can scroll inside the layer');
  const scrollStart = clientPoint(180, list.top + 100);
  const scrollEnd = clientPoint(180, list.top + 50);
  handlers.touch({ touches: [scrollStart] });
  handlers.move({ touches: [scrollEnd] });
  game.draw();
  handlers.end({ changedTouches: [scrollEnd] });
  assert.ok(game.ui.coinWaysScroll > 0);
  assert.equal(game.ui.page, 'collection', 'scrolling never selects a route');
  tapId('coin_ways_close');
  assert.equal(game.ui.page, 'collection');
  game.state.tasks = tasksBeforeScroll;
  game.state.pets.cat.dailyGrowth = growthBeforeScroll;
  game.state.pets.cat.xp = xpBeforeScroll;
  tapId('get_coins_rabbit');
  tapId('coin_way_daily');
  assert.equal(game.ui.page, 'tasks');
  tapId('nav_collection');
  tapId('get_coins_rabbit');
  tapId('coin_way_game');
  assert.equal(game.ui.page, 'game');
  assert.equal(game.ui.coinWaysForId, null);
  tapId('nav_collection');
  tapId('get_coins_rabbit');
  game.state.coins = 80;
  game.draw();
  assert.equal(game.ui.coinWaysForId, null);
  assert.ok(game.scene.buttons.some(button => button.id === 'adopt_rabbit'));
  tapId('adopt_rabbit');
  assert.equal(game.ui.adoptionConfirmId, 'rabbit');
  assert.equal(game.state.coins, 80);
  tapId('adopt_cancel');
  assert.equal(game.ui.adoptionConfirmId, null);
  tapId('adopt_rabbit');
  game.state.coins = 79;
  tapId('adopt_confirm');
  assert.equal(game.ui.adoptionConfirmId, null);
  assert.equal(game.state.pets.rabbit, undefined);
  assert.equal(game.state.coins, 79);
  tapId('get_coins_rabbit');
  tapId('coin_way_game');
  tapId('nav_collection');
  game.state.coins = 80;
  tapId('adopt_rabbit');
  tapId('adopt_confirm');
  assert.equal(game.state.coins, 0);
  assert.equal(game.state.active, 'rabbit');
  assert.equal(game.ui.page, 'home');
  tapId('nav_collection');
  tapId('current_rabbit');
  assert.equal(game.ui.page, 'collection');
  assert.equal(game.state.coins, 0);
  tapId('select_cat');
  assert.equal(game.state.active, 'cat');
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
  handlers.move({ touches: [clientPoint(150, 600)] });
  assert.equal(game.ui.basketX, 150);
  game.updateGame(21);
  assert.equal(played.length, playedBeforeMute);
  assert.equal(game.ui.playing, false);
  assert.match(game.ui.gameResult, /接到/);
  assert.match(game.ui.gameGrowth, /成长 \+\d+/);
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
  game.ui.stars = [{ x: 195, y: game.scene.gameField().bottom - 60, speed: 250 }];
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
  assert.equal(game.ui.gameGrowth, '成长 +0（今日已满）');
  const coinsAfterPayout = game.state.coins;
  game.updateGame(20);
  assert.equal(game.state.coins, coinsAfterPayout, 'the round pays out only once');

  game.state.pets.cat.hunger = 80;
  game.state.lastSeen = Date.now() - 3600000;
  game.save();
  assert.ok(saved.paw_house_save_v1.pets.cat.hunger < 79,
    'saving settles foreground time before advancing lastSeen');

  let draws = 0;
  let animationDraws = 0;
  game.scene.draw = () => { draws++; };
  game.scene.drawAnimation = () => { animationDraws++; };
  game.ui.page = 'tasks';
  game.ui.toast = '';
  game.needsDraw = true;
  game.loop();
  game.loop();
  assert.equal(draws, 1, 'static task page only draws when invalidated');
  game.notice('领取成功');
  game.loop();
  assert.equal(draws, 2, 'a new toast redraws a static page');
  game.ui.toastUntil = Date.now() - 1;
  game.loop();
  assert.equal(draws, 3, 'an expired toast is removed from the screen');
  handlers.hide();
  handlers.show();
  game.loop();
  assert.equal(draws, 4, 'returning to the foreground redraws the page');
  game.ui.page = 'home';
  game.lastAnimationDraw = 0;
  game.loop();
  game.lastAnimationDraw = Date.now() + 1000;
  game.loop();
  assert.equal(draws, 4, 'pet animation does not repaint the full canvas');
  assert.equal(animationDraws, 1, 'pet animation is paced below the display frame rate');
  game.lastAnimationDraw = 0;
  game.loop();
  assert.equal(animationDraws, 2, 'pet animation still advances after its interval');
  game.ui.showSettings = true;
  game.needsDraw = true;
  game.loop();
  game.loop();
  assert.equal(draws, 5, 'settings get one full redraw');
  assert.equal(animationDraws, 2, 'settings pause the covered pet animation');
  game.ui.showSettings = false;
  game.ui.page = 'game';
  game.ui.playing = true;
  game.ui.paused = false;
  game.ui.remaining = 20;
  game.ui.spawnTimer = 100;
  game.ui.stars = [];
  game.lastAnimationDraw = 0;
  game.loop();
  game.loop();
  assert.equal(animationDraws, 4, 'active game animation keeps drawing every frame');
});

test('main actions stay reachable on a shorter portrait screen', async () => {
  const { default: Scene } = await import('../js/scene.js');
  const { initialState, adopt } = await import('../js/model.js');
  const context = new Proxy({}, { get(target, key) { return target[key] || (() => {}); } });
  const canvas = { width: 390, height: 680 };
  const scene = new Scene(context, canvas);
  const state = initialState();
  const ui = { page: 'home', speech: '', expressionUntil: 0, action: '', statDelta: '' };
  scene.draw(state, ui);
  assert.deepEqual(scene.buttons.map(button => button.id), ['adopt_selected'],
    'first visit has one clear adoption action');
  adopt(state, 'cat');
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

test('animation redraw stays in the scene area and preserves touch targets', async () => {
  const { default: Scene } = await import('../js/scene.js');
  const { initialState, adopt } = await import('../js/model.js');
  const rectangles = [];
  const context = new Proxy({ rect: (...args) => rectangles.push(args) },
    { get(target, key) { return target[key] || (() => {}); } });
  const scene = new Scene(context, { width: 390, height: 844 });
  const state = initialState();
  const ui = { page: 'home', speech: '', expressionUntil: 0, action: '', statDelta: '' };
  for (const height of [680, 844]) {
    scene.canvas.height = height;
    for (const page of ['home', 'collection', 'game']) {
      if (page === 'collection' && !state.active) adopt(state, 'cat');
      ui.page = page;
      ui.playing = page === 'game';
      ui.stars = [];
      scene.draw(state, ui);
      const targets = scene.buttons.map(button => ({ ...button }));
      rectangles.length = 0;
      scene.drawAnimation(state, ui);
      assert.deepEqual(scene.buttons, targets, `${page} keeps touch targets at ${height}px`);
      assert.equal(rectangles.length, 1, `${page} clips one animated area`);
      const [x, y, width, clipHeight] = rectangles[0];
      assert.ok(x > 0 && width < 390 && y > 0 && clipHeight < scene.h,
        `${page} avoids a full-canvas repaint at ${height}px`);
    }
  }
});

test('essential captions remain readable on a narrow short screen', async () => {
  const { default: Scene } = await import('../js/scene.js');
  const { initialState, adopt, TASKS } = await import('../js/model.js');
  const context = new Proxy({}, { get: () => () => {} });
  const scene = new Scene(context, { width: 320, height: 568 });
  scene.setViewport({ width: 320, height: 568, top: 24, bottom: 34, menuBottom: 60 });
  const state = initialState();
  adopt(state, 'cat');
  const ui = { page: 'home', expressionUntil: 0 };
  const labels = [];
  const drawPage = page => {
    ui.page = page;
    labels.length = 0;
    scene.draw(state, ui, ui.coinWaysForId ? coinWays(state, ui.coinWaysForId) : null);
    assert.equal(scene.scale, .75);
  };
  const originalText = scene.text.bind(scene);
  scene.text = (value, x, y, size, ...rest) => {
    labels.push({ value: String(value), x, y, size });
    originalText(value, x, y, size, ...rest);
  };
  const readable = value => {
    const label = labels.find(item => item.value === value);
    assert.ok(label, `${value} is visible`);
    assert.ok(label.size * scene.scale >= 11, `${value} is at least 11 screen pixels`);
    return label;
  };

  drawPage('home');
  for (const value of ['小屋', '萌宠', '任务', '游戏', '喂食', '清洁',
    '饱腹', '免费']) readable(value);
  const action = readable('喂食');
  const hint = readable('✦ 5');
  assert.ok((hint.y - action.y - (hint.size + action.size) / 2) * scene.scale >= 3,
    'action label and hint retain a visible gap');

  drawPage('collection');
  readable('一只喜欢晒太阳的小猫');
  readable('未领养 · 需 80 爪爪币');
  readable('还差 20 爪爪币');
  readable('获取爪爪币');
  ui.coinWaysForId = 'rabbit';
  drawPage('collection');
  readable('领养糯米还差 20 爪爪币');
  readable('领取今日礼物 · +30');
  readable('每局最多 +30 爪爪币，可能 +0');
  const closeCoinWays = scene.buttons.find(button => button.id === 'coin_ways_close');
  assert.ok(closeCoinWays && closeCoinWays.y + closeCoinWays.h < scene.h,
    'the coin routes layer keeps its close action on the short screen');
  ui.coinWaysScroll = 999;
  const modalUi = structuredClone(ui);
  drawPage('collection');
  assert.deepEqual(ui, modalUi, 'drawing the coin routes leaves UI state with Main');
  ui.coinWaysForId = null;

  state.coins = 80;
  drawPage('collection');
  const price = readable('未领养 · 需 80 爪爪币');
  const adoptionButton = scene.buttons.find(button => button.id === 'adopt_rabbit');
  assert.ok(adoptionButton);
  assert.ok((adoptionButton.y - price.y - price.size / 2) * scene.scale >= 3,
    'affordable price stays above the adoption button on a short screen');
  ui.adoptionConfirmId = 'rabbit';
  drawPage('collection');
  readable('用 80 爪爪币领养糯米？');
  readable('领养后剩余 0 爪爪币');
  assert.ok(scene.buttons.some(button => button.id === 'adopt_confirm'));
  ui.adoptionConfirmId = null;

  drawPage('tasks');
  readable(TASKS[0].label);
  readable('去完成 →');
  const summary = labels.find(item => item.value.startsWith('今天已完成'));
  const slogan = readable('把小事变成好回忆  ✦');
  assert.ok(summary && slogan.y - summary.y >= 20,
    'task summary and decorative caption use separate lines on a short screen');

  drawPage('game');
  readable('每局 20 秒 · 星星越多奖励越多');
  readable('玩法说明  ›');
});

test('header controls stay below the native WeChat menu on different screens', async () => {
  const { default: Scene } = await import('../js/scene.js');
  const { initialState, adopt } = await import('../js/model.js');
  const context = new Proxy({}, { get: () => () => {} });
  const state = initialState();
  adopt(state, 'cat');
  const ui = { page: 'home', expressionUntil: 0 };
  for (const device of [
    { width: 390, height: 844, safeTop: 0, menuTop: 12, menuBottom: 45 },
    { width: 320, height: 568, safeTop: 17, menuTop: 12, menuBottom: 47 },
    { width: 390, height: 680, safeTop: 0, menuTop: 50, menuBottom: 83 },
  ]) {
    globalThis.wx = {
      getSystemInfoSync: () => ({ windowWidth: device.width, screenHeight: device.height,
        safeArea: { top: device.safeTop, bottom: device.height } }),
      getMenuButtonBoundingClientRect: () => ({ top: device.menuTop,
        bottom: device.menuBottom, left: device.width - 118, right: device.width - 10 }),
    };
    const scene = new Scene(context, { width: device.width, height: device.height });
    scene.draw(state, ui);
    const button = scene.buttons.find(item => item.id === 'settings');
    assert.ok(button, 'settings remains reachable');
    const buttonTopPx = scene.offsetY + button.y * scene.scale;
    assert.ok(buttonTopPx >= device.menuBottom + 10 - .01,
      `${device.width}x${device.height}: settings clears the native menu`);
    assert.equal(scene.hit(button.x + button.w / 2, button.y + button.h / 2), 'settings');
  }
  globalThis.wx = { getMenuButtonBoundingClientRect: () => ({ top: 0, bottom: 0 }) };
  const fallback = new Scene(context, { width: 390, height: 680 });
  fallback.draw(state, ui);
  assert.equal(fallback.buttons.find(item => item.id === 'settings').y, 64);
});

test('every page gives its heading more prominence than its description', async () => {
  const { default: Scene } = await import('../js/scene.js');
  const { initialState, adopt } = await import('../js/model.js');
  const context = new Proxy({}, { get(target, key) { return target[key] || (() => {}); } });
  const adopted = initialState();
  adopt(adopted, 'cat');
  const pages = [
    { page: 'welcome', state: initialState(), heading: '欢迎来到小屋',
      description: '一起慢慢长大' },
    { page: 'home', state: adopted, heading: '陪伴日记',
      description: '今天也一起慢慢长大' },
    { page: 'collection', state: adopted, heading: '小伙伴们',
      description: '每一位都值得被珍惜' },
    { page: 'tasks', state: adopted, heading: '每日清单',
      description: '今天的小小约定' },
    { page: 'game', state: adopted, heading: '星星接接乐',
      description: '把星光装进小篮子' },
  ];
  const sharedCoins = new Map();
  for (const height of [680, 844]) {
    for (const page of pages) {
      const scene = new Scene(context, { width: 390, height });
      const labels = [], boxes = [];
      scene.text = (value, x, y, size) => labels.push({ value, x, y, size });
      scene.box = (x, y, w, h, r, fill) => boxes.push({ x, y, w, h, fill });
      scene.draw(page.state, { page: page.page, guideStep: 0, expressionUntil: 0 });
      const heading = labels.find(label => label.value === page.heading);
      const description = labels.find(label => label.value === page.description);
      assert.ok(heading && description, `${page.page}: both header lines render`);
      assert.ok(heading.size > description.size,
        `${page.page}: heading is larger than its description`);
      assert.equal(heading.x, description.x, `${page.page}: both lines align`);
      assert.ok(heading.y + heading.size / 2 < description.y - description.size / 2,
        `${page.page}: header lines do not overlap`);
      const contentTop = page.page === 'home' ? scene.homeLayout().sceneY : scene.layout().sceneY;
      assert.ok(description.y + description.size / 2 < contentTop,
        `${page.page}: description clears content on ${height}px screen`);
      const coin = boxes.find(box => box.fill === '#F1DFC5');
      assert.ok(coin, `${page.page}: coin appears in the shared header`);
      const coinBounds = { x: coin.x, y: coin.y, w: coin.w, h: coin.h };
      if (!sharedCoins.has(height)) sharedCoins.set(height, coinBounds);
      assert.deepEqual(coinBounds, sharedCoins.get(height),
        `${page.page}: coin position matches every other page`);
      assert.ok(coin.y + coin.h < contentTop,
        `${page.page}: coin clears content on ${height}px screen`);
    }
  }
});

test('large home scene, action dock and colored arcs fit on short and tall screens', async () => {
  const { default: Scene } = await import('../js/scene.js');
  const { initialState, adopt } = await import('../js/model.js');
  const context = new Proxy({}, { get(target, key) { return target[key] || (() => {}); } });
  const state = initialState();
  adopt(state, 'cat');
  const ui = { page: 'home', speech: '', expressionUntil: 0, action: '', statDelta: '' };
  for (const height of [680, 844]) {
    const scene = new Scene(context, { width: 390, height });
    const boxes = [], labels = [], arcs = [];
    scene.box = (x, y, w, h, r, fill) => boxes.push({ x, y, w, h, fill });
    scene.text = (value, x, y) => labels.push({ value, x, y });
    scene.drawHomeGauge = (x, y, value, color) => arcs.push({ x, y, value, color });
    scene.draw(state, ui);
    const layout = scene.homeLayout();
    const dock = boxes.find(box => box.x === layout.dockX && box.y === layout.dockY &&
      box.w === layout.dockW);
    assert.ok(dock, `${height}px: care actions sit in the scene dock`);
    assert.ok(layout.sceneH >= 340, `${height}px: pet scene remains large`);
    assert.ok(layout.sceneBottom < layout.gaugeY,
      `${height}px: scene clears the arc row`);
    assert.equal(arcs.length, 4);
    assert.equal(new Set(arcs.map(arc => arc.color)).size, 4,
      'each state has a distinct arc color');
    assert.ok(arcs.every(arc => arc.y < layout.gaugeBottom &&
      layout.gaugeBottom <= layout.labelY + 1),
      `${height}px: status labels are close to the arcs`);
    assert.ok(layout.labelY + 7 < scene.layout().navY,
      `${height}px: labels clear the navigation`);
    assert.ok(labels.some(label => String(label.value).includes('今日 0/100')));
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

test('approved scene backgrounds load once, crop to cover, and request a redraw', async () => {
  const { default: Scene } = await import('../js/scene.js');
  const requested = [], drawn = [];
  const image = { width: 960, height: 720,
    set src(value) { requested.push(value); } };
  const context = new Proxy({ drawImage: (...args) => drawn.push(args) },
    { get(target, key) { return target[key] || (() => {}); } });
  const scene = new Scene(context, { width: 390, height: 844, createImage: () => image });
  let invalidations = 0;
  scene.onAssetReady = () => { invalidations++; };
  assert.equal(scene.sceneBackdrop('home_afternoon', 35, 150, 320, 160, 20, '#fff'), false);
  assert.deepEqual(requested, ['assets/scenes/scene_home_afternoon.jpg']);
  image.onload();
  assert.equal(invalidations, 1);
  assert.equal(scene.sceneBackdrop('home_afternoon', 35, 150, 320, 160, 20, '#fff'), true);
  assert.deepEqual(drawn[0].slice(1), [0, 120, 960, 480, 35, 150, 320, 160]);
  assert.equal(requested.length, 1, 'loaded background is cached');
});

test('all care and game scenes preload once and redraw when an image arrives', async () => {
  const { default: Scene } = await import('../js/scene.js');
  const requested = [], images = [];
  const context = new Proxy({}, { get: () => () => {} });
  const scene = new Scene(context, { width: 390, height: 680, createImage: () => {
    const image = { width: 960, height: 720, set src(value) { requested.push(value); } };
    images.push(image);
    return image;
  } });
  let invalidations = 0;
  scene.onAssetReady = () => { invalidations++; };
  scene.preloadSceneImages();
  assert.deepEqual(requested, [
    'assets/scenes/scene_home_afternoon.jpg',
    'assets/scenes/scene_wash_nook.jpg',
    'assets/scenes/scene_play_garden.jpg',
    'assets/scenes/scene_rest_evening.jpg',
    'assets/scenes/scene_star_sky.jpg',
  ]);
  images[1].onload();
  assert.equal(invalidations, 1);
  assert.equal(scene.sceneBackdrop('wash_nook', 20, 136, 350, 165, 23, '#fff'), true);
  scene.preloadSceneImages();
  assert.equal(requested.length, 5, 'scene transitions reuse cached images');
});

test('short game field keeps the moon near the top of the night scene', async () => {
  const { default: Scene } = await import('../js/scene.js');
  const image = { width: 941, height: 1672, set src(value) { this.path = value; } };
  let crop;
  const context = new Proxy({ drawImage: (...args) => { crop = args; } },
    { get(target, key) { return target[key] || (() => {}); } });
  const scene = new Scene(context, { width: 390, height: 680, createImage: () => image });
  scene.sceneBackdrop('star_sky', 36, 153, 318, 360, 21, '#174768', .12);
  image.onload();
  scene.sceneBackdrop('star_sky', 36, 153, 318, 360, 21, '#174768', .12);
  assert.equal(image.path, 'assets/scenes/scene_star_sky.jpg');
  assert.ok(crop[2] < 100, 'the source crop begins high enough to include the moon');
  assert.deepEqual(crop.slice(5), [36, 153, 318, 360]);
});

test('care actions and the star game select their matching backgrounds', async () => {
  const { default: Scene } = await import('../js/scene.js');
  const { initialState, adopt } = await import('../js/model.js');
  const context = new Proxy({}, { get: () => () => {} });
  const scene = new Scene(context, { width: 390, height: 844 });
  const state = initialState();
  adopt(state, 'cat');
  const names = [];
  scene.sceneBackdrop = name => { names.push(name); return true; };
  scene.pet = () => {};
  const ui = { action: '', expression: 'normal', expressionUntil: 0 };
  for (const [action, expected] of [['', 'home_afternoon'], ['feed', 'home_afternoon'],
    ['wash', 'wash_nook'], ['play', 'play_garden'], ['rest', 'rest_evening']]) {
    ui.action = action;
    ui.expressionUntil = action ? Date.now() + 3000 : 0;
    scene.home(state, ui);
    assert.equal(names.at(-1), expected, `${action || 'idle'} background`);
  }
  scene.game(state, { playing: false });
  assert.equal(names.at(-1), 'star_sky');
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
  assert.ok(text.some(value => String(value).includes('今日 0/100')));
  state.pets.cat.dailyGrowth.earned = 100;
  text.length = 0;
  scene.home(state, ui);
  assert.ok(text.some(value => String(value).includes('今日 100/100')));
  ui.expressionUntil = Date.now() - 1;
  text.length = 0;
  scene.home(state, ui);
  assert.deepEqual(pose, { expression: 'need', action: '' });
  assert.ok(text.includes('肚子饿啦，想吃点东西'));
  assert.ok(!text.includes('休息中，补充精力～'));
});
