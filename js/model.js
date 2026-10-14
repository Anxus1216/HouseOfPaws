export const SPECIES = [
  { id: 'cat', name: '奶糖', type: '奶油小猫', color: '#F5CDA5', accent: '#D78B78', cost: 0, line: '一只喜欢晒太阳的小猫' },
  { id: 'rabbit', name: '糯米', type: '垂耳小兔', color: '#E8D9C9', accent: '#D9A7B0', cost: 80, line: '软乎乎的云朵收藏家' },
  { id: 'dog', name: '团团', type: '小柴犬', color: '#DFA777', accent: '#B6785C', cost: 120, line: '热爱奔跑和拥抱的伙伴' },
];

export const STORAGE_KEY = 'paw_house_save_v1';
export const SAVE_VERSION = 2;
export const TASKS = [
  { id: 'care', label: '照料萌宠 1 次', target: 1, reward: 10 },
  { id: 'interact', label: '和萌宠互动 1 次', target: 1, reward: 10 },
  { id: 'game', label: '完成接星星 1 局', target: 1, reward: 20 },
];
const STATS = ['hunger', 'clean', 'happy', 'energy'];
const MAX_COINS = 999999;
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

export function makePet(id) {
  return { id, name: SPECIES.find(s => s.id === id).name, hunger: 76, clean: 82,
    happy: 72, energy: 78, level: 1, xp: 0, actions: 0 };
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
    const pet = makePet(species.id);
    STATS.forEach(key => { pet[key] = validNumber(source[key], pet[key], 0, 100); });
    pet.level = validInteger(source.level, 1, 1, 99);
    pet.xp = validInteger(source.xp, 0, 0, 9999);
    pet.actions = validInteger(source.actions, 0, 0, 999999);
    pet.name = typeof source.name === 'string' && source.name.trim() ? source.name.slice(0, 8) : pet.name;
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
  const elapsedHours = clamp((now - state.lastSeen) / 3600000, 0, 24);
  Object.values(state.pets).forEach(pet => {
    pet.hunger = clamp(pet.hunger - elapsedHours * 1.25, 15, 100);
    pet.clean = clamp(pet.clean - elapsedHours * 0.8, 15, 100);
    pet.happy = clamp(pet.happy - elapsedHours * 0.65, 15, 100);
    pet.energy = clamp(pet.energy + elapsedHours * 1.7, 15, 100);
  });
  state.lastSeen = now;
  return state;
}

export function adopt(state, id) {
  const species = SPECIES.find(item => item.id === id);
  if (!species || state.pets[id] || state.coins < species.cost) return false;
  state.coins -= species.cost;
  state.pets[id] = makePet(id);
  state.active = id;
  return true;
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

export function care(state, action) {
  const pet = state.pets[state.active];
  if (!pet) return null;
  const effects = {
    feed: { hunger: 25, happy: 3, cost: 5, xp: 10, label: '吃饱啦！' },
    wash: { clean: 29, happy: 4, cost: 0, xp: 10, label: '香喷喷！' },
    play: { happy: 22, energy: -14, hunger: -7, cost: 0, xp: 12, label: '玩得好开心！' },
    rest: { energy: 27, hunger: -5, cost: 0, xp: 8, label: '精神满满！' },
  };
  const effect = effects[action];
  if (!effect || state.coins < effect.cost) return { error: '爪爪币不够啦' };
  if (action === 'play' && pet.energy < 15) return { error: '先让宝贝休息一下吧' };
  state.coins -= effect.cost;
  STATS.forEach(key => { if (effect[key]) pet[key] = clamp(pet[key] + effect[key], 0, 100); });
  pet.actions++;
  state.totalActions++;
  const leveled = addXp(pet, effect.xp);
  const bonus = leveled ? Math.min(15, MAX_COINS - state.coins) : 0;
  state.coins += bonus;
  return { label: leveled ? `升级啦！获得 ${bonus} 爪爪币` : effect.label, leveled };
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

export function canDaily(state, now = Date.now()) {
  const key = dayKey(now);
  return dateOrder(state.lastDaily) < dateOrder(key) && state.coins <= MAX_COINS - 30;
}

export function daily(state, now = Date.now()) {
  if (!canDaily(state, now)) return false;
  const key = dayKey(now);
  state.lastDaily = key;
  state.coins += 30;
  return true;
}

export function miniReward(state, score) {
  const pet = state.pets[state.active];
  if (!pet) return null;
  score = validInteger(score, 0, 0, 999999);
  const coins = Math.min(30, Math.max(0, score) * 3, MAX_COINS - state.coins);
  state.coins += coins;
  pet.happy = clamp(pet.happy + Math.min(20, score * 3), 0, 100);
  const leveled = addXp(pet, Math.min(25, score * 3));
  const bonus = leveled ? Math.min(15, MAX_COINS - state.coins) : 0;
  state.coins += bonus;
  return leveled ? { coins, leveled, bonus } : { coins, leveled };
}
