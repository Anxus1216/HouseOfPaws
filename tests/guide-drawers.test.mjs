import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, adopt, hydrate, care, SAVE_VERSION, STORAGE_KEY } from '../js/model.js';
import { guideView, drawerTutorialView, recordDrawerGuideEvent, recordGuideEvent } from '../js/guide.js';

const now = new Date(2026, 9, 28, 10).getTime();
const home = { page: 'home' };

function newCompanion(interacted = true) {
  const state = initialState(now);
  adopt(state, 'cat', now);
  recordGuideEvent(state, 'adopt', now);
  if (interacted) recordGuideEvent(state, 'pet_tap', now);
  return state;
}

test('new companions learn two entrances without granting care or changing the wallet', () => {
  const state = newCompanion();
  const businessBefore = { coins: state.coins, pets: structuredClone(state.pets),
    tasks: structuredClone(state.tasks), facts: structuredClone(state.guide.facts) };
  assert.deepEqual(drawerTutorialView(state, home, now).targetIds, ['home_care_toggle']);
  assert.equal(recordDrawerGuideEvent(state, 'care'), true);
  assert.equal(recordDrawerGuideEvent(state, 'care'), false);
  assert.deepEqual(drawerTutorialView(state, home, now).targetIds, ['home_status_toggle']);
  assert.equal(recordDrawerGuideEvent(state, 'status'), true);
  assert.deepEqual(drawerTutorialView(state, home, now), guideView(state, 'home', now));
  assert.equal(state.guide.phase, 'care');
  assert.deepEqual({ coins: state.coins, pets: state.pets, tasks: state.tasks,
    facts: state.guide.facts }, businessBefore);
});

test('real entrance discovery before interaction is remembered without advancing the main guide', () => {
  const state = newCompanion(false);
  assert.equal(recordDrawerGuideEvent(state, 'status'), true);
  assert.equal(recordDrawerGuideEvent(state, 'care'), true);
  assert.deepEqual(drawerTutorialView(state, home, now).targetIds, ['pet_tap']);
  assert.equal(state.guide.phase, 'interact');
  recordGuideEvent(state, 'pet_tap', now);
  assert.deepEqual(drawerTutorialView(state, home, now), guideView(state, 'home', now));
});

test('teaching resumes its optional second hint after saving without storing drawer openness', () => {
  const state = newCompanion();
  recordDrawerGuideEvent(state, 'care');
  const loaded = hydrate(JSON.parse(JSON.stringify(state)), now);
  assert.deepEqual(loaded.guide.uiHints, { version: 1, careOpened: true, statusOpened: false });
  assert.deepEqual(drawerTutorialView(loaded, home, now).targetIds, ['home_status_toggle']);
  assert.equal(loaded.homeDrawers, undefined);
  assert.equal(loaded.version, SAVE_VERSION);
  assert.equal(STORAGE_KEY, 'paw_house_save_v1');
});

test('old or malformed optional metadata preserves main progress without forcing entrance teaching', () => {
  const original = newCompanion();
  const invalid = [undefined, null, [], 7, {},
    { version: 2, careOpened: false, statusOpened: false },
    { version: 1, careOpened: 'false', statusOpened: false },
    { version: 1, careOpened: false }];
  for (const uiHints of invalid) {
    const raw = structuredClone(original);
    if (uiHints === undefined) delete raw.guide.uiHints;
    else raw.guide.uiHints = uiHints;
    const loaded = hydrate(raw, now);
    assert.equal(loaded.guide.uiHints, null);
    assert.equal(loaded.guide.phase, 'care');
    assert.deepEqual(loaded.guide.facts, original.guide.facts);
    assert.deepEqual(drawerTutorialView(loaded, home, now), guideView(loaded, 'home', now));
    assert.equal(recordDrawerGuideEvent(loaded, 'care'), false);
  }
});

test('non-home pages retain the main return-home hint rather than targeting invisible entrances', () => {
  const state = newCompanion();
  for (const page of ['collection', 'tasks', 'game']) {
    const view = drawerTutorialView(state, { page }, now);
    assert.deepEqual(view, guideView(state, page, now));
    assert.deepEqual(view.targetIds, ['nav_home']);
  }
  assert.deepEqual(drawerTutorialView(state, home, now).targetIds, ['home_care_toggle']);
});

test('success skips unseen optional state teaching and skip ends the whole guide persistently', () => {
  const state = newCompanion();
  recordDrawerGuideEvent(state, 'care');
  assert.equal(care(state, 'wash', now).error, undefined);
  recordGuideEvent(state, 'care_success', now);
  assert.equal(drawerTutorialView(state, home, now).phase, 'claim');
  assert.equal(state.guide.uiHints.statusOpened, false);
  assert.equal(recordDrawerGuideEvent(state, 'status'), false);
  assert.equal(recordGuideEvent(state, 'skip', now), true);
  const loaded = hydrate(state, now);
  assert.equal(loaded.guide.phase, 'skipped');
  assert.equal(drawerTutorialView(loaded, home, now), null);
});

test('blocked care retains reward/game alternatives and active results suppress teaching', () => {
  const state = newCompanion();
  assert.equal(drawerTutorialView(state, { ...home, guideHoldUntil: now + 1 }, now), null);
  assert.equal(drawerTutorialView(state, { ...home, careFeedback: { until: now + 1 } }, now), null);
  assert.equal(drawerTutorialView(state, { ...home, statDelta: '清洁 +5', expressionUntil: now + 1 }, now), null);
  assert.equal(drawerTutorialView(state, { ...home, careFeedback: { until: now } }, now).substep, 1);
  state.coins = 0;
  Object.assign(state.pets.cat, { clean: 100, happy: 100, energy: 100 });
  assert.deepEqual(drawerTutorialView(state, home, now), guideView(state, 'home', now));
  assert.deepEqual(drawerTutorialView(state, home, now).targetIds, ['nav_game']);
});

test('invalid events and inactive phases cannot mutate teaching markers', () => {
  const state = newCompanion();
  const before = structuredClone(state);
  assert.equal(recordDrawerGuideEvent(state, 'unknown'), false);
  assert.equal(recordDrawerGuideEvent(null, 'care'), false);
  assert.deepEqual(state, before);
  recordGuideEvent(state, 'skip', now);
  const skipped = structuredClone(state);
  assert.equal(recordDrawerGuideEvent(state, 'care'), false);
  assert.deepEqual(state, skipped);
});
