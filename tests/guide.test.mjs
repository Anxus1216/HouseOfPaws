import test from 'node:test';
import assert from 'node:assert/strict';
import { adopt, care, claimTask, dayKey, hydrate, initialState, MAX_COINS,
  recordTask } from '../js/model.js';
import { guideView, reconcileGuide, recordGuideEvent } from '../js/guide.js';

const now = new Date(2026, 9, 20, 10).getTime();
function newCompanion() {
  const state = initialState(now);
  assert.equal(adopt(state, 'cat', now), true);
  assert.equal(recordGuideEvent(state, 'adopt', now), true);
  return state;
}

test('only a new free cat adoption starts the guide; old and corrupt saves stay disabled', () => {
  const fresh = initialState(now);
  assert.equal(fresh.guide.phase, 'await_adoption');
  assert.equal(recordGuideEvent(fresh, 'adopt', now), false);
  adopt(fresh, 'cat', now);
  assert.equal(recordGuideEvent(fresh, 'adopt', now), true);
  assert.equal(guideView(fresh, 'home', now).targetIds[0], 'pet_tap');
  assert.equal(hydrate(JSON.parse(JSON.stringify(fresh)), now).guide.phase, 'interact');

  for (const raw of [{}, { guideStep: 1 }, { guideStep: 3 },
    { guide: { version: 1, phase: 'interact' } },
    { guide: { version: 1, phase: 'unknown', facts: {}, branch: null } },
    { guide: null }, 123, '']) {
    const loaded = hydrate(raw, now);
    assert.equal(loaded.guide.phase, 'disabled');
    assert.equal(recordGuideEvent(loaded, 'adopt', now), false);
    assert.equal(guideView(loaded, 'home', now), null);
  }
});

test('successful interaction, care and credited task reward drive three steps', () => {
  const state = newCompanion();
  state.pets.cat.name = '泡芙';
  assert.match(guideView(state, 'home', now).text, /泡芙/);
  assert.equal(recordGuideEvent(state, 'pet_tap', now), true);
  assert.equal(state.guide.phase, 'care');
  assert.deepEqual(guideView(state, 'home', now).targetIds, ['feed', 'wash', 'play', 'rest']);
  assert.equal(recordGuideEvent(state, 'care_failed', now), false);
  assert.equal(state.guide.phase, 'care');
  assert.ok(care(state, 'wash', now)?.label);
  recordTask(state, 'care', now);
  assert.equal(recordGuideEvent(state, 'care_success', now), true);
  assert.equal(state.guide.phase, 'claim');
  assert.deepEqual(guideView(state, 'tasks', now).targetIds, ['claim_care']);
  assert.ok(claimTask(state, 'care', now)?.reward);
  assert.equal(recordGuideEvent(state, 'task_claim', now), true);
  assert.equal(state.guide.phase, 'outro');
  assert.equal(guideView(state, 'home', now).title, '小小约定完成啦！');
  assert.equal(guideView(state, 'home', now).text, '想继续攒爪爪币？试试 20 秒接星星');
  assert.equal(recordGuideEvent(state, 'finish', now), true);
  assert.equal(state.guide.phase, 'done');
  assert.equal(guideView(state, 'home', now), null);
});

test('early facts persist and guide can resume after reload or be skipped', () => {
  let state = newCompanion();
  assert.equal(recordGuideEvent(state, 'care_success', now), true);
  assert.equal(recordGuideEvent(state, 'task_claim', now), true);
  assert.equal(state.guide.phase, 'interact');
  state = hydrate(JSON.parse(JSON.stringify(state)), now);
  assert.equal(recordGuideEvent(state, 'pet_tap', now), true);
  assert.equal(state.guide.phase, 'outro');
  assert.deepEqual(state.guide.facts,
    { interacted: true, cared: true, naturalGame: false, claimedTask: true });
  assert.equal(recordGuideEvent(state, 'skip', now), true);
  assert.equal(hydrate(state, now).guide.phase, 'skipped');
  assert.equal(recordGuideEvent(state, 'pet_tap', now), false);
});

test('all care blocked chooses today pending reward before the game fallback', () => {
  const state = newCompanion();
  recordGuideEvent(state, 'pet_tap', now);
  state.coins = 0;
  Object.assign(state.pets.cat, { clean: 100, happy: 100, energy: 100 });
  assert.equal(guideView(state, 'home', now).targetIds[0], 'nav_game');
  assert.equal(recordGuideEvent(state, 'game_abort', now), false);
  assert.equal(reconcileGuide(state, now), false);
  assert.equal(state.guide.phase, 'care');
  recordTask(state, 'interact', now);
  assert.equal(reconcileGuide(state, now), true);
  assert.equal(state.guide.branch, 'pending_reward');
  assert.equal(state.guide.phase, 'claim');
  assert.deepEqual(guideView(state, 'tasks', now).targetIds, ['claim_interact']);
});

test('natural game completion is remembered and crosses into claim when care becomes blocked', () => {
  const state = newCompanion();
  recordGuideEvent(state, 'pet_tap', now);
  assert.equal(recordGuideEvent(state, 'game_complete', now), true);
  assert.equal(state.guide.phase, 'care');
  state.coins = 0;
  Object.assign(state.pets.cat, { clean: 100, happy: 100, energy: 100 });
  assert.equal(reconcileGuide(state, now), true);
  assert.equal(state.guide.phase, 'claim');
  assert.equal(state.guide.branch, 'game');
});

test('a completed game keeps the game branch after its task becomes claimable', () => {
  const state = newCompanion();
  recordGuideEvent(state, 'pet_tap', now);
  state.coins = 0;
  Object.assign(state.pets.cat, { clean: 100, happy: 100, energy: 100 });
  recordTask(state, 'game', now);
  assert.equal(recordGuideEvent(state, 'game_complete', now), true);
  assert.equal(state.guide.phase, 'claim');
  assert.equal(state.guide.branch, 'game');
});

test('wallet guidance and day rollover use live tasks while claimed guide fact persists', () => {
  const state = newCompanion();
  recordGuideEvent(state, 'pet_tap', now);
  recordGuideEvent(state, 'care_success', now);
  recordTask(state, 'care', now);
  state.coins = MAX_COINS;
  assert.match(guideView(state, 'tasks', now).text, /花掉一些爪爪币/);
  assert.deepEqual(guideView(state, 'tasks', now).targetIds, ['claim_care']);
  state.coins = 60;
  assert.equal(guideView(state, 'tasks', now).text, '去任务页，领走刚完成的奖励');
  state.tasks.date = dayKey(now - 86400000);
  assert.match(guideView(state, 'tasks', now).text, /再完成一个小任务/);
  assert.deepEqual(guideView(state, 'tasks', now).targetIds, ['task_go_interact']);
  assert.deepEqual(guideView(state, 'home', now).targetIds, ['pet_tap']);
  assert.deepEqual(guideView(state, 'collection', now).targetIds, ['nav_home']);
  state.tasks.date = dayKey(now + 86400000);
  assert.deepEqual(guideView(state, 'tasks', now).targetIds, []);
  state.tasks.date = dayKey(now);
  recordGuideEvent(state, 'task_claim', now);
  assert.equal(hydrate(state, now + 86400000).guide.facts.claimedTask, true);
});
