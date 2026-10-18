import './render.js';
import Scene from './scene.js';
import { CARE_ACTIONS } from './care-actions.js';
import { ACTION_SPEECH, FEEDBACK_MS } from './pet-display.js';
import { DEBUG_ENABLED } from './debug-config.generated.js';
import { createDebugDraft, draftChanged, commitDebugDraft, PET_FIELDS } from './debug-editor.js';
import { SPECIES, STORAGE_KEY, hydrate, adopt, care, daily, miniReward,
  ensureTasks, recordTask, claimTask, settleTime, getDailyGrowth,
  MAX_DAILY_GROWTH } from './model.js';

const STAT_LABELS = { hunger: '饱腹', clean: '清洁', happy: '快乐', energy: '精力' };

function growthFeedback(pet, earned, base, now) {
  const reason = earned < base && pet.level >= 99 ? '（已满级）' :
    earned < base && getDailyGrowth(pet, now) >= MAX_DAILY_GROWTH ? '（今日已满）' : '';
  return `成长 +${earned}${reason}`;
}

export default class Main {
  constructor(options = {}) {
    this.canvas = GameGlobal.canvas;
    this.ctx = this.canvas.getContext('2d');
    this.scene = new Scene(this.ctx, this.canvas);
    this.state = this.load();
    this.ui = { page: 'home', speech: '', toast: '', toastUntil: 0,
      playing: false, paused: false, score: 0, remaining: 20, stars: [], basketX: 195,
      gameResult: '', gameGrowth: '', guideStep: this.state.guideStep, showSettings: false,
      debugEnabled: options.debugEnabled === true || DEBUG_ENABLED,
      debugEditor: null, debugDraft: null, debugKeyboard: null,
      expression: 'normal', expressionUntil: 0, action: '', statDelta: '' };
    this.lastFrame = Date.now();
    this.lastSave = Date.now();
    this.lastCareAt = 0;
    this.sounds = {};
    this.needsDraw = true;
    this.scene.onAssetReady = () => { this.needsDraw = true; };
    this.scene.preloadSceneImages();
    this.visible = true;
    wx.onTouchStart(event => this.touch(event));
    wx.onTouchMove(event => this.move(event));
    if (wx.onTouchEnd) wx.onTouchEnd(event => this.touchEnd(event));
    if (wx.onHide) wx.onHide(() => {
      this.visible = false;
      if (this.ui.playing) this.ui.paused = true;
      this.save();
    });
    if (wx.onShow) wx.onShow(() => {
      settleTime(this.state, Date.now());
      ensureTasks(this.state);
      this.lastFrame = Date.now();
      this.visible = true;
      this.needsDraw = true;
      this.save();
    });
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  load() {
    try { return hydrate(wx.getStorageSync(STORAGE_KEY), Date.now()); }
    catch (e) { return hydrate(null, Date.now()); }
  }

  save() {
    settleTime(this.state, Date.now());
    try { wx.setStorageSync(STORAGE_KEY, this.state); }
    catch (e) { this.notice('本机存档暂时不可用'); }
  }

  notice(message) {
    this.ui.toast = message;
    this.ui.toastUntil = Date.now() + 2200;
    this.needsDraw = true;
  }

  playSound(name) {
    if (!this.state.soundEnabled || !wx.createInnerAudioContext) return;
    try {
      const existing = !!this.sounds[name];
      if (!this.sounds[name]) {
        const audio = wx.createInnerAudioContext();
        audio.src = `audio/${name}.wav`;
        audio.volume = .3;
        this.sounds[name] = audio;
      }
      if (existing) this.sounds[name].stop();
      this.sounds[name].play();
    } catch (error) { /* Audio is optional; gameplay must continue. */ }
  }

  coords(event) {
    const p = event.touches && event.touches[0] || event.changedTouches && event.changedTouches[0];
    if (!p) return null;
    return { x: (p.clientX - this.scene.offsetX) / this.scene.scale,
      y: (p.clientY - this.scene.offsetY) / this.scene.scale };
  }

  touch(event) {
    const p = this.coords(event);
    if (!p) return;
    this.needsDraw = true;
    settleTime(this.state, Date.now());
    if (this.ui.debugEditor) {
      this.debugTouch = { startY: p.y, lastY: p.y, moved: false };
      return;
    }
    const id = this.scene.hit(p.x, p.y);
    if (this.ui.showSettings) {
      if (id === 'sound_toggle') {
        this.state.soundEnabled = !this.state.soundEnabled;
        this.save();
      } else if (id === 'debug_open' && this.ui.debugEnabled) this.openDebugEditor();
      else if (id === 'settings_close') this.ui.showSettings = false;
      return;
    }
    if (this.state.active && this.ui.guideStep > 0) {
      if (id === 'guide_skip') this.ui.guideStep = 0;
      else if (id === 'guide_next') this.ui.guideStep = this.ui.guideStep >= 3 ? 0 : this.ui.guideStep + 1;
      else return;
      this.state.guideStep = this.ui.guideStep;
      this.save();
      return;
    }
    if (id === 'settings') {
      if (this.ui.playing) this.ui.paused = true;
      this.ui.showSettings = true;
      return;
    }
    if (id === 'pause_game' && this.ui.playing) { this.ui.paused = true; return; }
    if (id === 'resume_game' && this.ui.playing) { this.ui.paused = false; this.lastFrame = Date.now(); return; }
    if (id === 'quit_game' && this.ui.playing) {
      this.ui.playing = false; this.ui.paused = false; this.ui.gameResult = '本局已结束，随时再来接星星';
      return;
    }
    if (this.ui.playing && this.ui.page === 'game' && !this.ui.paused && !id) {
      this.ui.basketX = Math.max(83, Math.min(307, p.x));
      return;
    }
    if (!id) return;
    if (id.startsWith('nav_')) {
      if (this.ui.playing && id !== 'nav_game') this.ui.paused = true;
      this.ui.page = id.slice(4);
      return;
    }
    if (id === 'home_tasks') { this.ui.page = 'tasks'; return; }
    if (id === 'game_help') { this.notice('左右滑动篮子接星星，20 秒后结算奖励'); return; }
    if (id.startsWith('task_go_')) {
      const task = id.slice(8);
      this.ui.page = task === 'game' ? 'game' : 'home';
      if (task === 'interact') this.notice('轻点小伙伴，就能完成互动');
      else if (task === 'care') this.notice('选择一种照料方式，完成今日目标');
      return;
    }
    if (id === 'adopt_selected' || id.startsWith('adopt_')) {
      const speciesId = id === 'adopt_selected' ? 'cat' : id.slice(6);
      if (adopt(this.state, speciesId)) {
        this.ui.page = 'home'; this.ui.speech = '终于见到你啦！';
        this.ui.expression = 'happy'; this.ui.expressionUntil = Date.now() + FEEDBACK_MS.tap;
        this.ui.action = ''; this.ui.statDelta = '';
        this.notice('欢迎新伙伴加入小屋 ♡'); this.playSound('adopt'); this.save();
      } else {
        const species = SPECIES.find(item => item.id === speciesId);
        const missing = Math.max(0, (species && species.cost || 0) - this.state.coins);
        this.notice(missing ? `还差 ${missing} 爪爪币，玩游戏可以赚取` : '这位伙伴已经在小屋里啦');
      }
      return;
    }
    if (id.startsWith('select_')) {
      this.state.active = id.slice(7);
      this.ui.page = 'home'; this.ui.speech = ''; this.ui.expressionUntil = 0;
      this.ui.action = ''; this.ui.statDelta = '';
      this.save(); return;
    }
    if (id === 'daily') {
      if (daily(this.state)) { this.notice('领取成功：+30 爪爪币'); this.save(); }
      else this.notice('今天已经领取过啦，明天再来吧');
      return;
    }
    if (id.startsWith('claim_')) {
      const result = claimTask(this.state, id.slice(6));
      this.notice(result && result.reward ? `任务完成：+${result.reward} 爪爪币` : '先完成任务再来领取吧');
      if (result && result.reward) { this.playSound('care'); this.save(); }
      return;
    }
    if (id === 'start_game') { this.startGame(); return; }
    if (id === 'pet_tap') {
      this.ui.speech = ['好喜欢你呀 ♡', '再摸摸我的头~', '今天也要开心哦！'][Math.floor(Math.random() * 3)];
      this.ui.expression = 'happy'; this.ui.expressionUntil = Date.now() + FEEDBACK_MS.tap;
      this.ui.action = ''; this.ui.statDelta = '';
      recordTask(this.state, 'interact'); this.playSound('care'); this.save();
      return;
    }
    if (['feed', 'wash', 'play', 'rest'].includes(id)) {
      const now = Date.now();
      if (now - this.lastCareAt < 350) return;
      const pet = this.state.pets[this.state.active];
      const before = pet && { hunger: pet.hunger, clean: pet.clean, happy: pet.happy, energy: pet.energy };
      const result = care(this.state, id, now);
      if (result) {
        this.notice(result.error || result.label);
        if (!result.error) {
          this.lastCareAt = now;
          this.ui.speech = ACTION_SPEECH[id];
          this.ui.expression = CARE_ACTIONS[id].expression;
          this.ui.expressionUntil = now + FEEDBACK_MS[id];
          this.ui.action = id;
          const effect = CARE_ACTIONS[id];
          const changes = Object.keys(effect.changes).map(stat => {
            const change = Math.round(pet[stat]) - Math.round(before[stat]);
            return change ? `${STAT_LABELS[stat]} ${change > 0 ? '+' : ''}${change}` : '';
          }).filter(Boolean);
          const cost = effect.cost ? ` · 爪爪币 -${effect.cost}` : '';
          this.ui.statDelta = `${changes.join(' · ')}|${growthFeedback(pet, result.xp, effect.xp, now)}${cost}`;
          recordTask(this.state, 'care'); this.playSound(result.leveled ? 'level' : 'care'); this.save();
        }
      }
    }
  }

  move(event) {
    if (this.ui.debugEditor) {
      if (!this.debugTouch || this.ui.debugKeyboard || this.ui.debugEditor.confirmDiscard) return;
      const p = this.coords(event);
      if (!p) return;
      if (Math.abs(p.y - this.debugTouch.startY) > 5) this.debugTouch.moved = true;
      if (this.debugTouch.moved && p.y >= 141 && p.y <= this.scene.debugViewport(this.ui).bottom) {
        this.ui.debugEditor.scroll = Math.max(0, Math.min(this.ui.debugEditor.maxScroll || 0,
          this.ui.debugEditor.scroll + this.debugTouch.lastY - p.y));
        this.needsDraw = true;
      }
      this.debugTouch.lastY = p.y;
      return;
    }
    if (!this.ui.playing || this.ui.paused || this.ui.page !== 'game') return;
    const p = this.coords(event);
    if (p) {
      this.ui.basketX = Math.max(83, Math.min(307, p.x));
      this.needsDraw = true;
    }
  }

  touchEnd(event) {
    if (!this.ui.debugEditor || !this.debugTouch) return;
    const touch = this.debugTouch;
    this.debugTouch = null;
    if (touch.moved) return;
    const p = this.coords(event);
    if (p) this.debugTap(this.scene.hit(p.x, p.y));
  }

  openDebugEditor() {
    if (!this.ui.debugEnabled) return;
    if (this.ui.playing) this.ui.paused = true;
    this.ui.showSettings = false;
    this.ui.debugDraft = createDebugDraft(this.state, Date.now());
    this.ui.debugEditor = { scroll: 0, maxScroll: 0, errors: {}, message: '', confirmDiscard: false };
    this.ui.debugKeyboard = null;
    this.needsDraw = true;
  }

  closeDebugEditor(returnToSettings = true) {
    this.ui.debugEditor = null;
    this.ui.debugDraft = null;
    this.ui.debugKeyboard = null;
    this.debugTouch = null;
    this.ui.showSettings = returnToSettings;
    this.needsDraw = true;
  }

  debugTap(id) {
    const ui = this.ui;
    if (!ui.debugEnabled || !ui.debugEditor || !id) return;
    const editor = ui.debugEditor;
    const draft = ui.debugDraft;
    if (editor.confirmDiscard) {
      if (id === 'debug_keep') editor.confirmDiscard = false;
      else if (id === 'debug_discard') this.closeDebugEditor();
      this.needsDraw = true;
      return;
    }
    if (id.startsWith('debug_key:') && ui.debugKeyboard) {
      const key = id.slice(10);
      const keyboard = ui.debugKeyboard;
      const field = keyboard.key;
      if (key === '完成') ui.debugKeyboard = null;
      else if (key === '取消') {
        draft.values[field] = keyboard.before;
        ui.debugKeyboard = null;
      } else if (key === '清空') {
        draft.values[field] = '';
        keyboard.replace = false;
      } else if (key === '⌫') {
        draft.values[field] = keyboard.replace ? '' : draft.values[field].slice(0, -1);
        keyboard.replace = false;
      } else if (key === '.') {
        if (keyboard.decimal && !draft.values[field].includes('.')) {
          draft.values[field] = keyboard.replace ? '0.' : (draft.values[field] || '0') + '.';
          keyboard.replace = false;
        }
      } else if (/^\d$/.test(key)) {
        draft.values[field] = keyboard.replace ? key : draft.values[field] + key;
        keyboard.replace = false;
      }
      delete editor.errors[field];
      editor.message = '';
      this.needsDraw = true;
      return;
    }
    if (id === 'debug_close' || id === 'debug_cancel') {
      if (draftChanged(draft)) editor.confirmDiscard = true;
      else this.closeDebugEditor();
    } else if (id === 'debug_up' || id === 'debug_down') {
      editor.scroll = Math.max(0, Math.min(editor.maxScroll,
        editor.scroll + (id === 'debug_down' ? 265 : -265)));
    } else if (id === 'debug_save') {
      const now = Date.now();
      const result = commitDebugDraft(this.state, draft, now,
        candidate => wx.setStorageSync(STORAGE_KEY, candidate), ui.debugEnabled);
      if (result.state) {
        this.state = result.state;
        this.lastSave = now;
        this.lastFrame = now;
        this.ui.speech = ''; this.ui.statDelta = ''; this.ui.action = '';
        this.ui.expressionUntil = 0;
        this.closeDebugEditor(false);
        this.notice('调试数据已保存');
      } else if (result.reason === 'date_changed' || result.reason === 'pet_changed') {
        ui.debugDraft = createDebugDraft(this.state, now);
        editor.errors = {};
        editor.scroll = 0;
        editor.message = result.error;
      } else {
        editor.errors = result.errors || {};
        editor.message = result.error;
      }
    } else if (id.startsWith('debug_field:')) {
      const field = id.slice(12);
      if (!(field in draft.values)) return;
      if (field.endsWith('.claimed')) {
        draft.values[field] = !draft.values[field];
        delete editor.errors[field];
      } else {
        const spec = PET_FIELDS.find(item => item.key === field);
        ui.debugKeyboard = { key: field, label: spec?.label ||
          (field === 'coins' ? '爪爪币' : '任务进度'), decimal: !!spec && !spec.integer,
        before: draft.values[field], replace: true };
      }
      editor.message = '';
    }
    this.needsDraw = true;
  }

  startGame() {
    this.lastFrame = Date.now();
    this.ui.playing = true;
    this.ui.paused = false;
    this.ui.score = 0;
    this.ui.remaining = 20;
    this.ui.spawnTimer = 0;
    this.ui.stars = [];
    this.ui.basketX = 195;
    this.ui.gameResult = '';
    this.ui.gameGrowth = '';
  }

  updateGame(dt) {
    const ui = this.ui;
    if (!ui.playing || ui.paused || ui.page !== 'game' || !Number.isFinite(dt) || dt <= 0) return;
    const elapsed = Math.min(dt, ui.remaining);
    ui.remaining = Math.max(0, ui.remaining - dt);
    const field = this.scene.gameField();
    const fieldBottom = field.bottom;
    const priorScore = ui.score;
    let simulated = 0;
    while (simulated < elapsed) {
      const step = Math.min(.05, elapsed - simulated);
      ui.spawnTimer -= step;
      if (ui.spawnTimer <= 0) {
        ui.spawnTimer += .48;
        ui.stars.push({ x: 66 + Math.random() * 258, y: field.y + 34,
          speed: 195 + Math.random() * 70 });
      }
      ui.stars = ui.stars.filter(star => {
        const previousY = star.y;
        star.y += star.speed * step;
        if (previousY <= fieldBottom - 19 && star.y >= fieldBottom - 53 &&
            Math.abs(star.x - ui.basketX) < 52) {
          ui.score++; return false;
        }
        return star.y < fieldBottom;
      });
      simulated += step;
    }
    if (ui.score > priorScore) this.playSound('catch');
    if (ui.remaining <= 0) {
      ui.playing = false;
      ui.remaining = 0;
      const now = Date.now();
      const reward = miniReward(this.state, ui.score, now);
      recordTask(this.state, 'game');
      if (reward.leveled) this.playSound('level');
      ui.gameResult = `接到 ${ui.score} 颗星星 · 获得 ${reward.coins} 爪爪币`;
      const pet = this.state.pets[this.state.active];
      ui.gameGrowth = growthFeedback(pet, reward.xp, Math.min(25, ui.score * 3), now);
      this.notice(reward.leveled ? `萌宠升级啦！额外获得 ${reward.bonus} 爪爪币` : '萌宠玩得好开心！');
      this.save();
    }
  }

  isAnimated() {
    if (this.ui.showSettings || this.ui.debugEditor ||
        (this.state.active && this.ui.guideStep > 0)) return false;
    if (!this.state.active) return true;
    return this.ui.page === 'home' || this.ui.page === 'collection' ||
      (this.ui.page === 'game' && this.ui.playing && !this.ui.paused);
  }

  loop() {
    const now = Date.now();
    const dt = Math.max(0, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    settleTime(this.state, now);
    if (this.ui.expressionUntil && now >= this.ui.expressionUntil) {
      this.ui.expression = 'normal'; this.ui.expressionUntil = 0;
      this.ui.action = ''; this.ui.speech = ''; this.ui.statDelta = '';
      this.needsDraw = true;
    }
    if (this.ui.toast && now >= this.ui.toastUntil) {
      this.ui.toast = '';
      this.needsDraw = true;
    }
    if (this.state.tasks && this.state.tasks.date !== undefined) {
      const previousTasks = this.state.tasks;
      ensureTasks(this.state, now);
      if (this.state.tasks !== previousTasks) this.needsDraw = true;
    }
    const wasAnimated = this.isAnimated();
    this.updateGame(dt);
    if (this.visible && (this.needsDraw || wasAnimated || this.isAnimated())) {
      this.scene.draw(this.state, this.ui);
      this.needsDraw = false;
    }
    if (now - this.lastSave > 30000) { this.lastSave = now; this.save(); }
    requestAnimationFrame(this.loop);
  }
}
