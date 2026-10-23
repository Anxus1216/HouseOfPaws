import test from 'node:test';
import assert from 'node:assert/strict';

test('button press clears on release and on leaving its hit area', async () => {
  const context = new Proxy({}, { get(target, key) {
    return key in target ? target[key] : () => {};
  } });
  const handlers = {};
  globalThis.GameGlobal = {};
  globalThis.requestAnimationFrame = () => 1;
  globalThis.wx = {
    createCanvas: () => ({ width: 0, height: 0, getContext: () => context }),
    getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844 }),
    getStorageSync: () => undefined,
    setStorageSync() {},
    onTouchStart: callback => { handlers.start = callback; },
    onTouchMove: callback => { handlers.move = callback; },
    onTouchEnd: callback => { handlers.end = callback; },
    onTouchCancel: callback => { handlers.cancel = callback; },
    onHide() {}, onShow() {},
  };
  const { default: Main } = await import('../js/main.js');
  const game = new Main();
  game.draw();
  const button = game.scene.buttons.find(item => item.id === 'settings');
  assert.ok(button);
  const point = (x, y) => ({ clientX: game.scene.offsetX + x * game.scene.scale,
    clientY: game.scene.offsetY + y * game.scene.scale });
  const inside = point(button.x + button.w / 2, button.y + button.h / 2);
  handlers.start({ touches: [inside] });
  assert.equal(game.ui.pressedId, 'settings');
  handlers.move({ touches: [point(195, 400)] });
  assert.equal(game.ui.pressedId, null);
  handlers.end({ changedTouches: [inside] });
  assert.equal(game.ui.pressedId, null);
  assert.equal(game.ui.showSettings, true);
  game.draw();
  const sound = game.scene.buttons.find(item => item.id === 'sound_toggle');
  assert.ok(sound);
  const soundPoint = point(sound.x + sound.w / 2, sound.y + sound.h / 2);
  handlers.start({ touches: [soundPoint] });
  assert.equal(game.ui.pressedId, 'sound_toggle');
  game.pressExpiresAt = Date.now() - 1;
  game.loop();
  assert.equal(game.ui.pressedId, null, 'missing touch end cannot leave the switch pressed');
  handlers.start({ touches: [soundPoint] });
  handlers.cancel();
  assert.equal(game.ui.pressedId, null);
  assert.equal(game.ui.showSettings, true);
  game.draw();
  const close = game.scene.buttons.find(item => item.id === 'settings_close');
  assert.ok(close);
  const closePoint = point(close.x + close.w / 2, close.y + close.h / 2);
  handlers.start({ touches: [closePoint] });
  assert.equal(game.ui.pressedId, 'settings_close');
  handlers.end({ changedTouches: [closePoint] });
  assert.equal(game.ui.pressedId, null);
  assert.equal(game.ui.showSettings, false);
});
