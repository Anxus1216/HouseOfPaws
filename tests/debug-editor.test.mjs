import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, adopt, claimTask, dayKey, hydrate } from '../js/model.js';
import { createDebugDraft, validateDebugDraft, prepareDebugState,
  commitDebugDraft } from '../js/debug-editor.js';

const TODAY = new Date(2026, 9, 18, 12).getTime();
const TOMORROW = new Date(2026, 9, 19, 12).getTime();

function setup(now = TODAY) {
  const state = initialState(now);
  adopt(state, 'cat', now);
  return { state, draft: createDebugDraft(state, now) };
}

test('debug draft exposes all current pet numbers, currency and task status', () => {
  const { state, draft } = setup();
  assert.equal(draft.petId, 'cat');
  assert.deepEqual(Object.keys(draft.values), [
    'coins', 'hunger', 'clean', 'happy', 'energy', 'level', 'xp', 'actions',
    'dailyGrowth', 'task.care.progress', 'task.care.claimed',
    'task.interact.progress', 'task.interact.claimed',
    'task.game.progress', 'task.game.claimed',
  ]);
  assert.equal(draft.values.hunger, String(state.pets.cat.hunger));
  assert.equal(draft.taskDate, dayKey(TODAY));
});

test('stat fields show at most two decimals without changing untouched stored precision', () => {
  const { state } = setup();
  state.pets.cat.hunger = 97.765;
  const draft = createDebugDraft(state, TODAY);
  assert.equal(draft.values.hunger, '97.77');
  assert.equal(prepareDebugState(state, draft, TODAY).state.pets.cat.hunger, 97.765);
  draft.values.hunger = '97.76';
  assert.equal(prepareDebugState(state, draft, TODAY).state.pets.cat.hunger, 97.76);
});

test('validation rejects invalid and conflicting values without silent clipping', () => {
  for (const [field, value] of [
    ['coins', ''], ['coins', '1e3'], ['coins', '1000000'],
    ['hunger', '-1'], ['energy', 'Infinity'], ['hunger', '12.345'], ['level', '1.5'],
    ['dailyGrowth', '101'], ['actions', '1.2'],
  ]) {
    const { draft } = setup();
    draft.values[field] = value;
    const result = validateDebugDraft(draft);
    assert.equal(result.valid, false, `${field}=${value}`);
    assert.ok(result.errors[field]);
  }
  const { draft } = setup();
  draft.values.level = '99';
  draft.values.xp = '1';
  assert.match(validateDebugDraft(draft).errors.xp, /99/);
  draft.values.xp = '0';
  draft.values['task.care.claimed'] = true;
  assert.match(validateDebugDraft(draft).errors['task.care.progress'], /进度/);
});

test('commit changes requested fields only and has no gameplay reward side effects', () => {
  const { state, draft } = setup();
  state.pets.cat.hunger = 50;
  state.lastSeen = TODAY - 3600000;
  draft.values.energy = '15';
  draft.values.level = '99';
  draft.values.dailyGrowth = '100';
  draft.values.coins = '0';
  draft.values['task.care.progress'] = '1';
  let stored;
  const result = commitDebugDraft(state, draft, TODAY,
    candidate => { stored = structuredClone(candidate); }, true);
  assert.ok(result.state);
  assert.equal(result.state.pets.cat.energy, 15);
  assert.equal(result.state.pets.cat.level, 99);
  assert.equal(result.state.pets.cat.xp, 0);
  assert.equal(result.state.pets.cat.dailyGrowth.earned, 100);
  assert.equal(result.state.coins, 0);
  assert.equal(result.state.tasks.progress.care, 1);
  assert.equal(result.state.totalActions, 0);
  assert.equal(result.state.pets.cat.actions, 0);
  assert.equal(result.state.pets.cat.hunger, 48.75,
    'an untouched field keeps natural time settlement');
  assert.deepEqual(stored, result.state);
  const reloaded = hydrate(stored, TODAY);
  assert.equal(reloaded.pets.cat.energy, 15);
  assert.equal(reloaded.pets.cat.level, 99);
  assert.equal(reloaded.pets.cat.dailyGrowth.earned, 100);
  assert.equal(reloaded.coins, 0);
  assert.equal(reloaded.tasks.progress.care, 1);
  assert.equal(state.coins, 60, 'the original stays unchanged until persisted');
  assert.deepEqual(claimTask(result.state, 'care', TODAY), { reward: 10 });
  assert.equal(claimTask(result.state, 'care', TODAY), null);
});

test('marking a task claimed does not pay out and invalid edits do not persist', () => {
  const { state, draft } = setup();
  draft.values['task.game.progress'] = '1';
  draft.values['task.game.claimed'] = true;
  let writes = 0;
  const result = commitDebugDraft(state, draft, TODAY, () => { writes++; }, true);
  assert.equal(writes, 1);
  assert.equal(result.state.coins, 60);
  assert.equal(result.state.tasks.claimed.game, true);
  draft.values.coins = '-1';
  const invalid = commitDebugDraft(state, draft, TODAY, () => { writes++; }, true);
  assert.equal(invalid.reason, 'invalid');
  assert.equal(writes, 1);
});

test('closed mode and storage failure leave the original unchanged', () => {
  const { state, draft } = setup();
  draft.values.coins = '333';
  let writes = 0;
  assert.equal(commitDebugDraft(state, draft, TODAY, () => { writes++; }, false).reason, 'disabled');
  assert.equal(writes, 0);
  assert.equal(commitDebugDraft(state, draft, TODAY, () => {
    writes++; throw new Error('disk full');
  }, true).reason, 'storage');
  assert.equal(state.coins, 60);
  assert.equal(writes, 1);
});

test('crossing local midnight invalidates stale draft, while clock rollback retains newer date', () => {
  const { state, draft } = setup();
  draft.values.dailyGrowth = '90';
  assert.equal(prepareDebugState(state, draft, TOMORROW).reason, 'date_changed');
  const future = initialState(TOMORROW);
  adopt(future, 'cat', TOMORROW);
  const futureDraft = createDebugDraft(future, TODAY);
  futureDraft.values.dailyGrowth = '90';
  const prepared = prepareDebugState(future, futureDraft, TODAY);
  assert.ok(prepared.state);
  assert.equal(prepared.state.pets.cat.dailyGrowth.date, dayKey(TOMORROW));
});

test('without a pet, only currency and tasks are editable', () => {
  const state = initialState(TODAY);
  const draft = createDebugDraft(state, TODAY);
  assert.equal(draft.petId, null);
  assert.equal('hunger' in draft.values, false);
  draft.values.coins = '777';
  const result = prepareDebugState(state, draft, TODAY);
  assert.equal(result.state.coins, 777);
});
