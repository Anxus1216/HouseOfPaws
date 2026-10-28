import test from 'node:test';
import assert from 'node:assert/strict';
import { PAGE_TRANSITION_DURATION_MS, createTransition, requestTransition,
  advanceTransition, finishTransition, transitionFrame } from '../js/page-transition.js';

test('main content fades out, switches only at zero, and fades in within 180 ms', () => {
  const transition = createTransition();
  assert.equal(PAGE_TRANSITION_DURATION_MS, 180);
  assert.deepEqual(transitionFrame(transition), {
    displayPage: 'home', targetPage: 'home', alpha: 1, active: false,
  });
  assert.equal(requestTransition(transition, 'collection', 100).accepted, true);
  let frame = advanceTransition(transition, 145);
  assert.equal(frame.displayPage, 'home');
  assert.equal(frame.targetPage, 'collection');
  assert.equal(frame.alpha, .5);
  frame = advanceTransition(transition, 190);
  assert.equal(frame.displayPage, 'collection');
  assert.equal(frame.alpha, 0);
  assert.equal(frame.active, true);
  assert.equal(advanceTransition(transition, 235).alpha, .5);
  frame = advanceTransition(transition, 280);
  assert.deepEqual(frame, { displayPage: 'collection', targetPage: 'collection',
    alpha: 1, active: false, wasActive: true, changed: true, completed: true });
});

test('the idle completion frame remains distinguishable from later idle frames', () => {
  const transition = createTransition();
  requestTransition(transition, 'tasks', 0);
  const finalFrame = advanceTransition(transition, 180);
  assert.equal(finalFrame.wasActive || finalFrame.changed || finalFrame.completed, true,
    'a static task page still requires a full final redraw and fresh content hits');
  assert.deepEqual(advanceTransition(transition, 181), {
    displayPage: 'tasks', targetPage: 'tasks', alpha: 1, active: false,
    wasActive: false, changed: false, completed: false,
  });
});

test('repeated selection of the latest target never restarts either phase', () => {
  const transition = createTransition();
  assert.equal(requestTransition(transition, 'home', 0).accepted, false);
  requestTransition(transition, 'tasks', 10);
  assert.equal(requestTransition(transition, 'tasks', 55).accepted, false);
  assert.equal(transition.startedAt, 10);
  assert.equal(transition.alpha, .5);
  requestTransition(transition, 'tasks', 145);
  assert.equal(transition.startedAt, 100);
  assert.equal(advanceTransition(transition, 190).completed, true);
});

test('rapid navigation while fading out replaces the target without queuing or delay', () => {
  const transition = createTransition();
  requestTransition(transition, 'collection', 0);
  requestTransition(transition, 'tasks', 20);
  requestTransition(transition, 'game', 70);
  assert.equal(transition.startedAt, 0);
  assert.equal(transition.segmentDurationMs, 90);
  assert.equal(advanceTransition(transition, 90).displayPage, 'game');
  assert.equal(advanceTransition(transition, 180).active, false);
  assert.equal(advanceTransition(transition, 1000).displayPage, 'game');
});

test('returning to the still displayed page reverses continuously instead of replaying it', () => {
  const transition = createTransition();
  requestTransition(transition, 'tasks', 0);
  const frame = requestTransition(transition, 'home', 45);
  assert.equal(frame.alpha, .5);
  assert.equal(frame.displayPage, 'home');
  assert.equal(frame.targetPage, 'home');
  assert.equal(advanceTransition(transition, 67.5).alpha, .75);
  assert.equal(advanceTransition(transition, 90).completed, true);
});

test('new target during fade in starts fading from the visible alpha', () => {
  const transition = createTransition();
  requestTransition(transition, 'collection', 0);
  const frame = requestTransition(transition, 'tasks', 135);
  assert.equal(frame.displayPage, 'collection');
  assert.equal(frame.alpha, .5);
  assert.equal(advanceTransition(transition, 157.5).alpha, .25);
  assert.equal(advanceTransition(transition, 180).displayPage, 'tasks');
  assert.equal(advanceTransition(transition, 270).completed, true);
});

test('a long frame consumes both phases instead of leaving content invisible', () => {
  const transition = createTransition();
  requestTransition(transition, 'tasks', 0);
  const frame = advanceTransition(transition, 500);
  assert.equal(frame.displayPage, 'tasks');
  assert.equal(frame.alpha, 1);
  assert.equal(frame.completed, true);
});

test('a new request after an unpainted completion starts from the now current page', () => {
  const transition = createTransition();
  requestTransition(transition, 'collection', 0);
  const frame = requestTransition(transition, 'tasks', 500);
  assert.equal(frame.displayPage, 'collection');
  assert.equal(frame.targetPage, 'tasks');
  assert.equal(frame.alpha, 1);
  assert.equal(frame.active, true);
  assert.equal(advanceTransition(transition, 680).completed, true);
});

test('zero-duration and immediate navigation complete synchronously', () => {
  const zero = createTransition('home', { durationMs: 0 });
  const frame = requestTransition(zero, 'tasks', 0);
  assert.equal(frame.displayPage, 'tasks');
  assert.equal(frame.alpha, 1);
  assert.equal(frame.active, false);
  assert.equal(frame.completed, true);
  const transition = createTransition();
  requestTransition(transition, 'collection', 10);
  const immediate = requestTransition(transition, 'game', 30, { immediate: true });
  assert.equal(immediate.displayPage, 'game');
  assert.equal(immediate.active, false);
});

test('requesting another page exactly at zero alpha cannot get stuck in a zero-length phase', () => {
  const transition = createTransition();
  requestTransition(transition, 'collection', 0);
  const frame = requestTransition(transition, 'tasks', 90);
  assert.equal(frame.displayPage, 'tasks');
  assert.equal(frame.alpha, 0);
  assert.equal(advanceTransition(transition, 180).completed, true);
});

test('lifecycle completion snaps to the latest target and is idempotent', () => {
  const transition = createTransition();
  requestTransition(transition, 'collection', 0);
  requestTransition(transition, 'tasks', 20);
  const frame = finishTransition(transition);
  assert.deepEqual(frame, { displayPage: 'tasks', targetPage: 'tasks', alpha: 1,
    active: false, wasActive: true, changed: true, completed: true });
  assert.equal(finishTransition(transition).changed, false);
});

test('backward or unavailable clocks do not rewind the frame already displayed', () => {
  const transition = createTransition();
  requestTransition(transition, 'tasks', 100);
  advanceTransition(transition, 145);
  assert.equal(advanceTransition(transition, 120).alpha, .5);
  assert.equal(advanceTransition(transition, NaN).alpha, .5);
  assert.equal(advanceTransition(transition, 280).completed, true);
});

test('invalid navigation does not change the state or request an unsupported page', () => {
  const transition = createTransition('collection');
  const before = structuredClone(transition);
  assert.equal(requestTransition(transition, 'settings', 10).accepted, false);
  assert.deepEqual(transition, before);
  assert.equal(createTransition('unknown').displayPage, 'home');
  assert.equal(createTransition('home', { durationMs: NaN }).durationMs, 180);
});
