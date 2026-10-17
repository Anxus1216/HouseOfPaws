import { CARE_ACTIONS } from './care-actions.js';

const NEED_SPEECH = {
  hunger: '肚子饿啦，想吃点东西',
  clean: '想洗个澡啦',
  happy: '想和你玩一会儿',
  energy: '好累呀，想休息啦',
};

export const FEEDBACK_MS = { tap: 1800,
  ...Object.fromEntries(Object.entries(CARE_ACTIONS).map(([id, action]) => [id, action.duration])) };
export const ACTION_SPEECH = Object.fromEntries(Object.entries(CARE_ACTIONS)
  .map(([id, action]) => [id, action.speech || action.label]));

export function petDisplay(pet, ui, now = Date.now()) {
  if (ui.expressionUntil > now) {
    return { expression: ui.expression, action: ui.action || '',
      speech: ui.speech || '', statDelta: ui.statDelta || '' };
  }
  const lowest = ['hunger', 'clean', 'happy', 'energy']
    .reduce((key, next) => pet[next] < pet[key] ? next : key);
  if (pet[lowest] < 25) {
    return { expression: 'need', action: '', speech: NEED_SPEECH[lowest], statDelta: '' };
  }
  if (pet.energy < 29) {
    return { expression: 'sleepy', action: '', speech: '有点困啦', statDelta: '' };
  }
  return { expression: 'normal', action: '', speech: '', statDelta: '' };
}
