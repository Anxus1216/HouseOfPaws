const validSize = value => Number.isFinite(value) && value > 0;
const validInset = value => Number.isFinite(value) && value >= 0;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const validArea = (area, screenHeight) => area && validInset(area.top) &&
  validInset(area.bottom) && area.bottom > area.top &&
  (!screenHeight || area.bottom <= screenHeight);

export function readViewport(api, canvas = {}) {
  let current = null;
  let legacy = null;
  try { if (api.getWindowInfo) current = api.getWindowInfo(); } catch (error) { /* Use legacy info. */ }
  if (!current || !validSize(current.windowWidth) || !validSize(current.windowHeight) ||
      !validArea(current.safeArea, current.screenHeight) || !validInset(current.screenTop)) {
    try { if (api.getSystemInfoSync) legacy = api.getSystemInfoSync(); }
    catch (error) { /* Keep the available window data. */ }
  }
  if (![current?.windowWidth, current?.windowHeight, current?.screenWidth,
    current?.screenHeight, legacy?.windowWidth, legacy?.windowHeight,
    legacy?.screenWidth, legacy?.screenHeight].some(validSize)) return null;
  const width = [current?.windowWidth, legacy?.windowWidth, current?.screenWidth,
    legacy?.screenWidth, canvas.width].find(validSize);
  const height = [current?.windowHeight, legacy?.windowHeight, current?.screenHeight,
    legacy?.screenHeight, canvas.height].find(validSize);
  if (!validSize(width) || !validSize(height)) return null;

  const screenTop = validInset(current?.screenTop) ? current.screenTop :
    validInset(legacy?.screenTop) ? legacy.screenTop : null;
  const screenHeight = [current?.screenHeight, legacy?.screenHeight].find(validSize);
  const area = validArea(current?.safeArea, screenHeight) ? current.safeArea :
    validArea(legacy?.safeArea, screenHeight) ? legacy.safeArea : null;
  let top, bottom;
  if (area) {
    // safeArea is screen-relative; Canvas and touch events use window coordinates.
    top = clamp(area.top - (screenTop ?? 0), 0, height);
    bottom = clamp(screenTop === null ?
      (screenHeight ?? height) - area.bottom : screenTop + height - area.bottom, 0, height);
  } else {
    const statusBarHeight = [current?.statusBarHeight, legacy?.statusBarHeight]
      .find(validInset);
    top = clamp(statusBarHeight === undefined ? 24 :
      statusBarHeight - (screenTop ?? 0), 0, height);
    bottom = Math.min(34, Math.max(0, height - top - 1));
  }
  if (top + bottom >= height) {
    top = Math.min(top, height / 3);
    bottom = Math.min(bottom, height / 3);
  }

  let menuBottom = null;
  try {
    const menu = api.getMenuButtonBoundingClientRect?.();
    if (menu && validInset(menu.top) && validInset(menu.bottom) && menu.bottom > menu.top) {
      menuBottom = menu.bottom - (screenTop ?? 0);
    }
  } catch (error) { /* The capsule geometry is optional. */ }
  return { width, height, top, bottom, menuBottom };
}

export function sameViewport(a, b) {
  return !!a && !!b && ['width', 'height', 'top', 'bottom', 'menuBottom']
    .every(key => a[key] === b[key]);
}
