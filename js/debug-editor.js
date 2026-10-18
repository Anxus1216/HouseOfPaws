import { DEBUG_ENABLED } from './debug-config.generated.js';
import { TASKS, dayKey, ensureTasks, settleTime, MAX_DAILY_GROWTH } from './model.js';

export const PET_FIELDS = [
  { key: 'hunger', label: '饱腹', max: 100, integer: false },
  { key: 'clean', label: '清洁', max: 100, integer: false },
  { key: 'happy', label: '快乐', max: 100, integer: false },
  { key: 'energy', label: '精力', max: 100, integer: false },
  { key: 'level', label: '等级', min: 1, max: 99, integer: true },
  { key: 'xp', label: '经验', max: 9999, integer: true },
  { key: 'actions', label: '照料次数', max: 999999, integer: true },
  { key: 'dailyGrowth', label: '今日成长', max: MAX_DAILY_GROWTH, integer: true },
];

const dateOrder = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{1,2}-\d{1,2}$/.test(value)) return -1;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() + 1 === month &&
    date.getDate() === day ? year * 10000 + month * 100 + day : -1;
};

const effectiveDate = (saved, now) =>
  dateOrder(saved) >= dateOrder(dayKey(now)) ? saved : dayKey(now);

const taskProgressKey = id => `task.${id}.progress`;
const taskClaimedKey = id => `task.${id}.claimed`;

export function createDebugDraft(state, now = Date.now()) {
  const pet = state.pets[state.active] || null;
  const taskDate = effectiveDate(state.tasks?.date, now);
  const growthDate = pet ? effectiveDate(pet.dailyGrowth?.date, now) : null;
  const values = { coins: String(state.coins) };
  if (pet) {
    PET_FIELDS.forEach(field => {
      values[field.key] = String(field.key === 'dailyGrowth'
        ? pet.dailyGrowth?.date === growthDate ? pet.dailyGrowth.earned : 0
        : field.integer ? pet[field.key] : Math.round(pet[field.key] * 100) / 100);
    });
  }
  TASKS.forEach(task => {
    const current = state.tasks?.date === taskDate;
    values[taskProgressKey(task.id)] = String(current ? state.tasks.progress[task.id] : 0);
    values[taskClaimedKey(task.id)] = !!(current && state.tasks.claimed[task.id]);
  });
  return { petId: pet?.id || null, petName: pet?.name || '', taskDate, growthDate,
    values, original: { ...values } };
}

export const draftChanged = draft => Object.keys(draft.values).some(key =>
  draft.values[key] !== draft.original[key]);

function parseNumber(value, { min = 0, max, integer }) {
  const pattern = integer ? /^(0|[1-9]\d*)$/ : /^(0|[1-9]\d*)(?:\.\d{1,2})?$/;
  if (typeof value !== 'string' || !pattern.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max &&
    (!integer || Number.isSafeInteger(number)) ? number : null;
}

export function validateDebugDraft(draft) {
  const errors = {};
  const parsed = { pet: {}, tasks: {} };
  parsed.coins = parseNumber(draft.values.coins, { max: 999999, integer: true });
  if (parsed.coins === null) errors.coins = '请输入 0–999999 的整数';
  if (draft.petId) {
    PET_FIELDS.forEach(field => {
      const number = parseNumber(draft.values[field.key], field);
      parsed.pet[field.key] = number;
      if (number === null) errors[field.key] = field.min
        ? `请输入 ${field.min}–${field.max} 的整数`
        : `请输入 0–${field.max} 的${field.integer ? '整数' : '数值，最多两位小数'}`;
    });
    if (parsed.pet.level !== null && parsed.pet.xp !== null &&
        (parsed.pet.level === 99 ? parsed.pet.xp !== 0 :
          parsed.pet.xp >= parsed.pet.level * 40)) {
      errors.xp = parsed.pet.level === 99 ? '99 级经验必须为 0' :
        `当前等级经验须小于 ${parsed.pet.level * 40}`;
    }
  }
  TASKS.forEach(task => {
    const progressKey = taskProgressKey(task.id);
    const claimedKey = taskClaimedKey(task.id);
    const progress = parseNumber(draft.values[progressKey], { max: task.target, integer: true });
    const claimed = draft.values[claimedKey];
    parsed.tasks[task.id] = { progress, claimed };
    if (progress === null) errors[progressKey] = `请输入 0–${task.target} 的整数`;
    if (typeof claimed !== 'boolean') errors[claimedKey] = '请选择领奖状态';
    if (claimed === true && progress !== null && progress < task.target) {
      errors[progressKey] = '已领奖任务的进度须达到目标';
    }
  });
  return { valid: Object.keys(errors).length === 0, errors, parsed };
}

function cloneState(state) {
  const pets = {};
  Object.keys(state.pets).forEach(id => {
    const pet = state.pets[id];
    pets[id] = { ...pet, dailyGrowth: pet.dailyGrowth && { ...pet.dailyGrowth } };
  });
  return { ...state, pets, tasks: { ...state.tasks,
    progress: { ...state.tasks.progress }, claimed: { ...state.tasks.claimed } } };
}

export function prepareDebugState(state, draft, now = Date.now()) {
  if (state.active !== draft.petId || (draft.petId && !state.pets[draft.petId])) {
    return { error: '陪伴萌宠已变化，请重新打开调试模式', reason: 'pet_changed' };
  }
  const candidate = cloneState(state);
  settleTime(candidate, now);
  ensureTasks(candidate, now);
  const pet = draft.petId ? candidate.pets[draft.petId] : null;
  if (pet && dateOrder(pet.dailyGrowth?.date) < dateOrder(dayKey(now))) {
    pet.dailyGrowth = { date: dayKey(now), earned: 0 };
  }
  if (candidate.tasks.date !== draft.taskDate ||
      (pet && pet.dailyGrowth.date !== draft.growthDate)) {
    return { error: '日期已变化，请重新确认今日数据', reason: 'date_changed' };
  }
  const result = validateDebugDraft(draft);
  if (!result.valid) return { error: '请检查标红的字段', errors: result.errors, reason: 'invalid' };
  const { values, original } = draft;
  if (values.coins !== original.coins) candidate.coins = result.parsed.coins;
  if (pet) {
    PET_FIELDS.forEach(field => {
      if (values[field.key] === original[field.key]) return;
      if (field.key === 'dailyGrowth') pet.dailyGrowth.earned = result.parsed.pet.dailyGrowth;
      else pet[field.key] = result.parsed.pet[field.key];
    });
  }
  TASKS.forEach(task => {
    const progressKey = taskProgressKey(task.id);
    const claimedKey = taskClaimedKey(task.id);
    if (values[progressKey] !== original[progressKey]) {
      candidate.tasks.progress[task.id] = result.parsed.tasks[task.id].progress;
    }
    if (values[claimedKey] !== original[claimedKey]) {
      candidate.tasks.claimed[task.id] = result.parsed.tasks[task.id].claimed;
    }
  });
  return { state: candidate };
}

export function commitDebugDraft(state, draft, now, persist, enabled = DEBUG_ENABLED) {
  if (enabled !== true) return { error: '调试模式未开启', reason: 'disabled' };
  const prepared = prepareDebugState(state, draft, now);
  if (!prepared.state) return prepared;
  try { persist(prepared.state); }
  catch (error) { return { error: '本机存档暂时不可用，请重试', reason: 'storage' }; }
  return { state: prepared.state };
}
