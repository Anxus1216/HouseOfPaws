const FULL_REASONS = {
  feed: name => `${name}已经吃饱啦`,
  wash: name => `${name}已经很干净啦`,
  play: name => `${name}现在很开心啦`,
  rest: name => `${name}现在精力充沛啦`,
};

const SHORT_REASONS = {
  feed: '已吃饱', wash: '已干净', play: '快乐满满', rest: '精力已满',
};

export function careShortReason(block, action, compact = false) {
  if (!block) return null;
  if (block.kind === 'target_full') return SHORT_REASONS[action] || '暂不可用';
  if (block.kind === 'energy_low') return '先休息';
  if (block.kind === 'insufficient_coins') {
    return compact ? `还差 ${block.missing}` : `还差 ${block.missing} 爪爪币`;
  }
  return '暂不可用';
}

export function careFullReason(block, action, name) {
  if (!block) return null;
  if (block.kind === 'target_full') return FULL_REASONS[action]?.(name) || '暂时无法照料';
  if (block.kind === 'energy_low') return `先让${name}休息一下吧`;
  if (block.kind === 'insufficient_coins') return `喂食还差 ${block.missing} 爪爪币`;
  return block.kind === 'no_pet' ? '没有陪伴萌宠' : '无法执行该照料';
}
