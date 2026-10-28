export const DRAWER_DURATION_MS = 180;
const fresh = () => ({ targetOpen: false, from: 0, to: 0, startedAt: 0 });
export const createHomeDrawers = () => ({ care: fresh(), status: fresh() });
export function drawerProgress(drawer, now = Date.now()) {
  if (!drawer) return 0;
  const t = Math.max(0, Math.min(1, (now - drawer.startedAt) / DRAWER_DURATION_MS));
  const eased = 1 - (1 - t) ** 3;
  return drawer.from + (drawer.to - drawer.from) * eased;
}
export function setDrawerOpen(drawers, key, open, now = Date.now(), immediate = false) {
  const drawer = drawers[key];
  if (!drawer) return false;
  if (drawer.targetOpen === open) {
    if (immediate) drawer.from = drawer.to = Number(open);
    return false;
  }
  drawer.from = immediate ? Number(open) : drawerProgress(drawer, now);
  drawer.to = Number(open);
  drawer.targetOpen = open;
  drawer.startedAt = now;
  return true;
}
export function finishHomeDrawers(drawers) {
  for (const drawer of Object.values(drawers)) drawer.from = drawer.to = Number(drawer.targetOpen);
}
export function homeDrawersAnimating(drawers, now = Date.now()) {
  return !!drawers && Object.values(drawers).some(drawer => Math.abs(drawerProgress(drawer, now) - drawer.to) > .001);
}
