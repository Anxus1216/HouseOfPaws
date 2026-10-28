// Design dimensions are window logical pixels, independent of Canvas density.
export const HOME_METRICS = Object.freeze({
  pageInset: 12, entryInset: 16, topInset: 8, capsuleGap: 10,
  navigationHeight: 64, headerHeight: 72, sceneNavigationGap: 12,
  entrySize: 52, careHeight: 60, carePanelHeight: 64, careEntryOffset: 6,
  careItemsOffset: 56, careItemsTop: 2, actionCount: 4,
  statusWidth: 68, statusRightInset: 84, statusTop: 68,
  statusMaxHeight: 216, statusCareGap: 76,
  feedbackOffset: 102, feedbackHeight: 96, feedbackInset: 20,
  feedbackRightSpace: 88, feedbackMinWidth: 120,
  petInset: 24, petTop: 12, petMaxWidth: 190, petMinHeight: 80,
  petStatusSpace: 76, identityRightSpace: 132, identityHeight: 64,
  growthTop: 25, minHitSize: 44, walletWidth: 64, walletRightInset: 116,
  settingsRightInset: 48
});

export function computeHomeLayout(viewport, transform) {
  const { scale, offsetX, offsetY } = transform;
  const width = viewport.width - (viewport.left || 0) - (viewport.right || 0);
  const left = viewport.left || 0;
  const top = Math.max((viewport.top || 0) + HOME_METRICS.topInset, (viewport.menuBottom || 0) + HOME_METRICS.capsuleGap);
  const bottom = viewport.height - (viewport.bottom || 0);
  const rect = (x, y, w, h) => ({ x: (x - offsetX) / scale,
    y: (y - offsetY) / scale, w: w / scale, h: h / scale });
  const navY = bottom - HOME_METRICS.navigationHeight;
  const sceneY = top + HOME_METRICS.headerHeight;
  const sceneBottom = navY - HOME_METRICS.sceneNavigationGap;
  const sceneWidth = width - HOME_METRICS.pageInset * 2;
  const careY = sceneBottom - HOME_METRICS.carePanelHeight;
  const itemWidth = (sceneWidth - HOME_METRICS.careItemsOffset) / HOME_METRICS.actionCount;
  const feedbackY = careY - HOME_METRICS.feedbackOffset;
  const petWidth = Math.min(HOME_METRICS.petMaxWidth, sceneWidth - HOME_METRICS.petStatusSpace);
  const petHeight = Math.max(HOME_METRICS.petMinHeight, feedbackY - sceneY - HOME_METRICS.petTop);
  return {
    scene: rect(left + HOME_METRICS.pageInset, sceneY, sceneWidth, sceneBottom - sceneY),
    careEntry: rect(left + HOME_METRICS.entryInset, careY + HOME_METRICS.careEntryOffset, HOME_METRICS.entrySize, HOME_METRICS.entrySize),
    statusEntry: rect(left + width - HOME_METRICS.statusWidth, sceneY + HOME_METRICS.topInset, HOME_METRICS.entrySize, HOME_METRICS.entrySize),
    statusPanel: rect(left + width - HOME_METRICS.statusRightInset, sceneY + HOME_METRICS.statusTop,
      HOME_METRICS.statusWidth, Math.min(HOME_METRICS.statusMaxHeight, careY - sceneY - HOME_METRICS.statusCareGap)),
    carePanel: rect(left + HOME_METRICS.pageInset, careY, sceneWidth, HOME_METRICS.carePanelHeight),
    careItems: Array.from({ length: HOME_METRICS.actionCount }, (_, i) => rect(left + HOME_METRICS.entryInset + HOME_METRICS.entrySize + itemWidth * i,
      careY + HOME_METRICS.careItemsTop, itemWidth, HOME_METRICS.careHeight)),
    feedback: rect(left + HOME_METRICS.feedbackInset, feedbackY,
      Math.max(HOME_METRICS.feedbackMinWidth, sceneWidth - HOME_METRICS.feedbackRightSpace), HOME_METRICS.feedbackHeight),
    pet: rect(left + HOME_METRICS.petInset, sceneY + HOME_METRICS.petTop, petWidth, petHeight),
    identity: rect(left + HOME_METRICS.entryInset, top, width - HOME_METRICS.identityRightSpace, HOME_METRICS.identityHeight),
    growth: rect(left + HOME_METRICS.entryInset, top + HOME_METRICS.growthTop, width - HOME_METRICS.identityRightSpace, HOME_METRICS.minHitSize),
    wallet: rect(left + width - HOME_METRICS.walletRightInset, top, HOME_METRICS.walletWidth, HOME_METRICS.minHitSize),
    settings: rect(left + width - HOME_METRICS.settingsRightInset, top, HOME_METRICS.minHitSize, HOME_METRICS.minHitSize),
    nav: rect(left, navY, width, HOME_METRICS.navigationHeight),
    unit: 1 / scale,
  };
}
