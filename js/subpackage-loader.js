export const SUBPACKAGE_FOREGROUND_TIMEOUT_MS = 60_000;
export const RESOURCE_SUBPACKAGES = Object.freeze([
  Object.freeze({ name: 'petSprites', root: 'assets/pets/sprites/' }),
  Object.freeze({ name: 'gameAudio', root: 'audio/' }),
]);

export function createSubpackageLoader({ loadSubpackage, onState = () => {}, onReady = () => {},
  now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout,
  timeoutMs = SUBPACKAGE_FOREGROUND_TIMEOUT_MS } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError('Invalid subpackage timeout');
  let status = 'idle';
  let index = 0;
  let progress = null;
  let reason = null;
  let visible = true;
  let deliveredReady = false;
  let operation = null;
  const completed = [];

  const getState = () => ({ status, packageName: RESOURCE_SUBPACKAGES[index]?.name ?? null,
    stage: Math.min(index + 1, RESOURCE_SUBPACKAGES.length), total: RESOURCE_SUBPACKAGES.length,
    progress, reason, canRetry: status === 'failed' && reason !== 'unsupported', completed: [...completed] });
  const publish = () => { if (status !== 'disposed') onState(getState()); };
  const current = candidate => operation === candidate && status === 'loading';

  function stopTimer(candidate) {
    if (candidate?.timer !== null && candidate?.timer !== undefined) clearTimer(candidate.timer);
    if (candidate) candidate.timer = null;
  }

  function invalidate() {
    stopTimer(operation);
    operation = null;
  }

  function fail(candidate, failure) {
    if (!current(candidate)) return;
    invalidate();
    status = 'failed';
    reason = failure;
    publish();
  }

  function armTimer(candidate) {
    if (!visible || !current(candidate)) return;
    candidate.startedAt = now();
    candidate.timer = setTimer(() => fail(candidate, 'timeout'), candidate.remainingMs);
  }

  function notifyReady() {
    if (status !== 'ready' || !visible || deliveredReady) return;
    deliveredReady = true;
    onReady();
  }

  function loadNext() {
    if (index === RESOURCE_SUBPACKAGES.length) {
      status = 'ready';
      progress = 100;
      publish();
      notifyReady();
      return;
    }
    status = 'loading';
    reason = null;
    progress = null;
    const candidate = { timer: null, startedAt: null, remainingMs: timeoutMs };
    operation = candidate;
    publish();
    if (!current(candidate)) return;
    armTimer(candidate);
    try {
      const task = loadSubpackage({ name: RESOURCE_SUBPACKAGES[index].name,
        success() {
          if (!current(candidate)) return;
          invalidate();
          completed.push(RESOURCE_SUBPACKAGES[index].name);
          index++;
          loadNext();
        },
        fail: () => fail(candidate, 'load_failed'),
        complete() {},
      });
      // Cached packages can finish synchronously, before a task is returned.
      if (current(candidate) && typeof task?.onProgressUpdate === 'function') {
        task.onProgressUpdate(event => {
          if (!current(candidate) || !Number.isFinite(event?.progress)) return;
          progress = Math.max(progress ?? 0, Math.min(100, Math.max(0, event.progress)));
          publish();
        });
      }
    } catch (error) {
      fail(candidate, 'load_exception');
    }
  }

  return {
    getState,
    start() {
      if (status !== 'idle') return;
      if (typeof loadSubpackage !== 'function') {
        status = 'failed';
        reason = 'unsupported';
        publish();
        return;
      }
      loadNext();
    },
    retry() {
      if (status !== 'failed' || reason === 'unsupported') return;
      loadNext();
    },
    setVisible(nextVisible) {
      if (status === 'disposed' || visible === Boolean(nextVisible)) return;
      visible = Boolean(nextVisible);
      if (operation) {
        if (visible) armTimer(operation);
        else {
          operation.remainingMs = Math.max(0, operation.remainingMs - Math.max(0, now() - operation.startedAt));
          stopTimer(operation);
        }
      }
      notifyReady();
    },
    dispose() {
      invalidate();
      status = 'disposed';
    },
  };
}
