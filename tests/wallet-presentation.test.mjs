import test from 'node:test';
import assert from 'node:assert/strict';
import Scene from '../js/scene.js';
import { initialState, adopt } from '../js/model.js';

test('every page uses the restored slim coin capsule with identical window dimensions and type', () => {
  for (const [width, height] of [[320, 568], [390, 844], [430, 932]]) {
    for (const density of [1, 3]) {
      const scene = new Scene(new Proxy({}, { get: () => () => {} }),
        { width: width * density, height: height * density });
      scene.setViewport({ width, height, top: 24, bottom: 34, left: 0, right: 0, menuBottom: 60 });
      const state = initialState();
      adopt(state, 'cat');
      state.coins = 165;
      state.guide.phase = 'skipped';
      const variants = [
        { page: 'home' }, { page: 'collection' }, { page: 'tasks' }, { page: 'game' },
        { page: 'game', playing: true, score: 0, remaining: 20, basketX: 195, stars: [] },
        { page: 'game', gameOutcome: { kind: 'aborted' } },
      ];
      for (const ui of variants) {
        const panels = [];
        const labels = [];
        scene.fabricPanel = (x, y, w, h, radius) => panels.push({ x, y, w, h, radius });
        scene.text = (value, x, y, size) => labels.push({ value: String(value), x, y, size });
        scene.draw(state, ui);
        const geometry = scene.homeGeometry();
        const bounds = geometry.wallet;
        const panel = panels.find(item => item.x === bounds.x && item.y === bounds.y);
        assert.ok(panel, `${ui.page}: wallet capsule is visible`);
        for (const [key, pixels] of [['w', 69], ['h', 32], ['radius', 16]])
          assert.ok(Math.abs(panel[key] * scene.scale - pixels) < 1e-9);
        const coinLabels = labels.filter(item => item.value === '✦  165');
        assert.equal(coinLabels.length, 1, `${ui.page}: one shared coin display`);
        assert.ok(Math.abs(coinLabels[0].size * scene.scale - 13) < 1e-9);
        assert.ok(Math.abs(coinLabels[0].y - panel.y - panel.h / 2 - 1 / scene.scale) < 1e-9);
        const settings = scene.buttons.find(item => item.id === 'settings');
        assert.ok(settings);
        assert.ok(Math.abs((settings.x - panel.x - panel.w) * scene.scale - 4) < 1e-9);
        assert.ok(Math.abs((panel.x - geometry.identity.x - geometry.identity.w) * scene.scale - 4) < 1e-9,
          'long pet names retain a gap before the wider coin capsule');
        assert.ok(settings.w * scene.scale >= 44 && settings.h * scene.scale >= 44);
        assert.equal(scene.hit(settings.x + settings.w / 2, settings.y + settings.h / 2), 'settings');
        assert.ok(scene.offsetY + panel.y * scene.scale > 60, 'capsule clears native WeChat controls');
      }
      state.active = null;
      scene.draw(state, { page: 'home', debugEnabled: false });
      assert.ok(!scene.buttons.some(item => item.id === 'settings'), 'welcome preserves hidden settings');
      scene.draw(state, { page: 'home', debugEnabled: true });
      assert.ok(scene.buttons.some(item => item.id === 'settings'), 'debug welcome preserves settings access');
    }
  }
});
