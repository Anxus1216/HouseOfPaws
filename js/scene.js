import { SPECIES, TASKS, taskClaimState, giftClaimState, taskSnapshot,
  pendingDailyTaskCount, petCardState, DAILY_GIFT_COINS, careBlock } from './model.js';
import { rewardButtonLabel } from './reward-presentation.js';
import { coinWaysLayout, COIN_WAYS_ROW_STEP } from './coin-ways-layout.js';
import { petDisplay } from './pet-display.js';
import { CARE_ACTIONS } from './care-actions.js';
import { careShortReason } from './care-reasons.js';
import { homeAdvice, homeAdviceText } from './home-advice.js';
import { growthSummary, GROWTH_HELP_LINES } from './growth-info.js';
import { gameOutcomeView } from './game-result.js';
import { guideView } from './guide.js';
import { PET_FIELDS } from './debug-editor.js';
import { readViewport } from './viewport.js';
import { logInfo, logWarn, logError } from './logger.js';
import { LINEN_ASSET, UI_SPRITES } from './ui-assets.js';

const C = {
  ink: '#51372B', muted: '#927565', paper: '#FFF9F0', cream: '#FFF8EE',
  peach: '#FBEBD6', coral: '#C25343', pink: '#D9A2A7', mint: '#55B79B',
  brown: '#684738', gold: '#DDA84F', line: '#E9D5BD', shadow: '#D5BBA7',
  wash: '#FFF3E1', track: '#E9DED0',
};
const PRESS = Object.freeze({ primary: '#A34339', secondary: '#EADCCE',
  icon: '#EBD7C4', row: '#E5D6C2', nav: '#DCEEE9', danger: '#8E3937',
  guide: '#307C91' });
const DANGER = '#B44F4B';
const STATIC_FILL = '#E4DED5';
const FABRIC = Object.freeze({ stitch: '#DDBD9D', edge: '#E9D1B6' });
const BUTTON_FACE = Object.freeze({
  primary: { pressed: PRESS.primary, border: '#A7473D', stitch: 'rgba(255, 239, 219, .75)', linenOpacity: .12 },
  secondary: { pressed: PRESS.secondary, border: FABRIC.edge, stitch: FABRIC.stitch, linenOpacity: .32 },
  icon: { pressed: PRESS.icon, border: FABRIC.edge, stitch: FABRIC.stitch, linenOpacity: .32 },
  danger: { pressed: PRESS.danger, border: '#843A38', stitch: 'rgba(255, 239, 219, .75)', linenOpacity: .32 },
  guide: { pressed: PRESS.guide, border: '#2F6D7D', stitch: 'rgba(255, 239, 219, .75)', linenOpacity: .32 },
});

const TASK_ART = {
  care: { title: '照顾小伙伴', icon: 'feed', color: '#F77C68' },
  interact: { title: '亲密时光', icon: 'play', color: '#AB78D6' },
  game: { title: '星星收集家', icon: 'star', color: '#FFF0D4' },
};

const CARE_SCENE = { wash: 'wash_nook', play: 'play_garden', rest: 'rest_evening' };
const SCENE_NAMES = ['home_afternoon', 'wash_nook', 'play_garden', 'rest_evening', 'star_sky'];

// The design scales from the compact screen height to the fully expanded layout.
const COMPACT_LAYOUT_HEIGHT = 680;
const EXPANDED_LAYOUT_HEIGHT = 844;
const GAME_FIELD_COMPACT_HEIGHT = 356;
const NAV_HEIGHT = 64;
const HOME_LAYOUT = Object.freeze({
  sceneX: 20, sceneWidth: 350, sceneRadius: 23,
  sceneTopCompact: 136, sceneTopExpanded: 155,
  sceneBelowControls: 82, sceneToStats: 8,
  dockInset: 10, dockBottom: 10, dockHeight: 72, dockRadius: 17,
  gaugeSize: 68, gaugeRadius: 27, gaugeStroke: 7.5,
  gaugeAboveNav: 84, labelAboveNav: 16,
  petScaleHeight: 450,
});
const HOME_INFO = Object.freeze({ x: 32, width: 326, top: 12,
  growthHeight: 61, adviceTop: 79, adviceHeight: 28, speechTop: 114 });
const HOME_STATS = Object.freeze([
  { label: '饱腹', field: 'hunger', color: '#F3A34D' },
  { label: '清洁', field: 'clean', color: '#58AA9B' },
  { label: '心情', field: 'happy', color: '#B980D6' },
  { label: '精力', field: 'energy', color: '#599FE0' },
]);
const HOME_ACTIONS = Object.freeze([
  { id: 'feed', label: '喂食', icon: 'feed', fill: '#FFE0D3', pressed: '#F4A38B' },
  { id: 'wash', label: '清洁', icon: 'wash', fill: '#D8F1E9', pressed: '#8AD8C4' },
  { id: 'play', label: '玩耍', icon: 'play', fill: '#EDE5FA', pressed: '#D4AFE9' },
  { id: 'rest', label: '休息', icon: 'rest', fill: '#DCEBFA', pressed: '#9DC8EE' },
]);
const HEADER_TYPE = Object.freeze({
  headingSize: 24, descriptionSize: 12, captionSize: 10,
  accentAboveHeading: 18, descriptionBelowHeading: 24, captionBelowHeading: 48,
});
const HEADER_COIN = Object.freeze({ x: 274, topOffset: 3, width: 69, height: 32 });
// The welcome artwork extends below the home scene, with more space on taller screens.
const WELCOME_MIN_EXTENSION = 70;
const WELCOME_HEIGHT_EXTENSION_RATE = .25;
// Collection rows grow in height and spacing as the layout ratio approaches one.
const COLLECTION_ROW_BASE_HEIGHT = 150;
const COLLECTION_ROW_EXTRA_HEIGHT = 25;
const COLLECTION_ROW_BASE_GAP = 9;
const COLLECTION_ROW_EXTRA_GAP = 2;
// Animation clipping includes 5 units beyond each side of the 20..370 scene.
const ANIMATION_CLIP_LEFT = 15;
const ANIMATION_CLIP_WIDTH = 360;
// Sprites can bob slightly above the scene, so retain this top margin.
const ANIMATION_CLIP_TOP_MARGIN = 10;
// Scene animation time is measured in seconds; Date.now() is in milliseconds.
const MILLISECONDS_PER_SECOND = 1000;
const GUIDE_CARD = Object.freeze({ x: 32, width: 326, height: 82, radius: 16 });
const GUIDE_COLOR = Object.freeze({ fill: '#E7F4F6', label: '#2D6D7D',
  text: '#254A57', button: '#D6EDF1', focus: '#54A9BB' });

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

export default class Scene {
  constructor(ctx, canvas) {
    this.ctx = ctx;
    this.canvas = canvas;
    this.scale = 1;
    this.pixelScaleX = 1;
    this.pixelScaleY = 1;
    this.h = EXPANDED_LAYOUT_HEIGHT;
    this.offsetX = 0;
    this.offsetY = 0;
    this.headerControlsY = 64;
    this.buttons = [];
    this.time = 0;
    this.petImages = new Map();
    this.sceneImages = new Map();
    this.linenImage = null;
    this.uiImages = new Map();
    this.viewport = null;
  }

  setViewport(viewport) { this.viewport = viewport; }

  resize() {
    // Fit the 390-unit layout inside the visible safe rectangle.
    const viewport = this.viewport || readViewport(typeof wx === 'undefined' ? {} : wx, this.canvas);
    const top = viewport?.top ?? 0;
    const bottom = viewport?.bottom ?? 0;
    const left = viewport?.left ?? 0;
    const right = viewport?.right ?? 0;
    const logicalWidth = this.viewport?.width ?? this.canvas.width;
    const logicalHeight = this.viewport?.height ?? this.canvas.height;
    this.pixelScaleX = this.canvas.width / logicalWidth;
    this.pixelScaleY = this.canvas.height / logicalHeight;
    const usable = logicalHeight - top - bottom;
    const usableWidth = Math.max(1, logicalWidth - left - right);
    this.scale = Math.min(usableWidth / 390, usable / COMPACT_LAYOUT_HEIGHT);
    this.h = usable / this.scale;
    this.offsetX = left + (usableWidth - 390 * this.scale) / 2;
    this.offsetY = top;
    this.headerControlsY = 64;
    if (viewport && Number.isFinite(viewport.menuBottom)) {
      this.headerControlsY = Math.max(64,
        (viewport.menuBottom + 10 - this.offsetY) / this.scale);
    }
  }

  roundedPath(x, y, w, h, r) {
    const c = this.ctx, radius = Math.min(r, w / 2, h / 2);
    c.beginPath(); c.moveTo(x + radius, y);
    c.lineTo(x + w - radius, y); c.quadraticCurveTo(x + w, y, x + w, y + radius);
    c.lineTo(x + w, y + h - radius); c.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    c.lineTo(x + radius, y + h); c.quadraticCurveTo(x, y + h, x, y + h - radius);
    c.lineTo(x, y + radius); c.quadraticCurveTo(x, y, x + radius, y); c.closePath();
  }

  box(x, y, w, h, r, fill, stroke, line = 1) {
    const c = this.ctx;
    this.roundedPath(x, y, w, h, r);
    c.fillStyle = fill; c.fill();
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = line; c.stroke(); }
  }

  loadLinenImage() {
    if (this.linenImage) return this.linenImage;
    const createImage = this.canvas.createImage ? () => this.canvas.createImage() :
      typeof wx !== 'undefined' && wx.createImage ? () => wx.createImage() : null;
    if (!createImage) return null;
    try {
      const image = createImage();
      const entry = { image, ready: false, failed: false };
      this.linenImage = entry;
      image.onload = () => {
        entry.ready = true;
        if (this.onAssetReady) this.onAssetReady();
      };
      image.onerror = error => {
        entry.failed = true;
        logError('scene.linen_load_failed', { message: String(error) });
      };
      image.src = LINEN_ASSET;
      return entry;
    } catch (error) {
      logError('scene.linen_create_failed', { message: String(error) });
      return null;
    }
  }

  linenOverlay(x, y, w, h, radius, opacity) {
    const entry = this.loadLinenImage();
    if (!entry?.ready || entry.failed || !entry.image.width || !entry.image.height) return;
    const c = this.ctx;
    c.save();
    try {
      if (radius) { this.roundedPath(x, y, w, h, radius); c.clip(); }
      c.globalAlpha = opacity;
      const sourceX = x / 390 * entry.image.width;
      const sourceY = y / this.h * entry.image.height;
      const sourceW = w / 390 * entry.image.width;
      const sourceH = h / this.h * entry.image.height;
      c.drawImage(entry.image, sourceX, sourceY, sourceW, sourceH, x, y, w, h);
    } catch (error) {
      entry.failed = true;
      logError('scene.linen_draw_failed', { message: String(error) });
    } finally { c.restore(); }
  }

  loadUiSprite(name) {
    if (!Object.prototype.hasOwnProperty.call(UI_SPRITES, name)) {
      if (!this.unknownUiSprites) this.unknownUiSprites = new Set();
      if (!this.unknownUiSprites.has(name)) {
        this.unknownUiSprites.add(name);
        logWarn('scene.ui_sprite_unknown', { name });
      }
      return null;
    }
    const path = UI_SPRITES[name];
    let entry = this.uiImages.get(name);
    if (!entry) {
      const createImage = this.canvas.createImage ? () => this.canvas.createImage() :
        typeof wx !== 'undefined' && wx.createImage ? () => wx.createImage() : null;
      if (!createImage) return null;
      try {
        const image = createImage();
        entry = { image, ready: false, failed: false };
        this.uiImages.set(name, entry);
        image.onload = () => {
          entry.ready = true;
          if (this.onAssetReady) this.onAssetReady();
        };
        image.onerror = error => {
          entry.failed = true;
          logError('scene.ui_sprite_load_failed', { name, message: String(error) });
        };
        image.src = path;
      } catch (error) {
        logError('scene.ui_sprite_create_failed', { name, message: String(error) });
        return null;
      }
    }
    return entry;
  }

  drawUiSprite(name, x, y, w, h) {
    const entry = this.loadUiSprite(name);
    if (!entry) return false;
    if (!entry.ready || entry.failed) return false;
    try { this.ctx.drawImage(entry.image, x, y, w, h); }
    catch (error) {
      entry.failed = true;
      logError('scene.ui_sprite_draw_failed', { name, message: String(error) });
      return false;
    }
    return true;
  }

  fabricPanel(x, y, w, h, radius, fill = C.paper, stitch = true) {
    const c = this.ctx;
    if (typeof c.save !== 'function') {
      this.box(x, y, w, h, radius, fill, FABRIC.edge);
      return;
    }
    c.save();
    c.shadowColor = 'rgba(105, 66, 37, .13)';
    c.shadowBlur = 11;
    c.shadowOffsetY = 4;
    this.box(x, y, w, h, radius, fill, FABRIC.edge, 1);
    c.restore();
    this.linenOverlay(x, y, w, h, radius, .42);
    if (stitch && w > 90 && h > 43) {
      c.save();
      this.roundedPath(x + 6, y + 6, w - 12, h - 12, Math.max(2, radius - 5));
      c.strokeStyle = FABRIC.stitch;
      c.lineWidth = 1;
      c.setLineDash([4, 4]);
      c.stroke();
      c.restore();
    }
  }

  sceneFrame(x, y, w, h, radius) {
    const c = this.ctx;
    c.save();
    this.roundedPath(x, y, w, h, radius);
    c.strokeStyle = '#C78C59'; c.lineWidth = 5; c.stroke();
    this.roundedPath(x + 5, y + 5, w - 10, h - 10, Math.max(2, radius - 5));
    c.strokeStyle = '#FBE2B8'; c.lineWidth = 2; c.stroke();
    c.setLineDash([5, 5]);
    this.roundedPath(x + 8, y + 8, w - 16, h - 16, Math.max(2, radius - 8));
    c.strokeStyle = 'rgba(128, 75, 37, .55)'; c.lineWidth = 1; c.stroke();
    c.restore();
  }

  loadSceneImage(name) {
    let entry = this.sceneImages.get(name);
    if (!entry) {
      const createImage = this.canvas.createImage ? () => this.canvas.createImage() :
        typeof wx !== 'undefined' && wx.createImage ? () => wx.createImage() : null;
      if (!createImage) {
        if (!this.sceneImageApiUnavailable) {
          this.sceneImageApiUnavailable = true;
          logWarn('scene.image_api_unavailable');
        }
        return null;
      }
      try {
        const image = createImage();
        entry = { image, ready: false, failed: false };
        this.sceneImages.set(name, entry);
        image.onload = () => {
          entry.ready = true;
          logInfo('scene.image_ready', { name, width: image.width, height: image.height });
          if (this.onAssetReady) this.onAssetReady();
        };
        image.onerror = error => {
          if (!entry.fallback) {
            entry.fallback = true;
            image.src = `assets/scenes/scene_${name}.jpg`;
          } else {
            entry.failed = true;
            logError('scene.image_load_failed', { name, message: String(error) });
            if (this.onAssetReady) this.onAssetReady();
          }
        };
        image.src = `assets/scenes/scene_${name}_felt.jpg`;
      } catch (error) {
        this.sceneImages.delete(name);
        if (!this.failedSceneCreations) this.failedSceneCreations = new Set();
        if (!this.failedSceneCreations.has(name)) {
          this.failedSceneCreations.add(name);
          logError('scene.image_create_failed', { name, message: String(error) });
        }
        return null;
      }
    }
    return entry;
  }

  preloadSceneImages() {
    SCENE_NAMES.forEach(name => this.loadSceneImage(name));
  }

  sceneBackdrop(name, x, y, w, h, radius, fallback, focusY = .5) {
    this.box(x, y, w, h, radius, fallback);
    const entry = this.loadSceneImage(name);
    if (!entry) return false;
    const image = entry.image;
    if (!entry.ready || entry.failed || !image.width || !image.height) return false;
    const scale = Math.max(w / image.width, h / image.height);
    const sourceW = w / scale, sourceH = h / scale;
    const sourceX = (image.width - sourceW) / 2;
    const sourceY = (image.height - sourceH) * focusY;
    const c = this.ctx;
    c.save();
    try {
      this.roundedPath(x, y, w, h, radius);
      c.clip();
      c.drawImage(image, sourceX, sourceY, sourceW, sourceH, x, y, w, h);
    } catch (error) {
      entry.failed = true;
      logError('scene.image_draw_failed', { name, message: String(error) });
      return false;
    } finally { c.restore(); }
    return true;
  }

  text(value, x, y, size = 14, color = C.ink, align = 'left', weight = 'normal') {
    const c = this.ctx;
    c.fillStyle = color; c.textAlign = align; c.textBaseline = 'middle';
    c.font = `${weight} ${size}px sans-serif`;
    c.fillText(String(value), x, y);
  }

  readableText(value, x, y, size, color = C.ink, align = 'left', weight = 'normal') {
    this.text(value, x, y, Math.max(size, 11 / this.scale), color, align, weight);
  }

  circle(x, y, r, fill, stroke, line = 1) {
    const c = this.ctx;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
    c.fillStyle = fill; c.fill();
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = line; c.stroke(); }
  }

  ellipse(x, y, rx, ry, fill, rotation = 0, stroke = null, line = 1) {
    const c = this.ctx;
    c.beginPath(); c.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2);
    c.fillStyle = fill; c.fill();
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = line; c.stroke(); }
  }

  polygon(points, fill, stroke = null, line = 1) {
    const c = this.ctx;
    c.beginPath(); c.moveTo(points[0][0], points[0][1]);
    points.slice(1).forEach(p => c.lineTo(p[0], p[1])); c.closePath();
    c.fillStyle = fill; c.fill();
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = line; c.stroke(); }
  }

  line(points, color = C.ink, width = 2) {
    const c = this.ctx;
    c.beginPath(); c.moveTo(points[0][0], points[0][1]);
    points.slice(1).forEach(p => c.lineTo(p[0], p[1]));
    c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke();
  }

  curve(x1, y1, cx, cy, x2, y2, color = C.ink, width = 2) {
    const c = this.ctx;
    c.beginPath(); c.moveTo(x1, y1); c.quadraticCurveTo(cx, cy, x2, y2);
    c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.stroke();
  }

  button(id, x, y, w, h, label, fill = C.paper, color = C.ink, border = null,
    fontSize = 14, options = {}) {
    const style = !options.disabled &&
      Object.prototype.hasOwnProperty.call(BUTTON_FACE, options.variant) ?
      BUTTON_FACE[options.variant] : BUTTON_FACE.secondary;
    const activePress = this.pressedId === id && !options.disabled;
    const face = activePress ? style.pressed : fill;
    const inset = activePress ? 1 : 0;
    const radius = Math.min(24, h / 2);
    const c = this.ctx;
    if (typeof c.save === 'function') {
      c.save();
      c.shadowColor = 'rgba(96, 57, 34, .18)';
      c.shadowBlur = activePress ? 2 : 7;
      c.shadowOffsetY = activePress ? 1 : 3;
    }
    this.box(x, y + inset, w, h - inset, radius, face,
      border || (options.disabled ? C.line : style.border));
    if (typeof c.restore === 'function') c.restore();
    if (typeof c.save === 'function') this.linenOverlay(x, y + inset, w, h - inset,
      radius, style.linenOpacity);
    if (typeof c.setLineDash === 'function' && w > 110 && h >= 36) {
      c.save();
      c.setLineDash([4, 4]);
      this.roundedPath(x + 5, y + 5 + inset, w - 10, h - 10 - inset,
        Math.min(12, (h - 10) / 2));
      c.strokeStyle = style.stitch;
      c.lineWidth = 1; c.stroke();
      c.restore();
    }
    this.readableText(label, x + w / 2, y + h / 2 + 1 + inset, fontSize, color, 'center', 'bold');
    this.buttons.push({ id, x, y, w, h });
  }

  roundIconButton(id, cx, cy, radius, glyph) {
    this.circle(cx, cy + 2, radius, 'rgba(99, 62, 39, .14)');
    this.circle(cx, cy, radius,
      this.pressedId === id ? PRESS.icon : '#F8EFE5', FABRIC.edge, 1);
    this.text(glyph, cx, cy + 1, 20, C.brown, 'center');
    this.buttons.push({ id, x: cx - radius, y: cy - radius,
      w: radius * 2, h: radius * 2 });
  }

  background(x = 0, y = 0, w = 390, h = this.h) {
    const c = this.ctx;
    c.fillStyle = C.cream; c.fillRect(x, y, w, h);
    this.linenOverlay(x, y, w, h, 0, 1);
  }

  layout() {
    const ratio = clamp((this.h - COMPACT_LAYOUT_HEIGHT) /
      (EXPANDED_LAYOUT_HEIGHT - COMPACT_LAYOUT_HEIGHT), 0, 1);
    const extra = Math.max(0, this.h - EXPANDED_LAYOUT_HEIGHT);
    return { ratio, extra, sceneY: 136 + 33 * ratio,
      sceneH: 165 + 83 * ratio + extra, navY: this.h - NAV_HEIGHT };
  }

  homeLayout() {
    const { ratio, navY } = this.layout();
    const sceneY = Math.max(HOME_LAYOUT.sceneTopCompact +
      (HOME_LAYOUT.sceneTopExpanded - HOME_LAYOUT.sceneTopCompact) * ratio,
    this.headerControlsY + HOME_LAYOUT.sceneBelowControls);
    const gaugeY = navY - HOME_LAYOUT.gaugeAboveNav;
    const sceneBottom = gaugeY - HOME_LAYOUT.sceneToStats;
    const dockX = HOME_LAYOUT.sceneX + HOME_LAYOUT.dockInset;
    const dockW = HOME_LAYOUT.sceneWidth - HOME_LAYOUT.dockInset * 2;
    return { sceneY, sceneBottom, sceneH: sceneBottom - sceneY,
      gaugeY, gaugeBottom: gaugeY + HOME_LAYOUT.gaugeSize,
      labelY: navY - HOME_LAYOUT.labelAboveNav,
      dockX, dockW, dockY: sceneBottom - HOME_LAYOUT.dockBottom - HOME_LAYOUT.dockHeight };
  }

  header(state, heading, description, caption, settings = true, dark = false) {
    const { ratio } = this.layout();
    const headingColor = dark ? '#FFF8E8' : C.ink;
    const detailColor = dark ? '#FBE9CA' : C.brown;
    this.text('爪爪小屋', 20, 35, 18, headingColor, 'left', 'bold');
    const controlsY = this.headerControlsY;
    const coinY = controlsY + HEADER_COIN.topOffset;
    this.fabricPanel(HEADER_COIN.x, coinY, HEADER_COIN.width, HEADER_COIN.height,
      HEADER_COIN.height / 2, C.peach, false);
    this.text('✦  ' + state.coins, HEADER_COIN.x + HEADER_COIN.width / 2,
      coinY + HEADER_COIN.height / 2 + 1,
      13, C.brown, 'center', 'bold');
    if (settings) {
      this.circle(365, controlsY + 19, 18,
        this.pressedId === 'settings' ? PRESS.icon : '#F8EFE5');
      this.text('⚙', 366, controlsY + 19, 20, C.brown, 'center');
      this.buttons.push({ id: 'settings', x: 346, y: controlsY, w: 38, h: 38 });
    }
    const headingY = 83 + 16 * ratio;
    this.text(heading, 20, headingY, dark ? 27 : HEADER_TYPE.headingSize,
      headingColor, 'left', 'bold');
    this.text(description, 20, headingY + HEADER_TYPE.descriptionBelowHeading,
      HEADER_TYPE.descriptionSize, detailColor);
    if (ratio > .3 && caption) this.text(caption, 20,
      headingY + HEADER_TYPE.captionBelowHeading, HEADER_TYPE.captionSize, detailColor);
  }

  face(expression, t) {
    const blink = expression === 'normal' && Math.sin(t * 1.4) > .991;
    if (expression === 'happy') {
      this.curve(-38, -15, -27, -27, -16, -15, C.ink, 3);
      this.curve(16, -15, 27, -27, 38, -15, C.ink, 3);
      this.curve(-13, 12, 0, 28, 13, 12, C.ink, 2.6);
    } else if (expression === 'sleepy') {
      this.curve(-38, -12, -27, -5, -16, -12, C.ink, 3);
      this.curve(16, -12, 27, -5, 38, -12, C.ink, 3);
      this.ellipse(0, 15, 5, 6, C.ink);
    } else if (expression === 'need') {
      this.curve(-38, -18, -27, -23, -16, -15, C.ink, 3);
      this.curve(16, -15, 27, -23, 38, -18, C.ink, 3);
      this.ellipse(0, 15, 7, 4, C.ink);
      this.ellipse(43, 8, 3, 7, '#8ABBC6', -.25);
    } else if (blink) {
      this.ellipse(-27, -13, 8, 2, C.ink);
      this.ellipse(27, -13, 8, 2, C.ink);
      this.curve(-12, 11, 0, 19, 12, 11, C.ink, 2.4);
    } else {
      this.ellipse(-27, -13, 5, 8, C.ink);
      this.ellipse(27, -13, 5, 8, C.ink);
      this.circle(-29, -16, 1.7, '#FFF'); this.circle(25, -16, 1.7, '#FFF');
      this.curve(-12, 11, 0, 19, 12, 11, C.ink, 2.4);
    }
  }

  petSprite(id, x, y, size, t, expression, action) {
    const state = ['feed', 'wash', 'play', 'rest'].includes(action) ? action :
      ['normal', 'happy', 'sleepy', 'need'].includes(expression) ? expression : 'normal';
    const key = `${id}_${state}`;
    let entry = this.petImages.get(key);
    if (!entry) {
      const createImage = this.canvas.createImage ? () => this.canvas.createImage() :
        typeof wx !== 'undefined' && wx.createImage ? () => wx.createImage() : null;
      if (!createImage) {
        if (!this.petImageApiUnavailable) {
          this.petImageApiUnavailable = true;
          logWarn('pet.image_api_unavailable');
        }
        return false;
      }
      try {
        const image = createImage();
        entry = { image, ready: false, failed: false };
        this.petImages.set(key, entry);
        image.onload = () => {
          entry.ready = true;
          logInfo('pet.image_ready', { key, width: image.width, height: image.height });
          if (this.onAssetReady) this.onAssetReady();
        };
        image.onerror = error => {
          entry.failed = true;
          logError('pet.image_load_failed', { key, message: String(error) });
        };
        image.src = `assets/pets/sprites/pet_${key}.png`;
      } catch (error) {
        this.petImages.delete(key);
        if (!this.failedPetCreations) this.failedPetCreations = new Set();
        if (!this.failedPetCreations.has(key)) {
          this.failedPetCreations.add(key);
          logError('pet.image_create_failed', { key, message: String(error) });
        }
        return false;
      }
    }
    if (!entry.ready || entry.failed) return false;
    const bob = expression === 'sleepy' ? Math.sin(t * 1.2) * 1.8 : Math.sin(t * 2) * 3;
    const side = 300 * size;
    try {
      this.ctx.drawImage(entry.image, x - side / 2, y - 170 * size + bob, side, side);
    } catch (error) {
      entry.failed = true;
      logError('pet.image_draw_failed', { key, message: String(error) });
      return false;
    }
    return true;
  }

  pet(id, x, y, size = 1, t = 0, expression = 'normal', action = '') {
    if (this.petSprite(id, x, y, size, t, expression, action)) return;
    const spec = SPECIES.find(s => s.id === id) || SPECIES[0];
    const c = this.ctx;
    const bob = expression === 'sleepy' ? Math.sin(t * 1.2) * 1.8 : Math.sin(t * 2) * 3;
    c.save(); c.translate(x, y + bob); c.scale(size, size);
    const body = spec.color;
    // The silhouette, face shape, forehead mark, tail and accessory are unique to each pet.
    if (id === 'cat') {
      this.curve(58, 63, 101, 87 + Math.sin(t * 3) * 10, 76, 22, '#B8826D', 16);
      this.curve(58, 63, 101, 87 + Math.sin(t * 3) * 10, 76, 22, body, 12);
      this.ellipse(0, 48, 64, 70, body, 0, C.brown, 1.3);
      this.polygon([[-63, -34], [-59, -99], [-17, -71]], body, C.brown, 1.3);
      this.polygon([[63, -34], [59, -99], [17, -71]], body, C.brown, 1.3);
      this.polygon([[-54, -74], [-52, -90], [-34, -74]], '#DB9D8D');
      this.polygon([[54, -74], [52, -90], [34, -74]], '#DB9D8D');
      this.ellipse(0, -15, 70, 67, body, 0, C.brown, 1.4);
      this.curve(-12, -77, -15, -54, -2, -65, '#D78B78', 6);
      this.curve(-2, -65, 10, -75, 8, -56, '#D78B78', 5);
      this.circle(-47, 4, 2.5, '#C6816F'); this.circle(-43, 12, 2.5, '#C6816F');
      this.circle(47, 4, 2.5, '#C6816F'); this.circle(43, 12, 2.5, '#C6816F');
      this.line([[-53, 7], [-77, 2]], '#A77768', 1.5); this.line([[53, 7], [77, 2]], '#A77768', 1.5);
      this.ellipse(0, 5, 6, 4, C.ink);
      this.ellipse(0, 49, 38, 8, C.coral);
      this.circle(20, 58, 8, C.gold, C.brown, 1);
    } else if (id === 'rabbit') {
      this.circle(65, 65, 17, '#F3E7DE', C.brown, 1);
      this.ellipse(0, 48, 58, 68, body, 0, C.brown, 1.3);
      const lift = expression === 'happy' ? 12 : 0;
      this.ellipse(-56, -102 - lift, 20, 62, body, -.52, C.brown, 1.3);
      this.ellipse(56, -102 - lift, 20, 62, body, .52, C.brown, 1.3);
      this.ellipse(-56, -101 - lift, 8, 45, '#D9A7B0', -.52);
      this.ellipse(56, -101 - lift, 8, 45, '#D9A7B0', .52);
      this.ellipse(0, -17, 64, 73, body, 0, C.brown, 1.4);
      for (const [px, py] of [[-25, -75], [-8, -81], [10, -78], [26, -69]]) this.circle(px, py, 15, '#F5EBE3');
      this.ellipse(0, 4, 6, 5, '#B77F8C');
      this.ellipse(0, 48, 37, 8, C.mint);
      this.polygon([[13, 51], [31, 51], [25, 76]], C.mint);
    } else {
      this.curve(55, 59, 105, 61, 76, 14, '#B6785C', 22);
      this.curve(55, 59, 105, 61, 76, 14, body, 15);
      this.ellipse(0, 48, 69, 71, body, 0, C.brown, 1.3);
      this.polygon([[-64, -33], [-52, -91], [-18, -65]], '#B6785C', C.brown, 1.3);
      this.polygon([[64, -33], [52, -91], [18, -65]], '#B6785C', C.brown, 1.3);
      this.polygon([[-53, -67], [-48, -82], [-34, -65]], '#E9B69B');
      this.polygon([[53, -67], [48, -82], [34, -65]], '#E9B69B');
      this.ellipse(0, -13, 76, 65, body, 0, C.brown, 1.4);
      this.ellipse(-27, -36, 15, 9, '#F8DEC2'); this.ellipse(27, -36, 15, 9, '#F8DEC2');
      this.ellipse(0, 10, 43, 26, '#FFF1DD');
      this.ellipse(0, 2, 8, 6, C.ink);
      this.ellipse(0, 51, 35, 8, '#B6785C');
      this.text('★', 20, 59, 15, C.gold, 'center', 'bold');
    }
    this.ellipse(-43, 12, 10, 5, '#EFAFAB'); this.ellipse(43, 12, 10, 5, '#EFAFAB');
    this.face(expression, t);
    this.ellipse(-40, 102, 21, 13, body, 0, C.brown, 1);
    this.ellipse(40, 102, 21, 13, body, 0, C.brown, 1);
    if (action === 'feed') {
      this.circle(64, 31, 13, '#D77F7A'); this.polygon([[62, 17], [70, 13], [67, 23]], C.mint);
    } else if (action === 'wash') {
      this.circle(-68, -47, 9, '#D9F1F1', '#9FCBD0');
      this.circle(72, -72, 12, '#D9F1F1', '#9FCBD0');
      this.circle(78, 3, 6, '#D9F1F1', '#9FCBD0');
    } else if (action === 'play') {
      this.circle(72, 84, 19, '#E9A9B8', C.brown);
      this.curve(72, 84, 97, 67, 105, 81, C.brown, 2);
    } else if (action === 'rest') {
      this.text('z', 73, -73, 19, C.muted, 'center', 'bold');
      this.text('z', 90, -94, 14, C.muted, 'center', 'bold');
    }
    c.restore();
  }

  drawHomeGauge(x, y, value, color) {
    const c = this.ctx;
    const centerY = y + 42;
    const start = Math.PI;
    const sweep = Math.PI;
    c.save();
    c.lineWidth = HOME_LAYOUT.gaugeStroke;
    c.lineCap = 'round';
    c.beginPath(); c.arc(x, centerY, HOME_LAYOUT.gaugeRadius, start, start + sweep);
    c.strokeStyle = '#E8DDD1'; c.stroke();
    if (value > 0) {
      c.beginPath(); c.arc(x, centerY, HOME_LAYOUT.gaugeRadius,
        start, start + sweep * clamp(value, 0, 100) / 100);
      c.strokeStyle = color; c.stroke();
    }
    c.restore();
    this.text(`${Math.round(value)}%`, x, centerY - 7, 13, C.ink, 'center', 'bold');
  }

  homeStats(pet, layout) {
    this.fabricPanel(HOME_LAYOUT.sceneX, layout.gaugeY - 6, HOME_LAYOUT.sceneWidth,
      this.layout().navY - layout.gaugeY + 1, 17, '#FFF3E2', false);
    const columnWidth = HOME_LAYOUT.sceneWidth / HOME_STATS.length;
    HOME_STATS.forEach((stat, index) => {
      const x = HOME_LAYOUT.sceneX + columnWidth * (index + .5);
      this.drawHomeGauge(x, layout.gaugeY, pet[stat.field], stat.color);
      this.readableText(stat.label, x, layout.labelY, 11, C.brown, 'center', 'bold');
    });
  }

  careIcon(id, x, y, color) {
    const c = this.ctx;
    c.save(); c.translate(x, y);
    c.strokeStyle = color; c.fillStyle = color; c.lineWidth = 2.2;
    c.lineCap = 'round'; c.lineJoin = 'round';
    if (id === 'feed') {
      c.beginPath(); c.moveTo(-10, 1); c.quadraticCurveTo(0, 15, 10, 1); c.stroke();
      c.beginPath(); c.moveTo(-11, 0); c.lineTo(11, 0); c.stroke();
      [-5, 0, 5].forEach((offset, index) => {
        c.beginPath(); c.arc(offset, index === 1 ? -6 : -4, 1.5, 0, Math.PI * 2); c.fill();
      });
    } else if (id === 'wash') {
      c.beginPath(); c.moveTo(0, -11);
      c.bezierCurveTo(-4, -5, -8, 0, -7, 4);
      c.bezierCurveTo(-6, 12, 6, 12, 7, 4);
      c.bezierCurveTo(8, 0, 4, -5, 0, -11); c.stroke();
      c.beginPath(); c.arc(9, -7, 2, 0, Math.PI * 2); c.stroke();
    } else if (id === 'play') {
      c.beginPath(); c.arc(0, 0, 9, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(-8, -3); c.quadraticCurveTo(0, -2, 4, -8); c.stroke();
      c.beginPath(); c.moveTo(-4, 8); c.quadraticCurveTo(-2, 0, 8, 3); c.stroke();
    } else {
      c.beginPath(); c.arc(1, 0, 9, Math.PI * .33, Math.PI * 1.67);
      c.quadraticCurveTo(-1, 4, 1, 0); c.stroke();
    }
    c.restore();
  }

  homeActions(state, layout) {
    this.fabricPanel(layout.dockX, layout.dockY - 8, layout.dockW,
      HOME_LAYOUT.dockHeight + 12, 23, 'rgba(255,249,239,.9)', false);
    const columnWidth = layout.dockW / HOME_ACTIONS.length;
    HOME_ACTIONS.forEach((action, index) => {
      const effect = CARE_ACTIONS[action.id];
      const x = layout.dockX + columnWidth * (index + .5);
      const block = careBlock(state, action.id);
      const unavailable = !!block;
      const iconY = layout.dockY + 18;
      // A blocked care action stays tappable so its specific reason can be shown.
      const iconFill = this.pressedId === action.id ? action.pressed : action.fill;
      this.circle(x, iconY + 3, 27, 'rgba(104, 67, 44, .17)');
      this.circle(x, iconY, 27, iconFill, 'rgba(255, 255, 255, .8)', 1.5);
      if (!this.drawUiSprite(`care-${action.icon}-v2`, x - 25,
        iconY - 25 + (this.pressedId === action.id ? 1 : 0), 50, 50))
        this.careIcon(action.icon, x, iconY, C.paper, iconFill);
      this.readableText(action.label, x, layout.dockY + 50, 11,
        C.brown, 'center', 'bold');
      this.readableText(careShortReason(block, action.id, this.scale < 1) ||
        (effect.cost ? `✦ ${effect.cost}` : '免费'),
      x, layout.dockY + 70, 9, unavailable ? C.brown : C.muted, 'center');
      this.buttons.push({ id: action.id,
        x: layout.dockX + index * columnWidth + 2,
        y: layout.dockY + 2, w: columnWidth - 4, h: HOME_LAYOUT.dockHeight - 4 });
    });
  }

  home(state, ui) {
    const pet = state.pets[state.active];
    const layout = this.homeLayout();
    const sceneCenterX = HOME_LAYOUT.sceneX + HOME_LAYOUT.sceneWidth / 2;
    this.header(state, '陪伴日记', '今天也一起慢慢长大', '');
    const display = petDisplay(pet, ui);
    const backdrop = CARE_SCENE[display.action] || 'home_afternoon';
    this.sceneBackdrop(backdrop, HOME_LAYOUT.sceneX, layout.sceneY,
      HOME_LAYOUT.sceneWidth, layout.sceneH, HOME_LAYOUT.sceneRadius, '#F2D8B8');
    this.sceneFrame(HOME_LAYOUT.sceneX, layout.sceneY, HOME_LAYOUT.sceneWidth,
      layout.sceneH, HOME_LAYOUT.sceneRadius);
    this.loadUiSprite('care-wash-front');
    this.loadUiSprite('care-rest-front');
    const petSize = clamp(layout.sceneH / HOME_LAYOUT.petScaleHeight, .8, 1.08);
    this.pet(pet.id, sceneCenterX, layout.dockY - petSize * 130, petSize, this.time,
      display.expression, display.action);
    if (display.action === 'wash' || display.action === 'rest') {
      const prop = display.action === 'wash' ? 'care-wash-front' : 'care-rest-front';
      this.drawUiSprite(prop, sceneCenterX - 142 * petSize,
        layout.dockY - 150 * petSize, 284 * petSize, 97 * petSize);
    }
    this.buttons.push({ id: 'pet_tap', x: 82, y: layout.sceneY + 4,
      w: 225, h: layout.dockY - layout.sceneY - 4 });
    const infoX = HOME_INFO.x, infoY = layout.sceneY + HOME_INFO.top;
    const homeGuide = this.visibleGuide(state, ui);
    if (!homeGuide || homeGuide.phase === 'outro') {
      this.box(infoX, infoY, HOME_INFO.width, HOME_INFO.growthHeight,
        12, this.pressedId === 'home_growth_help' ? PRESS.row : 'rgba(255,249,239,.94)');
      this.text(`${pet.name} · LV. ${pet.level}`, infoX + 11, infoY + 14,
        13, C.brown, 'left', 'bold');
      const growth = growthSummary(pet);
      this.readableText(growth.progress, infoX + 11, infoY + 33, 11, C.brown);
      this.readableText(`${growth.today}  ›`, infoX + 11, infoY + 51, 10, C.muted);
      this.buttons.push({ id: 'home_growth_help', x: infoX, y: infoY + 23,
        w: HOME_INFO.width, h: HOME_INFO.growthHeight - 23 });
    }
    if (ui.showHomeAdvice !== false && (!homeGuide || homeGuide.phase === 'outro')) {
      const advice = homeAdvice(state);
      const adviceY = layout.sceneY + HOME_INFO.adviceTop;
      const closeWidth = 38;
      this.box(infoX, adviceY, HOME_INFO.width, HOME_INFO.adviceHeight,
        13, this.pressedId === 'home_advice' ? PRESS.row : 'rgba(255,249,239,.94)');
      const explaining = ui.adviceExplanation?.until > Date.now();
      const fullAdvice = explaining ? ui.adviceExplanation.detail : homeAdviceText(advice);
      const fontSize = Math.max(11, 11 / this.scale);
      const c = this.ctx;
      c.save(); c.font = `bold ${fontSize}px sans-serif`;
      const measured = c.measureText?.(fullAdvice)?.width;
      c.restore();
      const compact = (advice.kind === 'coins' && this.scale < 1) ||
        (measured ?? fullAdvice.length * fontSize) > HOME_INFO.width - closeWidth - 16;
      const displayAdvice = explaining ?
        (compact ? ui.adviceExplanation.compactDetail : fullAdvice) : homeAdviceText(advice, compact);
      this.readableText(displayAdvice, infoX + 11,
        adviceY + HOME_INFO.adviceHeight / 2, 11, C.brown, 'left', 'bold');
      if (this.pressedId === 'home_advice_close') this.box(
        infoX + HOME_INFO.width - closeWidth, adviceY, closeWidth,
        HOME_INFO.adviceHeight, 13, PRESS.icon);
      this.text('×', infoX + HOME_INFO.width - closeWidth / 2,
        adviceY + HOME_INFO.adviceHeight / 2, 17, C.muted, 'center');
      this.buttons.push({ id: 'home_advice', x: infoX, y: adviceY,
        w: HOME_INFO.width - closeWidth, h: HOME_INFO.adviceHeight });
      this.buttons.push({ id: 'home_advice_close', x: infoX + HOME_INFO.width - closeWidth,
        y: adviceY - 4, w: closeWidth, h: HOME_INFO.adviceHeight + 8 });
    }
    if (display.speech) {
      this.box(103, layout.sceneY + HOME_INFO.speechTop, 184, 30, 15, C.paper);
      this.text(display.speech.slice(0, 13), sceneCenterX,
        layout.sceneY + HOME_INFO.speechTop + 16,
        11, C.brown, 'center');
    }
    if (display.statDelta) {
      const lines = display.statDelta.split('|');
      const feedbackH = lines.length > 1 ? 16 + lines.length * 19 : 27;
      const feedbackY = layout.dockY - feedbackH - 8;
      this.box(43, feedbackY, 304, feedbackH, 13, '#FFF5E7');
      this.text(lines[0], sceneCenterX, feedbackY + 14,
        lines.length > 1 ? 10 : 12, C.coral, 'center', 'bold');
      lines.slice(1).forEach((line, index) => this.text(line, sceneCenterX,
        feedbackY + 33 + index * 19, 11, C.brown, 'center', 'bold'));
    }
    this.homeActions(state, layout);
    this.homeStats(pet, layout);
    this.nav('home', state);
  }

  nav(active, state) {
    const y = this.layout().navY;
    this.box(0, y - 1, 390, NAV_HEIGHT + 1, 0, C.paper);
    this.linenOverlay(0, y, 390, NAV_HEIGHT, 0, .55);
    this.line([[0, y], [390, y]], FABRIC.edge, 1);
    [['home', '小屋'], ['collection', '萌宠'],
      ['tasks', '任务'], ['game', '游戏']].forEach((item, i) => {
      const x = i * 97.5;
      const selected = active === item[0];
      if (this.pressedId === 'nav_' + item[0])
        this.box(x + 8, y + 5, 81, NAV_HEIGHT - 10, 14, PRESS.nav);
      this.navIcon(item[0], x + 48.75, y + 27,
        selected ? '#418F81' : C.brown, selected);
      this.readableText(item[1], x + 48.75, y + 54, 11,
        selected ? '#418F81' : C.muted, 'center', selected ? 'bold' : 'normal');
      this.buttons.push({ id: 'nav_' + item[0], x, y: y + 3,
        w: 97.5, h: NAV_HEIGHT - 7 });
    });
    const pending = active === 'home' ? pendingDailyTaskCount(state) : 0;
    if (pending) {
      this.box(247, y + 3, 55, 18, 9, C.coral);
      this.readableText(`待领 ${pending}`, 274.5, y + 12, 9, '#FFF', 'center', 'bold');
    }
  }

  navIcon(id, x, y, color, selected) {
    const c = this.ctx;
    c.save();
    c.strokeStyle = color; c.fillStyle = color;
    c.lineWidth = 2; c.lineCap = 'round'; c.lineJoin = 'round';
    c.translate(x, y);
    if (id === 'home') {
      c.beginPath(); c.moveTo(-12, -2); c.lineTo(0, -12);
      c.lineTo(12, -2); c.lineTo(9, 0); c.lineTo(9, 10);
      c.lineTo(-9, 10); c.lineTo(-9, 0); c.closePath();
      if (selected) c.fill(); else c.stroke();
      c.strokeStyle = selected ? '#FFF9F0' : color;
      c.strokeRect(-2, 3, 4, 7);
    } else if (id === 'collection') {
      c.beginPath(); c.moveTo(-9, -3); c.lineTo(-10, -11);
      c.lineTo(-4, -7); c.quadraticCurveTo(0, -8, 4, -7);
      c.lineTo(10, -11); c.lineTo(9, -3);
      c.quadraticCurveTo(13, 10, 0, 11);
      c.quadraticCurveTo(-13, 10, -9, -3); c.closePath();
      if (selected) c.fill(); else c.stroke();
      const faceColor = selected ? '#FFF9F0' : color;
      this.circle(-4, 1, 1.2, faceColor); this.circle(4, 1, 1.2, faceColor);
      this.curve(-3, 6, 0, 9, 3, 6, faceColor, 1.2);
    } else if (id === 'tasks') {
      this.roundedPath(-10, -11, 20, 22, 3);
      if (selected) c.fill(); else c.stroke();
      this.line([[-5, 0], [-1, 4], [6, -4]], selected ? '#FFF9F0' : color, 2);
    } else {
      c.beginPath(); c.moveTo(-11, -5);
      c.quadraticCurveTo(-9, -10, -3, -9); c.lineTo(3, -9);
      c.quadraticCurveTo(9, -10, 11, -5);
      c.lineTo(13, 5); c.quadraticCurveTo(13, 10, 8, 9);
      c.lineTo(3, 5); c.lineTo(-3, 5); c.lineTo(-8, 9);
      c.quadraticCurveTo(-13, 10, -13, 5); c.closePath();
      if (selected) c.fill(); else c.stroke();
      const buttonColor = selected ? '#FFF9F0' : color;
      this.line([[-7, -2], [-7, 3]], buttonColor, 1.6);
      this.line([[-9.5, .5], [-4.5, .5]], buttonColor, 1.6);
      this.circle(6, -1, 1.3, buttonColor); this.circle(9, 2, 1.3, buttonColor);
    }
    c.restore();
  }

  collection(state) {
    this.header(state, '小伙伴们', '每一位都值得被珍惜', '选择此刻想陪伴的伙伴');
    const { sceneY, ratio } = this.layout();
    const rowH = COLLECTION_ROW_BASE_HEIGHT + COLLECTION_ROW_EXTRA_HEIGHT * ratio;
    const gap = COLLECTION_ROW_BASE_GAP + COLLECTION_ROW_EXTRA_GAP * ratio;
    SPECIES.forEach((spec, i) => {
      const y = sceneY + i * (rowH + gap);
      const card = petCardState(state, spec.id);
      const owned = card.kind === 'current' || card.kind === 'owned';
      const selected = card.kind === 'current';
      this.fabricPanel(20, y, 350, rowH, 19,
        selected ? '#EEF8F1' : C.paper, true);
      const portraitY = y + rowH / 2;
      const portraitFill = i === 0 ? '#E1EEE5' : i === 1 ? '#EAE4F5' : '#F8E9D3';
      this.circle(88, portraitY, 55, portraitFill, FABRIC.edge, 2);
      const c = this.ctx;
      c.save();
      c.beginPath(); c.arc(88, portraitY, 52, 0, Math.PI * 2); c.clip();
      this.pet(spec.id, 88, portraitY + 26, .53, this.time);
      c.restore();
      this.readableText(spec.type, 155, y + 31, 10, C.muted);
      this.text(owned ? state.pets[spec.id].name : spec.name,
        155, y + 56, 20, C.ink, 'left', 'bold');
      this.readableText(spec.line, 155, y + 81, 10, C.muted);
      if (owned) {
        const statusLabel = selected ? '当前陪伴' : '已领养';
        const statusFontSize = Math.max(10, 11 / this.scale);
        c.save();
        c.font = `normal ${statusFontSize}px sans-serif`;
        const measuredWidth = c.measureText(statusLabel)?.width;
        c.restore();
        const textWidth = Number.isFinite(measuredWidth) ? measuredWidth :
          Array.from(statusLabel).length * statusFontSize;
        const statusWidth = Math.ceil(textWidth + 24);
        this.box(155, y + rowH - 37, statusWidth, 22, 11,
          selected ? '#D8F1E9' : '#F5E9D9');
        this.readableText(statusLabel, 155 + statusWidth / 2,
          y + rowH - 26, 10, selected ? '#296C62' : C.brown, 'center');
      } else {
        if (card.kind === 'short') {
          this.readableText(`还差 ${card.missing}爪爪币`, 155, y + rowH - 28,
            11, C.coral, 'left', 'bold');
        } else {
          this.readableText(card.cost ? `需 ${card.cost} 爪爪币` : '免费领养',
            155, y + rowH - 28, 10, C.coral);
        }
      }
      const actionId = selected ? 'current_' + spec.id : owned ? 'select_' + spec.id :
        card.kind === 'short' ? 'get_coins_' + spec.id : 'adopt_' + spec.id;
      this.button(actionId, 266, y + rowH - 46, 92, 35,
        owned ? selected ? '陪伴中' : '切换陪伴' :
          card.kind === 'short' ? '获取爪爪币' : '领养',
        selected ? STATIC_FILL : owned ? C.paper : C.coral,
        selected ? C.muted : owned ? C.brown : '#FFF',
        selected || !owned ? null : C.line, 10,
        { disabled: selected, variant: owned ? 'secondary' : 'primary' });
    });
    this.nav('collection', state);
  }

  adoptionConfirm(state, speciesId) {
    const species = SPECIES.find(item => item.id === speciesId);
    const card = petCardState(state, speciesId);
    if (!species || !card) return;
    this.dim(); this.buttons = [];
    const y = this.h / 2 - 174;
    this.fabricPanel(36, y, 318, 348, 24);
    this.text(`用 ${card.cost} 爪爪币领养${species.name}？`,
      195, y + 44, 18, C.ink, 'center', 'bold');
    this.readableText('确认后将成为当前陪伴',
      195, y + 75, 12, C.brown, 'center');
    this.circle(195, y + 153, 64, '#F4EADB', FABRIC.edge, 2);
    this.pet(speciesId, 195, y + 174, .43, this.time);
    this.readableText(card.kind === 'short' ? `还差 ${card.missing} 爪爪币` :
      `领养后剩余 ${state.coins - card.cost} 爪爪币`,
      195, y + 245, 12, C.muted, 'center');
    this.button('adopt_confirm', 65, y + 265, 260, 40, '确认领养', C.coral,
      '#FFF', null, 14, { variant: 'primary' });
    this.button('adopt_cancel', 65, y + 311, 260, 28, '再看看', C.paper, C.brown);
  }

  coinWaysModal(offer, scroll) {
    this.dim(); this.buttons = [];
    const { modalY, modalHeight, top, bottom, listHeight, maxScroll } =
      coinWaysLayout(this.h, offer.ways.length);
    const safeScroll = clamp(scroll || 0, 0, maxScroll);
    this.fabricPanel(28, modalY, 334, modalHeight, 24);
    this.text(offer.title, 195, modalY + 39, 18, C.ink, 'center', 'bold');
    this.readableText('选择一种获取方式', 195, modalY + 68, 12, C.brown, 'center');
    const c = this.ctx;
    c.save();
    try {
      c.beginPath(); c.rect(40, top, 310, listHeight); c.clip();
      if (!offer.ways.length) {
        this.readableText('今天可领的奖励和游戏收益已用完',
          195, top + 65, 12, C.brown, 'center');
        this.readableText('明天再来看看吧', 195, top + 91, 12, C.muted, 'center');
      }
      offer.ways.forEach((way, index) => {
        const rowY = top + index * COIN_WAYS_ROW_STEP - safeScroll;
        if (rowY + 62 <= top || rowY >= bottom) return;
        this.box(44, rowY + 2, 302, 61, 15,
          this.pressedId === 'coin_way_' + way.id ? PRESS.row :
            way.page ? '#F5E9D9' : STATIC_FILL);
        this.readableText(way.title, 57, rowY + 23, 12, C.ink, 'left', 'bold');
        this.readableText(way.hint, 57, rowY + 45, 10, C.muted);
        if (way.page) {
          const hitTop = Math.max(top, rowY + 2);
          const hitBottom = Math.min(bottom, rowY + 63);
          this.buttons.push({ id: 'coin_way_' + way.id, x: 44, y: hitTop,
            w: 302, h: hitBottom - hitTop });
        }
      });
    } finally { c.restore(); }
    if (maxScroll > 0) {
      this.box(352, top, 3, listHeight, 2, C.track);
      this.box(352, top + safeScroll / maxScroll * (listHeight - 37),
        3, 37, 2, C.coral);
    }
    this.button('coin_ways_close', 65, modalY + modalHeight - 49,
      260, 36, '再看看', C.paper, C.brown, C.line, 12);
  }

  growthHelp() {
    this.dim(); this.buttons = [];
    const y = this.h / 2 - 178;
    this.fabricPanel(36, y, 318, 356, 24);
    this.text('关于成长', 195, y + 43, 21, C.ink, 'center', 'bold');
    this.circle(80, y + 96, 23, '#DDF0E4');
    this.line([[80, y + 107], [80, y + 90]], '#4F9D73', 2);
    this.ellipse(73, y + 89, 8, 4, '#67B98A', -.55);
    this.ellipse(87, y + 86, 8, 4, '#67B98A', .55);
    this.text('成长值', 112, y + 83, 15, C.ink, 'left', 'bold');
    this.readableText('照料伙伴可以获得成长。', 112, y + 110, 11, C.brown);
    this.line([[56, y + 137], [334, y + 137]], FABRIC.stitch, 1);
    this.circle(80, y + 170, 23, '#FFF0D2');
    if (!this.drawUiSprite('star', 63, y + 153, 34, 34))
      this.text('✦', 80, y + 172, 27, C.gold, 'center', 'bold');
    this.text('等级', 112, y + 157, 15, C.ink, 'left', 'bold');
    this.readableText('成长积累后会提升等级。', 112, y + 184, 11, C.brown);
    this.line([[56, y + 210], [334, y + 210]], FABRIC.stitch, 1);
    this.circle(80, y + 247, 23, '#FCE3D7');
    this.box(69, y + 237, 22, 20, 4, '#F47E6C');
    this.box(69, y + 239, 22, 5, 2, '#FFF1E2');
    this.text('每日上限', 112, y + 230, 15, C.ink, 'left', 'bold');
    GROWTH_HELP_LINES.forEach((line, index) => this.readableText(line,
      112, y + 255 + index * 18, 10, C.brown));
    this.button('home_growth_close', 65, y + 300, 260, 41,
      '知道啦', C.coral, '#FFF', null, 14, { variant: 'primary' });
  }

  rewardHelp(help) {
    this.dim(); this.buttons = [];
    const y = this.h / 2 - 112;
    this.fabricPanel(31, y, 328, 224, 24);
    this.text(help.title, 195, y + 38, 18, C.ink, 'center', 'bold');
    help.lines.forEach((line, index) => this.readableText(line,
      195, y + 83 + index * 27, 11, C.brown, 'center'));
    this.button('reward_help_close', 65, y + 171, 260, 38,
      '知道啦', C.coral, '#FFF', null, 14, { variant: 'primary' });
  }

  welcome(state, ui) {
    this.header(state, '欢迎来到小屋', '一起慢慢长大', '从第一位小伙伴开始', !!ui.debugEnabled);
    const { sceneY, sceneH } = this.layout();
    const visualH = sceneH + Math.max(WELCOME_MIN_EXTENSION,
      (this.h - COMPACT_LAYOUT_HEIGHT) * WELCOME_HEIGHT_EXTENSION_RATE);
    this.sceneBackdrop('home_afternoon', 20, sceneY, 350, visualH, 23, '#F2D8B8');
    this.sceneFrame(20, sceneY, 350, visualH, 23);
    const petSize = clamp(visualH / 300, .72, 1.08);
    this.pet('cat', 195, sceneY + visualH - 130 * petSize - 6, petSize, this.time);
    const infoY = sceneY + visualH + 23;
    this.text('奶糖', 195, infoY, 24, C.ink, 'center', 'bold');
    this.readableText('喜欢晒太阳的奶油小猫，正等着你',
      195, infoY + 29, 12, C.muted, 'center');
    this.readableText('糯米和团团也会在小屋里等你认识',
      195, this.h - 137, 11, C.muted, 'center');
    this.button('adopt_selected', 53, this.h - 114, 284, 53,
      '免费领养奶糖  →', C.coral, '#FFF', null, 15, { variant: 'primary' });
  }

  tasks(state) {
    this.header(state, '每日清单', '今天的小小约定', '做一点小事，换一份好心情');
    const { sceneY, ratio } = this.layout();
    const todayTasks = taskSnapshot(state);
    const progress = todayTasks?.progress || {};
    const completed = TASKS.filter(task => (progress[task.id] || 0) >= task.target).length;
    const summaryHeight = 104;
    this.fabricPanel(20, sceneY, 170, summaryHeight, 18, C.paper, true);
    this.fabricPanel(200, sceneY, 170, summaryHeight, 18, C.paper, true);
    const c = this.ctx;
    c.save();
    c.lineWidth = 8; c.lineCap = 'round';
    c.beginPath(); c.arc(105, sceneY + 42, 26, Math.PI * .75, Math.PI * 2.25);
    c.strokeStyle = '#BDDCD2'; c.stroke();
    c.beginPath(); c.arc(105, sceneY + 42, 26, Math.PI * .75,
      Math.PI * (.75 + 1.5 * completed / TASKS.length));
    c.strokeStyle = C.mint; c.stroke();
    c.restore();
    this.text(`${completed}/${TASKS.length}`, 105, sceneY + 40,
      20, C.ink, 'center', 'bold');
    this.readableText('今日完成', 105, sceneY + 84, 12, C.brown, 'center', 'bold');
    const gift = giftClaimState(state);
    if (!this.drawUiSprite('gift-felt-v2', 224, sceneY + 12, 40, 42)) {
      this.box(229, sceneY + 21, 30, 27, 6, '#B997DC', '#8566AA');
      this.box(241, sceneY + 21, 6, 27, 2, '#F6DF8B');
      this.box(226, sceneY + 17, 36, 8, 3, '#D1AFE9');
    }
    this.readableText('每日礼物', 272, sceneY + 27, 13, C.ink, 'left', 'bold');
    this.readableText(`+${DAILY_GIFT_COINS} 爪爪币`,
      272, sceneY + 48, 10, C.brown);
    this.button('daily', 213, sceneY + 65, 144, 30,
      rewardButtonLabel(gift.kind, true),
      gift.kind === 'claimed' ? STATIC_FILL : C.coral,
      gift.kind === 'claimed' ? C.muted : '#FFF',
      null, 10, { disabled: gift.kind === 'claimed', variant: 'primary' });
    const rowStart = sceneY + summaryHeight + 10;
    const rowStep = 105 + 19 * ratio;
    TASKS.forEach((task, i) => {
      const y = rowStart + i * rowStep;
      const art = TASK_ART[task.id];
      const status = taskClaimState(state, task.id);
      const count = clamp(status.progress || 0, 0, task.target);
      const done = count >= task.target;
      const claimedThis = status.kind === 'claimed';
      if (art.icon === 'star') {
        this.circle(54, y + 24, 20, art.color);
        if (!this.drawUiSprite('star', 39, y + 9, 30, 30))
          this.text('✦', 54, y + 25, 20, C.coral, 'center', 'bold');
      } else if (!this.drawUiSprite(`care-${art.icon}-v2`, 34, y + 4, 40, 40)) {
        this.circle(54, y + 24, 20, art.color);
        this.careIcon(art.icon, 54, y + 24, C.paper, art.color);
      }
      this.text(art.title, 82, y + 17, 15, C.ink, 'left', 'bold');
      this.readableText(task.label, 82, y + (status.kind === 'date_guard' ? 40 : 48),
        10, C.muted);
      if (status.kind === 'date_guard') this.readableText('日期变化后再查看今日任务',
        82, y + 56, 9, C.muted);
      this.readableText('✦ ' + task.reward, 354, y + 18, 10, C.coral, 'right', 'bold');
      this.readableText(`${count} / ${task.target}`, 82, y + 74, 11, C.muted);
      this.button(claimedThis || status.kind === 'date_guard' ? 'task_done_' + task.id :
        done ? 'claim_' + task.id :
        'task_go_' + task.id, 277, y + 62, 80, 30,
        rewardButtonLabel(status.kind) ||
          (task.id === 'game' ? '去游戏 →' : '去完成 →'),
        claimedThis || status.kind === 'date_guard' ? STATIC_FILL : done ? C.coral : C.paper,
        claimedThis || status.kind === 'date_guard' ? C.muted : done ? '#FFF' : C.coral,
        !claimedThis && !done ? C.line : null, 10,
        { disabled: claimedThis || status.kind === 'date_guard',
          variant: done ? 'primary' : 'secondary' });
      if (i < TASKS.length - 1) {
        const c = this.ctx;
        c.save(); c.beginPath(); c.setLineDash([5, 5]);
        c.moveTo(36, y + 100); c.lineTo(354, y + 100);
        c.strokeStyle = FABRIC.stitch; c.lineWidth = 1; c.stroke(); c.restore();
      }
    });
    this.nav('tasks', state);
  }

  gameField() {
    const { sceneY, ratio, extra } = this.layout();
    const h = GAME_FIELD_COMPACT_HEIGHT + 104 * ratio + extra;
    return { x: 20, y: sceneY, w: 350, h, bottom: sceneY + h };
  }

  game(state, ui) {
    this.sceneBackdrop('star_sky', 0, 0, 390, this.layout().navY,
      0, '#174768', .12);
    this.header(state, '星星接接乐', '把星光装进小篮子', '', true, true);
    const field = this.gameField();
    const fieldY = field.y, fieldH = field.h;
    if (ui.playing) {
      this.fabricPanel(36, fieldY + 13, 116, 53, 16, C.paper, false);
      this.fabricPanel(164, fieldY + 13, 116, 53, 16, C.paper, false);
      this.readableText('得分', 52, fieldY + 29, 10, C.brown);
      this.text(ui.score, 52, fieldY + 51, 19, C.ink, 'left', 'bold');
      this.readableText('时间', 180, fieldY + 29, 10, C.brown);
      this.text(Math.ceil(ui.remaining) + 's', 180, fieldY + 51, 19, C.ink, 'left', 'bold');
      this.button('pause_game', 306, fieldY + 13, 43, 38, 'Ⅱ', C.paper, C.brown);
      (ui.stars || []).forEach(s => {
        if (!this.drawUiSprite('star', s.x - 17, s.y - 17, 34, 34))
          this.text('✦', s.x, s.y, 34, '#FFD777', 'center', 'bold');
      });
      if (!this.drawUiSprite('basket', ui.basketX - 48,
        fieldY + fieldH - 66, 96, 52)) {
        this.box(ui.basketX - 43, fieldY + fieldH - 50, 86, 28, 12, '#D8937E');
        this.box(ui.basketX - 48, fieldY + fieldH - 53, 96, 10, 5, '#A46B56');
      }
    } else {
      const gameTask = TASKS.find(task => task.id === 'game');
      const hideTaskHint = state.tasks?.date !== ui.gameOutcome?.taskDate ||
        state.tasks?.claimed?.game || state.tasks?.progress?.game < gameTask.target;
      const result = gameOutcomeView(ui.gameOutcome, hideTaskHint);
      if (result) {
        if (ui.gameOutcome.kind === 'aborted') {
          const panelHeight = 214;
          const panelY = fieldY + (fieldH - panelHeight) / 2;
          this.fabricPanel(40, panelY, 310, panelHeight, 20, C.paper);
          this.text(result.title, 195, panelY + 44, 20, C.ink, 'center', 'bold');
          this.readableText(result.lines[0], 195, panelY + 75,
            11, C.coral, 'center');
          this.button('start_game', 56, panelY + 105, 278, 43,
            '再玩一局', C.coral, '#FFF', null, 14, { variant: 'primary' });
          this.button('game_return_home', 56, panelY + 157, 278, 40,
            '返回小屋', '#F6EDE6', C.brown);
        } else {
          const hintSpace = result.taskHint ? 33 : 0;
          const resultLineStep = Math.min(29,
            (fieldH - 203 - hintSpace) / Math.max(1, result.lines.length - 1));
          const panelHeight = 203 + hintSpace +
            (result.lines.length - 1) * resultLineStep;
          const panelY = fieldY + (fieldH - panelHeight) / 2;
          const lastLineY = panelY + 72 +
            (result.lines.length - 1) * resultLineStep;
          const replayY = lastLineY + 22 + hintSpace;
          this.fabricPanel(40, panelY, 310, panelHeight, 20, C.paper);
          this.pet(state.active, 293, panelY + 36, .25,
            this.time, 'happy');
          this.text(result.title, 195, panelY + 45, 20, C.ink, 'center', 'bold');
          result.lines.forEach((line, index) => {
            const lineY = panelY + 72 + index * resultLineStep;
            const rowHeight = Math.max(13, resultLineStep - 2);
            this.box(69, lineY - rowHeight / 2, 252, rowHeight,
              8, '#FFF3E3', FABRIC.edge, .6);
            this.readableText(line, 195, lineY, 11,
              index === 0 ? C.coral : C.brown, 'center');
          });
          if (result.taskHint) {
            if (this.pressedId === 'game_task_reward') this.box(51,
              replayY - 37, 288, 32, 12, 'rgba(255,249,240,.26)');
            this.readableText(result.taskHint, 195, replayY - 28,
              10, C.coral, 'center', 'bold');
            this.buttons.push({ id: 'game_task_reward', x: 51,
              y: replayY - 37, w: 288, h: 32 });
          }
          this.button('start_game', 56, replayY, 278, 43,
            '再玩一局', C.coral, '#FFF', null, 14, { variant: 'primary' });
          this.button('game_return_home', 56, replayY + 52, 278, 40,
            '返回小屋', '#F6EDE6', C.brown);
        }
      } else {
        this.pet(state.active, 195, field.bottom - 150, .5,
          this.time, 'happy');
        this.drawUiSprite('basket', 207, field.bottom - 158, 78, 42);
        const bubbleY = field.bottom - 295;
        this.fabricPanel(48, bubbleY, 294, 46, 19, C.paper);
        this.polygon([[173, bubbleY + 44], [189, bubbleY + 44],
          [181, bubbleY + 57]], C.paper, FABRIC.edge, 1);
        this.text('20 秒，左右移动篮子接星星', 195,
          field.bottom - 272, 13, C.ink, 'center', 'bold');
        this.button('start_game', 93, fieldY + fieldH - 67, 204, 46,
          '开始接星星  →', C.coral, '#FFF', null, 14, { variant: 'primary' });
      }
    }
    this.ctx.save();
    this.ctx.shadowColor = 'rgba(14, 42, 73, .9)';
    this.ctx.shadowBlur = 4;
    this.readableText('20 秒一局 · 星星越多奖励越多', 25,
      field.bottom + 24, 10, '#FFF', 'left', 'bold');
    this.readableText('玩法说明  ›', 365, field.bottom + 24,
      10, '#FFF', 'right', 'bold');
    this.ctx.restore();
    this.buttons.push({ id: 'game_help', x: 278, y: field.bottom + 8, w: 94, h: 32 });
    this.nav('game', state);
    if (ui.playing && ui.paused) {
      this.dim(); this.buttons = [];
      if (ui.quitConfirm) {
        const y = this.h / 2 - 128;
        this.fabricPanel(39, y, 312, 258, 24);
        this.button('quit_confirm_close', 300, y + 19, 34, 34,
          '×', '#F8EEE8', C.brown, null, 18, { variant: 'icon' });
        this.text('现在结束本局？', 195, y + 54, 21, C.ink, 'center', 'bold');
        this.readableText('结束后本局不结算奖励，', 195,
          y + 89, 12, C.brown, 'center');
        this.readableText('也不计入今日任务。', 195, y + 113, 12, C.brown, 'center');
        this.button('quit_confirm_continue', 74, y + 135, 242, 43,
          '继续游戏', C.coral, '#FFF', null, 14, { variant: 'primary' });
        this.button('quit_confirm_end', 74, y + 190, 242, 40,
          '确认结束', '#F6EDE6', C.brown);
      } else {
        const y = this.h / 2 - 128;
        this.fabricPanel(39, y, 312, 258, 24);
        this.text('暂停一下', 195, y + 50, 23, C.ink, 'center', 'bold');
        this.text('星星会等你回来', 195, y + 84, 13, C.muted, 'center');
        this.button('resume_game', 74, y + 120, 242, 48, '继续游戏', C.coral,
          '#FFF', null, 14, { variant: 'primary' });
        this.button('quit_game', 74, y + 184, 242, 42, '结束本局', '#F6EDE6', C.brown);
      }
    }
  }

  dim() {
    this.ctx.fillStyle = 'rgba(65, 44, 36, 0.35)';
    this.ctx.fillRect(0, 0, 390, this.h);
  }

  visibleGuide(state, ui, now = Date.now()) {
    if (!state.active || ui.guideHoldUntil > now || ui.showSettings ||
        ui.adoptionConfirmId || ui.coinWaysTarget || ui.showGrowthHelp ||
        ui.rewardHelp || ui.debugEditor || ui.playing ||
        (ui.page === 'game' && ui.gameOutcome) ||
        ui.quitConfirm) return null;
    return guideView(state, ui.page, now);
  }

  guideFocus(targetIds, page, now) {
    const targets = this.buttons.filter(button => targetIds.includes(button.id));
    if (!targets.length) return;
    let x = Math.min(...targets.map(button => button.x));
    let y = Math.min(...targets.map(button => button.y));
    let right = Math.max(...targets.map(button => button.x + button.w));
    const bottom = Math.min(this.h - 5,
      Math.max(...targets.map(button => button.y + button.h)));
    if (page === 'home' && targetIds.includes('pet_tap')) {
      y = Math.max(y, this.homeLayout().sceneY + GUIDE_CARD.height + 5);
    }
    x -= 3; y -= 3; right += 3;
    const width = right - x, height = bottom - y + 3;
    if (width <= 0 || height <= 0) return;
    const pulse = (1 - Math.cos(now / 1800 * Math.PI * 2)) / 2;
    const c = this.ctx;
    c.save();
    c.shadowColor = `rgba(42, 158, 183, ${.25 + pulse * .42})`;
    c.shadowBlur = 11 + pulse * 15;
    this.roundedPath(x, y, width, height, targetIds.includes('pet_tap') ? 30 : 17);
    c.strokeStyle = pulse > .5 ? '#E5FBFF' : GUIDE_COLOR.focus;
    c.lineWidth = 2.5 + pulse;
    c.stroke();
    c.shadowBlur = 0;
    c.strokeStyle = `rgba(102, 191, 209, ${.28 + pulse * .42})`;
    c.lineWidth = 7 + pulse * 5;
    c.stroke();
    c.restore();
  }

  guide(state, ui, now = Date.now()) {
    const view = this.visibleGuide(state, ui, now);
    if (!view) return;
    if (view.phase === 'outro') {
      const y = this.h / 2 - 67;
      this.fabricPanel(GUIDE_CARD.x, y, GUIDE_CARD.width, 134,
        GUIDE_CARD.radius, GUIDE_COLOR.fill);
      this.text(view.title, 195, y + 29, 17, GUIDE_COLOR.text, 'center', 'bold');
      this.readableText(view.text, 195, y + 59,
        12, GUIDE_COLOR.label, 'center');
      this.button('guide_game', 48, y + 82, 140, 37, '去游戏', '#4E9EB0',
        '#FFF', null, 14, { variant: 'guide' });
      this.button('guide_finish', 202, y + 82, 140, 37, '知道了', '#F2FBFC', GUIDE_COLOR.label);
      return;
    }
    this.guideFocus(view.targetIds, ui.page, now);
    const y = ui.page === 'home' ? this.homeLayout().sceneY : this.layout().sceneY;
    const c = this.ctx;
    c.save(); c.shadowColor = 'rgba(53,111,128,.2)'; c.shadowBlur = 18;
    c.shadowOffsetY = 7;
    this.fabricPanel(GUIDE_CARD.x, y, GUIDE_CARD.width, GUIDE_CARD.height,
      GUIDE_CARD.radius, GUIDE_COLOR.fill);
    c.restore();
    this.readableText(view.label, GUIDE_CARD.x + 15, y + 21,
      11, GUIDE_COLOR.label, 'left', 'bold');
    const split = view.text.length <= 15 ? view.text.length :
      Math.ceil(view.text.length / 2);
    const firstLine = view.text.slice(0, split);
    const secondLine = view.text.slice(split);
    this.readableText(firstLine, GUIDE_CARD.x + 15, y + (secondLine ? 46 : 53),
      13, GUIDE_COLOR.text, 'left', 'bold');
    if (secondLine) this.readableText(secondLine, GUIDE_CARD.x + 15, y + 67,
      13, GUIDE_COLOR.text, 'left', 'bold');
    this.button('guide_skip', GUIDE_CARD.x + GUIDE_CARD.width - 111, y + 14,
      100, 30, '跳过引导', GUIDE_COLOR.button, GUIDE_COLOR.label, '#ACD1D9', 11);
  }

  settings(state, ui) {
    this.dim(); this.buttons = [];
    const enabled = !!ui.debugEnabled;
    const height = enabled ? 338 : 274;
    const y = this.h / 2 - height / 2;
    this.fabricPanel(31, y, 328, height, 24);
    this.text('小屋设置', 195, y + 45, 21, C.ink, 'center', 'bold');
    this.roundIconButton('settings_close', 318, y + 39, 17, '×');
    this.fabricPanel(51, y + 78, 288, 65, 16, '#FFF9F0', false);
    this.polygon([[62, y + 105], [69, y + 105], [76, y + 99],
      [76, y + 120], [69, y + 114], [62, y + 114]], C.brown);
    this.curve(79, y + 102, 87, y + 109, 79, y + 117, C.brown, 2);
    this.text('音效', 98, y + 110, 15, C.ink, 'left', 'bold');
    this.box(281, y + 94, 53, 31, 16, this.pressedId === 'sound_toggle' ?
      (state.soundEnabled ? '#2D8875' : '#BBBAB0') :
      (state.soundEnabled ? '#55B79B' : '#D9D8D0'));
    this.circle(state.soundEnabled ? 318.5 : 296.5, y + 109.5, 12.5, '#FFFAF2');
    this.buttons.push({ id: 'sound_toggle', x: 51, y: y + 78, w: 288, h: 65 });
    if (enabled) {
      this.fabricPanel(51, y + 159, 288, 52, 16,
        this.pressedId === 'debug_open' ? PRESS.row : '#F5E9D9', false);
      this.text('⚙', 74, y + 185, 21, C.muted, 'center');
      this.text('调试模式', 98, y + 185, 15, C.ink, 'left', 'bold');
      this.text('›', 316, y + 185, 23, C.brown, 'center');
      this.buttons.push({ id: 'debug_open', x: 51, y: y + 159, w: 288, h: 52 });
      this.readableText('开发调试已开启', 58, y + 238, 11, C.coral, 'left', 'bold');
    }
    this.readableText('游戏进度会保存在当前设备。',
      58, y + (enabled ? 269 : 185), 12, C.brown);
    this.readableText('重新安装或清除数据后，存档无法恢复。', 58,
      y + (enabled ? 295 : 211), 11, C.muted);
  }

  debugRows(state, ui) {
    const rows = [];
    if (ui.debugDraft.petId) {
      rows.push({ type: 'section', label: '萌宠状态' });
      PET_FIELDS.slice(0, 4).forEach(field => rows.push({ type: 'field', ...field }));
      rows.push({ type: 'section', label: '成长与等级' });
      PET_FIELDS.slice(4).forEach(field => rows.push({ type: 'field', ...field }));
    } else {
      rows.push({ type: 'message', label: '先领养一只萌宠，再编辑萌宠数值。' });
    }
    rows.push({ type: 'section', label: '资源' });
    rows.push({ type: 'field', key: 'coins', label: '爪爪币', integer: true });
    rows.push({ type: 'section', label: '今日任务' });
    TASKS.forEach(task => {
      rows.push({ type: 'field', key: `task.${task.id}.progress`,
        label: `${task.label} · 进度`, integer: true, target: task.target });
      rows.push({ type: 'field', key: `task.${task.id}.claimed`,
        label: `${task.label} · 奖励`, claimed: true });
    });
    return rows;
  }

  debugViewport(ui) {
    return { top: 141, bottom: this.h - (ui.debugKeyboard ? 307 : 92) };
  }

  debugEditor(state, ui) {
    const editor = ui.debugEditor;
    const draft = ui.debugDraft;
    this.dim(); this.buttons = [];
    this.fabricPanel(10, 12, 370, this.h - 24, 20, C.paper, false);
    this.text('开发调试已开启', 28, 38, 11, C.coral, 'left', 'bold');
    this.text('调试模式', 28, 71, 21, C.ink, 'left', 'bold');
    this.button('debug_close', 330, 42, 34, 34, '×', '#F8EEE8', C.brown,
      null, 20, { variant: 'icon' });
    this.text(draft.petId ? `${draft.petName}  (${draft.petId})` : '当前没有陪伴萌宠',
      28, 99, 12, C.brown);
    this.text(`任务 ${draft.taskDate}  ·  成长 ${draft.growthDate || '—'}`,
      28, 121, 10, C.muted);
    if (editor.message) this.text(editor.message, 28, 138, 9, C.coral);

    const viewport = this.debugViewport(ui);
    const rows = this.debugRows(state, ui);
    const contentHeight = rows.reduce((sum, row) => sum +
      (row.type === 'section' ? 31 : row.type === 'message' ? 48 : 56), 0);
    const maxScroll = Math.max(0, contentHeight - (viewport.bottom - viewport.top));
    editor.scroll = clamp(editor.scroll, 0, maxScroll);
    editor.maxScroll = maxScroll;
    this.box(20, viewport.top, 350, viewport.bottom - viewport.top, 10, '#FFF9F2');
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(20, viewport.top, 350, viewport.bottom - viewport.top);
    this.ctx.clip();
    let y = viewport.top - editor.scroll;
    rows.forEach(row => {
      const height = row.type === 'section' ? 31 : row.type === 'message' ? 48 : 56;
      if (y + height >= viewport.top && y <= viewport.bottom) {
        if (row.type === 'section') {
          this.text(row.label, 35, y + 21, 12, C.coral, 'left', 'bold');
        } else if (row.type === 'message') {
          this.text(row.label, 35, y + 25, 11, C.muted);
        } else {
          const error = editor.errors[row.key];
          this.box(29, y + 3, 331, 50, 11,
            this.pressedId === `debug_field:${row.key}` ? PRESS.secondary :
              error ? '#FFF0EA' : C.paper, error ? C.coral : C.line);
          this.text(row.label, 39, y + 21, 11, C.ink);
          const raw = draft.values[row.key];
          const value = row.claimed ? raw ? '已领奖' : '未领奖' :
            `${raw === '' ? '空' : raw}${row.target ? ` / ${row.target}` : ''}`;
          this.text(value, 344, y + 21, 12, error ? C.coral : C.brown, 'right', 'bold');
          if (error) this.text(error, 39, y + 41, 9, C.coral);
          const top = Math.max(y + 3, viewport.top);
          const bottom = Math.min(y + 53, viewport.bottom);
          if (bottom > top) this.buttons.push({ id: `debug_field:${row.key}`,
            x: 29, y: top, w: 331, h: bottom - top });
        }
      }
      y += height;
    });
    this.ctx.restore();
    if (maxScroll > 0) {
      const track = viewport.bottom - viewport.top - 20;
      const thumb = Math.max(28, track * (viewport.bottom - viewport.top) / contentHeight);
      this.box(366, viewport.top + 10 + (track - thumb) * editor.scroll / maxScroll,
        3, thumb, 2, C.coral);
    }

    if (ui.debugKeyboard) {
      this.debugKeypad(ui);
    } else {
      this.box(20, this.h - 85, 350, 1, 1, C.line);
      this.button('debug_cancel', 24, this.h - 76, 150, 51, '取消', '#F6EDE6', C.brown);
      this.button('debug_save', 184, this.h - 76, 182, 51, '保存修改', C.coral,
        '#FFF', null, 14, { variant: 'primary' });
    }
    if (editor.confirmDiscard) {
      this.dim(); this.buttons = [];
      const y = this.h / 2 - 96;
      this.fabricPanel(36, y, 318, 190, 20);
      this.text('放弃未保存的修改？', 195, y + 51, 17, C.ink, 'center', 'bold');
      this.text('已输入的调试数值不会保存。', 195, y + 85, 11, C.muted, 'center');
      this.button('debug_keep', 55, y + 119, 129, 46, '继续编辑', '#F6EDE6', C.brown);
      this.button('debug_discard', 200, y + 119, 135, 46, '放弃修改', DANGER,
        '#FFF', null, 14, { variant: 'danger' });
    }
  }

  debugKeypad(ui) {
    const keyboard = ui.debugKeyboard;
    const y = this.h - 298;
    this.fabricPanel(20, y, 350, 280, 17, '#EBD8C4', false);
    this.text(`编辑 ${keyboard.label}：${ui.debugDraft.values[keyboard.key] || '空'}`,
      35, y + 23, 12, C.ink, 'left', 'bold');
    const keys = [
      ['1', '2', '3', '⌫'], ['4', '5', '6', '清空'],
      ['7', '8', '9', keyboard.decimal ? '.' : ''], ['取消', '0', '完成'],
    ];
    keys.forEach((row, index) => row.forEach((key, column) => {
      if (!key) return;
      const wide = index === 3 && column === 2;
      this.button(`debug_key:${key}`, 32 + column * 82, y + 35 + index * 56,
        wide ? 154 : 73, 48, key, key === '完成' ? C.coral : C.paper,
        key === '完成' ? '#FFF' : C.brown, null, 14);
    }));
  }

  toast(ui) {
    if (!ui.toast || Date.now() > ui.toastUntil) return;
    const w = Math.min(320, Math.max(215, ui.toast.length * 13 + 30));
    this.box((390 - w) / 2, this.h - 248, w, 42, 21, C.ink);
    this.text(ui.toast, 195, this.h - 227, 12, '#FFF', 'center');
  }

  setLayoutTransform() {
    this.ctx.setTransform(this.scale * this.pixelScaleX, 0, 0,
      this.scale * this.pixelScaleY, this.offsetX * this.pixelScaleX,
      this.offsetY * this.pixelScaleY);
  }

  drawAnimation(state, ui) {
    const { sceneY, sceneH, ratio } = this.layout();
    let top = sceneY;
    let bottom = sceneY + sceneH;
    if (!state.active) bottom += Math.max(WELCOME_MIN_EXTENSION,
      (this.h - COMPACT_LAYOUT_HEIGHT) * WELCOME_HEIGHT_EXTENSION_RATE);
    else if (ui.page === 'collection') bottom = sceneY + SPECIES.length *
      (COLLECTION_ROW_BASE_HEIGHT + COLLECTION_ROW_EXTRA_HEIGHT * ratio) +
      (SPECIES.length - 1) * (COLLECTION_ROW_BASE_GAP + COLLECTION_ROW_EXTRA_GAP * ratio);
    else if (ui.page === 'game') bottom = this.gameField().bottom;
    else if (ui.page === 'home') {
      const home = this.homeLayout();
      top = home.sceneY;
      bottom = home.sceneBottom;
    }

    const c = this.ctx;
    const buttons = this.buttons;
    const clipY = top - ANIMATION_CLIP_TOP_MARGIN;
    const clipHeight = bottom - clipY;
    this.time = Date.now() / MILLISECONDS_PER_SECOND;
    c.save();
    try {
      this.setLayoutTransform();
      c.beginPath(); c.rect(ANIMATION_CLIP_LEFT, clipY, ANIMATION_CLIP_WIDTH, clipHeight);
      c.clip();
      this.background(ANIMATION_CLIP_LEFT, clipY, ANIMATION_CLIP_WIDTH, clipHeight);
      this.buttons = [];
      if (!state.active) this.welcome(state, ui);
      else if (ui.page === 'collection') this.collection(state);
      else if (ui.page === 'game') this.game(state, ui);
      else this.home(state, ui);
      this.toast(ui);
    } finally {
      this.buttons = buttons;
      c.restore();
    }
  }

  draw(state, ui, coinWaysOffer = null) {
    this.resize(); this.time = Date.now() / MILLISECONDS_PER_SECOND; this.buttons = [];
    this.pressedId = ui.pressedId || null;
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = C.cream; c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.setLayoutTransform();
    c.clearRect(0, 0, 390, this.h);
    this.background();
    if (!state.active) this.welcome(state, ui);
    else if (ui.page === 'collection') this.collection(state);
    else if (ui.page === 'tasks') this.tasks(state);
    else if (ui.page === 'game') this.game(state, ui);
    else this.home(state, ui);
    this.toast(ui);
    this.guide(state, ui);
    if (ui.adoptionConfirmId) this.adoptionConfirm(state, ui.adoptionConfirmId);
    if (coinWaysOffer) this.coinWaysModal(coinWaysOffer, ui.coinWaysScroll);
    if (ui.showGrowthHelp) this.growthHelp();
    if (ui.rewardHelp) this.rewardHelp(ui.rewardHelp);
    if (ui.showSettings) this.settings(state, ui);
    if (ui.debugEditor) this.debugEditor(state, ui);
  }

  hit(x, y) {
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      const b = this.buttons[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
    }
    return null;
  }
}
