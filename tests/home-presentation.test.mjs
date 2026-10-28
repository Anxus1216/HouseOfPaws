import test from 'node:test';
import assert from 'node:assert/strict';
import Scene from '../js/scene.js';
import { initialState, adopt } from '../js/model.js';
import { createHomeDrawers, setDrawerOpen, finishHomeDrawers } from '../js/home-drawers.js';

test('status drawer renders four original semicircular gauges with clamped colored progress', () => {
  const arcs = [];
  const context = new Proxy({}, { get: (obj, key) => obj[key] ?? (() => {}) });
  context.arc = (...args) => arcs.push(args);
  const scene = new Scene(context, { width: 320, height: 568 });
  const labels = [];
  scene.readableText = (...args) => labels.push(args);
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
