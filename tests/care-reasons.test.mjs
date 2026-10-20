import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, adopt, care, careBlock } from '../js/model.js';
import { careFullReason, careShortReason } from '../js/care-reasons.js';

test('full care targets use the visible 100% threshold and cannot change the save', () => {
  const cases = [
    ['feed', 'hunger', '已吃饱', '奶糖已经吃饱啦'],
    ['wash', 'clean', '已干净', '奶糖已经很干净啦'],
    ['play', 'happy', '快乐满满', '奶糖现在很开心啦'],
    ['rest', 'energy', '精力已满', '奶糖现在精力充沛啦'],
  ];
  for (const [action, target, short, full] of cases) {
    const state = initialState();
    adopt(state, 'cat');
    state.pets.cat[target] = 99.5;
    const block = careBlock(state, action);
    assert.equal(block.kind, 'target_full');
    assert.equal(careShortReason(block, action), short);
    assert.equal(careFullReason(block, action, state.pets.cat.name), full);
    const before = structuredClone(state);
    assert.ok(care(state, action).error);
    assert.deepEqual(state, before, `${action} cannot mutate a displayed-full pet`);
    state.pets.cat[target] = 99.4;
    assert.notEqual(careBlock(state, action)?.kind, 'target_full');
  }
});

test('play energy and feed price report the actual limit and refresh with active pet', () => {
  const state = initialState();
  adopt(state, 'cat');
  const cat = state.pets.cat;
  cat.happy = 50;
  cat.energy = 28;
  let block = careBlock(state, 'play');
  assert.equal(block.kind, 'energy_low');
  assert.equal(careShortReason(block, 'play'), '先休息');
  assert.equal(careFullReason(block, 'play', cat.name), '先让奶糖休息一下吧');
  assert.equal(care(state, 'play').block.kind, 'energy_low');
  cat.energy = 29;
  assert.equal(careBlock(state, 'play'), null);
  cat.happy = 100;
  cat.energy = 0;
  assert.equal(careBlock(state, 'play').kind, 'target_full');

  cat.hunger = 50;
  state.coins = 4;
  block = careBlock(state, 'feed');
  assert.deepEqual(block, { kind: 'insufficient_coins', missing: 1 });
  assert.equal(careShortReason(block, 'feed'), '还差 1 爪爪币');
  assert.equal(careShortReason(block, 'feed', true), '还差 1');
  assert.equal(careFullReason(block, 'feed', cat.name), '喂食还差 1 爪爪币');
  const before = structuredClone(state);
  assert.deepEqual(care(state, 'feed').block, block);
  assert.deepEqual(state, before);
  state.coins = 5;
  assert.equal(careBlock(state, 'feed'), null);
  assert.ok(care(state, 'feed').label);
  assert.equal(state.coins, 0);

  state.coins = 200;
  adopt(state, 'rabbit');
  state.pets.rabbit.hunger = 100;
  block = careBlock(state, 'feed');
  assert.equal(careFullReason(block, 'feed', state.pets.rabbit.name), '糯米已经吃饱啦');
});

test('home action dock shows each current reason on short and tall layouts', async () => {
  const { default: Scene } = await import('../js/scene.js');
  const context = new Proxy({}, { get(target, key) { return target[key] || (() => {}); } });
  const state = initialState();
  adopt(state, 'cat');
  const pet = state.pets.cat;
  pet.hunger = 50;
  pet.clean = 100;
  pet.happy = 50;
  pet.energy = 28;
  state.coins = 4;
  for (const height of [568, 844]) {
    const canvas = { width: height === 568 ? 320 : 390, height };
    const scene = new Scene(context, canvas);
    scene.resize();
    const labels = [];
    scene.readableText = (value, x, y) => labels.push({ value, x, y });
    scene.homeActions(state, scene.homeLayout());
    const captions = labels.filter(item => ['还差 1', '还差 1 爪爪币', '已干净', '先休息', '免费']
      .includes(item.value)).map(item => item.value);
    assert.deepEqual(captions, [height === 568 ? '还差 1' : '还差 1 爪爪币',
      '已干净', '先休息', '免费']);
    assert.deepEqual(scene.buttons.map(button => button.id), ['feed', 'wash', 'play', 'rest']);
    const navY = scene.layout().navY;
    assert.ok(scene.buttons.every(button => button.y + button.h < navY));
  }
});
