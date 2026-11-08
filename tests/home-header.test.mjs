import test from 'node:test';
import assert from 'node:assert/strict';
import Scene from '../js/scene.js';
import { initialState, adopt, care, selectPet } from '../js/model.js';
import { growthSummary } from '../js/growth-info.js';

test('daily cap changes the label while level progress remains independent', () => {
  const now = new Date(2026, 10, 8, 12).getTime();
  const state = initialState(now);
  adopt(state, 'cat', now);
  const pet = state.pets.cat;
  Object.assign(pet, { level: 6, xp: 112, clean: 50 });
  pet.dailyGrowth.earned = 99;
  assert.equal(growthSummary(pet, now).today, '今日上限99/100');
  assert.equal(care(state, 'wash', now).xp, 1);
  assert.deepEqual(growthSummary(pet, now), {
    progress: '还差127成长', ratio: 113 / 240,
    today: '今日成长已达上限', dailyCapped: true,
  });
  assert.equal(growthSummary(pet, now + 86400000).today, '今日上限0/100');
  assert.equal(growthSummary(pet, now + 86400000).ratio, 113 / 240);
  pet.level = 99;
  pet.xp = 0;
  assert.deepEqual(growthSummary(pet, now), {
    progress: '已满级', ratio: 1, today: '今日成长已达上限', dailyCapped: true,
  });
  delete pet.dailyGrowth;
  assert.equal(growthSummary(pet, now).today, '今日上限0/100', 'legacy missing daily data is supported');
});

test('home header fits both daily states and long names with an accessible growth target', () => {
  for (const [width, height] of [[320, 568], [390, 844], [430, 932]]) {
    const context = new Proxy({}, { get: (obj, key) => obj[key] ?? (() => {}) });
    const scene = new Scene(context, { width, height });
    scene.setViewport({ width, height, top: 24, bottom: 34, menuBottom: 60 });
    scene.resize();
    const labels = [];
    const panels = [];
    const boxes = [];
    scene.text = (text, x, y, size, color, align, weight) => labels.push({ text, x, y, size, color, align, weight });
    scene.headerFabricPanel = (...args) => panels.push(args);
    scene.box = (...args) => boxes.push(args);
    const state = initialState();
    adopt(state, 'cat');
    const pet = state.pets.cat;
    Object.assign(pet, { name: '奶糖奶糖奶糖奶糖', level: 6, xp: 112 });
    for (const earned of [32, 100]) {
      pet.dailyGrowth.earned = earned;
      labels.length = panels.length = boxes.length = scene.buttons.length = 0;
      const layout = scene.homeGeometry();
      scene.compactHeader(state, pet, layout);
      const daily = labels.find(label => label.text.startsWith('今日'));
      const name = labels.find(label => label.text.startsWith('奶糖'));
      assert.equal(daily.text, earned === 100 ? '今日成长已达上限' : '今日上限32/100');
      assert.equal(daily.weight, 'bold');
      assert.equal(daily.color, earned === 100 ? '#8A421F' : '#684738');
      const [dailyX, dailyY, dailyW, dailyH] = panels[0];
      assert.ok(name.x + scene.textWidth(name.text, name.size, name.weight) < dailyX);
      assert.ok(dailyX + dailyW <= layout.identity.x + layout.identity.w + 1e-9);
      assert.ok(dailyY + dailyH <= layout.growth.y);
      assert.equal(labels.filter(label => label.text.startsWith('Lv.')).length, 1);
      assert.equal(labels.filter(label => label.text.includes('128')).length, 1);
      assert.ok(labels.every(label => !label.text.includes('%')));
      assert.equal(boxes.length, 2, 'one track and one level fill');
      assert.ok(boxes[0][2] > 0, 'track retains width on the short screen');
      assert.ok(Math.abs(boxes[1][2] / boxes[0][2] - 112 / 240) < 1e-9);
      const target = scene.buttons.find(button => button.id === 'home_growth_help');
      assert.ok(target.h * scene.scale >= 44);
      assert.ok(target.y + target.h <= layout.scene.y + 1e-9);
      assert.equal(scene.hit(target.x + target.w / 2, target.y + target.h / 2), 'home_growth_help');
    }
  }
});

test('header switches from the capped pet to the next pet without retaining daily styling', () => {
  const state = initialState();
  adopt(state, 'cat');
  state.pets.cat.dailyGrowth.earned = 100;
  state.coins = 200;
  adopt(state, 'rabbit');
  selectPet(state, 'cat');
  const scene = new Scene(new Proxy({}, { get: () => () => {} }), { width: 390, height: 844 });
  const labels = [];
  scene.text = value => labels.push(value);
  scene.compactHeader(state, state.pets[state.active], scene.homeGeometry());
  assert.ok(labels.includes('今日成长已达上限'));
  labels.length = 0;
  selectPet(state, 'rabbit');
  scene.compactHeader(state, state.pets[state.active], scene.homeGeometry());
  assert.ok(labels.includes('糯米'));
  assert.ok(labels.includes('今日上限0/100'));
  assert.ok(!labels.includes('今日成长已达上限'));
});
