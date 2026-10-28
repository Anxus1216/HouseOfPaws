import test from 'node:test';
import assert from 'node:assert/strict';
import Scene from '../js/scene.js';
import { initialState, adopt } from '../js/model.js';

test('navigation icons and text keep uniform window scale on short, tall and dense screens', () => {
  for (const [width, height] of [[320, 568], [390, 844], [430, 932]]) {
    for (const density of [1, 3]) {
      let matrix = { x: 1, y: 1 };
      const stack = [];
      const context = new Proxy({
        save: () => stack.push({ ...matrix }), restore: () => { matrix = stack.pop(); },
        setTransform: (x, b, c, y) => { matrix = { x, y }; },
        scale: (x, y) => { matrix.x *= x; matrix.y *= y; },
      }, { get: (object, key) => object[key] ?? (() => {}) });
      const scene = new Scene(context, { width: width * density, height: height * density });
      scene.setViewport({ width, height, top: 24, bottom: 34, left: 0, right: 0, menuBottom: 60 });
      scene.resize();
      scene.setLayoutTransform();
      const icons = [];
      const labels = [];
      scene.navIcon = id => icons.push({ id, ...matrix });
      context.fillText = (value, x, y) => labels.push({ value, x, y, font: context.font, ...matrix });
      const state = initialState();
      adopt(state, 'cat');
      state.tasks.progress.care = 3;
      scene.nav('home', state);
      assert.equal(icons.length, 4);
      for (const icon of icons) {
        assert.ok(Math.abs(icon.x - icon.y) < 1e-9, 'icons never stretch vertically');
        assert.ok(Math.abs(icon.x - density) < 1e-9, 'icon dimensions use window pixels');
      }
      for (const value of ['小屋', '萌宠', '任务', '游戏', '待领 1']) {
        const label = labels.find(item => item.value === value);
        assert.ok(label, value);
        assert.ok(Math.abs(label.x - label.y) < 1e-9, 'glyphs never stretch');
        const fontSize = Number(label.font.match(/([\d.]+)px/)[1]);
        assert.ok(Math.abs(fontSize * label.x / density - 11) < 1e-9);
      }
      const nav = scene.homeGeometry().nav;
      for (const [index, target] of scene.buttons.entries()) {
        assert.ok(target.w * scene.scale >= 44 && target.h * scene.scale >= 44);
        assert.ok(Math.abs(target.x - nav.x - index * nav.w / 4) < 1e-9);
        assert.equal(scene.hit(target.x + target.w / 2, target.y + target.h / 2), target.id);
      }
    }
  }
});
