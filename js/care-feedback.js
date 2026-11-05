const STAT_NAMES = Object.freeze({ hunger: '饱腹', clean: '清洁', happy: '心情', energy: '精力' });

export function mergeCareFeedback(previous, entry) {
  const continuing = previous && previous.petId === entry.petId && previous.until > entry.now;
  const base = continuing ? previous : { count: 0, changes: {}, growth: 0, cost: 0, bonus: 0 };
  const changes = { ...base.changes };
  for (const [field, delta] of Object.entries(entry.changes)) {
    changes[field] = (changes[field] || 0) + delta;
  }
  return {
    petId: entry.petId,
    action: entry.action,
    label: entry.label,
    count: base.count + 1,
    changes,
    growth: base.growth + entry.growth,
    cost: base.cost + entry.cost,
    bonus: base.bonus + entry.bonus,
    zeroBonusUpgrades: (base.zeroBonusUpgrades || 0) +
      (entry.leveled && entry.bonus === 0 ? 1 : 0),
    level: entry.level,
    leveled: !!entry.leveled || (continuing && previous.leveled),
    growthReason: entry.growthReason || null,
    until: entry.now + entry.duration,
  };
}

export function careFeedbackTokens(feedback) {
  const changes = Object.entries(STAT_NAMES).filter(([field]) => feedback.changes[field])
    .map(([field, name]) => {
      const delta = feedback.changes[field];
      return `${name} ${delta > 0 ? '+' : ''}${delta}`;
    });
  const rewards = [];
  if (feedback.growth) rewards.push(`成长 +${feedback.growth}`);
  if (feedback.cost) rewards.push(`爪爪币 -${feedback.cost}`);
  if (feedback.bonus) rewards.push(`${feedback.zeroBonusUpgrades ? '累计升级返币' : '升级返币'} +${feedback.bonus}`);
  if (feedback.zeroBonusUpgrades) {
    rewards.push(feedback.count === 1 ? '钱包已满，升级返币 0' :
      `钱包已满，${feedback.zeroBonusUpgrades}次升级返币 0`);
  }
  if (feedback.growthReason && !feedback.growth) rewards.push(feedback.growthReason);
  if (feedback.leveled) rewards.push(`升到 Lv.${feedback.level} 啦`);
  return { changes, rewards };
}
