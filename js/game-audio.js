const CUE_CHANNELS = {
  care: 'action', care_feed: 'action', care_wash: 'action', care_play: 'action',
  care_rest: 'action', pet_tap: 'action', pet_select: 'action',
  drawer_open: 'ui', drawer_close: 'ui', soft_block: 'ui',
  adopt: 'reward', level: 'reward', task_claim: 'reward', daily_gift: 'reward',
  game_start: 'game', game_pause: 'game', game_resume: 'game', game_time_low: 'game',
  game_end: 'game', game_end_quiet: 'game',
};
const CATCH_CUES = ['catch_a', 'catch_b', 'catch_c'];
const COOLDOWN_MS = { pet_tap: 450, soft_block: 900, catch: 90 };
const TRACK_GAIN = { home: .48, night: .43, stars: .5 };
const MUSIC_FADE_MS = 400;
const DUCK_RELEASE_MS = 450;
const DUCK_GAIN = .63;
const DUCK_HOLD_MS = { adopt: 800, level: 550 };
const EFFECT_GAIN = .82;
const AUDIO_RETRY_DELAY_MS = 4000;
const PERMANENT_AUDIO_ERRORS = new Set([10003, 10004]); // Missing file or unsupported format.
const ROUND_SYNC_TOLERANCE_SECONDS = .25;

function gainAt(track, now) {
  const progress = Math.max(0, Math.min(1, (now - track.fadeStartedAt) / MUSIC_FADE_MS));
  return track.from + (track.target - track.from) * progress;
}

export class GameAudio {
  constructor(platform, { now = Date.now, warn = () => {}, random = Math.random } = {}) {
    this.platform = platform;
    this.now = now;
    this.warn = warn;
    this.random = random;
    this.effects = new Map();
    this.tracks = new Map();
    this.retryAfter = new Map();
    this.lastCueAt = new Map();
    this.lastCatch = null;
    this.duckUntil = -Infinity;
    this.unlocked = false;
    this.effectsEnabled = false;
    this.scene = 'home';
    this.starsPosition = null;
  }

  unlock() {
    this.unlocked = true;
  }

  canTry(path, now = this.now()) {
    return now >= (this.retryAfter.get(path) ?? -Infinity);
  }

  createContext(group, channel, id, path, { loop = false, startTime = 0, volume = 0 } = {}) {
    if (!this.canTry(path) || typeof this.platform?.createInnerAudioContext !== 'function') return null;
    let entry;
    try {
      const audio = this.platform.createInnerAudioContext();
      entry = { audio, id, path, playing: false, finished: false, volume,
        from: 0, target: 0, fadeStartedAt: 0 };
      group.set(channel, entry);
      audio.onError?.(error => this.contextFailed(group, channel, entry, error));
      audio.onPlay?.(() => {
        if (group.get(channel) !== entry || !entry.playing) return;
        this.retryAfter.delete(path);
        if (id === 'stars') this.alignRoundStart(entry);
      });
      // Reused short cues may receive an ended event from an earlier playback.
      // Only the one-shot round track needs an ended flag to prevent looping.
      if (id === 'stars') audio.onEnded?.(() => {
        entry.playing = false;
        entry.finished = true;
      });
      audio.loop = loop;
      audio.volume = volume;
      audio.src = path;
      if (startTime > 0) audio.startTime = startTime;
      return group.get(channel) === entry ? entry : null;
    } catch (error) {
      if (entry) this.contextFailed(group, channel, entry, error);
      else this.reportFailure(id, path, error);
      return null;
    }
  }

  alignRoundStart(entry) {
    const position = this.starsPosition;
    if (position === null || entry.roundStartChecked) return;
    entry.roundStartChecked = true;
    try {
      const time = entry.audio.currentTime;
      if (Number.isFinite(time) && Math.abs(time - position) >= ROUND_SYNC_TOLERANCE_SECONDS) {
        entry.audio.seek?.(position);
      }
    } catch (_) { /* Keep the music playing if the platform cannot seek on first play. */ }
  }

  reportFailure(id, path, error) {
    const firstFailure = !this.retryAfter.has(path);
    const retryAt = PERMANENT_AUDIO_ERRORS.has(error?.errCode) ? Infinity : this.now() + AUDIO_RETRY_DELAY_MS;
    this.retryAfter.set(path, retryAt);
    if (firstFailure) this.warn('audio.play_failed', { name: id, message: error?.errMsg || String(error) });
  }

  contextFailed(group, channel, entry, error) {
    if (group.get(channel) !== entry) return;
    this.dispose(group, channel);
    this.reportFailure(entry.id, entry.path, error);
  }

  dispose(group, channel) {
    const entry = group.get(channel);
    if (!entry) return;
    group.delete(channel);
    try { entry.audio.stop?.(); } catch (_) { /* Destroy even if stop fails. */ }
    try { entry.audio.destroy?.(); } catch (_) { /* The platform may already have released it. */ }
  }

  run(group, channel, entry, operation) {
    try {
      operation(entry.audio);
      return group.get(channel) === entry;
    } catch (error) {
      this.contextFailed(group, channel, entry, error);
      return false;
    }
  }

  setVolume(group, channel, entry, volume) {
    if (entry.volume === volume) return;
    if (this.run(group, channel, entry, audio => { audio.volume = volume; })) entry.volume = volume;
  }

  stopEffects() {
    for (const [channel, entry] of this.effects) {
      if (entry.playing && this.run(this.effects, channel, entry, audio => audio.stop?.())) entry.playing = false;
    }
    this.duckUntil = -Infinity;
  }

  play(id, { volume = 1 } = {}) {
    if (id === 'catch') return this.catchStar();
    if (!this.effectsEnabled) return false;
    const channel = CATCH_CUES.includes(id) ? id : CUE_CHANNELS[id];
    if (!channel) return false;
    const now = this.now();
    const path = `audio/sfx/${id}.wav`;
    if (!this.canTry(path, now)) return false;
    if (now - (this.lastCueAt.get(id) ?? -Infinity) < (COOLDOWN_MS[id] || 0)) return false;
    const gain = EFFECT_GAIN * Math.max(0, Math.min(1, volume));
    let entry = this.effects.get(channel);
    if (entry?.id !== id) {
      this.dispose(this.effects, channel);
      entry = this.createContext(this.effects, channel, id, path, { volume: gain });
    }
    if (!entry) return false;
    const started = this.run(this.effects, channel, entry, audio => {
      if (entry.playing) audio.stop?.();
      if (entry.volume !== gain) audio.volume = gain;
      entry.playing = true;
      audio.play();
    });
    if (!started) return false;
    entry.volume = gain;
    this.lastCueAt.set(id, now);
    if (DUCK_HOLD_MS[id]) {
      this.duckUntil = Math.max(this.duckUntil, now + DUCK_HOLD_MS[id]);
      this.applyMix(now);
    }
    const action = this.effects.get('action');
    if (id === 'level' && action?.playing) {
      this.setVolume(this.effects, 'action', action, action.volume * DUCK_GAIN);
    }
    return true;
  }

  catchStar() {
    const now = this.now();
    if (!this.effectsEnabled || now - (this.lastCueAt.get('catch') ?? -Infinity) < COOLDOWN_MS.catch) return false;
    const available = CATCH_CUES.filter(id => this.canTry(`audio/sfx/${id}.wav`, now));
    const different = available.filter(id => id !== this.lastCatch);
    const choices = different.length ? different : available;
    const id = choices[Math.floor(this.random() * choices.length)];
    if (!id || !this.play(id)) return false;
    this.lastCatch = id;
    this.lastCueAt.set('catch', now);
    return true;
  }

  resetRound() {
    this.dispose(this.tracks, 'stars');
    this.lastCueAt.delete('catch');
    this.lastCatch = null;
  }

  startTrack(name, position = 0) {
    const path = `audio/bgm/bgm_${name}.mp3`;
    const entry = this.tracks.get(name) || this.createContext(this.tracks, name, name, path, {
      loop: name !== 'stars', startTime: position,
    });
    if (!entry) return null;
    if (!entry.playing && !entry.finished) {
      entry.playing = true;
      if (!this.run(this.tracks, name, entry, audio => audio.play())) return null;
    }
    return entry;
  }

  pauseTrack(name, entry, now) {
    this.setVolume(this.tracks, name, entry, 0);
    if (this.tracks.get(name) !== entry) return;
    if (entry.playing && this.run(this.tracks, name, entry, audio => {
      if (typeof audio.pause === 'function') audio.pause();
      else audio.stop?.();
    })) entry.playing = false;
    entry.from = 0;
    entry.target = 0;
    entry.fadeStartedAt = now;
  }

  applyMix(now) {
    const recovery = Math.max(0, Math.min(1, (now - this.duckUntil) / DUCK_RELEASE_MS));
    const duck = DUCK_GAIN + (1 - DUCK_GAIN) * recovery;
    for (const [name, entry] of this.tracks) {
      this.setVolume(this.tracks, name, entry, gainAt(entry, now) * duck);
    }
  }

  update({ musicEnabled, soundEnabled, visible, scene, paused, gamePosition = 0 }, now = this.now()) {
    const effectsEnabled = this.unlocked && soundEnabled && visible;
    if (this.effectsEnabled && !effectsEnabled) this.stopEffects();
    this.effectsEnabled = effectsEnabled;
    if (scene === 'stars' && this.scene !== 'stars') this.resetRound();
    this.scene = scene;

    const musicActive = this.unlocked && musicEnabled && visible && (scene !== 'stars' || !paused);
    this.starsPosition = musicActive && scene === 'stars' && Number.isFinite(gamePosition) ? gamePosition : null;
    if (!musicActive) {
      // The game clock can advance while music is muted. On unmute, start at its current position.
      if (!musicEnabled) this.dispose(this.tracks, 'stars');
      for (const [name, entry] of this.tracks) this.pauseTrack(name, entry, now);
      // Home keeps its position. Re-create night aligned to home after suspension.
      this.dispose(this.tracks, 'night');
      return;
    }

    let desired = scene;
    if (scene === 'night') {
      // Keep home advancing silently during the short night variant so its return stays in time.
      const home = this.startTrack('home');
      const position = home?.audio.currentTime;
      if (!this.startTrack('night', Number.isFinite(position) ? position : 0)) desired = 'home';
    } else {
      this.startTrack(scene, scene === 'stars' ? gamePosition : 0);
    }

    for (const [name, entry] of this.tracks) {
      const target = name === desired ? TRACK_GAIN[name] : 0;
      if (target !== entry.target) {
        entry.from = gainAt(entry, now);
        entry.target = target;
        entry.fadeStartedAt = now;
      }
    }
    this.applyMix(now);
    for (const [name, entry] of this.tracks) {
      if (name === desired || entry.target > 0 || gainAt(entry, now) > 0) continue;
      if (name === 'home') {
        if (desired !== 'night' && entry.playing) this.pauseTrack(name, entry, now);
      } else this.dispose(this.tracks, name);
    }
  }
}
