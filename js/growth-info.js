import { getDailyGrowth, MAX_DAILY_GROWTH } from './model.js';

export const GROWTH_HELP_LINES = [
  `每只宠物每天最多获得 ${MAX_DAILY_GROWTH} 成长。`,
  '达到上限后，照料仍能改善状态。',
];

export function growthSummary(pet, now = Date.now()) {
  return {
    progress: pet.level >= 99 ? '已满级' :
      `距 Lv.${pet.level + 1} 还差 ${pet.level * 40 - pet.xp} 成长`,
    today: `今日成长 ${getDailyGrowth(pet, now)}/${MAX_DAILY_GROWTH}`,
  };
}

export function careGrowthFeedback(pet, earned, now = Date.now()) {
  if (earned > 0) return `成长 +${earned}`;
  return pet.level >= 99 ? '已满级，照料仍有效' :
    getDailyGrowth(pet, now) >= MAX_DAILY_GROWTH ?
      '今日成长已满，照料仍有效' : '照料仍有效';
}
