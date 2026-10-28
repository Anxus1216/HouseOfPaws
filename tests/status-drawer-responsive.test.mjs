import test from 'node:test';
import assert from 'node:assert/strict';
import Scene from '../js/scene.js';
import { initialState, adopt } from '../js/model.js';
import { createHomeDrawers, setDrawerOpen, finishHomeDrawers } from '../js/home-drawers.js';

test('status drawer follows the available scene height with evenly spaced gauges', () => {
  const heights = [];
  for (const [width, height] of [[320, 568], [390, 844], [430, 932]]) {
    const scene = new Scene(new Proxy({}, { get: () => () => {} }), { width, height });
    scene.setViewport({ width, height, top: 24, bottom: 34, menuBottom: 60 });
    const state = initialState();
    adopt(state, 'cat');
    state.guide.phase = 'skipped';
    const drawers = createHomeDrawers();
    setDrawerOpen(drawers, 'status', true, 0);
    finishHomeDrawers(drawers);
    const gauges = [];
    scene.drawHomeGauge = (x, y) => gauges.push({ x, y });
    scene.draw(state, { page: 'home', homeDrawers: drawers, showHomeAdvice: false });
    const { statusPanel: panel, statusEntry: entry, carePanel, unit } = scene.homeGeometry();
    heights.push(panel.h * scene.scale);
    assert.equal(panel.x, entry.x);
    assert.equal(panel.y, entry.y);
    assert.equal(panel.w, entry.w);
    assert.ok(Math.abs(panel.y + panel.h + 8 * unit - carePanel.y) < 1e-9);
    assert.equal(gauges.length, 4);
    const gap = gauges[1].y - gauges[0].y;
    for (let index = 0; index < gauges.length; index++) {
      const gauge = gauges[index];
      assert.ok(gauge.y - 20.5 * unit >= entry.y + entry.h);
      assert.ok(gauge.y + 16.5 * unit <= panel.y + panel.h);
      if (index) assert.ok(Math.abs(gauge.y - gauges[index - 1].y - gap) < 1e-9);
    }
    assert.equal(scene.hit(entry.x + entry.w / 2, entry.y + entry.h / 2), 'home_status_toggle');
  }
  assert.ok(heights[1] > heights[0] * 1.5, 'tall screens extend beyond the old 268px cap');
  assert.ok(heights[2] > heights[1]);
});
