import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { startGameWithPackages } from '../js/startup.js';

function harness({ metrics = { windowWidth: 390, windowHeight: 844, pixelRatio: 2 },
  missingApi = false, throwStart = false, offSupported = true } = {}) {
  let time = 0, nextTimer = 0, started = 0;
  const timers = new Map(), handlers = new Map(), calls = [], texts = [], rects = [];
  const context = new Proxy({ fillText: text => texts.push(text), fillRect: (...args) => rects.push(args) },
    { get: (object, key) => object[key] ?? (() => {}) });
  const canvas = { width: 390, height: 844, getContext: () => context };
  const platform = { getWindowInfo: () => metrics };
  for (const event of ['TouchStart', 'TouchEnd', 'TouchCancel', 'Hide', 'Show', 'WindowResize']) {
    handlers.set(event, new Set());
    platform[`on${event}`] = listener => handlers.get(event).add(listener);
    if (offSupported) platform[`off${event}`] = listener => handlers.get(event).delete(listener);
  }
  if (!missingApi) platform.loadSubpackage = options => { calls.push(options); return {}; };
  globalThis.GameGlobal = {};
  const controller = startGameWithPackages({ platform, canvas, timeoutMs: 100,
    now: () => time, setTimer(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, at: time + ms }); return id; },
    clearTimer: id => timers.delete(id), startGame() { started++; if (throwStart) throw new Error('constructor failure'); } });
  const emit = (event, payload = {}) => { for (const callback of [...handlers.get(event)]) callback(payload); };
  return { controller, canvas, context, handlers, calls, texts, rects, emit, metrics,
    tick(ms = 0) { time += ms; for (const [id, timer] of [...timers]) if (timer.at <= time && timers.delete(id)) timer.fn(); },
    ready() { calls[0].success(); calls[1].success(); },
    tapRetry() {
      const [x, y, w, h] = rects.at(-1);
      const touch = { clientX: x + w / 2, clientY: y + h / 2 };
      emit('TouchStart', { touches: [touch] }); emit('TouchEnd', { changedTouches: [touch] });
    },
    get started() { return started; }, get timerCount() { return timers.size; } };
}

test('startup waits for resources, reuses its canvas and hands off once with clean listeners', () => {
  const h = harness();
  assert.ok(h.texts.includes('正在准备小伙伴（1/2）'));
  assert.equal(h.started, 0);
  h.ready(); assert.equal(h.started, 0); h.tick();
  assert.equal(h.started, 1); assert.equal(h.timerCount, 0);
  assert.ok([...h.handlers.values()].every(listeners => listeners.size === 0));
  h.calls[1].success(); h.tick(); assert.equal(h.started, 1);
  assert.equal(h.context.globalAlpha, 1);
});

test('ready handoff queued before hide is rescheduled after show', () => {
  const h = harness(); h.ready(); h.emit('Hide'); h.tick();
  assert.equal(h.started, 0);
  h.emit('Show'); h.tick(); assert.equal(h.started, 1);
});

test('background completion stays quiet and missing off methods leave inert handlers', () => {
  const h = harness({ offSupported: false }); h.emit('Hide');
  const before = h.texts.length; h.ready(); h.tick();
  assert.equal(h.texts.length, before); assert.equal(h.started, 0);
  h.emit('Show'); h.tick(); const after = h.texts.length;
  h.emit('Hide'); h.emit('Show'); h.emit('WindowResize'); h.tick(1000);
  assert.equal(h.texts.length, after); assert.equal(h.started, 1);
});

for (const metrics of [{ windowWidth: 320, windowHeight: 568, pixelRatio: 3 },
  { windowWidth: 390, windowHeight: 844, pixelRatio: 2 }]) {
  test(`failure retry uses logical coordinates at ${metrics.windowWidth}x${metrics.windowHeight}`, () => {
    const h = harness({ metrics }); h.calls[0].success(); h.calls[1].fail();
    assert.ok(h.texts.includes('重试'));
    const [x, y, w, height] = h.rects.at(-1);
    assert.ok(w >= 44 && height >= 44 && x >= 0 && y + height <= metrics.windowHeight - 34);
    h.tapRetry(); h.tapRetry();
    assert.equal(h.calls.length, 3); assert.equal(h.calls[2].name, 'gameAudio');
    h.calls[2].success(); assert.equal(h.started, 0); h.tick(); assert.equal(h.started, 1);
  });
}

test('unsupported API has an update message and cannot start the game', () => {
  const h = harness({ missingApi: true }); h.tick(1000);
  assert.ok(h.texts.includes('请更新微信后重新打开')); assert.equal(h.started, 0);
  assert.equal(h.controller.getState().canRetry, false); h.controller.dispose();
});

test('a game constructor exception shows a reopen message without a second instance', () => {
  const h = harness({ throwStart: true }); h.ready(); h.tick();
  assert.ok(h.texts.includes('请重新打开小游戏'));
  h.emit('Show'); h.tick(); assert.equal(h.started, 1);
});

test('real game.js defers storage, audio and the game loop until both resource packages finish', () => {
  const entryUrl = new URL('../game.js', import.meta.url).href;
  const script = `
    import assert from 'node:assert/strict';
    let canvases=0, reads=0, frames=0, audio=0; const packages=[]; const ready=new Set();
    const ctx=new Proxy({}, {get:(o,k)=>o[k]||(()=>{})});
    const canvas={width:390,height:844,getContext:()=>ctx,createImage(){
      return {set src(value){assert.ok(!value.includes('pets/sprites')||ready.has('petSprites'));this.onload?.();},width:320,height:320};
    }};
    globalThis.GameGlobal={}; globalThis.requestAnimationFrame=()=>{frames++;return 1;};
    globalThis.wx={createCanvas:()=>{canvases++;return canvas;},getWindowInfo:()=>({windowWidth:390,windowHeight:844}),
      loadSubpackage:options=>{packages.push(options);return {};},getStorageSync:()=>{reads++;return null;},setStorageSync(){},
      onTouchStart(){},onTouchMove(){},onTouchEnd(){},onTouchCancel(){},onHide(){},onShow(){},
      createInnerAudioContext:()=>{audio++;return {};}};
    await import(${JSON.stringify(entryUrl)});
    assert.equal(canvases,1);assert.equal(reads,0);assert.equal(frames,0);assert.equal(audio,0);
    ready.add('petSprites');packages[0].success();assert.equal(reads,0);assert.equal(packages[1].name,'gameAudio');
    ready.add('gameAudio');packages[1].success();await new Promise(resolve=>setTimeout(resolve,5));
    assert.ok(reads>0);assert.equal(frames,1);assert.equal(canvases,1);assert.equal(audio,0);
    packages[1].success();await new Promise(resolve=>setTimeout(resolve,5));assert.equal(frames,1);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
