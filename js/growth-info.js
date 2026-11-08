import { getDailyGrowth, MAX_DAILY_GROWTH } from './model.js';

export const GROWTH_HELP_LINES = [
  `每只宠物每天最多获得 ${MAX_DAILY_GROWTH} 成长。`,
  '达到上限后，照料仍能改善状态。',
];

export function growthSummary(pet, now = Date.now()) {
  const dailyGrowth = getDailyGrowth(pet, now);
  const dailyCapped = dailyGrowth >= MAX_DAILY_GROWTH;
  const maxLevel = pet.level >= 99;
  const requiredGrowth = pet.level * 40;
  return {
    progress: maxLevel ? '已满级' : `还差${requiredGrowth - pet.xp}成长`,
    ratio: maxLevel ? 1 : Math.max(0, Math.min(1, pet.xp / requiredGrowth)),
    today: dailyCapped ? '今日成长已达上限' : `今日上限${dailyGrowth}/${MAX_DAILY_GROWTH}`,
    dailyCapped,
  };
}

export function careGrowthFeedback(pet, earned, now = Date.now()) {
  if (earned > 0) return `成长 +${earned}`;
  return pet.level >= 99 ? '已满级，照料仍有效' :
    getDailyGrowth(pet, now) >= MAX_DAILY_GROWTH ?
      '今日成长已满，照料仍有效' : '照料仍有效';
}
