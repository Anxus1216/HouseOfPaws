import { careBlock } from './model.js';

const NEEDS = [
  { field: 'energy', action: 'rest', phrase: name => `${name}有点累了，歇一会儿吧` },
  { field: 'hunger', action: 'feed', phrase: name => `${name}有点饿了，吃点东西吧` },
  { field: 'clean', action: 'wash', phrase: name => `${name}想清爽一下` },
  { field: 'happy', action: 'play', phrase: name => `${name}想和你玩一会儿` },
];

export function homeAdvice(state) {
  const pet = state.pets[state.active];
  if (!pet) return null;
  for (const threshold of [25, 40]) {
    const need = NEEDS.find(item => pet[item.field] < threshold);
    if (!need) continue;
    const block = careBlock(state, need.action);
    if (block?.kind === 'energy_low') {
      return { kind: 'care', action: 'rest', name: pet.name, prerequisite: true };
    }
    if (block?.kind === 'insufficient_coins') {
      return { kind: 'coins', action: need.action, name: pet.name, missing: block.missing };
    }
    return { kind: 'care', action: need.action, name: pet.name };
  }
  return { kind: 'pet', name: pet.name };
}

export function homeAdviceText(advice, compact = false) {
  if (!advice) return '';
  if (advice.kind === 'coins') {
    return compact ? '攒点爪爪币，再给它喂食吧' :
      `再攒 ${advice.missing} 爪爪币，就能给${advice.name}喂食啦`;
  }
  const name = compact ? '它' : advice.name;
  if (advice.prerequisite) return `${name}先歇一会儿，再一起玩吧`;
  if (advice.kind === 'pet') return `${name}看起来很开心，摸摸它吧`;
  return NEEDS.find(item => item.action === advice.action).phrase(name);
}

export function homeAdviceDetail(advice, compact = false) {
  const name = compact ? '它' : advice.name;
  if (advice?.prerequisite) return `可以先点「休息」，等${name}恢复精力再玩`;
  if (advice?.kind === 'pet') return `可以轻点${name}，陪它互动一下`;
  const labels = { feed: '喂食', wash: '清洁', play: '玩耍', rest: '休息' };
  return `想照料${name}，可以点下方「${labels[advice.action]}」`;
}
