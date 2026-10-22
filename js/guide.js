import { CARE_ACTIONS } from './care-actions.js';
import { TASKS, careBlock, pendingDailyTaskCount, taskClaimState } from './model.js';

const FACT_EVENTS = {
  pet_tap: 'interacted', care_success: 'cared',
  game_complete: 'naturalGame', task_claim: 'claimedTask',
};
const ACTIVE_PHASES = new Set(['interact', 'care', 'claim']);
const NEXT_TASK_PRIORITY = ['interact', 'game', 'care'];

function availableCare(state) {
  return Object.keys(CARE_ACTIONS).filter(action => !careBlock(state, action));
}

function pendingTask(state, now) {
  return TASKS.find(task => {
    const kind = taskClaimState(state, task.id, now).kind;
    return kind === 'claimable' || kind === 'wallet_full' || kind === 'space_short';
  });
}

function nextTask(state, now) {
  const canCare = availableCare(state).length > 0;
  for (const id of NEXT_TASK_PRIORITY) {
    if (id === 'care' && !canCare) continue;
    if (taskClaimState(state, id, now).kind === 'incomplete') {
      return TASKS.find(task => task.id === id);
    }
  }
  return null;
}

// Advance only from saved facts and today's live availability. Repeated calls are safe.
export function reconcileGuide(state, now = Date.now()) {
  const guide = state?.guide;
  if (!guide || !ACTIVE_PHASES.has(guide.phase)) return false;
  let changed = false;
  if (guide.phase === 'interact' && guide.facts.interacted) {
    guide.phase = 'care';
    changed = true;
  }
  if (guide.phase === 'care') {
    if (guide.facts.cared) {
      guide.phase = 'claim';
      guide.branch = 'care';
      changed = true;
    } else if (!availableCare(state).length) {
      if (guide.facts.naturalGame) {
        guide.phase = 'claim';
        guide.branch = 'game';
        changed = true;
      } else if (pendingDailyTaskCount(state, now) > 0) {
        guide.phase = 'claim';
        guide.branch = 'pending_reward';
        changed = true;
      }
    }
  }
  if (guide.phase === 'claim' && guide.facts.claimedTask) {
    guide.phase = 'outro';
    changed = true;
  }
  return changed;
}

// The caller emits events only after the corresponding action has succeeded.
export function recordGuideEvent(state, event, now = Date.now()) {
  const guide = state?.guide;
  if (!guide) return false;
  if (event === 'skip' && (guide.phase === 'await_adoption' || ACTIVE_PHASES.has(guide.phase) || guide.phase === 'outro')) {
    guide.phase = 'skipped';
    return true;
  }
  if (event === 'finish' && guide.phase === 'outro') {
    guide.phase = 'done';
    return true;
  }
  if (event === 'adopt' && guide.phase === 'await_adoption' && state.active === 'cat' &&
      Object.keys(state.pets).length === 1) {
    guide.phase = 'interact';
    return true;
  }
  const fact = FACT_EVENTS[event];
  if (!fact || !ACTIVE_PHASES.has(guide.phase)) return false;
  const newFact = !guide.facts[fact];
  guide.facts[fact] = true;
  return reconcileGuide(state, now) || newFact;
}

export function guideInteractionResponse(state) {
  if (state?.guide?.phase !== 'interact') return null;
  const name = state.pets[state.active]?.name || '小伙伴';
  return `${name}记住你啦`;
}

export function guideView(state, page, now = Date.now()) {
  const guide = state?.guide;
  if (!guide || (!ACTIVE_PHASES.has(guide.phase) && guide.phase !== 'outro')) return null;
  const name = state.pets[state.active]?.name || '小伙伴';
  if (guide.phase === 'interact') return {
    phase: 'interact', step: 1, label: '1 / 3 · 打招呼',
    text: `轻点${name}，和它打个招呼`, targetIds: [page === 'home' ? 'pet_tap' : 'nav_home'],
  };
  if (guide.phase === 'care') {
    const actions = availableCare(state);
    if (actions.length) return {
      phase: 'care', step: 2, label: '2 / 3 · 照料萌宠',
      text: `选一种照料方式，看看${name}的反应`,
      targetIds: page === 'home' ? actions : ['nav_home'],
    };
    const pending = pendingDailyTaskCount(state, now) > 0;
    return {
      phase: 'care', step: 2, label: '2 / 3 · 照料萌宠',
      text: pending ? '已有任务奖励可领，先去任务页看看吧' :
        '现在暂时无法照料，先完成一局接星星吧',
      targetIds: pending ?
        [page === 'tasks' ? `claim_${pendingTask(state, now)?.id || 'interact'}` : 'nav_tasks'] :
        [page === 'game' ? 'start_game' : 'nav_game'],
    };
  }
  if (guide.phase === 'claim') {
    const task = pendingTask(state, now);
    const kind = task && taskClaimState(state, task.id, now).kind;
    const next = task ? null : nextTask(state, now);
    const dateGuard = !task && !next && TASKS.some(item =>
      taskClaimState(state, item.id, now).kind === 'date_guard');
    let targetIds = [];
    if (!dateGuard && task) targetIds = page === 'tasks' ? [`claim_${task.id}`] : ['nav_tasks'];
    else if (!dateGuard && next) {
      if (page === 'tasks') targetIds = [`task_go_${next.id}`];
      else if (next.id === 'game') targetIds = [page === 'game' ? 'start_game' : 'nav_game'];
      else if (page !== 'home') targetIds = ['nav_home'];
      else targetIds = next.id === 'interact' ? ['pet_tap'] : availableCare(state);
    }
    return { phase: 'claim', step: 3, label: '3 / 3 · 领取奖励',
      text: kind === 'wallet_full' || kind === 'space_short' ?
        '先花掉一些爪爪币，再领取完整奖励' :
        task ? '去任务页，领走刚完成的奖励' :
          dateGuard ? '日期变化后，再来看看今日任务吧' :
            '再完成一个小任务，就能领取奖励',
      targetIds,
    };
  }
  return { phase: 'outro', step: 3, label: '引导完成', title: '小小约定完成啦！',
    text: '想继续攒爪爪币？试试 20 秒接星星', targetIds: [] };
}
