import test from 'node:test';
import assert from 'node:assert/strict';
import { createSubpackageLoader } from '../js/subpackage-loader.js';

export function fakeClock() {
  let time = 0, nextId = 0;
  const timers = new Map();
  return { now: () => time,
    setTimer(fn, ms) { const id = ++nextId; timers.set(id, { fn, at: time + ms }); return id; },
    clearTimer(id) { timers.delete(id); },
    advance(ms) {
      time += ms;
      for (const [id, timer] of [...timers]) if (timer.at <= time && timers.delete(id)) timer.fn();
    },
    get count() { return timers.size; },
  };
}

function harness(overrides = {}) {
  const clock = fakeClock(), calls = [], states = [];
  let ready = 0;
  const loader = createSubpackageLoader({ ...clock, timeoutMs: 100,
    loadSubpackage(options) {
      const call = { ...options };
      calls.push(call);
      return { onProgressUpdate(fn) { call.progress = fn; } };
    },
    onState: value => states.push(value), onReady: () => ready++, ...overrides });
  return { loader, calls, states, clock, get ready() { return ready; } };
}

test('only two success callbacks unlock startup, in package order', () => {
  const h = harness();
  h.loader.start(); h.loader.start();
  assert.deepEqual(h.calls.map(c => c.name), ['petSprites']);
  h.calls[0].progress({ progress: 100 }); h.calls[0].complete();
  assert.equal(h.ready, 0);
  h.calls[0].success();
  assert.deepEqual(h.calls.map(c => c.name), ['petSprites', 'gameAudio']);
  h.calls[1].success(); h.calls[1].success(); h.calls[0].fail();
  assert.equal(h.ready, 1);
  assert.deepEqual(h.loader.getState().completed, ['petSprites', 'gameAudio']);
  assert.equal(h.clock.count, 0);
});

test('cached synchronous completions work without returned tasks or progress', () => {
  let ready = 0;
  const names = [];
  const loader = createSubpackageLoader({ loadSubpackage: call => { names.push(call.name); call.success(); },
    onReady: () => ready++ });
  loader.start();
  assert.equal(ready, 1);
  assert.deepEqual(names, ['petSprites', 'gameAudio']);
  assert.equal(loader.getState().status, 'ready');
});

test('retry preserves the ready package and ignores all callbacks from the failed attempt', () => {
  const h = harness(); h.loader.start(); h.calls[0].success();
  const old = h.calls[1]; old.fail();
  assert.equal(h.loader.getState().canRetry, true);
  h.loader.retry(); h.loader.retry();
  assert.deepEqual(h.calls.map(c => c.name), ['petSprites', 'gameAudio', 'gameAudio']);
  old.success(); old.fail(); old.progress({ progress: 99 });
  assert.equal(h.ready, 0);
  assert.equal(h.loader.getState().progress, null);
  h.calls[2].success(); assert.equal(h.ready, 1);
});

test('foreground timeout rejects a late success and supports a new first-package attempt', () => {
  const h = harness(); h.loader.start(); const old = h.calls[0];
  h.clock.advance(100);
  assert.equal(h.loader.getState().reason, 'timeout');
  old.success(); assert.equal(h.ready, 0);
  h.loader.retry(); h.calls[1].success(); h.calls[2].success();
  assert.equal(h.ready, 1);
});

test('background duration consumes no foreground timeout budget', () => {
  const h = harness(); h.loader.start(); h.clock.advance(40); h.loader.setVisible(false);
  h.clock.advance(1000); assert.equal(h.loader.getState().status, 'loading');
  h.loader.setVisible(true); h.clock.advance(59);
  assert.equal(h.loader.getState().status, 'loading');
  h.clock.advance(1); assert.equal(h.loader.getState().reason, 'timeout');
});

test('both packages can finish in background but readiness is delivered once on foreground', () => {
  const h = harness(); h.loader.start(); h.loader.setVisible(false);
  h.calls[0].success(); h.calls[1].success();
  assert.equal(h.ready, 0); assert.equal(h.clock.count, 0);
  h.loader.setVisible(true); h.loader.setVisible(false); h.loader.setVisible(true);
  assert.equal(h.ready, 1);
});

test('disposal invalidates callbacks and clears timers without a platform abort method', () => {
  const h = harness(); h.loader.start(); const before = h.states.length;
  h.loader.dispose(); h.calls[0].success(); h.calls[0].fail(); h.calls[0].progress({ progress: 10 });
  h.loader.retry(); h.loader.setVisible(false); h.clock.advance(200);
  assert.equal(h.loader.getState().status, 'disposed'); assert.equal(h.clock.count, 0);
  assert.equal(h.states.length, before); assert.equal(h.ready, 0);
});

test('missing API is not retryable, while a synchronous API exception is retryable', () => {
  const absent = harness({ loadSubpackage: undefined }); absent.loader.start(); absent.loader.retry();
  assert.equal(absent.loader.getState().reason, 'unsupported');
  assert.equal(absent.loader.getState().canRetry, false);
  const thrown = harness({ loadSubpackage() { throw new Error('platform'); } });
  thrown.loader.start();
  assert.equal(thrown.loader.getState().reason, 'load_exception');
  assert.equal(thrown.loader.getState().canRetry, true);
  assert.equal(thrown.clock.count, 0);
});
