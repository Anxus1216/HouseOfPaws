import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeCareFeedback, careFeedbackTokens, lowStateSummary } from '../js/care-feedback.js';
import { initialState, adopt, care, MAX_COINS } from '../js/model.js';
import { homeAdvice } from '../js/home-advice.js';
import Scene from '../js/scene.js';

const entry = (extra = {}) => ({
  petId: 'cat', action: 'wash', label: '清洁完成', count: 1,
  changes: { clean: 5, happy: 4 }, growth: 10, cost: 0, bonus: 0,
  level: 1, leveled: false, now: 1000, duration: 2500, ...extra,
});

test('consecutive results preserve actual capped deltas, cost, growth and upgrade bonus separately', () => {
  const first = mergeCareFeedback(null, entry());
  const merged = mergeCareFeedback(first, entry({ action: 'feed', now: 1400,
    changes: { hunger: 25, happy: 3 }, growth: 1, cost: 5, bonus: 15, leveled: true, level: 2 }));
  assert.deepEqual(merged.changes, { clean: 5, happy: 7, hunger: 25 });
  assert.equal(merged.growth, 11);
  assert.equal(merged.cost, 5);
  assert.equal(merged.bonus, 15);
  assert.equal(merged.count, 2);
  assert.equal(careFeedbackTokens(merged).rewards.join(' · '), '成长 +11 · 爪爪币 -5 · 升级返币 +15 · 升到 Lv.2 啦');
  assert.equal(mergeCareFeedback(merged, entry({ petId: 'rabbit', now: 1500 })).count, 1);
  assert.equal(mergeCareFeedback(merged, entry({ now: 5000 })).count, 1);
});

test('growth caps explain zero earned growth without inventing nominal growth', () => {
  const feedback = mergeCareFeedback(null, entry({ growth: 0, growthReason: '今日成长已满，照料仍有效' }));
  const rewards = careFeedbackTokens(feedback).rewards;
  assert.deepEqual(rewards, ['今日成长已满，照料仍有效']);
});

test('real full-wallet upgrades retain zero-bonus explanations throughout mixed bursts', () => {
  const state = initialState();
  adopt(state, 'cat');
  const pet = state.pets.cat;
  const now = Date.now();
  Object.assign(pet, { xp: 39, clean: 0 });
  state.coins = MAX_COINS;
  const first = care(state, 'wash', now);
  assert.equal(first.leveled, true);
  assert.equal(first.bonus, 0);
  let feedback = mergeCareFeedback(null, entry({ now, growth: first.xp,
    changes: { clean: pet.clean }, leveled: first.leveled, bonus: first.bonus, level: pet.level }));
  assert.ok(careFeedbackTokens(feedback).rewards.includes('钱包已满，升级返币 0'));
  assert.equal(feedback.zeroBonusUpgrades, 1);

  // Simulate spending between upgrades; the next real free action can return coins.
  state.coins = MAX_COINS - 20;
  pet.xp = pet.level * 40 - 1;
  const second = care(state, 'wash', now + 400);
  assert.equal(second.bonus, 15);
  feedback = mergeCareFeedback(feedback, entry({ now: now + 400, growth: second.xp,
    changes: { clean: 29 }, leveled: second.leveled, bonus: second.bonus, level: pet.level }));
  assert.equal(feedback.bonus, 15);
  assert.equal(feedback.zeroBonusUpgrades, 1);
  assert.ok(careFeedbackTokens(feedback).rewards.includes('累计升级返币 +15'));
  assert.ok(careFeedbackTokens(feedback).rewards.includes('钱包已满，1次升级返币 0'));

  state.coins = MAX_COINS;
  pet.xp = pet.level * 40 - 1;
  const third = care(state, 'wash', now + 800);
  assert.equal(third.bonus, 0);
  feedback = mergeCareFeedback(feedback, entry({ now: now + 800, growth: third.xp,
    changes: { clean: 29 }, leveled: third.leveled, bonus: third.bonus, level: pet.level }));
  assert.equal(feedback.zeroBonusUpgrades, 2);
  assert.ok(careFeedbackTokens(feedback).rewards.includes('钱包已满，2次升级返币 0'));
});

test('low summary uses the selected advice field including its prerequisite', () => {
  const state = initialState();
  adopt(state, 'cat');
  Object.assign(state.pets.cat, { energy: 28, happy: 18, hunger: 80, clean: 80 });
  const advice = homeAdvice(state);
  assert.equal(advice.action, 'rest');
  assert.equal(lowStateSummary(state.pets.cat, advice), '心情18% · 先休息');
});

test('low status remains visible after dismissing normal advice and after successful care', () => {
  const state = initialState();
  adopt(state, 'cat');
  state.guide.phase = 'skipped';
  state.pets.cat.energy = 18;
  const context = new Proxy({}, { get: () => () => {} });
  const view = new Scene(context, { width: 320, height: 568 });
  const labels = [];
  view.readableText = value => labels.push(String(value));
  view.draw(state, { page: 'home', showHomeAdvice: false });
  assert.ok(labels.includes('精力18% · 先休息'));
  labels.length = 0;
  view.draw(state, { page: 'home', showHomeAdvice: false,
    careFeedback: mergeCareFeedback(null, entry({ now: Date.now() })) });
  assert.ok(labels.includes('精力18% · 先休息'));
  assert.ok(labels.some(label => label.includes('清洁 +5')));
  assert.ok(!view.buttons.some(button => button.id === 'home_advice_close'));
});

test('longest result, low status, failed save and a later rejected action stay within reserved bounds', () => {
  const state = initialState();
  adopt(state, 'cat');
  state.guide.phase = 'skipped';
  state.pets.cat.energy = 18;
  const now = Date.now();
  let feedback = null;
  for (let index = 0; index < 4; index++) {
    feedback = mergeCareFeedback(feedback, entry({ now: now + index,
      changes: { hunger: 25, clean: 29, happy: 25, energy: 27 },
      growth: 25, cost: 5, bonus: 15, leveled: true, level: 3 }));
  }
  for (const reason of [null, { text: '奶糖已经吃饱啦', until: now + 5000 }]) {
    const view = new Scene(new Proxy({}, { get: () => () => {} }), { width: 320, height: 568 });
    const panels = [];
    const labels = [];
    view.fabricPanel = (x, y, w, h) => panels.push({ x, y, w, h });
    view.readableText = value => labels.push(String(value));
    const ui = { page: 'home', careFeedback: feedback,
      persistenceWarning: '本机存档暂时不可用', careReason: reason };
    view.draw(state, ui);
    const bounds = view.homeGeometry().feedback;
    const panel = panels.find(item => item.x === bounds.x && item.w === bounds.w);
    assert.ok(panel);
    assert.ok(panel.y >= bounds.y - 1e-9, 'feedback never grows into the fixed pet region');
    assert.ok(panel.y + panel.h <= bounds.y + bounds.h + 1e-9);
    assert.ok(labels.includes('精力18% · 先休息'));
    assert.ok(labels.includes('照料已生效，尚未成功保存'));
    if (reason) {
      assert.ok(labels.includes(reason.text), 'a later rejection takes the explanation carrier');
      assert.equal(ui.careFeedback, feedback, 'explaining a rejection never deletes settled result data');
    } else {
      const text = labels.join('');
      for (const value of ['饱腹 +100', '清洁 +116', '心情 +100', '精力 +108',
        '成长 +100', '爪爪币 -20', '升级返币 +60', '升到 Lv.3 啦']) {
        assert.ok(text.includes(value), `${value} is retained without truncation`);
      }
    }
  }
});

test('mixed zero-bonus upgrade notes fit beside low status and save errors without covering the pet', () => {
  const state = initialState();
  adopt(state, 'cat');
  state.guide.phase = 'skipped';
  state.pets.cat.energy = 18;
  const now = Date.now();
  let feedback = null;
  for (let index = 0; index < 4; index++) {
    feedback = mergeCareFeedback(feedback, entry({ now: now + index,
      changes: { hunger: 25, clean: 29, happy: 25, energy: 27 },
      growth: 25, cost: 5, bonus: index % 2 ? 15 : 0, leveled: true, level: 5 }));
  }
  for (const [width, height] of [[320, 568], [390, 844]]) {
    const view = new Scene(new Proxy({}, { get: () => () => {} }), { width, height });
    view.setViewport({ width, height, top: 24, bottom: 34, left: 0, right: 0, menuBottom: 60 });
    const panels = [];
    const labels = [];
    view.fabricPanel = (x, y, w, h) => panels.push({ x, y, w, h });
    view.readableText = value => labels.push(String(value));
    view.draw(state, { page: 'home', careFeedback: feedback, persistenceWarning: '本机存档暂时不可用' });
    const layout = view.homeGeometry();
    const panel = panels.find(item => item.x === layout.feedback.x && item.w === layout.feedback.w);
    assert.ok(panel.y >= layout.feedback.y - 1e-9);
    assert.ok(panel.y + panel.h <= layout.carePanel.y);
    assert.ok(layout.pet.y + layout.pet.h <= panel.y + 1e-9,
      'fixed portrait area clears even the longest upgrade result');
    assert.ok(labels.join('').includes('累计升级返币 +30'));
    assert.ok(labels.join('').includes('钱包已满，2次升级返币 0'));
    assert.ok(labels.includes('精力18% · 先休息'));
    assert.ok(labels.includes('照料已生效，尚未成功保存'));
  }
});
