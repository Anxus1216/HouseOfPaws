import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER_PROFILE_KEY, normalizePlayerProfile, cachedPlayerProfile,
  authorizationOutcome } from '../js/player-profile.js';
import { adopt } from '../js/model.js';

test('profile data is bounded and authorization results do not accept empty consent', () => {
  assert.deepEqual(normalizePlayerProfile({ nickName: '  小\n明  ', avatarUrl: 'http://bad.example/a' }),
    { nickName: '小明', avatarUrl: '' });
  assert.equal(normalizePlayerProfile({ nickName: '', avatarUrl: 'javascript:bad' }), null);
  assert.equal(normalizePlayerProfile({ nickName: '微信用户', avatarUrl: '' }), null);
  assert.deepEqual(normalizePlayerProfile({ nickName: '微信用户',
    avatarUrl: 'https://example.com/real-avatar' }),
  { nickName: '微信用户', avatarUrl: 'https://example.com/real-avatar' });
  assert.equal(cachedPlayerProfile({ version: 2, nickName: '旧资料' }), null);
  assert.equal(authorizationOutcome({ errMsg: 'getUserInfo:ok', userInfo: { nickName: '小明' } }).kind,
    'invalid');
  assert.equal(authorizationOutcome({ errMsg: 'getUserInfo:ok', rawData: '{}',
    userInfo: { nickName: '微信用户', avatarUrl: '' } }).kind, 'invalid');
  assert.equal(authorizationOutcome({ errMsg: 'getUserInfo:fail auth deny' }).kind,
    'denied');
  assert.equal(authorizationOutcome({ errMsg: 'getUserInfo:fail privacy' }).kind,
    'privacy_required');
});

test('native authorization follows profile visibility and keeps refusal or storage failures usable', async () => {
  const context = new Proxy({}, { get: () => () => {} });
  const saved = {};
  const buttons = [];
  const logs = [];
  const originalInfo = console.info;
  console.info = (...parts) => logs.push(parts);
  globalThis.GameGlobal = {};
  globalThis.requestAnimationFrame = () => 1;
  let permission = true;
  let settingFails = false;
  let failWrite = false;
  const handlers = {};
  globalThis.wx = {
    createCanvas: () => ({ width: 0, height: 0, getContext: () => context }),
    getWindowInfo: () => ({ windowWidth: 320, windowHeight: 568,
      safeArea: { top: 24, bottom: 534 } }),
    getStorageSync: key => saved[key],
    setStorageSync: (key, value) => {
      if (failWrite && key === PLAYER_PROFILE_KEY) throw Error('storage unavailable');
      saved[key] = structuredClone(value);
    },
    removeStorageSync: key => { delete saved[key]; },
    getSetting: ({ success, fail }) => settingFails ? fail() :
      success({ authSetting: { 'scope.userInfo': permission } }),
    getUserInfo: ({ success }) => success({ userInfo: { nickName: '更新的名字', avatarUrl: '' } }),
    createUserInfoButton: options => {
      const button = { options, hidden: false, destroyed: false, listener: null,
        onTap(listener) { this.listener = listener; },
        offTap(listener) { assert.equal(listener, this.listener); this.listener = null; },
        show() { this.hidden = false; }, hide() { this.hidden = true; },
        destroy() { this.destroyed = true; },
        tap(result) { this.listener(result); } };
      buttons.push(button);
      return button;
    },
    onTouchStart() {}, onTouchMove() {}, onTouchEnd() {},
    onHide: listener => { handlers.hide = listener; },
    onShow: listener => { handlers.show = listener; },
  };
  try {
    const { default: Main } = await import('../js/main.js');
    const game = new Main();
    adopt(game.state, 'cat');
    game.state.guide.phase = 'skipped';
    game.requestPage('profile', { immediate: true });
    game.draw();
    const first = buttons.at(-1);
    const target = game.scene.buttons.find(button => button.id === 'profile_authorize');
    assert.ok(first && target);
    assert.equal(first.options.withCredentials, false);
    assert.ok(Math.abs(first.options.style.top -
      (game.scene.offsetY + target.y * game.scene.scale)) < .01);
    assert.ok(first.options.style.height >= 44);

    first.tap({ errMsg: 'getUserInfo:fail auth deny' });
    assert.equal(game.ui.playerProfile, null);
    assert.match(game.ui.toast, /未授权/);
    handlers.hide();
    assert.ok(first.hidden, 'backgrounding hides native hit area');
    handlers.show();
    game.draw();
    assert.equal(first.hidden, false, 'returning to profile restores hit area');
    game.requestPage('home', { immediate: true });
    assert.ok(first.hidden, 'leaving profile hides native hit area immediately');
    game.requestPage('profile', { immediate: true });
    game.draw();
    const second = buttons.at(-1);
    second.tap({ errMsg: 'getUserInfo:ok', rawData: '{}',
      userInfo: { nickName: '真实玩家', avatarUrl: 'https://example.com/avatar' } });
    assert.equal(game.ui.playerProfile.nickName, '真实玩家');
    assert.equal(saved[PLAYER_PROFILE_KEY].nickName, '真实玩家');
    game.draw();
    assert.ok(second.destroyed, 'native button is removed after authorization');
    assert.ok(!game.scene.buttons.some(button =>
      button.id === 'profile_authorize' || button.id === 'profile_clear'));
    handlers.show();
    game.draw();
    assert.equal(game.profileAuthButton, null,
      'returning with a saved profile does not recreate authorization controls');
    game.requestPage('home', { immediate: true });
    settingFails = true;
    game.requestPage('profile', { immediate: true });
    assert.equal(game.ui.playerProfile, null,
      'permission query failure keeps stored private data off screen');
    assert.equal(game.cachedPlayerProfile.nickName, '更新的名字',
      'permission query failure retains the last valid cache for retry');
    settingFails = false;
    permission = false;
    game.refreshPlayerProfile();
    assert.equal(game.ui.playerProfile, null, 'revoked permission clears displayed data');
    assert.equal(saved[PLAYER_PROFILE_KEY], undefined);

    failWrite = true;
    game.handleProfileAuthorization({ errMsg: 'getUserInfo:ok', rawData: '{}',
      userInfo: { nickName: '临时玩家', avatarUrl: '' } });
    assert.equal(game.ui.playerProfile.nickName, '临时玩家',
      'storage failure does not discard the current authorized view');
    assert.equal(saved[PLAYER_PROFILE_KEY], undefined);
    assert.ok(logs.some(parts => parts[0].includes('profile.authorization_result')));
    assert.ok(!JSON.stringify(logs).includes('真实玩家'), 'logs omit personal details');
  } finally { console.info = originalInfo; }
});

test('avatar loading and stale URLs leave the default portrait available', async () => {
  const { default: Scene } = await import('../js/scene.js');
  const images = [];
  let drawCount = 0;
  const context = new Proxy({}, { get: (_, key) => key === 'drawImage' ?
    () => { drawCount++; } : () => {} });
  const canvas = { width: 390, height: 844, createImage: () => {
    const image = { width: 64, height: 64, src: '' };
    images.push(image);
    return image;
  } };
  const scene = new Scene(context, canvas);
  scene.drawProfileAvatar({ avatarUrl: 'https://example.com/one' }, 66, 130);
  assert.equal(drawCount, 0, 'default portrait remains while loading');
  images[0].onload();
  scene.drawProfileAvatar({ avatarUrl: 'https://example.com/one' }, 66, 130);
  assert.equal(drawCount, 1);
  scene.drawProfileAvatar({ avatarUrl: 'https://example.com/two' }, 66, 130);
  images[0].onerror();
  images[1].onerror();
  scene.drawProfileAvatar({ avatarUrl: 'https://example.com/two' }, 66, 130);
  assert.equal(drawCount, 1, 'failed replacement uses the default portrait');
});

test('cached identity waits for current permission before appearing', async () => {
  const context = new Proxy({}, { get: () => () => {} });
  const canvas = { width: 390, height: 844, getContext: () => context };
  globalThis.GameGlobal = { canvas, viewport: { width: 390, height: 844,
    top: 0, bottom: 0, left: 0, right: 0 } };
  globalThis.requestAnimationFrame = () => 1;
  const saved = { [PLAYER_PROFILE_KEY]: { version: 1,
    nickName: '缓存玩家', avatarUrl: '' } };
  let settingResult;
  let refreshedResult;
  globalThis.wx = {
    getStorageSync: key => saved[key],
    setStorageSync: (key, value) => { saved[key] = value; },
    removeStorageSync: key => { delete saved[key]; },
    getSetting: ({ success }) => { settingResult = success; },
    getUserInfo: ({ success }) => { refreshedResult = success; },
    createUserInfoButton: () => ({ onTap() {}, offTap() {}, show() {},
      hide() {}, destroy() {} }),
    onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onHide() {}, onShow() {},
  };
  const { default: Main } = await import('../js/main.js');
  const game = new Main();
  adopt(game.state, 'cat');
  game.state.guide.phase = 'skipped';
  game.requestPage('profile', { immediate: true });
  game.draw();
  assert.equal(game.ui.playerProfile, null, 'cached nickname is hidden while permission is pending');
  settingResult({ authSetting: { 'scope.userInfo': true } });
  assert.equal(game.ui.playerProfile.nickName, '缓存玩家');
  refreshedResult({ userInfo: { nickName: '最新玩家', avatarUrl: '' } });
  assert.equal(game.ui.playerProfile.nickName, '最新玩家');
  game.refreshPlayerProfile();
  settingResult({ authSetting: { 'scope.userInfo': true } });
  refreshedResult({ userInfo: { nickName: '微信用户', avatarUrl: '' } });
  assert.equal(game.ui.playerProfile.nickName, '最新玩家',
    'an anonymous API placeholder does not replace a previously authorized profile');
  assert.equal(saved[PLAYER_PROFILE_KEY].nickName, '最新玩家');
  game.refreshPlayerProfile();
  assert.equal(game.ui.playerProfile, null, 'refresh hides the previous profile until checked');
  settingResult({ authSetting: { 'scope.userInfo': false } });
  assert.equal(game.ui.playerProfile, null);
  assert.equal(saved[PLAYER_PROFILE_KEY], undefined);
});
