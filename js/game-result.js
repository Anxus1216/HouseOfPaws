import { dayKey, getDailyGrowth, LEVEL_UP_BONUS_COINS,
  MAX_DAILY_GROWTH } from './model.js';

export function completedGameOutcome(stars, reward, pet, taskCompleted, now = Date.now()) {
  const growthReason = stars === 0 ? 'no_stars' : reward.xp > 0 ? 'earned' :
    pet.level >= 99 ? 'max_level' :
      getDailyGrowth(pet, now) >= MAX_DAILY_GROWTH ? 'daily_cap' : 'none';
  return { kind: 'completed', stars, coins: reward.coins,
    requestedGameCoins: reward.requestedGameCoins, bonus: reward.bonus,
    leveled: reward.leveled, happyDelta: reward.happyDelta, xp: reward.xp,
    growthReason, taskCompleted, taskDate: dayKey(now) };
}

export function gameOutcomeView(outcome, hideTaskHint = false) {
  if (!outcome) return null;
  if (outcome.kind === 'aborted') return {
    title: '本局已结束', lines: ['本局未结算奖励，也不计入今日任务'], taskHint: '',
  };
  const lines = [
    `接住 ${outcome.stars} 颗星星`,
    `游戏奖励 +${outcome.coins} 爪爪币`,
  ];
  if (outcome.requestedGameCoins > outcome.coins) {
    lines.push(outcome.coins === 0 ? '爪爪币已满，未增加' : '钱包空间不足，游戏奖励仅部分到账');
  }
  if (outcome.leveled) {
    const limit = outcome.bonus < LEVEL_UP_BONUS_COINS ?
      (outcome.bonus === 0 ? ' · 钱包已满' : ' · 钱包空间不足') : '';
    lines.push(`升级奖励 +${outcome.bonus} 爪爪币${limit}`);
  }
  if (outcome.happyDelta > 0) {
    lines.push(`快乐 +${Number(outcome.happyDelta.toFixed(2))}`);
  } else if (outcome.stars > 0) {
    lines.push('快乐已满');
  }
  if (outcome.xp > 0) lines.push(`成长 +${outcome.xp}`);
  else if (outcome.growthReason === 'no_stars') lines.push('本局未获得成长');
  else if (outcome.growthReason === 'max_level') lines.push('已满级');
  else if (outcome.growthReason === 'daily_cap') lines.push('今日成长已满');
  else lines.push('本局未获得成长');
  if (outcome.stars === 0) lines.push('星星这次躲起来啦，再试一次吧');
  return { title: '本局完成', lines,
    taskHint: outcome.taskCompleted && !hideTaskHint ? '今日游戏任务已完成，去领取奖励' : '' };
}
