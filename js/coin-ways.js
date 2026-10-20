import { SPECIES, TASKS, petCardState, taskSnapshot, dailyAvailability,
  careBlockReason, getDailyGrowth, DAILY_GIFT_COINS, GAME_MAX_COINS,
  MAX_DAILY_GROWTH, MAX_COINS } from './model.js';
import { CARE_ACTIONS } from './care-actions.js';

// A02's route suggestions are presentation data; reward and eligibility rules stay in model.
export function coinWays(state, id, now = Date.now()) {
  const card = petCardState(state, id);
  if (card?.kind !== 'short') return null;
  const species = SPECIES.find(item => item.id === id);
  const space = MAX_COINS - state.coins;
  const ways = [];
  const gift = dailyAvailability(state, now);
  let walletBlocked = gift === 'wallet_full';
  if (gift === 'claimable') {
    ways.push({ id: 'daily', page: 'tasks',
      title: `领取今日礼物 · +${DAILY_GIFT_COINS}`, hint: '前往任务页领取' });
  }

  const tasks = taskSnapshot(state, now);
  let claimable = 0;
  let unclaimedSpace = space;
  let potential = 0;
  for (const task of tasks ? TASKS : []) {
    if (tasks.claimed[task.id]) continue;
    if (tasks.progress[task.id] >= task.target) {
      if (unclaimedSpace >= task.reward) {
        claimable += task.reward;
        unclaimedSpace -= task.reward;
      } else walletBlocked = true;
    } else if (state.active && (task.id !== 'care' ||
        Object.keys(CARE_ACTIONS).some(action => !careBlockReason(state, action)))) {
      potential += task.reward;
    }
  }
  if (claimable) ways.push({ id: 'claim_tasks', page: 'tasks',
    title: `领取任务奖励 · 共 +${claimable}`, hint: '前往任务页领取' });
  if (walletBlocked) ways.push({ id: 'wallet_full',
    title: '先花掉一些爪爪币', hint: '才能领取完整奖励' });
  if (potential) ways.push({ id: 'do_tasks', page: 'tasks',
    title: `完成今日任务 · 最高可得 +${potential}`, hint: '完成后再前往任务页领取' });
  if (state.active && space > 0) ways.push({ id: 'game', page: 'game',
    title: '玩星星接接乐',
    hint: `每局最多 +${Math.min(GAME_MAX_COINS, space)} 爪爪币，可能 +0` });
  const pet = state.pets[state.active];
  if (pet && pet.level < 99 && space > 0 &&
      pet.level * 40 - pet.xp <= Math.min(25, MAX_DAILY_GROWTH - getDailyGrowth(pet, now))) {
    ways.push({ id: 'level', page: 'home', title: '回小屋陪伴',
      hint: '升级可得奖励，并非立即到账' });
  }
  return { title: `领养${species.name}还差 ${card.missing} 爪爪币`, ways };
}
