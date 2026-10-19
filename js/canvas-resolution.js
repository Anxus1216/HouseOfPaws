// Render at up to 3 physical pixels per logical pixel on high-density displays.
const MAX_RENDER_DPR = 3;
// A 4-million-pixel RGBA backing store uses about 16 MB before platform overhead.
const MAX_CANVAS_PIXELS = 4_000_000;

export function canvasBacking(viewport) {
  const { width, height } = viewport;
  const requested = Number.isFinite(viewport.pixelRatio) && viewport.pixelRatio > 0 ?
    viewport.pixelRatio : 1;
  const budgetDpr = Math.sqrt(MAX_CANVAS_PIXELS / (width * height));
  // A very large logical window may exceed the budget even at 1x.
  const dpr = Math.max(1, Math.min(requested, MAX_RENDER_DPR, budgetDpr));
  const pixelWidth = Math.max(1, Math.floor(width * dpr));
  const pixelHeight = Math.max(1, Math.floor(height * dpr));
  return { width: pixelWidth, height: pixelHeight,
    scaleX: pixelWidth / width, scaleY: pixelHeight / height };
}
