import { createSubpackageLoader } from './subpackage-loader.js';
import { readViewport } from './viewport.js';
import { canvasBacking } from './canvas-resolution.js';
import { logError, logWarn } from './logger.js';

const COLORS = { background: '#FFF8EF', ink: '#684738', muted: '#957E6A',
  track: '#E9DED0', accent: '#B95D45', white: '#FFFFFF' };
const RETRY_HEIGHT = 48;
const RETRY_WIDTH = 160;
const inside = (point, rect) => rect && point && point.x >= rect.x && point.x <= rect.x + rect.w &&
  point.y >= rect.y && point.y <= rect.y + rect.h;

export function startGameWithPackages({ platform, canvas, startGame, now = Date.now,
  setTimer = setTimeout, clearTimer = clearTimeout, timeoutMs } = {}) {
  let active = true;
  let visible = true;
  let started = false;
  let readyToStart = false;
  let handoffTimer = null;
  let viewport = GameGlobal.viewport;
  let state = { status: 'idle', stage: 1, total: 2, progress: null, canRetry: false, reason: null };
  let retryRect = null;
  let pressedRetry = false;
  const listeners = [];

  function draw(fatal = false) {
    if (!visible || (!active && !fatal)) return;
    viewport = readViewport(platform, viewport || canvas) || viewport ||
      { width: canvas.width || 390, height: canvas.height || 844, top: 24, bottom: 34, left: 0, right: 0, pixelRatio: 1 };
    GameGlobal.viewport = viewport;
    const backing = canvasBacking(viewport);
    if (canvas.width !== backing.width) canvas.width = backing.width;
    if (canvas.height !== backing.height) canvas.height = backing.height;
    const c = canvas.getContext('2d');
    const { width, height, top, bottom, left, right } = viewport;
    const contentTop = Math.max(top, viewport.menuBottom ?? top) + 24;
    const centerX = left + (width - left - right) / 2;
    const centerY = contentTop + Math.max(0, height - bottom - contentTop) * .43;
    const contentWidth = Math.max(1, Math.min(300, width - left - right - 40));
    retryRect = null;
    c.save();
    try {
      c.setTransform(backing.scaleX, 0, 0, backing.scaleY, 0, 0);
      c.globalAlpha = 1;
      c.fillStyle = COLORS.background;
      c.fillRect(0, 0, width, height);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = COLORS.ink;
      c.font = 'bold 28px sans-serif';
      c.fillText('爪爪小屋', centerX, centerY - 58, contentWidth);
      c.font = '16px sans-serif';
      if (fatal) {
        c.fillText('启动暂时失败', centerX, centerY, contentWidth);
        c.fillText('请重新打开小游戏', centerX, centerY + 28, contentWidth);
      } else if (state.status === 'failed') {
        const unsupported = state.reason === 'unsupported';
        c.fillText(unsupported ? '当前微信版本较低' : '小屋资源暂时未准备好', centerX, centerY, contentWidth);
        c.font = '14px sans-serif';
        c.fillStyle = COLORS.muted;
        c.fillText(unsupported ? '请更新微信后重新打开' : '请检查网络后重试', centerX, centerY + 28, contentWidth);
        if (state.canRetry) {
          retryRect = { x: centerX - Math.min(RETRY_WIDTH, contentWidth) / 2,
            y: Math.min(centerY + 65, height - bottom - RETRY_HEIGHT - 16),
            w: Math.min(RETRY_WIDTH, contentWidth), h: RETRY_HEIGHT };
          c.fillStyle = COLORS.accent;
          c.fillRect(retryRect.x, retryRect.y, retryRect.w, retryRect.h);
          c.fillStyle = COLORS.white;
          c.font = '16px sans-serif';
          c.fillText('重试', centerX, retryRect.y + retryRect.h / 2);
        }
      } else {
        const label = state.status === 'ready' ? '小屋准备好了' :
          state.stage === 2 ? '正在准备声音（2/2）' : '正在准备小伙伴（1/2）';
        c.fillText(label, centerX, centerY, contentWidth);
        c.fillStyle = COLORS.track;
        c.fillRect(centerX - contentWidth / 2, centerY + 36, contentWidth, 6);
        if (state.progress !== null) {
          c.fillStyle = COLORS.accent;
          c.fillRect(centerX - contentWidth / 2, centerY + 36, contentWidth * state.progress / 100, 6);
          c.fillStyle = COLORS.muted;
          c.font = '13px sans-serif';
          c.fillText(`${Math.floor(state.progress)}%`, centerX, centerY + 62);
        }
      }
    } finally { c.restore(); }
  }

  function cleanup() {
    if (handoffTimer !== null) clearTimer(handoffTimer);
    handoffTimer = null;
    loader.dispose();
    for (const [offName, listener] of listeners) {
      try { platform[offName]?.(listener); }
      catch (error) { logWarn('startup.listener_cleanup_failed', { method: offName }); }
    }
    listeners.length = 0;
    retryRect = null;
    pressedRetry = false;
  }

  function scheduleHandoff() {
    if (!active || !visible || !readyToStart || handoffTimer !== null) return;
    handoffTimer = setTimer(() => {
      handoffTimer = null;
      if (!active || !visible || !readyToStart || started) return;
      started = true;
      active = false;
      cleanup();
      const context = canvas.getContext('2d');
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalAlpha = 1;
      try { startGame(); }
      catch (error) {
        logError('startup.game_failed', { message: String(error) });
        draw(true);
      }
    }, 0);
  }

  const loader = createSubpackageLoader({
    loadSubpackage: typeof platform.loadSubpackage === 'function' ? platform.loadSubpackage.bind(platform) : undefined,
    now, setTimer, clearTimer, timeoutMs,
    onState(next) {
      state = next;
      if (next.status === 'failed') logWarn('startup.subpackage_failed', { package: next.packageName, reason: next.reason });
      draw();
    },
    onReady() { readyToStart = true; scheduleHandoff(); },
  });

  function listen(onName, offName, listener) {
    if (typeof platform[onName] !== 'function') return;
    platform[onName](listener);
    listeners.push([offName, listener]);
  }
  const point = event => {
    const touch = event.changedTouches?.[0] || event.touches?.[0];
    return touch ? { x: touch.clientX ?? touch.x, y: touch.clientY ?? touch.y } : null;
  };
  listen('onTouchStart', 'offTouchStart', event => {
    if (active && visible) pressedRetry = inside(point(event), retryRect);
  });
  listen('onTouchEnd', 'offTouchEnd', event => {
    if (!active || !visible) return;
    const retry = pressedRetry && inside(point(event), retryRect);
    pressedRetry = false;
    if (retry) loader.retry();
  });
  listen('onTouchCancel', 'offTouchCancel', () => { pressedRetry = false; });
  listen('onHide', 'offHide', () => {
    if (!active) return;
    visible = false;
    pressedRetry = false;
    loader.setVisible(false);
  });
  listen('onShow', 'offShow', () => {
    if (!active) return;
    visible = true;
    loader.setVisible(true);
    draw();
    scheduleHandoff();
  });
  listen('onWindowResize', 'offWindowResize', () => { if (active) { pressedRetry = false; draw(); } });
  draw();
  loader.start();
  return { getState: loader.getState, dispose() { active = false; cleanup(); } };
}
