export const CARE_ACTIONS = {
  feed: {
    target: 'hunger', changes: { hunger: 25, happy: 3 }, cost: 5, xp: 10,
    label: '吃饱啦！', fullMessage: '已经吃饱啦', expression: 'happy', duration: 2400,
  },
  wash: {
    target: 'clean', changes: { clean: 29, happy: 4 }, cost: 0, xp: 10,
    label: '香喷喷！', fullMessage: '已经很干净啦', expression: 'happy', duration: 2400,
  },
  play: {
    target: 'happy', changes: { happy: 22, energy: -14, hunger: -7 }, cost: 0, xp: 12,
    label: '玩得好开心！', fullMessage: '已经玩得很开心啦', expression: 'happy', duration: 2400,
  },
  rest: {
    target: 'energy', changes: { energy: 27, hunger: -5 }, cost: 0, xp: 8,
    label: '休息好舒服！', fullMessage: '现在精力很充沛啦',
    expression: 'sleepy', speech: '休息中，补充精力～', duration: 3000,
  },
};
