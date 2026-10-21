import './render.js';
import Scene from './scene.js';
import { CARE_ACTIONS } from './care-actions.js';
import { ACTION_SPEECH, FEEDBACK_MS } from './pet-display.js';
import { DEBUG_ENABLED } from './debug-config.generated.js';
import { createDebugDraft, draftChanged, commitDebugDraft, PET_FIELDS } from './debug-editor.js';
import { readViewport, sameViewport } from './viewport.js';
import { canvasBacking } from './canvas-resolution.js';
import { coinWays, careCoinWays } from './coin-ways.js';
import { coinWaysLayout } from './coin-ways-layout.js';
import { careFullReason } from './care-reasons.js';
import { homeAdvice, homeAdviceDetail } from './home-advice.js';
import { careGrowthFeedback } from './growth-info.js';
import { completedGameOutcome } from './game-result.js';
import { logInfo, logWarn, logError } from './logger.js';
import { SPECIES, STORAGE_KEY, hydrate, adopt, care, daily, miniReward,
  ensureTasks, recordTask, claimTask, settleTime,
  SAVE_VERSION, TASKS, petCardState, selectPet,
  DAILY_GIFT_COINS, MAX_COINS } from './model.js';

const STAT_LABELS = { hunger: '饱腹', clean: '清洁', happy: '快乐', energy: '精力' };
// Idle pet scenes need fewer redraws; 50 ms gives them a 20 FPS cap.
const PET_ANIMATION_INTERVAL_MS = 50;

export default class Main {
  constructor(options = {}) {
    this.canvas = GameGlobal.canvas;
    this.ctx = this.canvas.getContext('2d');
    this.scene = new Scene(this.ctx, this.canvas);
    this.viewport = GameGlobal.viewport;
    this.scene.setViewport(this.viewport);
    this.state = this.load();
    this.ui = { page: 'home', speech: '', toast: '', toastUntil: 0,
      playing: false, paused: false, score: 0, remaining: 20, stars: [], basketX: 195,
      gameOutcome: null, quitConfirm: false,
      guideStep: this.state.guideStep, showSettings: false,
      adoptionConfirmId: null,
      coinWaysTarget: null, coinWaysScroll: 0,
      showGrowthHelp: false, showHomeAdvice: true, adviceExplanation: null,
      debugEnabled: options.debugEnabled === true || DEBUG_ENABLED,
      debugEditor: null, debugDraft: null, debugKeyboard: null,
      expression: 'normal', expressionUntil: 0, action: '', statDelta: '' };
    this.lastFrame = Date.now();
    this.lastSave = Date.now();
    this.lastCareAt = 0;
    this.coinWayTouch = null;
    this.sounds = {};
    this.needsDraw = true;
    this.lastAnimationDraw = 0;
    this.lastViewportCheck = Date.now();
    this.scene.onAssetReady = () => { this.needsDraw = true; };
    this.scene.preloadSceneImages();
    this.visible = true;
    wx.onTouchStart(event => this.touch(event));
    wx.onTouchMove(event => this.move(event));
    if (wx.onTouchEnd) wx.onTouchEnd(event => this.touchEnd(event));
    try { if (wx.onWindowResize) wx.onWindowResize(() => this.syncViewport()); }
    catch (error) { logWarn('viewport.resize_listener_failed', { message: String(error) }); }
    if (wx.onHide) wx.onHide(() => {
      this.visible = false;
      if (this.ui.playing) this.ui.paused = true;
      logInfo('app.hidden', { gamePaused: this.ui.playing });
      this.save();
    });
    if (wx.onShow) wx.onShow(() => {
      this.syncViewport();
      settleTime(this.state, Date.now());
      ensureTasks(this.state);
      this.lastFrame = Date.now();
      this.visible = true;
      this.needsDraw = true;
      logInfo('app.shown', { gamePaused: this.ui.playing && this.ui.paused });
      this.save();
    });
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  syncViewport() {
    // The backing store may be larger than the logical window.
    const viewport = readViewport(wx, this.viewport || {});
    this.lastViewportCheck = Date.now();
    if (!viewport || sameViewport(this.viewport, viewport)) return false;
    const resized = !this.viewport || viewport.width !== this.viewport.width ||
      viewport.height !== this.viewport.height;
    const fieldChanged = resized || viewport.top !== this.viewport.top ||
      viewport.bottom !== this.viewport.bottom || viewport.left !== this.viewport.left ||
      viewport.right !== this.viewport.right;
    this.viewportFieldChanged = fieldChanged;
    const oldField = this.ui.playing && fieldChanged ? this.scene.gameField() : null;
    if (fieldChanged) {
      if (this.ui.playing) this.ui.paused = true;
      this.debugTouch = null;
      this.coinWayTouch = null;
    }
    const backing = canvasBacking(viewport);
    if (this.canvas.width !== backing.width || this.canvas.height !== backing.height) {
      this.canvas.width = backing.width;
      this.canvas.height = backing.height;
      this.ctx = this.canvas.getContext('2d');
      this.scene.ctx = this.ctx;
    }
    this.viewport = viewport;
    GameGlobal.viewport = viewport;
    this.scene.setViewport(viewport);
    this.scene.resize();
    logInfo('viewport.changed', { width: viewport.width, height: viewport.height,
      top: viewport.top, bottom: viewport.bottom, left: viewport.left, right: viewport.right,
      gamePaused: this.ui.playing && this.ui.paused });
    if (oldField) {
      const newField = this.scene.gameField();
      this.ui.stars.forEach(star => {
        star.y = newField.y + (star.y - oldField.y) * newField.h / oldField.h;
      });
    }
    this.lastFrame = Date.now();
    this.draw();
    this.needsDraw = false;
    return true;
  }

  load() {
    try {
      const raw = wx.getStorageSync(STORAGE_KEY);
      const state = hydrate(raw, Date.now());
      const source = raw == null || raw === '' ? 'new' :
        raw && typeof raw === 'object' && !Array.isArray(raw) ? 'stored' : 'invalid';
      logInfo('save.loaded', { source, version: raw?.version ?? null,
        migrated: source === 'stored' && raw.version !== SAVE_VERSION,
        pets: Object.keys(state.pets).length });
      return state;
    } catch (error) {
      logError('save.load_failed', { message: String(error) });
      return hydrate(null, Date.now());
    }
  }

  save() {
    settleTime(this.state, Date.now());
    try { wx.setStorageSync(STORAGE_KEY, this.state); }
    catch (error) {
      logError('save.write_failed', { message: String(error) });
      this.notice('本机存档暂时不可用');
    }
  }

  notice(message) {
    this.ui.toast = message;
    this.ui.toastUntil = Date.now() + 2200;
    this.needsDraw = true;
  }

  completeAdoption(speciesId) {
    if (adopt(this.state, speciesId)) {
      const species = SPECIES.find(item => item.id === speciesId);
      logInfo('pet.adopted', { species: speciesId, coins: this.state.coins });
      this.ui.page = 'home'; this.ui.speech = '终于见到你啦！';
      this.ui.expression = 'happy'; this.ui.expressionUntil = Date.now() + FEEDBACK_MS.tap;
      this.ui.action = ''; this.ui.statDelta = '';
      this.notice(speciesId === 'cat' ? '欢迎新伙伴加入小屋 ♡' :
        `欢迎${species.name}来到小屋！`);
      this.playSound('adopt'); this.save();
      return;
    }
    const card = petCardState(this.state, speciesId);
    logInfo('pet.adoption_rejected', { species: speciesId,
      reason: card?.kind === 'short' ? 'insufficient_coins' :
        card?.kind === 'owned' || card?.kind === 'current' ? 'already_owned' : 'invalid_species',
      missing: card?.missing || 0 });
    this.notice(card?.kind === 'short' ? `还差 ${card.missing} 爪爪币` :
      '这位伙伴已经在小屋里啦');
  }

  openCoinWays(target) {
    const offer = target?.kind === 'care' ?
      careCoinWays(this.state, target.action) : coinWays(this.state, target);
    if (!offer) return;
    this.ui.coinWaysTarget = target;
    this.ui.coinWaysScroll = 0;
    this.needsDraw = true;
  }

  closeCoinWays() {
    this.ui.coinWaysTarget = null;
    this.ui.coinWaysScroll = 0;
    this.coinWayTouch = null;
    this.needsDraw = true;
  }

  currentCoinWays(now = Date.now()) {
    if (!this.ui.coinWaysTarget) return null;
    const target = this.ui.coinWaysTarget;
    const offer = target?.kind === 'care' ?
      careCoinWays(this.state, target.action, now) : coinWays(this.state, target, now);
    if (!offer) this.closeCoinWays();
    return offer;
  }

  draw() {
    this.scene.draw(this.state, this.ui, this.currentCoinWays());
  }

  chooseCoinWay(id) {
    if (id === 'coin_ways_close') { this.closeCoinWays(); return; }
    const offer = this.currentCoinWays();
    if (!offer) { this.closeCoinWays(); return; }
    const way = offer.ways.find(item => 'coin_way_' + item.id === id && item.page);
    if (!way) return;
    this.closeCoinWays();
    this.ui.page = way.page;
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
    } catch (error) {
      logWarn('audio.play_failed', { name, message: String(error) });
    }
  }

  coords(event) {
    const p = event.touches && event.touches[0] || event.changedTouches && event.changedTouches[0];
    if (!p) return null;
    return { x: (p.clientX - this.scene.offsetX) / this.scene.scale,
      y: (p.clientY - this.scene.offsetY) / this.scene.scale };
  }

  touch(event) {
    const previousPoint = this.coords(event);
    const previousId = previousPoint && this.scene.hit(previousPoint.x, previousPoint.y);
    const changed = this.syncViewport();
    const p = this.coords(event);
    if (!p) return;
    // A viewport change may move a control under the finger. Keep the touch only
    // when it still points to the same target after the redraw.
    if (changed && previousId !== this.scene.hit(p.x, p.y)) return;
    this.needsDraw = true;
    settleTime(this.state, Date.now());
    if (this.ui.debugEditor) {
      this.debugTouch = { startY: p.y, lastY: p.y, moved: false };
      return;
    }
    const id = this.scene.hit(p.x, p.y);
    if (this.ui.showGrowthHelp) {
      if (id === 'home_growth_close') this.ui.showGrowthHelp = false;
      return;
    }
    if (this.ui.showSettings) {
      if (id === 'sound_toggle') {
        this.state.soundEnabled = !this.state.soundEnabled;
        this.save();
      } else if (id === 'debug_open' && this.ui.debugEnabled) this.openDebugEditor();
      else if (id === 'settings_close') this.ui.showSettings = false;
      return;
    }
    if (this.ui.coinWaysTarget) {
      if (!this.currentCoinWays()) return;
      this.coinWayTouch = { startY: p.y, lastY: p.y, startId: id, moved: false };
      return;
    }
    if (this.ui.adoptionConfirmId) {
      if (id === 'adopt_cancel') this.ui.adoptionConfirmId = null;
      else if (id === 'adopt_confirm') {
        const speciesId = this.ui.adoptionConfirmId;
        this.ui.adoptionConfirmId = null;
        this.completeAdoption(speciesId);
      }
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
    if (this.ui.quitConfirm) {
      if (id === 'quit_confirm_close') this.ui.quitConfirm = false;
      else if (id === 'quit_confirm_continue' && this.ui.playing) {
        this.ui.quitConfirm = false;
        this.ui.paused = false;
        this.lastFrame = Date.now();
        logInfo('game.resumed', { remaining: this.ui.remaining });
      } else if (id === 'quit_confirm_end' && this.ui.playing && this.ui.paused) {
        this.ui.quitConfirm = false;
        this.ui.playing = false;
        this.ui.paused = false;
        this.ui.gameOutcome = { kind: 'aborted' };
        this.ui.toast = '';
        logInfo('game.quit', { score: this.ui.score, remaining: this.ui.remaining });
      }
      return;
    }
    if (id === 'settings') {
      if (this.ui.playing) this.ui.paused = true;
      this.ui.showSettings = true;
      return;
    }
    if (id === 'pause_game' && this.ui.playing) {
      this.ui.paused = true;
      logInfo('game.paused', { reason: 'button', remaining: this.ui.remaining });
      return;
    }
    if (id === 'resume_game' && this.ui.playing && this.ui.paused) {
      this.ui.paused = false; this.lastFrame = Date.now();
      logInfo('game.resumed', { remaining: this.ui.remaining });
      return;
    }
    if (id === 'quit_game' && this.ui.playing && this.ui.paused) {
      this.ui.quitConfirm = true;
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
      this.ui.adviceExplanation = null;
      return;
    }
    if (id === 'home_growth_help') {
      this.ui.showGrowthHelp = true;
      this.ui.adviceExplanation = null;
      return;
    }
    if (id === 'home_advice_close') {
      this.ui.showHomeAdvice = false;
      this.ui.adviceExplanation = null;
      return;
    }
    if (id === 'home_advice') {
      if (!this.ui.showHomeAdvice) return;
      const advice = homeAdvice(this.state);
      if (!advice) return;
      if (advice.kind === 'coins') {
        this.openCoinWays({ kind: 'care', action: advice.action });
      } else {
        this.ui.adviceExplanation = {
          detail: homeAdviceDetail(advice), compactDetail: homeAdviceDetail(advice, true),
          until: Date.now() + 2200 };
        this.ui.toast = '';
        this.ui.toastUntil = 0;
      }
      return;
    }
    if (id === 'game_help') { this.notice('左右滑动篮子接星星，20 秒后结算奖励'); return; }
    if (id === 'game_return_home' && !this.ui.playing && this.ui.gameOutcome) {
      this.ui.page = 'home'; return;
    }
    if (id === 'game_task_reward' && !this.ui.playing && this.ui.gameOutcome) {
      this.ui.page = 'tasks'; return;
    }
    if (id.startsWith('task_go_')) {
      const task = id.slice(8);
      this.ui.page = task === 'game' ? 'game' : 'home';
      if (task === 'interact') this.notice('轻点小伙伴，就能完成互动');
      else if (task === 'care') this.notice('选择一种照料方式，完成今日目标');
      return;
    }
    if (id === 'adopt_selected') { this.completeAdoption('cat'); return; }
    if (id.startsWith('get_coins_')) {
      this.openCoinWays(id.slice(10));
      return;
    }
    if (id.startsWith('adopt_')) {
      const speciesId = id.slice(6);
      const card = petCardState(this.state, speciesId);
      if (card?.kind === 'affordable' && card.cost > 0) {
        this.ui.adoptionConfirmId = speciesId;
      } else if (card?.kind === 'affordable') this.completeAdoption(speciesId);
      else if (card?.kind === 'short') this.openCoinWays(speciesId);
      return;
    }
    if (id.startsWith('current_')) return;
    if (id.startsWith('select_')) {
      const speciesId = id.slice(7);
      if (!selectPet(this.state, speciesId)) return;
      logInfo('pet.selected', { species: this.state.active });
      this.ui.page = 'home'; this.ui.speech = ''; this.ui.expressionUntil = 0;
      this.ui.action = ''; this.ui.statDelta = '';
      this.ui.adviceExplanation = null;
      this.save(); return;
    }
    if (id === 'daily') {
      if (daily(this.state)) {
        logInfo('reward.daily_claimed', { coins: DAILY_GIFT_COINS, balance: this.state.coins });
        this.notice(`领取成功：+${DAILY_GIFT_COINS} 爪爪币`); this.save();
      } else {
        logInfo('reward.daily_rejected', { reason: this.state.coins > MAX_COINS - DAILY_GIFT_COINS ?
          'wallet_full' : 'already_claimed' });
        this.notice('今天已经领取过啦，明天再来吧');
      }
      return;
    }
    if (id.startsWith('claim_')) {
      const taskId = id.slice(6);
      const result = claimTask(this.state, taskId);
      const task = TASKS.find(item => item.id === taskId);
      const reason = result?.reward ? undefined : !task ? 'invalid_task' :
        this.state.tasks.claimed[taskId] ? 'already_claimed' :
          this.state.tasks.progress[taskId] < task.target ? 'incomplete' : 'wallet_full';
      logInfo(result?.reward ? 'reward.task_claimed' : 'reward.task_rejected',
        { task: taskId, reward: result?.reward ?? 0, reason });
      this.notice(result && result.reward ? `任务完成：+${result.reward} 爪爪币` : '先完成任务再来领取吧');
      if (result && result.reward) { this.playSound('care'); this.save(); }
      return;
    }
    if (id === 'start_game' && this.ui.page === 'game' && !this.ui.playing) {
      this.startGame(); return;
    }
    if (id === 'pet_tap') {
      this.ui.adviceExplanation = null;
      this.ui.speech = ['好喜欢你呀 ♡', '再摸摸我的头~', '今天也要开心哦！'][Math.floor(Math.random() * 3)];
      this.ui.expression = 'happy'; this.ui.expressionUntil = Date.now() + FEEDBACK_MS.tap;
      this.ui.action = ''; this.ui.statDelta = '';
      recordTask(this.state, 'interact'); this.playSound('care'); this.save();
      return;
    }
    if (['feed', 'wash', 'play', 'rest'].includes(id)) {
      this.ui.adviceExplanation = null;
      const now = Date.now();
      if (now - this.lastCareAt < 350) return;
      const pet = this.state.pets[this.state.active];
      const before = pet && { hunger: pet.hunger, clean: pet.clean, happy: pet.happy, energy: pet.energy };
      const result = care(this.state, id, now);
      if (result) {
        logInfo(result.error ? 'care.rejected' : 'care.completed',
          { action: id, pet: this.state.active, reason: result.error || undefined,
            xp: result.xp ?? 0, leveled: !!result.leveled });
        this.notice(result.block ? careFullReason(result.block, id, pet.name) :
          result.leveled ? `${pet.name}升到 Lv.${pet.level} 啦` : result.label);
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
          if (effect.cost) changes.push(`爪爪币 -${effect.cost}`);
          const lines = [changes.join(' · ')];
          if (result.leveled) lines.push(`${pet.name}升到 Lv.${pet.level} 啦`);
          lines.push(careGrowthFeedback(pet, result.xp, now));
          if (result.leveled) lines.push(result.bonus ?
            `升级返币 +${result.bonus} 爪爪币` : '钱包已满，升级返币 0');
          this.ui.statDelta = lines.join('|');
          recordTask(this.state, 'care'); this.playSound(result.leveled ? 'level' : 'care'); this.save();
        }
      }
    }
  }

  move(event) {
    if (Date.now() - this.lastViewportCheck >= 500 && this.syncViewport() &&
      this.viewportFieldChanged) return;
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
    if (this.ui.coinWaysTarget) {
      if (!this.coinWayTouch) return;
      const p = this.coords(event);
      if (!p) return;
      if (Math.abs(p.y - this.coinWayTouch.startY) > 5) this.coinWayTouch.moved = true;
      const offer = this.currentCoinWays();
      if (!offer) return;
      const viewport = coinWaysLayout(this.scene.h, offer.ways.length);
      if (this.coinWayTouch.moved && p.y >= viewport.top && p.y <= viewport.bottom) {
        this.ui.coinWaysScroll = Math.max(0, Math.min(viewport.maxScroll,
          this.ui.coinWaysScroll + this.coinWayTouch.lastY - p.y));
        this.needsDraw = true;
      }
      this.coinWayTouch.lastY = p.y;
      return;
    }
    if (!this.ui.playing || this.ui.paused || this.ui.page !== 'game') return;
    const p = this.coords(event);
    if (p) {
      this.ui.basketX = Math.max(83, Math.min(307, p.x));
    }
  }

  touchEnd(event) {
    if (this.syncViewport() && this.viewportFieldChanged) return;
    if (this.ui.coinWaysTarget) {
      const touch = this.coinWayTouch;
      this.coinWayTouch = null;
      if (!touch || touch.moved) return;
      const p = this.coords(event);
      if (!p) return;
      const id = this.scene.hit(p.x, p.y);
      if (id === touch.startId) this.chooseCoinWay(id);
      return;
    }
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
    logInfo('debug.opened', { pet: this.state.active });
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
        const value = draft.values[field];
        if (!keyboard.decimal || !value.includes('.') || value.split('.')[1].length < 2 ||
            keyboard.replace) draft.values[field] = keyboard.replace ? key : value + key;
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
    } else if (id === 'debug_save') {
      const now = Date.now();
      const result = commitDebugDraft(this.state, draft, now,
        candidate => wx.setStorageSync(STORAGE_KEY, candidate), ui.debugEnabled);
      if (result.state) {
        logInfo('debug.saved', { fields: Object.keys(draft.values).filter(key =>
          draft.values[key] !== draft.original[key]) });
        this.state = result.state;
        this.lastSave = now;
        this.lastFrame = now;
        this.ui.speech = ''; this.ui.statDelta = ''; this.ui.action = '';
        this.ui.expressionUntil = 0;
        this.closeDebugEditor(false);
        this.notice('调试数据已保存');
      } else if (result.reason === 'date_changed' || result.reason === 'pet_changed') {
        logWarn('debug.save_rejected', { reason: result.reason });
        ui.debugDraft = createDebugDraft(this.state, now);
        editor.errors = {};
        editor.scroll = 0;
        editor.message = result.error;
      } else {
        (result.reason === 'invalid' ? logInfo : logWarn)('debug.save_rejected', { reason: result.reason,
          fields: Object.keys(result.errors || {}) });
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
    this.ui.gameOutcome = null;
    this.ui.quitConfirm = false;
    logInfo('game.started', { pet: this.state.active });
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
      logInfo('game.completed', { pet: this.state.active, score: ui.score,
        coins: reward.coins, xp: reward.xp, leveled: reward.leveled });
      const taskCompleted = recordTask(this.state, 'game', now);
      if (reward.leveled) this.playSound('level');
      const pet = this.state.pets[this.state.active];
      ui.gameOutcome = completedGameOutcome(ui.score, reward, pet, taskCompleted, now);
      ui.toast = '';
      ui.toastUntil = 0;
      this.save();
    }
  }

  isAnimated() {
    if (this.ui.showSettings || this.ui.adoptionConfirmId || this.ui.coinWaysTarget ||
        this.ui.showGrowthHelp || this.ui.debugEditor ||
        (this.state.active && this.ui.guideStep > 0)) return false;
    if (!this.state.active) return true;
    return this.ui.page === 'home' || this.ui.page === 'collection' ||
      (this.ui.page === 'game' && this.ui.playing && !this.ui.paused);
  }

  loop() {
    const now = Date.now();
    if (this.visible && now - this.lastViewportCheck >= 500) this.syncViewport();
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
      if (this.state.tasks !== previousTasks) {
        logInfo('tasks.reset', { date: this.state.tasks.date });
        this.needsDraw = true;
      }
    }
    const wasAnimated = this.isAnimated();
    this.updateGame(dt);
    const animated = wasAnimated || this.isAnimated();
    const gameAnimating = this.ui.page === 'game' && this.ui.playing;
    if (this.visible && (this.needsDraw ||
        (animated && (gameAnimating ||
          now - this.lastAnimationDraw >= PET_ANIMATION_INTERVAL_MS)))) {
      if (this.needsDraw) this.draw();
      else this.scene.drawAnimation(this.state, this.ui);
      this.lastAnimationDraw = now;
      this.needsDraw = false;
    }
    if (now - this.lastSave > 30000) { this.lastSave = now; this.save(); }
    requestAnimationFrame(this.loop);
  }
}
