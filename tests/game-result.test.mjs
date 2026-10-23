import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, adopt } from '../js/model.js';
import { completedGameOutcome, gameOutcomeView } from '../js/game-result.js';

test('completed and abandoned rounds show distinct outcomes with actual rewards', () => {
  const now = new Date(2026, 9, 20, 10).getTime();
  const state = initialState(now);
  adopt(state, 'cat', now);
  const pet = state.pets.cat;
  const reward = { coins: 2, requestedGameCoins: 24, bonus: 5,
    leveled: true, happyDelta: 3.5, xp: 1 };
  const outcome = completedGameOutcome(8, reward, pet, true, now);
  const view = gameOutcomeView(outcome);
  assert.equal(view.title, '本局完成');
  assert.deepEqual(view.lines, [
    '接住 8 颗星星', '游戏奖励 +2 爪爪币',
    '钱包空间不足，游戏奖励仅部分到账',
    '升级奖励 +5 爪爪币 · 钱包空间不足',
    '快乐 +3.5', '成长 +1',
  ]);
  assert.equal(view.taskHint, '今日游戏任务已完成，去领取奖励');
  assert.equal(outcome.taskDate, state.tasks.date);
  assert.equal(gameOutcomeView(outcome, true).taskHint, '');
  assert.deepEqual(gameOutcomeView({ kind: 'aborted' }), {
    title: '本局已结束', lines: ['本局未结算奖励，也不计入今日任务'], taskHint: '',
  });
});

test('zero stars, full growth and max level use the right reason without false rewards', () => {
  const now = new Date(2026, 9, 20, 10).getTime();
  const state = initialState(now);
  adopt(state, 'cat', now);
  const pet = state.pets.cat;
  const empty = completedGameOutcome(0, { coins: 0, requestedGameCoins: 0,
    bonus: 0, leveled: false, happyDelta: 0, xp: 0 }, pet, true, now);
  assert.deepEqual(gameOutcomeView(empty).lines, [
    '接住 0 颗星星', '游戏奖励 +0 爪爪币', '本局未获得成长',
    '星星这次躲起来啦，再试一次吧',
  ]);
  pet.dailyGrowth.earned = 100;
  const capped = completedGameOutcome(2, { coins: 0, requestedGameCoins: 6,
    bonus: 0, leveled: false, happyDelta: 0, xp: 0 }, pet, false, now);
  assert.ok(gameOutcomeView(capped).lines.includes('今日成长已满'));
  assert.ok(gameOutcomeView(capped).lines.includes('爪爪币已满，未增加'));
  assert.ok(gameOutcomeView(capped).lines.includes('快乐已满'));
  pet.level = 99;
  assert.ok(gameOutcomeView(completedGameOutcome(2, { coins: 6,
    requestedGameCoins: 6, bonus: 0, leveled: false, happyDelta: 2, xp: 0 },
  pet, false, now)).lines.includes('已满级'));
});

test('game result and quit confirmation controls fit short and tall scenes', async () => {
  const { default: Scene } = await import('../js/scene.js');
  const state = initialState();
  adopt(state, 'cat');
  const context = new Proxy({}, { get(target, key) { return target[key] || (() => {}); } });
  const outcome = { kind: 'completed', stars: 8, coins: 2, requestedGameCoins: 24,
    bonus: 5, leveled: true, happyDelta: 3.5, xp: 1,
    growthReason: 'earned', taskCompleted: true, taskDate: state.tasks.date };
  state.tasks.progress.game = 1;
  for (const height of [680, 844, 1000]) {
    const scene = new Scene(context, { width: 390, height });
    const labels = [];
    scene.text = (value, x, y, size, color) => labels.push({ value, x, y, color });
    scene.draw(state, { page: 'game', playing: false, gameOutcome: outcome });
    const field = scene.gameField();
    const replay = scene.buttons.find(button => button.id === 'start_game');
    const home = scene.buttons.find(button => button.id === 'game_return_home');
    const task = scene.buttons.find(button => button.id === 'game_task_reward');
    assert.ok(replay && home && task, `${height}px: all result actions are visible`);
    assert.ok(task.y + task.h < replay.y && replay.y + replay.h < home.y &&
      home.y + home.h < field.bottom, `${height}px: result actions do not overlap`);
    const lastReward = labels.find(label => label.value === '成长 +1');
    assert.ok(lastReward?.y < task.y, `${height}px: rewards clear the task link`);
    const taskHint = labels.find(label => label.value === '今日游戏任务已完成，去领取奖励');
    assert.equal(taskHint?.color, '#C25343', `${height}px: task hint remains readable`);
    labels.length = 0;
    scene.draw(state, { page: 'game', playing: false, gameOutcome: {
      kind: 'completed', stars: 0, coins: 0, requestedGameCoins: 0,
      bonus: 0, leveled: false, happyDelta: 0, xp: 0,
      growthReason: 'no_stars', taskCompleted: false,
    } });
    const finalLine = labels.find(label =>
      label.value === '星星这次躲起来啦，再试一次吧');
    const compactReplay = scene.buttons.find(button => button.id === 'start_game');
    const compactHome = scene.buttons.find(button => button.id === 'game_return_home');
    assert.ok(finalLine && compactReplay && compactHome);
    assert.ok(compactReplay.y - finalLine.y <= 30 &&
      compactReplay.y > finalLine.y &&
      compactHome.y + compactHome.h < field.bottom,
    `${height}px: result without a task hint stays compact inside the game field`);
    labels.length = 0;
    scene.draw(state, { page: 'game', playing: false,
      gameOutcome: { kind: 'aborted' } });
    const abortedLine = labels.find(label =>
      label.value === '本局未结算奖励，也不计入今日任务');
    const abortedReplay = scene.buttons.find(button => button.id === 'start_game');
    const abortedHome = scene.buttons.find(button => button.id === 'game_return_home');
    assert.ok(abortedLine && abortedReplay && abortedHome,
      `${height}px: abandoned round has a message and both actions`);
    assert.ok(abortedReplay.y - abortedLine.y <= 40 &&
      abortedReplay.y > abortedLine.y,
    `${height}px: abandoned round has no empty gulf before the actions`);
    assert.ok(abortedHome.y + abortedHome.h < scene.layout().navY,
      `${height}px: abandoned actions clear the navigation`);
    scene.draw(state, { page: 'game', playing: true, paused: true,
      quitConfirm: true, score: 1, remaining: 10, stars: [], basketX: 195 });
    const confirm = scene.buttons.find(button => button.id === 'quit_confirm_end');
    assert.ok(confirm && confirm.y + confirm.h < scene.layout().navY,
      `${height}px: confirmation stays above navigation`);
    assert.ok(scene.buttons.some(button => button.id === 'quit_confirm_close'));
    assert.ok(scene.buttons.some(button => button.id === 'quit_confirm_continue'));
    state.tasks.date = '2020-1-1';
    scene.draw(state, { page: 'game', playing: false, gameOutcome: outcome });
    assert.ok(!scene.buttons.some(button => button.id === 'game_task_reward'),
      `${height}px: an old result cannot link to a new day's game task`);
    state.tasks.date = outcome.taskDate;
  }
});
