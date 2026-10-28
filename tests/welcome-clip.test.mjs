import test from 'node:test';
import assert from 'node:assert/strict';
import Scene from '../js/scene.js';
import { initialState, adopt } from '../js/model.js';

test('welcome adoption stays fully inside the rendered safe area on short and tall screens', () => {
  for (const [width, height] of [[320, 568], [390, 844]]) {
    const rectangles = [];
    const context = new Proxy({ rect: (x, y, w, h) => rectangles.push({ x, y, w, h }) },
      { get: (target, key) => target[key] || (() => {}) });
    const scene = new Scene(context, { width, height });
    scene.setViewport({ width, height, top: 24, bottom: 34, left: 0, right: 0,
      menuBottom: 60, pixelRatio: 1 });
    const state = initialState();
    scene.draw(state, { page: 'home' });
    const navigation = scene.homeGeometry().nav;
    const clip = rectangles.find(r => r.x === navigation.x && r.y === 0 && r.w === navigation.w);
    const button = scene.buttons.find(b => b.id === 'adopt_selected');
    assert.ok(clip && button);
    assert.ok(button.y >= clip.y && button.y + button.h <= clip.y + clip.h,
      'the complete visible adoption button matches its clickable region');
    assert.ok(scene.offsetY + (button.y + button.h) * scene.scale <= height - 34);
    assert.ok(!scene.buttons.some(b => b.id.startsWith('nav_')));

    rectangles.length = 0;
    adopt(state, 'cat');
    state.guide.phase = 'skipped';
    scene.draw(state, { page: 'home' });
    const homeClip = rectangles.find(r => r.x === navigation.x && r.y === 0 && r.w === navigation.w);
    assert.equal(homeClip.h, navigation.y, 'normal pages still protect the navigation');
  }
});
