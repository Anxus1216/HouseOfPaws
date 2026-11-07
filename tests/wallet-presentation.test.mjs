import test from 'node:test';
import assert from 'node:assert/strict';
import Scene from '../js/scene.js';
import { initialState, adopt } from '../js/model.js';

test('wallet and settings live on profile while old main pages keep their content', () => {
  for (const [width, height] of [[320, 568], [390, 844], [430, 932]]) {
    const scene = new Scene(new Proxy({}, { get: () => () => {} }), { width, height });
    scene.setViewport({ width, height, top: 24, bottom: 34,
      left: 0, right: 0, menuBottom: 60 });
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
      const labels = [];
      scene.text = value => labels.push(String(value));
      scene.draw(state, ui);
      assert.ok(!labels.includes('✦ 165'), `${ui.page}: no top wallet`);
      assert.ok(!scene.buttons.some(button => button.id === 'settings'),
        `${ui.page}: no old settings button`);
      assert.ok(scene.buttons.some(button => button.id === `nav_${ui.page}`));
    }
    const labels = [];
    scene.text = value => labels.push(String(value));
    scene.draw(state, { page: 'profile' });
    assert.equal(labels.filter(value => value === '✦ 165').length, 1);
    const settings = scene.buttons.find(button => button.id === 'settings');
    assert.ok(settings);
    assert.ok(settings.w * scene.scale >= 44 && settings.h * scene.scale >= 44);
    assert.ok(scene.offsetY + settings.y * scene.scale >= 70,
      'settings clears the native WeChat menu');
    assert.equal(scene.hit(settings.x + settings.w / 2,
      settings.y + settings.h / 2), 'settings');
  }
});
