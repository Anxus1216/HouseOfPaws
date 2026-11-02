import test from 'node:test';
import assert from 'node:assert/strict';
import Scene from '../js/scene.js';
import { initialState, adopt } from '../js/model.js';
import { createHomeDrawers, setDrawerOpen } from '../js/home-drawers.js';

test('status percentages and labels retain short-screen proportions across viewports and densities', () => {
  for (const [width, height, top, bottom] of [[320, 568, 20, 0], [393, 852, 59, 34], [430, 932, 62, 34]]) {
    for (const density of [1, 3]) {
      const arcs = [];
      const context = new Proxy({
        arc: (x, y, radius) => arcs.push({ radius, lineWidth: context.lineWidth }),
      }, { get: (target, key) => target[key] ?? (() => {}) });
      const scene = new Scene(context, { width: width * density, height: height * density });
      scene.setViewport({ width, height, top, bottom, left: 0, right: 0, menuBottom: top + 40 });
      scene.resize();
      const unit = 1 / scene.scale;
      const text = [];
      scene.text = (value, x, y, size) => text.push({ value: String(value), x, y, size });
      const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9,
        `${width}x${height} @${density}: expected ${expected}, received ${actual}`);
      for (const value of [0, 45, 80, 99, 100]) {
        arcs.length = text.length = 0;
        scene.drawHomeGauge(100, 100, value, '#599FE0', unit);
        assert.equal(text[0].value, `${value}%`);
        near(text[0].size * scene.scale, 11);
        near((text[0].y - 100) * scene.scale, -5);
        for (const arc of arcs) {
          near(arc.radius * scene.scale, 18);
          near(arc.lineWidth * scene.scale, 5);
        }
      }
      const state = initialState();
      adopt(state, 'cat');
      state.guide.phase = 'skipped';
      const homeDrawers = createHomeDrawers();
      setDrawerOpen(homeDrawers, 'status', true, 0, true);
      text.length = 0;
      scene.draw(state, { page: 'home', homeDrawers, frameNow: 200 });
      const layout = scene.homeGeometry();
      for (const [index, label] of ['饱腹', '清洁', '心情', '精力'].entries()) {
        const item = text.find(item => item.value === label);
        assert.ok(item, `${label} is visible`);
        near(item.size * scene.scale, 11);
        const rowTop = layout.statusPanel.y + layout.statusEntry.h +
          index * (layout.statusPanel.h - layout.statusEntry.h) / 4;
        near((item.y - rowTop) * scene.scale, 36);
      }
      near(layout.statusPanel.w * scene.scale, 52);
      near(layout.statusPanel.h * scene.scale, 268);
    }
  }
});
