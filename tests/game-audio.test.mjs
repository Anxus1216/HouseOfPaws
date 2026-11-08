import assert from 'node:assert/strict';
import test from 'node:test';
import { GameAudio } from '../js/game-audio.js';

function harness() {
  const contexts = [];
  const warnings = [];
  const state = { musicEnabled: true, soundEnabled: true, visible: true, scene: 'home', paused: false };
  let now = 0;
  const audio = new GameAudio({
    createInnerAudioContext() {
      const context = {
        startTime: 0, currentTime: 0, plays: 0, pauses: 0, stops: 0, destroyed: false,
        play() { this.plays++; },
        pause() { this.pauses++; },
        stop() { this.stops++; },
        destroy() { this.destroyed = true; },
        seek(time) { this.currentTime = time; },
        onPlay(fn) { this.started = fn; },
        onError(fn) { this.fail = fn; },
        onEnded(fn) { this.end = fn; },
      };
      contexts.push(context);
      return context;
    },
  }, { now: () => now, warn: (...args) => warnings.push(args), random: () => 0 });
  return {
    audio, contexts, warnings,
    update(time, changes) {
      now = time;
      Object.assign(state, changes);
      audio.update(state, now);
    },
    context(filename) {
      return contexts.findLast(entry => entry.src.endsWith(`/${filename}`));
    },
  };
}

test('first gesture unlocks audio, settings mute sound and music independently and immediately', () => {
  const h = harness();
  h.update(0);
  assert.equal(h.audio.play('adopt'), false);
  assert.equal(h.contexts.length, 0);

  h.audio.unlock();
  h.update(10);
  const home = h.context('bgm_home.mp3');
  assert.equal(home.loop, true);
  assert.equal(home.volume, 0);
  h.update(410);
  assert.equal(home.volume, .48);
  assert.equal(h.audio.play('pet_tap'), true);
  const pet = h.context('pet_tap.wav');
  h.update(450, { soundEnabled: false });
  assert.equal(pet.stops, 1);
  assert.equal(h.audio.play('adopt'), false);
  assert.equal(home.volume, .48);
  assert.equal(home.plays, 1);

  h.update(500, { soundEnabled: true, musicEnabled: false });
  assert.equal(home.volume, 0);
  assert.equal(home.pauses, 1);
  assert.equal(h.audio.play('adopt'), true);
  h.update(1500, { visible: false });
  assert.equal(h.context('adopt.wav').stops, 1);
  assert.equal(h.audio.play('care'), false);
});

test('night starts from the home position and fades back without restarting home', () => {
  const h = harness();
  h.audio.unlock();
  h.update(0);
  h.update(400);
  const home = h.context('bgm_home.mp3');
  home.currentTime = 15.25;
  h.update(1000, { scene: 'night' });
  const night = h.context('bgm_night.mp3');
  assert.equal(night.startTime, 15.25);
  assert.equal(night.loop, true);
  assert.equal(night.volume, 0);

  h.update(1200);
  assert.equal(night.volume, .215);
  assert.equal(home.volume, .24);
  h.update(1400);
  assert.equal(night.volume, .43);
  assert.equal(home.volume, 0);
  assert.equal(home.pauses, 0);

  h.update(4000, { scene: 'home' });
  h.update(4400);
  assert.equal(home.volume, .48);
  assert.equal(home.plays, 1);
  assert.equal(night.destroyed, true);
});

test('an old completion cannot leave a reused sound playing when effects are muted', () => {
  const h = harness();
  h.audio.unlock();
  h.update(0);
  h.audio.play('pet_tap');
  const tap = h.context('pet_tap.wav');
  h.update(500);
  h.audio.play('pet_tap');
  tap.end?.();
  h.update(510, { soundEnabled: false });
  assert.equal(tap.plays, 2);
  assert.equal(tap.stops, 2);
});

test('stars music is one shot, pauses in place and unmuting starts from the current round position', () => {
  const h = harness();
  h.audio.unlock();
  h.update(0);
  h.update(400);
  h.update(500, { scene: 'stars', gamePosition: 0 });
  const stars = h.context('bgm_stars.mp3');
  assert.equal(stars.loop, false);
  assert.equal(stars.startTime, 0);
  h.update(1800, { gamePosition: 1.3 });
  stars.currentTime = 1.3;
  h.update(1801, { paused: true });
  assert.equal(stars.volume, 0);
  assert.equal(stars.pauses, 1);
  h.update(5000, { visible: false });
  h.update(8000, { visible: true });
  assert.equal(stars.plays, 1, 'foreground stays paused until the game continues');
  h.update(8100, { paused: false });
  assert.equal(stars.plays, 2);
  assert.equal(stars.currentTime, 1.3);

  h.update(8500, { musicEnabled: false });
  assert.equal(stars.destroyed, true);
  h.update(10000, { musicEnabled: true, gamePosition: 3.2 });
  const resumed = h.context('bgm_stars.mp3');
  assert.notEqual(resumed, stars);
  assert.equal(resumed.startTime, 3.2);
  resumed.end();
  h.update(10100);
  assert.equal(resumed.plays, 1, 'natural completion does not repeat');

  h.update(10101, { scene: 'home' });
  h.update(10501);
  h.update(11000, { scene: 'stars', gamePosition: 0 });
  const next = h.context('bgm_stars.mp3');
  assert.notEqual(next, resumed);
  assert.equal(next.startTime, 0);
});

test('high-frequency effects coalesce, rotate variants and reuse bounded channels', () => {
  const h = harness();
  h.audio.unlock();
  h.update(0);
  assert.equal(h.audio.catchStar(), true);
  assert.equal(h.context('catch_a.wav').plays, 1);
  h.update(89);
  assert.equal(h.audio.catchStar(), false);
  h.update(90);
  assert.equal(h.audio.play('catch'), true);
  assert.equal(h.context('catch_b.wav').plays, 1);
  h.update(180);
  assert.equal(h.audio.catchStar(), true);
  assert.equal(h.context('catch_a.wav').plays, 2);
  assert.equal(h.audio.play('pet_tap'), true);
  assert.equal(h.audio.play('pet_tap'), false);
  assert.equal(h.audio.play('soft_block'), true);
  assert.equal(h.audio.play('soft_block'), false);
  for (let i = 1; i <= 30; i++) {
    h.update(i * 1000);
    h.audio.play('care_feed');
    h.audio.play('care_rest');
    h.audio.play('drawer_open');
    h.audio.play('drawer_close');
    h.audio.play('task_claim');
    h.audio.play('game_start');
  }
  assert.equal(h.contexts.filter(entry => !entry.destroyed).length, 7);
});

test('a delayed first play aligns stars music once with the current round', () => {
  const h = harness();
  h.audio.unlock();
  h.update(0, { scene: 'stars', gamePosition: 0 });
  const stars = h.context('bgm_stars.mp3');
  h.update(500, { paused: true, gamePosition: .5 });
  stars.started();
  assert.equal(stars.currentTime, 0, 'a late callback while paused must not seek');
  h.update(900, { paused: false });
  stars.started();
  assert.equal(stars.currentTime, .5);
  h.update(1500, { gamePosition: 1.1 });
  stars.started();
  assert.equal(stars.currentTime, .5, 'subsequent play events must not resync');
});

test('major rewards duck music and the care tail, and music volume recovers', () => {
  const h = harness();
  h.audio.unlock();
  h.update(0);
  h.update(500);
  const home = h.context('bgm_home.mp3');
  h.audio.play('care_feed');
  h.audio.play('level');
  assert.ok(home.volume < .32);
  assert.ok(h.context('care_feed.wav').volume < .6);
  h.update(1250);
  assert.ok(home.volume > .32 && home.volume < .48);
  h.update(1500);
  assert.equal(home.volume, .48);
});

test('missing platform audio and invalid resources do not block gameplay or retry on every frame', () => {
  const absent = new GameAudio({});
  absent.unlock();
  absent.update({ musicEnabled: true, soundEnabled: true, visible: true, scene: 'home' });
  assert.equal(absent.play('adopt'), false);

  const h = harness();
  h.audio.unlock();
  h.update(0);
  h.update(400);
  h.update(500, { scene: 'night' });
  const night = h.context('bgm_night.mp3');
  night.fail({ errCode: 10003, errMsg: 'bad file' });
  assert.equal(night.destroyed, true);
  h.update(600);
  h.update(2000);
  h.update(6000);
  assert.equal(h.contexts.filter(entry => entry.src.includes('night')).length, 1);
  assert.equal(h.context('bgm_home.mp3').volume, .48);
  assert.deepEqual(h.warnings, [['audio.play_failed', { name: 'night', message: 'bad file' }]]);
  assert.equal(h.audio.play('adopt'), true);
});

test('a temporary system failure retries the track after backoff', () => {
  const h = harness();
  h.audio.unlock();
  h.update(0);
  const home = h.context('bgm_home.mp3');
  home.fail({ errCode: 10001, errMsg: 'system audio unavailable' });
  assert.equal(home.destroyed, true);
  h.update(3999);
  assert.equal(h.contexts.length, 1);
  h.update(4000);
  const recovered = h.context('bgm_home.mp3');
  assert.notEqual(recovered, home);
  recovered.started();
  h.update(4400);
  assert.equal(recovered.volume, .48);
  assert.equal(h.warnings.length, 1);
});
