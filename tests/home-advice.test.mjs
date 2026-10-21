import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, adopt, care, MAX_COINS } from '../js/model.js';
import { homeAdvice, homeAdviceText, homeAdviceDetail } from '../js/home-advice.js';
import { growthSummary, careGrowthFeedback } from '../js/growth-info.js';
import { careCoinWays, coinWays } from '../js/coin-ways.js';

test('home advice keeps the fixed need order and strict thresholds', () => {
  const state = initialState();
  assert.equal(homeAdvice(state), null);
  adopt(state, 'cat');
  const pet = state.pets.cat;
  assert.equal(homeAdviceText(homeAdvice(state)), '奶糖看起来很开心，摸摸它吧');
  Object.assign(pet, { energy: 24.9, hunger: 10, clean: 10, happy: 10 });
  assert.equal(homeAdvice(state).action, 'rest');
  assert.equal(homeAdviceText(homeAdvice(state)), '奶糖有点累了，歇一会儿吧');
  pet.energy = 25;
  assert.equal(homeAdvice(state).action, 'feed');
  assert.equal(homeAdviceText(homeAdvice(state)), '奶糖有点饿了，吃点东西吧');
  pet.hunger = 25;
  assert.equal(homeAdvice(state).action, 'wash');
  assert.equal(homeAdviceText(homeAdvice(state)), '奶糖想清爽一下');
  pet.clean = 25;
  pet.energy = 40;
  assert.equal(homeAdvice(state).action, 'play');
  assert.equal(homeAdviceText(homeAdvice(state)), '奶糖想和你玩一会儿');
  Object.assign(pet, { energy: 39.9, hunger: 39, clean: 39, happy: 39 });
  assert.equal(homeAdvice(state).action, 'rest');
  Object.assign(pet, { energy: 40, hunger: 40, clean: 40, happy: 40 });
  pet.wish = { active: true };
  assert.equal(homeAdvice(state).kind, 'pet', 'future wishes are not shown before F01');
});

test('blocked advice gives a feasible prerequisite or the exact feeding shortage', () => {
  const state = initialState();
  adopt(state, 'cat');
  const pet = state.pets.cat;
  Object.assign(pet, { energy: 28, hunger: 50, clean: 50, happy: 20 });
  const rest = homeAdvice(state);
  assert.deepEqual([rest.kind, rest.action, rest.prerequisite], ['care', 'rest', true]);
  assert.equal(homeAdviceText(rest), '奶糖先歇一会儿，再一起玩吧');
  assert.equal(homeAdviceDetail(rest), '可以先点「休息」，等奶糖恢复精力再玩');
  pet.energy = 29;
  assert.equal(homeAdvice(state).action, 'play');
  pet.hunger = 20;
  state.coins = 4;
  const shortage = homeAdvice(state);
  assert.deepEqual([shortage.kind, shortage.missing], ['coins', 1]);
  assert.equal(homeAdviceText(shortage), '再攒 1 爪爪币，就能给奶糖喂食啦');
  assert.equal(homeAdviceText(shortage, true), '攒点爪爪币，再给它喂食吧');
  assert.equal(careCoinWays(state, 'feed').title, '喂食还差 1 爪爪币');
  assert.equal(careCoinWays(state, 'wash'), null);
  state.coins = 5;
  assert.equal(homeAdvice(state).action, 'feed');
  assert.equal(careCoinWays(state, 'feed'), null);
  state.coins = 200;
  adopt(state, 'rabbit');
  assert.equal(homeAdvice(state).name, '糯米');
  assert.equal(coinWays(state, 'dog'), null);
});

test('growth copy reports each pet actual daily balance, cap and full level', () => {
  const now = new Date(2026, 9, 20, 10).getTime();
  const state = initialState(now);
  adopt(state, 'cat', now);
  const pet = state.pets.cat;
  pet.level = 5;
  pet.xp = 135;
  pet.dailyGrowth.earned = 80;
  assert.deepEqual(growthSummary(pet, now), {
    progress: '距 Lv.6 还差 65 成长', today: '今日成长 80/100',
  });
  pet.dailyGrowth.earned = 99;
  pet.clean = 50;
  assert.equal(care(state, 'wash', now).xp, 1);
  assert.equal(careGrowthFeedback(pet, 1, now), '成长 +1');
  assert.equal(care(state, 'wash', now).xp, 0);
  assert.equal(careGrowthFeedback(pet, 0, now), '今日成长已满，照料仍有效');
  assert.equal(growthSummary(pet, now + 86400000).today, '今日成长 0/100');
  pet.level = 99;
  pet.xp = 0;
  assert.equal(growthSummary(pet, now).progress, '已满级');
  assert.equal(careGrowthFeedback(pet, 0, now), '已满级，照料仍有效');
});

test('care returns the actual upgrade coin amount even when the wallet is full', () => {
  const state = initialState();
  adopt(state, 'cat');
  const pet = state.pets.cat;
  pet.xp = 39;
  state.coins = MAX_COINS;
  const result = care(state, 'wash');
  assert.equal(result.leveled, true);
  assert.equal(result.bonus, 0);
  assert.equal(state.coins, MAX_COINS);
  pet.xp = pet.level * 40 - 1;
  pet.hunger = 50;
  state.coins = 60;
  const feed = care(state, 'feed');
  assert.equal(feed.bonus, 15);
  assert.equal(state.coins, 70);
});
