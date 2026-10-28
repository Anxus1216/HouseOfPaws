import test from 'node:test';
import assert from 'node:assert/strict';
import Scene from '../js/scene.js';
import { initialState, adopt } from '../js/model.js';

test('one-line advice is vertically centered while its close target remains 44px', () => {
  for (const [width, height] of [[320, 568], [390, 844], [430, 932]]) {
    const scene = new Scene(new Proxy({}, { get: () => () => {} }), { width, height });
    scene.setViewport({ width, height, top: 24, bottom: 34, menuBottom: 60 });
    scene.resize();
    const state = initialState();
    adopt(state, 'cat');
    state.guide.phase = 'skipped';
    const panels = [];
    const texts = [];
    scene.fabricPanel = (x, y, w, h) => panels.push({ x, y, w, h });
    scene.readableText = (text, x, y) => texts.push({ text, x, y });
    scene.homeFeedback(state, {}, scene.homeGeometry(), {}, null, 0);
    assert.equal(texts.length, 1);
    assert.ok(texts[0].text.trim());
    assert.equal(texts[0].y, panels[0].y + panels[0].h / 2);
    const close = scene.buttons.find(button => button.id === 'home_advice_close');
    assert.ok(close.w * scene.scale >= 44 && close.h * scene.scale >= 44);
    panels.length = texts.length = 0;
    scene.homeFeedback(state, {}, scene.homeGeometry(), { speech: '喜欢和你在一起' }, null, 0);
    assert.equal(texts.length, 2);
    assert.ok(Math.abs((texts[0].y + texts[1].y) / 2 - panels[0].y - panels[0].h / 2) < 1e-9);
    assert.ok(Math.abs((texts[1].y - texts[0].y) * scene.scale - 14) < 1e-9);
  }
});
