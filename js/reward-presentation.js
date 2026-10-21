export function rewardButtonLabel(kind, gift = false) {
  if (kind === 'claimed') return gift ? '今日已领取' : '已领取';
  if (kind === 'wallet_full' || kind === 'space_short') return '装不下啦！';
  if (kind === 'claimable') return gift ? '领取礼物' : '领取奖励';
  if (kind === 'date_guard') return '日期待确认';
  return null;
}

export function rewardSpaceHelp(status, gift = false) {
  if (status.kind !== 'wallet_full' && status.kind !== 'space_short') return null;
  const reason = status.kind === 'wallet_full'
    ? '先花掉一些爪爪币，再领取完整奖励'
    : `还需腾出 ${status.missing} 爪爪币，才能领取完整奖励`;
  return { title: status.kind === 'space_short' ? '余额空间不足' : '爪爪币已满', lines: gift
    ? [reason, '今天花币后仍可领取，换日后无法补领']
    : [reason, '今天花币后仍可领取', '换日后这笔日任务奖励会失效'] };
}
