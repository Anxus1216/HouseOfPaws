import test from 'node:test';
import assert from 'node:assert/strict';

test('settings entry, numeric keypad, save and disabled mode work through touch events', async () => {
  const context = new Proxy({}, { get(target, key) { return target[key] || (() => {}); } });
  const stored = {};
  const handlers = {};
  globalThis.GameGlobal = {};
  globalThis.requestAnimationFrame = () => 1;
  globalThis.wx = {
    createCanvas: () => ({ width: 0, height: 0, getContext: () => context }),
    getWindowInfo: () => ({ windowWidth: 390, windowHeight: 680 }),
    getStorageSync: key => stored[key],
    setStorageSync: (key, value) => { stored[key] = structuredClone(value); },
    onTouchStart: callback => { handlers.start = callback; },
    onTouchMove: callback => { handlers.move = callback; },
    onTouchEnd: callback => { handlers.end = callback; },
    onHide() {}, onShow() {},
  };
  const { default: Main } = await import('../js/main.js');
  const game = new Main({ debugEnabled: true });
  const tapId = id => {
    game.scene.draw(game.state, game.ui);
    const button = game.scene.buttons.find(item => item.id === id);
    assert.ok(button, `button ${id} is visible`);
    const point = { clientX: button.x + button.w / 2, clientY: button.y + button.h / 2 };
    handlers.start({ touches: [point] });
    handlers.end({ changedTouches: [point] });
  };
  const swipeList = (fromY, toY) => {
    game.scene.draw(game.state, game.ui);
    handlers.start({ touches: [{ clientX: 195, clientY: fromY }] });
    handlers.move({ touches: [{ clientX: 195, clientY: toY }] });
    handlers.end({ changedTouches: [{ clientX: 195, clientY: toY }] });
  };
  tapId('settings');
  tapId('debug_open');
  assert.equal(game.ui.debugDraft.petId, null);
  tapId('debug_field:coins');
  tapId('debug_key:清空');
  tapId('debug_key:4');
  tapId('debug_key:2');
  tapId('debug_key:完成');
  tapId('debug_save');
  assert.equal(game.state.coins, 42);
  assert.equal(stored.paw_house_save_v1.coins, 42);
  assert.equal(game.ui.debugEditor, null);

  tapId('adopt_selected');
  tapId('guide_skip');
  tapId('settings');
  tapId('debug_open');
  tapId('debug_field:hunger');
  for (const key of ['1', '.', '2', '3', '4']) tapId(`debug_key:${key}`);
  assert.equal(game.ui.debugDraft.values.hunger, '1.23');
  tapId('debug_key:完成');
  tapId('debug_cancel');
  tapId('debug_discard');
  tapId('settings_close');
  tapId('settings');
  tapId('debug_open');
  swipeList(520, 200);
  assert.ok(game.ui.debugEditor.scroll > 0);
  tapId('debug_field:coins');
  tapId('debug_key:9');
  tapId('debug_key:完成');
  tapId('debug_cancel');
  assert.equal(game.ui.debugEditor.confirmDiscard, true);
  tapId('debug_discard');
  assert.equal(game.state.coins, 42);
  assert.equal(game.ui.showSettings, true);
  tapId('settings_close');
  game.ui.debugEnabled = false;
  tapId('settings');
  game.scene.draw(game.state, game.ui);
  assert.equal(game.scene.buttons.some(item => item.id === 'debug_open'), false);
  game.openDebugEditor();
  assert.equal(game.ui.debugEditor, null);
});

test('editor hit areas and fixed actions stay within short and tall screens', async () => {
  const { default: Scene } = await import('../js/scene.js');
  const { initialState, adopt } = await import('../js/model.js');
  const { createDebugDraft } = await import('../js/debug-editor.js');
  const context = new Proxy({}, { get(target, key) { return target[key] || (() => {}); } });
  const state = initialState();
  adopt(state, 'cat');
  for (const height of [680, 844]) {
    const scene = new Scene(context, { width: 390, height });
    const ui = { page: 'home', guideStep: 0, showSettings: false, debugEnabled: true,
      debugDraft: createDebugDraft(state), debugEditor: {
        scroll: 0, maxScroll: 0, errors: {}, message: '', confirmDiscard: false,
      }, debugKeyboard: null };
    for (const position of ['top', 'bottom', 'keypad']) {
      if (position === 'bottom') ui.debugEditor.scroll = 9999;
      if (position === 'keypad') ui.debugKeyboard = {
        key: 'hunger', label: '饱腹', before: '76', replace: true, decimal: true,
      };
      scene.draw(state, ui);
      assert.ok(scene.buttons.length > 0);
      assert.equal(scene.buttons.some(button => ['debug_up', 'debug_down'].includes(button.id)), false);
      if (!ui.debugKeyboard) {
        const cancel = scene.buttons.find(button => button.id === 'debug_cancel');
        const save = scene.buttons.find(button => button.id === 'debug_save');
        assert.ok(cancel && save && cancel.x + cancel.w < save.x);
      }
      for (const button of scene.buttons) {
        assert.ok(button.x >= 0 && button.x + button.w <= 390, `${height}:${button.id} width`);
        assert.ok(button.y >= 0 && button.y + button.h <= scene.h,
          `${height}:${button.id} height`);
      }
      const viewport = scene.debugViewport(ui);
      for (const button of scene.buttons.filter(item => item.id.startsWith('debug_field:'))) {
        assert.ok(button.y >= viewport.top && button.y + button.h <= viewport.bottom,
          `${height}:${button.id} stays inside scroller`);
      }
    }
  }
});
