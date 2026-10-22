import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, hydrate, adopt, care, daily, miniReward,
  STORAGE_KEY, SAVE_VERSION, TASKS, dayKey, ensureTasks, recordTask, claimTask,
  taskClaimState, giftClaimState, pendingDailyTaskCount,
  settleTime, getDailyGrowth, MAX_DAILY_GROWTH, MAX_COINS, petCardState,
  selectPet } from '../js/model.js';
import { coinWays } from '../js/coin-ways.js';

test('coin routes separate claimable rewards from actions and refresh with balance and date', () => {
  const now = new Date(2026, 9, 20, 10).getTime();
  const state = initialState(now);
  adopt(state, 'cat', now);
  let offer = coinWays(state, 'rabbit', now);
  assert.equal(offer.title, '领养糯米还差 20 爪爪币');
  assert.deepEqual(offer.ways.map(way => way.id), ['daily', 'do_tasks', 'game']);
  assert.match(offer.ways[1].title, /最高可得 \+40/);
  assert.match(offer.ways[2].hint, /最多 \+30.*可能 \+0/);

  state.tasks.progress.care = 1;
  offer = coinWays(state, 'rabbit', now);
  assert.deepEqual(offer.ways.map(way => way.id),
    ['daily', 'claim_tasks', 'do_tasks', 'game']);
  assert.match(offer.ways[1].title, /共 \+10/);
  assert.match(offer.ways[2].title, /最高可得 \+30/);

  state.lastDaily = dayKey(now);
  state.tasks.claimed.care = true;
  offer = coinWays(state, 'rabbit', now);
  assert.deepEqual(offer.ways.map(way => way.id), ['do_tasks', 'game']);
  state.tasks.date = dayKey(now - 86400000);
  state.tasks.claimed.care = false;
  offer = coinWays(state, 'rabbit', now);
  assert.deepEqual(offer.ways.map(way => way.id), ['do_tasks', 'game']);
  assert.match(offer.ways[0].title, /最高可得 \+40/);
  state.tasks.date = dayKey(now + 86400000);
  assert.deepEqual(coinWays(state, 'rabbit', now).ways.map(way => way.id), ['game']);
  state.coins = 80;
  assert.equal(coinWays(state, 'rabbit', now), null);
});

test('pet cards distinguish ownership from the sole companion and charge once', () => {
  const now = new Date(2026, 9, 20, 10).getTime();
  const state = initialState(now);
  assert.equal(state.active, null);
  assert.equal(petCardState(state, 'cat').kind, 'affordable');
  assert.deepEqual(petCardState(state, 'rabbit'),
    { kind: 'short', cost: 80, missing: 20 });
  assert.equal(adopt(state, 'cat', now), true);
  assert.equal(petCardState(state, 'cat').kind, 'current');
  assert.equal(selectPet(state, 'rabbit'), false);

  state.coins = 80;
  assert.equal(petCardState(state, 'rabbit').kind, 'affordable');
  assert.equal(adopt(state, 'rabbit', now), true);
  assert.equal(state.coins, 0);
  assert.equal(adopt(state, 'rabbit', now), false);
  assert.equal(state.coins, 0);
  assert.equal(petCardState(state, 'rabbit').kind, 'current');
  assert.equal(petCardState(state, 'cat').kind, 'owned');
  assert.equal(selectPet(state, 'rabbit'), false);
  assert.equal(selectPet(state, 'cat'), true);
  assert.equal(petCardState(state, 'cat').kind, 'current');
  assert.equal(petCardState(state, 'rabbit').kind, 'owned');

  const loaded = hydrate({ ...state, active: 'missing' }, now);
  assert.ok(loaded.pets[loaded.active]);
  assert.equal([ 'cat', 'rabbit' ].filter(id =>
    petCardState(loaded, id).kind === 'current').length, 1);
});

test('free adoption, care, switching and persistence', () => {
  const state = initialState(1000);
  assert.equal(adopt(state, 'cat'), true);
  assert.equal(state.active, 'cat');
  assert.equal(care(state, 'feed').label, '吃饱啦！');
  assert.equal(state.coins, 55);
  state.coins = 200;
  assert.equal(adopt(state, 'rabbit'), true);
  assert.equal(state.coins, 120);
  state.active = 'cat';
  const loaded = hydrate(JSON.parse(JSON.stringify(state)), 1000);
  assert.equal(loaded.active, 'cat');
  assert.equal(loaded.pets.rabbit.name, '糯米');
  assert.equal(loaded.pets.cat.hunger, 100);
});

test('care at a full target stat cannot grant XP, coins or task progress', () => {
  for (const [action, target] of Object.entries({
    feed: 'hunger', wash: 'clean', play: 'happy', rest: 'energy',
  })) {
    const state = initialState(1000);
    adopt(state, 'cat');
    const pet = state.pets.cat;
    pet[target] = 100;
    pet.level = 1;
    pet.xp = 39;
    const before = JSON.stringify(state);
    const result = care(state, action);
    assert.ok(result.error, `${action} should be rejected`);
    assert.equal(JSON.stringify(state), before, `${action} should not mutate state`);
    assert.equal(state.tasks.progress.care, 0);
  }
});

test('care near a full target stat still grants the normal reward', () => {
  const state = initialState(1000);
  adopt(state, 'cat');
  state.pets.cat.hunger = 99;
  const result = care(state, 'feed');
  assert.equal(result.error, undefined);
  assert.equal(state.pets.cat.hunger, 100);
  assert.equal(state.pets.cat.xp, 10);
  assert.equal(state.pets.cat.actions, 1);
  assert.equal(state.totalActions, 1);
  assert.equal(state.coins, 55);
});

test('a stat displayed as 100% cannot be farmed through fractional decay', () => {
  const state = initialState();
  adopt(state, 'cat');
  const pet = state.pets.cat;
  pet.happy = 99.9999;
  const before = JSON.stringify(state);
  assert.equal(care(state, 'play').error, '已经玩得很开心啦');
  assert.equal(JSON.stringify(state), before);
  pet.happy = 99.4;
  const result = care(state, 'play');
  assert.equal(result.error, undefined);
  assert.equal(pet.xp, 12);
  assert.equal(pet.happy, 100);
});

test('each pet has a 100-point daily growth cap, including partial final awards', () => {
  const now = new Date(2026, 9, 17, 10).getTime();
  const state = initialState(now);
  state.coins = 200;
  adopt(state, 'cat', now);
  adopt(state, 'rabbit', now);
  state.active = 'cat';
  const cat = state.pets.cat;
  cat.dailyGrowth.earned = 96;
  const play = care(state, 'play', now);
  assert.equal(play.xp, 4);
  assert.equal(cat.xp, 4);
  assert.equal(getDailyGrowth(cat, now), MAX_DAILY_GROWTH);
  cat.xp = 39;
  const cleanBefore = cat.clean;
  const wash = care(state, 'wash', now);
  assert.equal(wash.xp, 0);
  assert.equal(wash.leveled, false);
  assert.equal(cat.xp, 39);
  assert.ok(cat.clean > cleanBefore, 'care remains useful after growth reaches its cap');
  assert.equal(cat.actions, 2);
  state.active = 'rabbit';
  assert.equal(care(state, 'rest', now).xp, 8);
  assert.equal(getDailyGrowth(state.pets.rabbit, now), 8);
  assert.equal(getDailyGrowth(cat, now), 100);
});

test('mini-game growth shares the pet cap and resets on the next local day', () => {
  const today = new Date(2026, 9, 17, 10).getTime();
  const tomorrow = new Date(2026, 9, 18, 10).getTime();
  const state = initialState(today);
  adopt(state, 'cat', today);
  const pet = state.pets.cat;
  pet.dailyGrowth.earned = 90;
  assert.equal(miniReward(state, 100, today).xp, 10);
  assert.equal(miniReward(state, 100, today).xp, 0);
  assert.equal(getDailyGrowth(pet, today), 100);
  assert.equal(care(state, 'wash', tomorrow).xp, 10);
  assert.equal(pet.dailyGrowth.date, dayKey(tomorrow));
  assert.equal(getDailyGrowth(pet, tomorrow), 10);
  assert.equal(care(state, 'rest', today).xp, 8,
    'clock rollback must not reset the newer daily growth counter');
  assert.equal(pet.dailyGrowth.date, dayKey(tomorrow));
  assert.equal(getDailyGrowth(pet, today), 18);
});

test('play requires enough energy to stay above the care threshold', () => {
  const state = initialState(1000);
  adopt(state, 'cat');
  state.pets.cat.energy = 28;
  const before = JSON.stringify(state);
  assert.ok(care(state, 'play').error);
  assert.equal(JSON.stringify(state), before);
  state.pets.cat.energy = 29;
  assert.equal(care(state, 'play').error, undefined);
  assert.equal(state.pets.cat.energy, 15);
});

test('offline decay is capped and damaged saves are repaired', () => {
  const state = initialState(1000);
  adopt(state, 'cat');
  state.pets.cat.hunger = 90;
  state.pets.cat.clean = 5;
  const loaded = hydrate(state, 1000 + 72 * 3600000);
  assert.equal(loaded.pets.cat.hunger, 60);
  assert.equal(loaded.pets.cat.clean, 5);
  assert.equal(hydrate({ pets: { cat: { hunger: 'broken' } }, active: 'missing' }, 1000).active, 'cat');
});

test('foreground and offline settlement share one clock and never double count', () => {
  const hour = 3600000;
  const state = initialState(1000);
  adopt(state, 'cat');
  state.pets.cat.hunger = 90;
  assert.equal(settleTime(state, 1000 + hour), 1);
  assert.equal(state.pets.cat.hunger, 88.75);
  assert.equal(settleTime(state, 1000 + hour), 0);
  assert.equal(state.pets.cat.hunger, 88.75);
  const loaded = hydrate(JSON.parse(JSON.stringify(state)), 1000 + 2 * hour);
  assert.equal(loaded.pets.cat.hunger, 87.5);
  assert.equal(loaded.lastSeen, 1000 + 2 * hour);
  assert.equal(settleTime(loaded, 1000 + hour), 0, 'clock rollback must not replay time');
  assert.equal(loaded.lastSeen, 1000 + 2 * hour);
});

test('time decay does not raise a stat that an action drove below the floor', () => {
  const state = initialState(1000);
  adopt(state, 'cat');
  state.pets.cat.hunger = 5;
  state.pets.cat.clean = 10;
  state.pets.cat.happy = 12;
  state.pets.cat.energy = 5;
  settleTime(state, 1000 + 24 * 3600000);
  assert.equal(state.pets.cat.hunger, 5);
  assert.equal(state.pets.cat.clean, 10);
  assert.equal(state.pets.cat.happy, 12);
  assert.ok(state.pets.cat.energy > 5);
});

test('daily is once per local day and mini game rewards are bounded', () => {
  const state = initialState();
  adopt(state, 'cat');
  const date = new Date(2026, 9, 13, 10).getTime();
  assert.equal(daily(state, date), true);
  assert.equal(daily(state, date + 1000), false);
  assert.equal(state.coins, 90);
  const reward = miniReward(state, 100);
  assert.equal(reward.coins, 30);
  assert.equal(state.pets.cat.happy, 92);
});

test('v1 save migrates without losing pets, currency or daily gift status', () => {
  const now = new Date(2026, 9, 14, 10).getTime();
  const old = { version: 1, coins: 137, lastSeen: now, lastDaily: dayKey(now),
    totalActions: 9, active: 'rabbit', pets: {
      cat: { name: '小奶糖', hunger: 62, clean: 51, happy: 72, energy: 41,
        level: 4, xp: 19, actions: 7 },
      rabbit: { name: '糯米', hunger: 88, level: 2 },
    } };
  const state = hydrate(old, now);
  assert.equal(STORAGE_KEY, 'paw_house_save_v1');
  assert.equal(state.version, SAVE_VERSION);
  assert.equal(state.coins, 137);
  assert.equal(state.active, 'rabbit');
  assert.equal(state.pets.cat.name, '小奶糖');
  assert.equal(state.pets.cat.level, 4);
  assert.equal(state.pets.cat.xp, 19);
  assert.equal(state.pets.cat.actions, 7);
  assert.equal(getDailyGrowth(state.pets.cat, now), 0);
  assert.equal(state.totalActions, 9);
  assert.equal(daily(state, now), false);
  assert.equal(state.guide.phase, 'disabled');
  assert.equal(Object.hasOwn(state, 'guideStep'), false);
  assert.equal(state.soundEnabled, true);
  assert.equal(state.tasks.date, dayKey(now));
  assert.deepEqual(Object.values(state.tasks.progress), [0, 0, 0]);
});

test('three tasks record real events and each reward is claimed once', () => {
  const now = new Date(2026, 9, 14, 10).getTime();
  const state = initialState(now);
  assert.deepEqual(TASKS.map(task => task.id), ['care', 'interact', 'game']);
  assert.deepEqual(TASKS.map(task => task.target), [1, 1, 1]);
  assert.equal(recordTask(state, 'unknown', now), false);
  assert.equal(claimTask(state, 'care', now), null);
  for (const task of TASKS) {
    assert.equal(recordTask(state, task.id, now), true);
    assert.equal(recordTask(state, task.id, now), false);
    assert.deepEqual(claimTask(state, task.id, now), { reward: task.reward });
    assert.equal(claimTask(state, task.id, now), null);
  }
  assert.equal(state.coins, 60 + TASKS.reduce((sum, task) => sum + task.reward, 0));
  const loaded = hydrate(JSON.parse(JSON.stringify(state)), now);
  assert.deepEqual(loaded.tasks, state.tasks);
  assert.equal(claimTask(loaded, 'game', now), null);
});

test('tasks reset on local date change and damaged progress is repaired', () => {
  const today = new Date(2026, 9, 14, 10).getTime();
  const tomorrow = new Date(2026, 9, 15, 10).getTime();
  const state = initialState(today);
  recordTask(state, 'care', today);
  claimTask(state, 'care', today);
  assert.equal(ensureTasks(state, tomorrow).date, dayKey(tomorrow));
  assert.equal(state.tasks.progress.care, 0);
  assert.equal(state.tasks.claimed.care, false);
  assert.equal(recordTask(state, 'care', tomorrow), true);

  const damaged = hydrate({ version: 2, coins: Infinity, lastSeen: tomorrow + 3600000,
    guideStep: 'broken', soundEnabled: 'false', tasks: {
      date: dayKey(tomorrow), progress: { care: Infinity, interact: -20, game: 99 },
      claimed: { care: true, interact: 'true', game: false },
    }, pets: { cat: { hunger: Infinity, clean: null, level: Infinity } } }, tomorrow);
  assert.equal(damaged.lastSeen, tomorrow);
  assert.equal(damaged.coins, 60);
  assert.equal(damaged.pets.cat.hunger, 76);
  assert.equal(damaged.pets.cat.clean, 82);
  assert.equal(damaged.pets.cat.level, 1);
  assert.equal(damaged.tasks.progress.care, 1);
  assert.equal(damaged.tasks.claimed.care, true);
  assert.equal(damaged.tasks.claimed.interact, false);
  assert.equal(damaged.tasks.progress.interact, 0);
  assert.equal(damaged.tasks.progress.game, 1);
  assert.equal(damaged.guide.phase, 'disabled');
  assert.equal(Object.hasOwn(damaged, 'guideStep'), false);
  assert.equal(damaged.soundEnabled, true);
  assert.equal(hydrate({ lastSeen: null, pets: { cat: {} } }, tomorrow).pets.cat.hunger, 76);
});

test('clock rollback cannot reset claimed tasks or repeat daily gift', () => {
  const yesterday = new Date(2026, 9, 13, 10).getTime();
  const today = new Date(2026, 9, 14, 10).getTime();
  const state = initialState(today);
  recordTask(state, 'care', today);
  claimTask(state, 'care', today);
  assert.equal(daily(state, today), true);
  const coins = state.coins;
  assert.equal(ensureTasks(state, yesterday).date, dayKey(today));
  assert.equal(recordTask(state, 'care', yesterday), false);
  assert.equal(claimTask(state, 'care', yesterday), null);
  assert.equal(daily(state, yesterday), false);
  assert.equal(state.coins, coins);
  const loaded = hydrate(JSON.parse(JSON.stringify(state)), yesterday);
  assert.equal(loaded.tasks.date, dayKey(today));
  assert.equal(loaded.tasks.claimed.care, true);
  assert.equal(daily(loaded, yesterday), false);
});

test('full wallet cannot claim an unrecoverable partial reward', () => {
  const now = new Date(2026, 9, 14, 10).getTime();
  const state = initialState(now);
  state.coins = 999999;
  recordTask(state, 'care', now);
  assert.equal(claimTask(state, 'care', now), null);
  assert.equal(state.tasks.claimed.care, false);
  assert.equal(daily(state, now), false);
  state.coins -= 40;
  assert.deepEqual(claimTask(state, 'care', now), { reward: 10 });
  assert.equal(daily(state, now), true);
  assert.equal(state.coins, 999999);
});

test('task and gift status preserve full rewards, priority, and pending count', () => {
  const today = new Date(2026, 9, 14, 10).getTime();
  const tomorrow = new Date(2026, 9, 15, 10).getTime();
  const state = initialState(today);
  assert.equal(pendingDailyTaskCount(state, today), 0);
  assert.equal(taskClaimState(state, 'care', today).kind, 'incomplete');
  recordTask(state, 'care', today);
  assert.equal(pendingDailyTaskCount(state, today), 1);
  state.coins = MAX_COINS - 4;
  assert.deepEqual(taskClaimState(state, 'care', today),
    { kind: 'space_short', reward: 10, progress: 1, missing: 6 });
  assert.equal(claimTask(state, 'care', today), null);
  assert.equal(state.tasks.claimed.care, false);
  state.coins = MAX_COINS;
  assert.equal(taskClaimState(state, 'care', today).kind, 'wallet_full');
  assert.equal(pendingDailyTaskCount(state, today), 1);
  state.coins = MAX_COINS - 10;
  assert.equal(taskClaimState(state, 'care', today).kind, 'claimable');
  assert.deepEqual(claimTask(state, 'care', today), { reward: 10 });
  assert.equal(state.coins, MAX_COINS);
  assert.equal(claimTask(state, 'care', today), null);
  assert.equal(taskClaimState(state, 'care', today).kind, 'claimed');
  assert.equal(pendingDailyTaskCount(state, today), 0);

  state.coins = MAX_COINS - 24;
  assert.deepEqual(giftClaimState(state, today), { kind: 'space_short', missing: 6 });
  assert.equal(daily(state, today), false);
  state.coins -= 6;
  assert.equal(giftClaimState(state, today).kind, 'claimable');
  assert.equal(daily(state, today), true);
  assert.equal(state.coins, MAX_COINS);
  assert.equal(daily(state, today), false);
  assert.equal(giftClaimState(state, today).kind, 'claimed');

  recordTask(state, 'game', today);
  assert.equal(pendingDailyTaskCount(state, today), 1);
  assert.equal(pendingDailyTaskCount(state, tomorrow), 0);
  assert.equal(taskClaimState(state, 'game', tomorrow).kind, 'incomplete');
  assert.equal(claimTask(state, 'game', tomorrow), null);
});

test('clock rollback cannot advance or claim future task progress', () => {
  const yesterday = new Date(2026, 9, 13, 10).getTime();
  const today = new Date(2026, 9, 14, 10).getTime();
  const state = initialState(today);
  recordTask(state, 'care', today);
  assert.equal(pendingDailyTaskCount(state, yesterday), 0);
  assert.equal(taskClaimState(state, 'care', yesterday).kind, 'date_guard');
  assert.equal(recordTask(state, 'interact', yesterday), false);
  assert.equal(claimTask(state, 'care', yesterday), null);
  assert.equal(state.tasks.progress.interact, 0);
  assert.equal(state.tasks.claimed.care, false);
});

test('invalid mini-game score cannot corrupt currency or pet stats', () => {
  const state = initialState();
  adopt(state, 'cat');
  assert.deepEqual(miniReward(state, NaN), {
    coins: 0, leveled: false, bonus: 0, xp: 0, happyDelta: 0,
    requestedGameCoins: 0,
  });
  assert.equal(state.coins, 60);
  assert.equal(state.pets.cat.happy, 72);
});

test('zero-star mini-game has no rewards or stat changes', () => {
  const state = initialState();
  adopt(state, 'cat');
  const before = { coins: state.coins, happy: state.pets.cat.happy,
    level: state.pets.cat.level, xp: state.pets.cat.xp };
  assert.deepEqual(miniReward(state, 0), {
    coins: 0, leveled: false, bonus: 0, xp: 0, happyDelta: 0,
    requestedGameCoins: 0,
  });
  assert.deepEqual({ coins: state.coins, happy: state.pets.cat.happy,
    level: state.pets.cat.level, xp: state.pets.cat.xp }, before);
});

test('level reward takes wallet space before game coins, including partial payouts', () => {
  for (const [walletSpace, expectedBonus, expectedGameCoins] of [
    [20, 15, 5], [1, 1, 0], [0, 0, 0],
  ]) {
    const state = initialState();
    adopt(state, 'cat');
    state.coins = MAX_COINS - walletSpace;
    state.pets.cat.xp = 39;
    const result = miniReward(state, 10);
    assert.equal(result.leveled, true);
    assert.equal(result.bonus, expectedBonus);
    assert.equal(result.coins, expectedGameCoins);
    assert.equal(result.requestedGameCoins, 30);
    assert.equal(result.happyDelta, 20);
    assert.equal(result.xp, 25);
    assert.equal(state.coins, MAX_COINS - walletSpace + expectedBonus + expectedGameCoins);
  }
});

test('mini-game reports actual happiness and growth at their caps', () => {
  const now = new Date(2026, 9, 20, 10).getTime();
  const state = initialState(now);
  adopt(state, 'cat', now);
  const pet = state.pets.cat;
  pet.happy = 99;
  pet.dailyGrowth.earned = 99;
  const partial = miniReward(state, 10, now);
  assert.equal(partial.happyDelta, 1);
  assert.equal(partial.xp, 1);
  const capped = miniReward(state, 10, now);
  assert.equal(capped.happyDelta, 0);
  assert.equal(capped.xp, 0);
  pet.level = 99;
  pet.xp = 0;
  pet.dailyGrowth.earned = 0;
  const maxLevel = miniReward(state, 10, now);
  assert.equal(maxLevel.xp, 0);
  assert.equal(maxLevel.leveled, false);
  assert.equal(maxLevel.bonus, 0);
  assert.equal(maxLevel.coins, 30);
});

test('daily growth survives saves and damaged counters are repaired', () => {
  const now = new Date(2026, 9, 17, 10).getTime();
  const state = initialState(now);
  adopt(state, 'cat', now);
  state.pets.cat.dailyGrowth.earned = 72;
  assert.equal(getDailyGrowth(hydrate(state, now).pets.cat, now), 72);
  const legacy = structuredClone(state);
  legacy.version = 2;
  delete legacy.pets.cat.dailyGrowth;
  assert.equal(getDailyGrowth(hydrate(legacy, now).pets.cat, now), 0);
  state.pets.cat.dailyGrowth.earned = Infinity;
  assert.equal(getDailyGrowth(hydrate(state, now).pets.cat, now), 0);
  state.pets.cat.dailyGrowth.earned = 999;
  assert.equal(getDailyGrowth(hydrate(state, now).pets.cat, now), 100);
  state.pets.cat.dailyGrowth.date = 'invalid';
  assert.equal(getDailyGrowth(hydrate(state, now).pets.cat, now), 0);
  state.pets.cat.dailyGrowth = { date: dayKey(now), earned: 50 };
  assert.equal(getDailyGrowth(hydrate(state, now + 86400000).pets.cat, now + 86400000), 0);
});

test('the last level only counts growth that the pet can actually use', () => {
  const now = new Date(2026, 9, 17, 10).getTime();
  const state = initialState(now);
  adopt(state, 'cat', now);
  const pet = state.pets.cat;
  pet.level = 98;
  pet.xp = 98 * 40 - 5;
  const result = care(state, 'wash', now);
  assert.equal(result.xp, 5);
  assert.equal(result.leveled, true);
  assert.equal(pet.level, 99);
  assert.equal(pet.xp, 0);
  assert.equal(getDailyGrowth(pet, now), 5);
  assert.equal(care(state, 'rest', now).xp, 0);
  assert.equal(getDailyGrowth(pet, now), 5);
});

test('mini-game and level rewards respect the wallet cap', () => {
  const state = initialState();
  adopt(state, 'cat');
  state.coins = 999998;
  const reward = miniReward(state, 100);
  assert.equal(reward.coins, 1);
  assert.equal(state.coins, 999999);
  state.pets.cat.level = 99;
  state.pets.cat.xp = 3900;
  const careResult = care(state, 'wash');
  assert.equal(careResult.xp, 0);
  assert.equal(state.pets.cat.xp, 0);
  assert.equal(getDailyGrowth(state.pets.cat), reward.xp);
});
