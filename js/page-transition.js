export const PAGE_TRANSITION_DURATION_MS = 180;
const MAIN_PAGES = new Set(['home', 'collection', 'tasks', 'game', 'profile']);

export function createTransition(page = 'home', options = {}) {
  const initialPage = MAIN_PAGES.has(page) ? page : 'home';
  const durationMs = Number.isFinite(options.durationMs) && options.durationMs >= 0 ?
    options.durationMs : PAGE_TRANSITION_DURATION_MS;
  return {
    displayPage: initialPage, targetPage: initialPage, phase: 'idle', alpha: 1,
    startAlpha: 1, startedAt: 0, segmentDurationMs: 0, durationMs, lastNow: 0,
  };
}

export function transitionFrame(transition) {
  return {
    displayPage: transition.displayPage, targetPage: transition.targetPage,
    alpha: transition.alpha, active: transition.phase !== 'idle',
  };
}

function signature(transition) {
  return [transition.displayPage, transition.targetPage, transition.phase, transition.alpha];
}

function report(transition, before, wasActive, completed = false) {
  const current = signature(transition);
  return { ...transitionFrame(transition), wasActive,
    changed: current.some((value, index) => value !== before[index]), completed };
}

function clock(transition, now) {
  // A clock adjustment must not reverse an animation already shown to the player.
  transition.lastNow = Math.max(transition.lastNow,
    Number.isFinite(now) ? now : transition.lastNow);
  return transition.lastNow;
}

function beginSegment(transition, phase, now) {
  transition.phase = phase;
  transition.startAlpha = transition.alpha;
  transition.startedAt = now;
  const distance = phase === 'out' ? transition.alpha : 1 - transition.alpha;
  transition.segmentDurationMs = transition.durationMs / 2 * distance;
}

function settle(transition) {
  transition.displayPage = transition.targetPage;
  transition.phase = 'idle';
  transition.alpha = 1;
  transition.startAlpha = 1;
  transition.segmentDurationMs = 0;
}

export function advanceTransition(transition, now) {
  const before = signature(transition);
  const wasActive = transition.phase !== 'idle';
  const currentTime = clock(transition, now);
  while (transition.phase !== 'idle') {
    const elapsed = currentTime - transition.startedAt;
    if (transition.segmentDurationMs > 0 && elapsed < transition.segmentDurationMs) {
      const progress = Math.max(0, elapsed / transition.segmentDurationMs);
      const endAlpha = transition.phase === 'out' ? 0 : 1;
      transition.alpha = transition.startAlpha + (endAlpha - transition.startAlpha) * progress;
      break;
    }
    // Preserve the original phase boundary so a long frame can finish both halves.
    const boundary = transition.startedAt + transition.segmentDurationMs;
    if (transition.phase === 'out') {
      transition.alpha = 0;
      transition.displayPage = transition.targetPage;
      beginSegment(transition, 'in', boundary);
    } else {
      settle(transition);
    }
  }
  return report(transition, before, wasActive, wasActive && transition.phase === 'idle');
}

export function finishTransition(transition) {
  const before = signature(transition);
  const wasActive = transition.phase !== 'idle';
  const completed = wasActive || transition.displayPage !== transition.targetPage;
  settle(transition);
  return report(transition, before, wasActive, completed);
}

export function requestTransition(transition, nextPage, now, options = {}) {
  const before = signature(transition);
  const wasActive = transition.phase !== 'idle';
  if (!MAIN_PAGES.has(nextPage)) {
    return { ...report(transition, before, wasActive), accepted: false };
  }
  const advanced = advanceTransition(transition, now);
  if (nextPage === transition.targetPage) {
    return { ...report(transition, before, wasActive, advanced.completed), accepted: false };
  }
  transition.targetPage = nextPage;
  if (options.immediate || transition.durationMs === 0) {
    settle(transition);
  } else if (nextPage === transition.displayPage) {
    beginSegment(transition, 'in', transition.lastNow);
  } else if (transition.phase !== 'out') {
    beginSegment(transition, 'out', transition.lastNow);
  }
  // While fading out, only replace the target: do not extend the deadline.
  const frame = advanceTransition(transition, transition.lastNow);
  return { ...report(transition, before, wasActive,
    advanced.completed || frame.completed || transition.phase === 'idle'), accepted: true };
}
