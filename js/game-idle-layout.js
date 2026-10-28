// Display geometry only: the playable field and basket collision bounds stay unchanged.
const IDLE = Object.freeze({
  petWidthRatio: .76, petHeightRatio: .55, topInset: 12,
  buttonWidth: 204, buttonHeight: 46, buttonBottomGap: 21, petButtonGap: 18,
  bubbleWidth: 294, bubbleHeight: 46, bubblePetGap: 18,
  basketOffsetXRatio: .08, basketOffsetYRatio: .51,
  basketWidthRatio: .52, basketHeightRatio: .28,
});

export function gameIdleLayout(field) {
  const centerX = field.x + field.w / 2;
  const startY = field.bottom - IDLE.buttonBottomGap - IDLE.buttonHeight;
  const petBottom = startY - IDLE.petButtonGap;
  const petSide = Math.min(field.w * IDLE.petWidthRatio, field.h * IDLE.petHeightRatio,
    petBottom - field.y - IDLE.topInset - IDLE.bubbleHeight - IDLE.bubblePetGap);
  const petTop = petBottom - petSide;
  const bubbleWidth = Math.min(IDLE.bubbleWidth, field.w);
  return {
    pet: { x: centerX - petSide / 2, y: petTop, w: petSide, h: petSide },
    basket: { x: centerX + petSide * IDLE.basketOffsetXRatio,
      y: petTop + petSide * IDLE.basketOffsetYRatio,
      w: petSide * IDLE.basketWidthRatio, h: petSide * IDLE.basketHeightRatio },
    bubble: { x: centerX - bubbleWidth / 2,
      y: petTop - IDLE.bubblePetGap - IDLE.bubbleHeight, w: bubbleWidth, h: IDLE.bubbleHeight },
    start: { x: centerX - IDLE.buttonWidth / 2, y: startY,
      w: IDLE.buttonWidth, h: IDLE.buttonHeight },
  };
}
