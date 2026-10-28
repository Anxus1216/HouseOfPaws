import test from 'node:test';
import assert from 'node:assert/strict';
import { createHomeDrawers, setDrawerOpen, drawerProgress, finishHomeDrawers } from '../js/home-drawers.js';
import { computeHomeLayout } from '../js/home-layout.js';

test('drawers start closed, remain independent and reverse from their current position', () => {
  const d = createHomeDrawers();
  assert.equal(d.care.targetOpen, false);
  assert.equal(d.status.targetOpen, false);
  setDrawerOpen(d,'care', true, 100);
  const current = drawerProgress(d.care, 160);
  assert.ok(current>0 && current<1);
  setDrawerOpen(d,'care', false, 160);
  assert.equal(drawerProgress(d.care, 160), current);
  setDrawerOpen(d,'status', true, 170);
  finishHomeDrawers(d);
  assert.equal(drawerProgress(d.care, 170), 0);
  assert.equal(drawerProgress(d.status, 170), 1);
  assert.equal(createHomeDrawers().status.targetOpen, false,'new sessions do not restore UI preferences');
});

test('window-sized targets survive short-screen letterboxing and density', () => {
  for (const [width, height] of [[320, 568], [390, 844]]) {
    const viewport = {width, height, top: 24, bottom: 34, left: 0, right: 0, menuBottom: 60};
    const scale = Math.min(width / 390, (height-58) / 680);
    const transform = {scale, offsetX: (width-390 * scale) / 2, offsetY: 24};
    const l = computeHomeLayout(viewport, transform);
    for (const r of [l.careEntry, l.statusEntry, l.settings, l.growth, ...l.careItems]) {
      assert.ok(r.w * scale >= 44 && r.h * scale >= 44);
      assert.ok(transform.offsetX + r.x * scale >= 0);
      assert.ok(transform.offsetX + (r.x + r.w) * scale <= width);
    }
    assert.ok(Math.abs(l.pet.x + l.pet.w / 2 - l.scene.x - l.scene.w / 2) < 1e-9);
    assert.ok(Math.abs(l.pet.y + l.pet.h / 2 - l.scene.y - l.scene.h / 2) < 1e-9);
    assert.equal(l.statusPanel.x, l.statusEntry.x);
    assert.equal(l.statusPanel.y, l.statusEntry.y);
    assert.equal(l.statusPanel.w, l.statusEntry.w);
    assert.ok(l.statusPanel.h > l.statusEntry.h);
    assert.ok(l.carePanel.y + l.carePanel.h<l.nav.y);
    assert.ok(l.statusPanel.y + l.statusPanel.h<l.carePanel.y);
  }
});
