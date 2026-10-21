import { CARE_ACTIONS, MIN_PLAY_ENERGY_REMAINING } from './care-actions.js';

export const SPECIES = [
  { id: 'cat', name: '奶糖', type: '奶油小猫', color: '#F5CDA5', accent: '#D78B78', cost: 0, line: '一只喜欢晒太阳的小猫' },
  { id: 'rabbit', name: '糯米', type: '垂耳小兔', color: '#E8D9C9', accent: '#D9A7B0', cost: 80, line: '软乎乎的云朵收藏家' },
  { id: 'dog', name: '团团', type: '小柴犬', color: '#DFA777', accent: '#B6785C', cost: 120, line: '热爱奔跑和拥抱的伙伴' },
];

export const STORAGE_KEY = 'paw_house_save_v1';
export const SAVE_VERSION = 3;
export const MAX_DAILY_GROWTH = 100;
export const DAILY_GIFT_COINS = 30;
export const GAME_MAX_COINS = 30;
export const TASKS = [
  { id: 'care', label: '照料萌宠 1 次', target: 1, reward: 10 },
  { id: 'interact', label: '和萌宠互动 1 次', target: 1, reward: 10 },
  { id: 'game', label: '完成接星星 1 局', target: 1, reward: 20 },
];
const STATS = ['hunger', 'clean', 'happy', 'energy'];
export const MAX_COINS = 999999;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const dateOrder = key => {
  if (typeof key !== 'string' || !/^\d{4}-\d{1,2}-\d{1,2}$/.test(key)) return -1;
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() + 1 === month &&
    date.getDate() === day ? year * 10000 + month * 100 + day : -1;
};
const validNumber = (value, fallback, min, max) => {
  const number = Number(value);
  return value === null || value === undefined || !Number.isFinite(number)
    ? fallback : clamp(number, min, max);
};
const validInteger = (value, fallback, min, max) =>
  Math.floor(validNumber(value, fallback, min, max));
const validTime = (value, fallback) => {
  if (value === null || value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= fallback ? number : fallback;
};

function freshTasks(now) {
  return { date: dayKey(now), progress: { care: 0, interact: 0, game: 0 },
    claimed: { care: false, interact: false, game: false } };
}

export function makePet(id, now = Date.now()) {
  return { id, name: SPECIES.find(s => s.id === id).name, hunger: 76, clean: 82,
    happy: 72, energy: 78, level: 1, xp: 0, actions: 0,
    dailyGrowth: { date: dayKey(now), earned: 0 } };
}

export function initialState(now = Date.now()) {
  return { version: SAVE_VERSION, pets: {}, active: null, coins: 60, lastSeen: now,
    lastDaily: '', totalActions: 0, tasks: freshTasks(now), guideStep: 1,
    soundEnabled: true };
}

export function hydrate(raw, now = Date.now()) {
  const fallback = initialState(now);
  if (!raw || typeof raw !== 'object') return fallback;
  const state = { ...fallback, coins: validInteger(raw.coins, fallback.coins, 0, MAX_COINS),
    lastSeen: validTime(raw.lastSeen, now),
    lastDaily: typeof raw.lastDaily === 'string' ? raw.lastDaily : '',
    totalActions: validInteger(raw.totalActions, 0, 0, 999999), pets: {} };
  SPECIES.forEach(species => {
    const source = raw.pets && raw.pets[species.id];
    if (!source || typeof source !== 'object' || Array.isArray(source)) return;
    const pet = makePet(species.id, now);
    STATS.forEach(key => { pet[key] = validNumber(source[key], pet[key], 0, 100); });
    pet.level = validInteger(source.level, 1, 1, 99);
    pet.xp = validInteger(source.xp, 0, 0, 9999);
    pet.actions = validInteger(source.actions, 0, 0, 999999);
    pet.name = typeof source.name === 'string' && source.name.trim() ? source.name.slice(0, 8) : pet.name;
    if (source.dailyGrowth && typeof source.dailyGrowth === 'object' &&
        dateOrder(source.dailyGrowth.date) >= dateOrder(dayKey(now))) {
      pet.dailyGrowth = { date: source.dailyGrowth.date,
        earned: validInteger(source.dailyGrowth.earned, 0, 0, MAX_DAILY_GROWTH) };
    }
    state.pets[species.id] = pet;
  });
  state.active = state.pets[raw.active] ? raw.active : Object.keys(state.pets)[0] || null;
  state.guideStep = validInteger(raw.guideStep,
    Object.keys(state.pets).length ? 0 : 1, 0, 3);
  state.soundEnabled = typeof raw.soundEnabled === 'boolean' ? raw.soundEnabled : true;
  if (raw.tasks && typeof raw.tasks === 'object' &&
      dateOrder(raw.tasks.date) >= dateOrder(dayKey(now))) {
    state.tasks.date = raw.tasks.date;
    TASKS.forEach(task => {
      const claimed = raw.tasks.claimed && raw.tasks.claimed[task.id] === true;
      state.tasks.progress[task.id] = claimed ? task.target :
        validInteger(raw.tasks.progress && raw.tasks.progress[task.id], 0, 0, task.target);
      state.tasks.claimed[task.id] = claimed;
    });
  }
  settleTime(state, now);
  return state;
}

export function settleTime(state, now = Date.now()) {
  if (!Number.isFinite(now) || now <= state.lastSeen) return 0;
  const elapsedHours = Math.min((now - state.lastSeen) / 3600000, 24);
  Object.values(state.pets).forEach(pet => {
    pet.hunger = Math.max(Math.min(pet.hunger, 15), pet.hunger - elapsedHours * 1.25);
    pet.clean = Math.max(Math.min(pet.clean, 15), pet.clean - elapsedHours * 0.8);
    pet.happy = Math.max(Math.min(pet.happy, 15), pet.happy - elapsedHours * 0.65);
    pet.energy = clamp(pet.energy + elapsedHours * 1.7, 0, 100);
  });
  state.lastSeen = now;
  return elapsedHours;
}

export function adopt(state, id, now = Date.now()) {
  const cost = adoptionCost(state, id);
  if (cost === null || state.pets[id] || state.coins < cost) return false;
  state.coins -= cost;
  state.pets[id] = makePet(id, now);
  state.active = id;
  return true;
}

export function adoptionCost(state, id) {
  return SPECIES.find(item => item.id === id)?.cost ?? null;
}

export function petCardState(state, id) {
  const cost = adoptionCost(state, id);
  if (cost === null) return null;
  if (state.pets[id]) return { kind: state.active === id ? 'current' : 'owned', cost };
  const missing = Math.max(0, cost - state.coins);
  return { kind: missing ? 'short' : 'affordable', cost, missing };
}

export function selectPet(state, id) {
  if (!state.pets[id] || state.active === id) return false;
  state.active = id;
  return true;
}

export function careBlock(state, action) {
  const pet = state.pets[state.active];
  if (!pet) return { kind: 'no_pet' };
  const effect = CARE_ACTIONS[action];
  if (!effect) return { kind: 'invalid_action' };
  if (Math.round(pet[effect.target]) >= 100) return { kind: 'target_full' };
  if (action === 'play' && pet.energy + effect.changes.energy < MIN_PLAY_ENERGY_REMAINING) {
    return { kind: 'energy_low' };
  }
  if (state.coins < effect.cost) return { kind: 'insufficient_coins', missing: effect.cost - state.coins };
  return null;
}

function careBlockMessage(block, action) {
  if (!block) return null;
  if (block.kind === 'target_full') return CARE_ACTIONS[action].fullMessage;
  if (block.kind === 'energy_low') return '先让宝贝休息一下吧';
  if (block.kind === 'insufficient_coins') return '爪爪币不够啦';
  return block.kind === 'no_pet' ? '没有陪伴萌宠' : '无法执行该照料';
}

export function careBlockReason(state, action) {
  return careBlockMessage(careBlock(state, action), action);
}

export function addXp(pet, amount) {
  if (pet.level >= 99) { pet.xp = 0; return false; }
  pet.xp += amount;
  let leveled = false;
  while (pet.level < 99 && pet.xp >= pet.level * 40) {
    pet.xp -= pet.level * 40;
    pet.level++;
    leveled = true;
  }
  if (pet.level >= 99) pet.xp = 0;
  return leveled;
}

export function getDailyGrowth(pet, now = Date.now()) {
  if (!pet || !pet.dailyGrowth ||
      dateOrder(pet.dailyGrowth.date) < dateOrder(dayKey(now))) return 0;
  return validInteger(pet.dailyGrowth.earned, 0, 0, MAX_DAILY_GROWTH);
}

function awardGrowth(pet, amount, now) {
  const key = dayKey(now);
  if (!pet.dailyGrowth || dateOrder(pet.dailyGrowth.date) < dateOrder(key)) {
    pet.dailyGrowth = { date: key, earned: 0 };
  }
  if (pet.level >= 99) { addXp(pet, 0); return { xp: 0, leveled: false }; }
  let untilMaxLevel = -pet.xp;
  for (let level = pet.level; level < 99; level++) untilMaxLevel += level * 40;
  const xp = Math.max(0, Math.min(amount,
    MAX_DAILY_GROWTH - getDailyGrowth(pet, now), untilMaxLevel));
  const leveled = xp > 0 && addXp(pet, xp);
  pet.dailyGrowth.earned += xp;
  return { xp, leveled };
}

export function care(state, action, now = Date.now()) {
  const pet = state.pets[state.active];
  if (!pet) return null;
  const block = careBlock(state, action);
  if (block) return { error: careBlockMessage(block, action), block };
  const effect = CARE_ACTIONS[action];
  state.coins -= effect.cost;
  STATS.forEach(key => { if (effect.changes[key]) pet[key] = clamp(pet[key] + effect.changes[key], 0, 100); });
  pet.actions++;
  state.totalActions++;
  const { xp, leveled } = awardGrowth(pet, effect.xp, now);
  const bonus = leveled ? Math.min(15, MAX_COINS - state.coins) : 0;
  state.coins += bonus;
  return { label: leveled ? `升级啦！获得 ${bonus} 爪爪币` : effect.label,
    leveled, xp, bonus };
}

export function dayKey(now = Date.now()) {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function ensureTasks(state, now = Date.now()) {
  const key = dayKey(now);
  if (!state.tasks || dateOrder(state.tasks.date) < dateOrder(key)) state.tasks = freshTasks(now);
  return state.tasks;
}

// Read today's task status without changing a save during route discovery.
export function taskSnapshot(state, now = Date.now()) {
  const order = dateOrder(state.tasks?.date);
  const today = dateOrder(dayKey(now));
  return order > today ? null : order === today ? state.tasks : freshTasks(now);
}

export function recordTask(state, id, now = Date.now()) {
  const task = TASKS.find(item => item.id === id);
  if (!task) return false;
  const tasks = ensureTasks(state, now);
  if (tasks.progress[id] >= task.target) return false;
  tasks.progress[id]++;
  return true;
}

export function claimTask(state, id, now = Date.now()) {
  const task = TASKS.find(item => item.id === id);
  if (!task) return null;
  const tasks = ensureTasks(state, now);
  if (tasks.claimed[id] || tasks.progress[id] < task.target ||
      state.coins > MAX_COINS - task.reward) return null;
  tasks.claimed[id] = true;
  state.coins += task.reward;
  return { reward: task.reward };
}

export function dailyAvailability(state, now = Date.now()) {
  const key = dayKey(now);
  if (dateOrder(state.lastDaily) >= dateOrder(key)) return 'claimed';
  return state.coins <= MAX_COINS - DAILY_GIFT_COINS ? 'claimable' : 'wallet_full';
}

export function canDaily(state, now = Date.now()) {
  return dailyAvailability(state, now) === 'claimable';
}

export function daily(state, now = Date.now()) {
  if (!canDaily(state, now)) return false;
  const key = dayKey(now);
  state.lastDaily = key;
  state.coins += DAILY_GIFT_COINS;
  return true;
}

export function miniReward(state, score, now = Date.now()) {
  const pet = state.pets[state.active];
  if (!pet) return null;
  score = validInteger(score, 0, 0, 999999);
  const coins = Math.min(GAME_MAX_COINS, Math.max(0, score) * 3, MAX_COINS - state.coins);
  state.coins += coins;
  pet.happy = clamp(pet.happy + Math.min(20, score * 3), 0, 100);
  const { xp, leveled } = awardGrowth(pet, Math.min(25, score * 3), now);
  const bonus = leveled ? Math.min(15, MAX_COINS - state.coins) : 0;
  state.coins += bonus;
  return leveled ? { coins, leveled, bonus, xp } : { coins, leveled, xp };
}
