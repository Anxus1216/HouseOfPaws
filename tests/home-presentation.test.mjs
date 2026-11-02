import test from 'node:test';
import assert from 'node:assert/strict';
import Scene from '../js/scene.js';
import { initialState, adopt } from '../js/model.js';
import { createHomeDrawers, setDrawerOpen, finishHomeDrawers } from '../js/home-drawers.js';

test('pet stays in scene center through drawer toggles on short and tall screens', () => {
  for (const [width, height] of [[320, 568], [390, 844]]) {
    const context = new Proxy({}, { get: (obj, key) => obj[key] ?? (() => {}) });
    const scene = new Scene(context, { width, height });
    scene.setViewport({ width, height, top: 24, bottom: 34, menuBottom: 60 });
    const state = initialState();
    adopt(state, 'cat');
    state.guide.phase = 'skipped';
    const drawers = createHomeDrawers();
    const positions = [];
    scene.pet = (id, x, y, size) => positions.push({ x, y: y - 20 * size, side: 300 * size });
    for (const [care, status] of [[false, false], [true, false], [true, true], [false, true]]) {
      setDrawerOpen(drawers, 'care', care, 0);
      setDrawerOpen(drawers, 'status', status, 0);
      finishHomeDrawers(drawers);
      scene.draw(state, { page: 'home', homeDrawers: drawers, showHomeAdvice: false });
      const { scene: bounds, statusPanel, statusEntry } = scene.homeGeometry();
      const portrait = positions.at(-1);
      assert.ok(Math.abs(portrait.x - (bounds.x + bounds.w / 2)) < 1e-9);
      assert.ok(Math.abs(portrait.y - (bounds.y + bounds.h / 2)) < 1e-9);
      assert.equal(scene.hit(statusEntry.x + statusEntry.w / 2, statusEntry.y + statusEntry.h / 2), 'home_status_toggle');
      if (status) assert.equal(scene.hit(statusPanel.x + statusPanel.w / 2,
        statusPanel.y + statusPanel.h - 10), 'home_panel');
    }
    assert.deepEqual(positions, Array(4).fill(positions[0]));
  }
});

test('status drawer renders four original semicircular gauges with clamped colored progress', () => {
  const arcs = [];
  const context = new Proxy({}, { get: (obj, key) => obj[key] ?? (() => {}) });
  context.arc = (...args) => arcs.push(args);
  const scene = new Scene(context, { width: 320, height: 568 });
  const labels = [];
  scene.text = (...args) => labels.push(args);
  for (const [value, progressCount] of [[0, 0], [50, 1], [100, 1]]) {
    arcs.length = 0;
    scene.drawHomeGauge(100, 200, value, '#58AA9B', 1);
    assert.equal(arcs.length, 1 + progressCount);
    assert.deepEqual(arcs[0], [100, 200, 18, Math.PI, Math.PI * 2]);
    if (progressCount) assert.equal(arcs[1][4], Math.PI + Math.PI * value / 100);
    assert.equal(labels.at(-1)[0], `${value}%`);
  }
  const state = initialState();
  adopt(state, 'cat');
  state.guide.phase = 'skipped';
  const drawers = createHomeDrawers();
  setDrawerOpen(drawers, 'status', true, 0);
  finishHomeDrawers(drawers);
  const gauges = [];
  scene.drawHomeGauge = (...args) => gauges.push(args);
  scene.draw(state, { page: 'home', homeDrawers: drawers, showHomeAdvice: false });
  assert.equal(gauges.length, 4);
  for (const text of ['饱腹', '清洁', '心情', '精力']) assert.ok(labels.some(args => args[0] === text));
  const { statusPanel, statusEntry, unit } = scene.homeGeometry();
  for (const [x, y] of gauges) {
    assert.ok(x - 20.5 * unit >= statusPanel.x);
    assert.ok(x + 20.5 * unit <= statusPanel.x + statusPanel.w);
    assert.ok(y - 20.5 * unit >= statusEntry.y + statusEntry.h);
    assert.ok(y + 11 * unit <= statusPanel.y + statusPanel.h);
  }
});

test('pet tap responses and low-state speech remain readable beside the advice', () => {
  const scene = new Scene(new Proxy({}, { get: () => () => {} }), { width: 320, height: 568 });
  const state = initialState();
  adopt(state, 'cat');
  state.guide.phase = 'skipped';
  for (const low of [false, true]) {
    state.pets.cat.hunger = low ? 10 : 80;
    const operations = [];
    scene.fabricPanel = (x, y, w, h) => operations.push({ type: 'panel', x, y, w, h });
    scene.readableText = (text, x, y) => operations.push({ type: 'text', text, x, y });
    scene.draw(state, { page: 'home', expression: 'happy',
      expressionUntil: low ? 0 : Date.now() + 10000, speech: '喜欢和你在一起' });
    const expected = low ? '肚子饿啦，想吃点东西' : '喜欢和你在一起';
    const index = operations.findIndex(op => op.text === expected);
    assert.ok(index >= 0, 'the pet response is retained');
    const text = operations[index];
    assert.ok(!operations.slice(index + 1).some(op => op.type === 'panel' &&
      text.x >= op.x && text.x <= op.x + op.w && text.y >= op.y && text.y <= op.y + op.h),
    'no later advice panel paints over the response');
    const bounds = scene.homeGeometry().feedback;
    assert.ok(text.y >= bounds.y && text.y <= bounds.y + bounds.h);
  }
});
