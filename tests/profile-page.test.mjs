import test from 'node:test';
import assert from 'node:assert/strict';

test('profile page shows live player summary, wallet, pet, and the existing settings dialog', async () => {
  const { default: Scene } = await import('../js/scene.js');
  const { initialState, adopt } = await import('../js/model.js');
  const state = initialState();
  adopt(state, 'cat');
  state.coins = 165;
  state.totalActions = 12;
  for (const [width, height] of [[320, 568], [390, 844]]) {
    const scene = new Scene(new Proxy({}, { get: () => () => {} }), { width, height });
    const labels = [];
    const originalText = scene.text.bind(scene);
    scene.text = (value, ...args) => { labels.push(String(value)); originalText(value, ...args); };
    scene.draw(state, { page: 'profile' });
    for (const label of ['我的', '本机玩家', '✦ 165', '奶糖'])
      assert.ok(labels.includes(label), `${width}x${height}: ${label}`);
    assert.ok(labels.some(label => label.includes('照料 12 次')));
    for (const id of ['nav_home', 'nav_collection', 'nav_tasks', 'nav_game',
      'nav_profile', 'profile_tasks', 'profile_home', 'settings']) {
      const button = scene.buttons.find(item => item.id === id);
      assert.ok(button, `${width}x${height}: ${id}`);
      assert.equal(scene.hit(button.x + button.w / 2, button.y + button.h / 2), id);
    }
    const returnButton = scene.buttons.find(item => item.id === 'profile_home');
    const nav = scene.buttons.find(item => item.id === 'nav_home');
    assert.ok(returnButton.y + returnButton.h < nav.y,
      `${width}x${height}: profile content clears navigation`);
    scene.draw(state, { page: 'profile', showSettings: true });
    assert.ok(scene.buttons.some(button => button.id === 'sound_toggle'));
    assert.ok(scene.buttons.some(button => button.id === 'settings_close'));
  }
});

test('profile is a peer page in the existing fade transition', async () => {
  const { createTransition, requestTransition, advanceTransition } =
    await import('../js/page-transition.js');
  const transition = createTransition('home');
  assert.equal(requestTransition(transition, 'profile', 0).accepted, true);
  assert.equal(advanceTransition(transition, 180).displayPage, 'profile');
  assert.equal(requestTransition(transition, 'tasks', 200).accepted, true);
});
