export const COIN_WAYS_ROW_STEP = 70;

export function coinWaysLayout(height, count) {
  const modalHeight = Math.min(480, Math.max(260, 160 + count * COIN_WAYS_ROW_STEP));
  const modalY = Math.max(80, (height - modalHeight) / 2);
  const top = modalY + 91;
  const bottom = modalY + modalHeight - 59;
  const listHeight = bottom - top;
  return { modalY, modalHeight, top, bottom, listHeight,
    maxScroll: Math.max(0, count * COIN_WAYS_ROW_STEP - listHeight) };
}
