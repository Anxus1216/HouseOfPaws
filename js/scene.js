import { SPECIES, TASKS, canDaily, getDailyGrowth, MAX_DAILY_GROWTH } from './model.js';
import { petDisplay } from './pet-display.js';
import { PET_FIELDS } from './debug-editor.js';
import { readViewport } from './viewport.js';

const C = {
  ink: '#5A3F2E', muted: '#9A806B', paper: '#FFF3E2', cream: '#FFF3E2',
  peach: '#F1DFC5', coral: '#B97956', pink: '#CE8EA1', mint: '#87A9A5',
  brown: '#76533E', gold: '#DAB56D', line: '#DEC3A4', shadow: '#D5BBA7',
  wash: '#F3E2C8', track: '#E6D2B6',
};

const TASK_ART = {
  care: { title: '照顾小伙伴', mark: '♥', color: '#FBE3DB' },
  interact: { title: '亲密时光', mark: '♡', color: '#E9F0E8' },
  game: { title: '星星收集家', mark: '✦', color: '#FFF0D4' },
};

const CARE_SCENE = { wash: 'wash_nook', play: 'play_garden', rest: 'rest_evening' };
const SCENE_NAMES = ['home_afternoon', 'wash_nook', 'play_garden', 'rest_evening', 'star_sky'];

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

export default class Scene {
  constructor(ctx, canvas) {
    this.ctx = ctx;
    this.canvas = canvas;
    this.scale = 1;
    this.h = 844;
    this.offsetX = 0;
    this.offsetY = 0;
    this.headerControlsY = 64;
    this.buttons = [];
    this.time = 0;
    this.petImages = new Map();
    this.sceneImages = new Map();
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
    const usable = this.canvas.height - top - bottom;
    const usableWidth = Math.max(1, this.canvas.width - left - right);
    this.scale = Math.min(usableWidth / 390, usable / 680);
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

  loadSceneImage(name) {
    let entry = this.sceneImages.get(name);
    if (!entry) {
      const createImage = this.canvas.createImage ? () => this.canvas.createImage() :
        typeof wx !== 'undefined' && wx.createImage ? () => wx.createImage() : null;
      if (!createImage) return null;
      try {
        const image = createImage();
        entry = { image, ready: false, failed: false };
        this.sceneImages.set(name, entry);
        image.onload = () => {
          entry.ready = true;
          if (this.onAssetReady) this.onAssetReady();
        };
        image.onerror = () => { entry.failed = true; if (this.onAssetReady) this.onAssetReady(); };
        image.src = `assets/scenes/scene_${name}.jpg`;
      } catch (error) {
        this.sceneImages.delete(name);
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

  button(id, x, y, w, h, label, fill = C.paper, color = C.ink, border = null, fontSize = 14) {
    this.box(x, y, w, h, Math.min(16, h / 2), fill, border);
    this.readableText(label, x + w / 2, y + h / 2 + 1, fontSize, color, 'center', 'bold');
    this.buttons.push({ id, x, y, w, h });
  }

  background() {
    const c = this.ctx;
    c.fillStyle = C.cream; c.fillRect(0, 0, 390, this.h);
  }

  layout() {
    const ratio = clamp((this.h - 680) / 164, 0, 1);
    const extra = Math.max(0, this.h - 844);
    return { ratio, extra, sceneY: 136 + 33 * ratio,
      sceneH: 165 + 83 * ratio + extra, navY: this.h - 74 };
  }

  header(state, eyebrow, title, subtitle, settings = true) {
    const { ratio } = this.layout();
    this.circle(37, 36, 16, '#ECD1AE');
    this.ellipse(37, 40, 7, 6, C.brown);
    [[28, 31], [34, 27], [41, 27], [47, 31]].forEach(([x, y]) => this.circle(x, y, 2.4, C.brown));
    this.text('爪爪小屋', 60, 30, 15, C.ink, 'left', 'bold');
    this.text('P A W P A W   H O U S E', 60, 47, 7, C.muted);
    const controlsY = this.headerControlsY;
    this.box(274, controlsY + 3, 69, 32, 16, C.peach);
    this.text('✦  ' + state.coins, 308, controlsY + 20, 13, C.brown, 'center', 'bold');
    if (settings) {
      this.text('⚙', 366, controlsY + 19, 20, C.brown, 'center');
      this.buttons.push({ id: 'settings', x: 346, y: controlsY, w: 38, h: 38 });
    }
    const eyebrowY = 83 + 16 * ratio;
    this.box(20, eyebrowY - 2, 22, 2, 1, C.coral);
    this.readableText(eyebrow, 51, eyebrowY, 10, C.coral, 'left', 'bold');
    this.text(title, 20, eyebrowY + 24, 23, C.ink, 'left', 'bold');
    if (ratio > .3) this.text(subtitle, 21, eyebrowY + 48, 11, C.muted);
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
      if (!createImage) return false;
      try {
        const image = createImage();
        entry = { image, ready: false, failed: false };
        this.petImages.set(key, entry);
        image.onload = () => { entry.ready = true; if (this.onAssetReady) this.onAssetReady(); };
        image.onerror = () => { entry.failed = true; };
        image.src = `assets/pets/sprites/pet_${key}.png`;
      } catch (error) {
        this.petImages.delete(key);
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

  stats(pet, y) {
    const items = [
      ['饱腹', pet.hunger, '#DCA277'], ['清洁', pet.clean, '#87AAA4'],
      ['快乐', pet.happy, '#CE8EA1'], ['精力', pet.energy, '#A4A2C8'],
    ];
    items.forEach((item, i) => {
      const x = 36 + (i % 2) * 170, yy = y + Math.floor(i / 2) * 35;
      const low = item[1] < 25;
      this.circle(x + 3, yy, 3, item[2]);
      this.readableText(item[0], x + 10, yy, 10, low ? C.coral : C.muted);
      this.readableText(Math.round(item[1]) + '%', x + 137, yy, 10,
        low ? C.coral : C.brown, 'right', 'bold');
      this.box(x, yy + 11, 137, 4, 2, C.track);
      this.box(x, yy + 11, 137 * clamp(item[1], 0, 100) / 100, 4, 2, low ? C.coral : item[2]);
    });
  }

  home(state, ui) {
    const pet = state.pets[state.active];
    this.header(state, '陪伴日记', '今天也一起慢慢长大', '多一点陪伴，就多一点好心情');
    const { ratio, sceneY, sceneH } = this.layout();
    const sheetY = sceneY + sceneH + 10 + 5 * ratio;
    const sheetH = 151 + 17 * ratio;
    const headingY = sheetY + sheetH + 15 + 4 * ratio;
    const actionsY = headingY + 28 + 4 * ratio;
    const display = petDisplay(pet, ui);
    const backdrop = CARE_SCENE[display.action] || 'home_afternoon';
    this.sceneBackdrop(backdrop, 20, sceneY, 350, sceneH, 23, '#F2D8B8');
    this.box(20, sceneY, 350, sceneH, 23, 'rgba(0,0,0,0)', C.coral, 1.5);
    const petSize = clamp(sceneH / 300, .55, .94);
    this.pet(pet.id, 195, sceneY + sceneH - petSize * 130 - 5, petSize, this.time,
      display.expression, display.action);
    this.buttons.push({ id: 'pet_tap', x: 82, y: sceneY + 4, w: 225, h: sceneH - 8 });
    if (display.speech) {
      this.box(181, sceneY + 11, 162, 30, 15, C.paper);
      this.text(display.speech.slice(0, 13), 262, sceneY + 27, 11, C.brown, 'center');
    }
    if (display.statDelta) {
      const lines = display.statDelta.split('|');
      const twoLines = lines.length > 1;
      this.box(43, sceneY + sceneH - (twoLines ? 54 : 37), 304,
        twoLines ? 43 : 27, 13, '#FFF5E7');
      this.text(lines[0], 195, sceneY + sceneH - (twoLines ? 40 : 23),
        twoLines ? 10 : 12, C.coral, 'center', 'bold');
      if (twoLines) this.text(lines[1], 195, sceneY + sceneH - 21,
        11, C.brown, 'center', 'bold');
    }
    this.box(20, sheetY, 350, sheetH, 19, C.wash);
    this.text(pet.name, 36, sheetY + 24, 17, C.ink, 'left', 'bold');
    this.box(93, sheetY + 12, 42, 22, 6, '#E6C8A8');
    this.readableText('LV. ' + pet.level, 114, sheetY + 23, 10, C.brown, 'center', 'bold');
    const needed = pet.level * 40;
    this.readableText(pet.level >= 99 ? '已满级' : `成长 ${pet.xp}/${needed}`,
      354, sheetY + 24, 10, C.muted, 'right');
    this.box(36, sheetY + 43, 238, 5, 3, C.track);
    this.box(36, sheetY + 43, 238 * clamp(pet.xp / needed, 0, 1), 5, 3, C.coral);
    const todayGrowth = getDailyGrowth(pet);
    this.readableText(`今日 ${todayGrowth}/${MAX_DAILY_GROWTH}`, 353, sheetY + 45, 10,
      todayGrowth >= MAX_DAILY_GROWTH ? C.coral : C.muted, 'right');
    this.box(36, sheetY + 60, 318, 1, 1, C.line);
    this.stats(pet, sheetY + 78);
    this.text('照料' + pet.name, 20, headingY, 15, C.ink, 'left', 'bold');
    const tasks = state.tasks || {};
    const ready = TASKS.filter(task =>
      (tasks.progress || {})[task.id] >= task.target &&
      !(tasks.claimed || {})[task.id]).length;
    const progress = TASKS.filter(task => (tasks.progress || {})[task.id] >= task.target).length;
    this.readableText(ready ? `待领奖励 ${ready}  ›` : `今日目标 ${progress}/${TASKS.length}  ›`,
      370, headingY, 11, C.coral, 'right');
    this.buttons.push({ id: 'home_tasks', x: 225, y: headingY - 17, w: 150, h: 34 });
    [['feed', '◉', '喂食', '✦ 5'], ['wash', '◌', '清洁', '免费'],
      ['play', '✿', '玩耍', '免费'], ['rest', '☾', '休息', '免费']].forEach((a, i) => {
      const x = 26 + i * 89;
      const value = [pet.hunger, pet.clean, pet.happy, pet.energy][i];
      const unavailable = Math.round(value) >= 100 || (a[0] === 'play' && pet.energy < 29) ||
        (a[0] === 'feed' && state.coins < 5);
      this.circle(x + 36, actionsY + 22, 22, unavailable ? '#E9DFD2' :
        i === 1 ? '#E6E9DE' : i === 3 ? '#E6DFE4' : '#EDD6B7');
      this.text(a[1], x + 36, actionsY + 23, 24,
        unavailable ? '#AC9A89' : i === 1 ? '#6F9B9A' : C.brown, 'center');
      this.readableText(a[2], x + 36, actionsY + 54, 11,
        unavailable ? C.muted : C.brown, 'center', 'bold');
      this.readableText(unavailable ? '暂不可用' : a[3], x + 36,
        actionsY + 73, 9, C.muted, 'center');
      this.buttons.push({ id: a[0], x, y: actionsY, w: 75, h: 82 });
    });
    this.nav('home');
  }

  nav(active) {
    const y = this.layout().navY;
    this.box(20, y, 350, 1, 1, C.line);
    [['home', '⌂', '小屋'], ['collection', '♡', '萌宠'],
      ['tasks', '✓', '任务'], ['game', '✦', '游戏']].forEach((item, i) => {
      const x = 20 + i * 87.5;
      const selected = active === item[0];
      if (selected) this.box(x + 30, y, 27, 3, 1.5, C.coral);
      this.text(item[1], x + 44, y + 27, 23, selected ? C.coral : C.brown, 'center');
      this.readableText(item[2], x + 44, y + 54, 11,
        selected ? C.coral : C.muted, 'center', selected ? 'bold' : 'normal');
      this.buttons.push({ id: 'nav_' + item[0], x, y: y + 3, w: 87, h: 67 });
    });
  }

  collection(state) {
    this.header(state, '小伙伴们', '每一位都值得被珍惜', '选择此刻想陪伴的伙伴');
    const { sceneY, ratio } = this.layout();
    const rowH = 135 + 25 * ratio;
    const gap = 9 + 2 * ratio;
    SPECIES.forEach((spec, i) => {
      const y = sceneY + i * (rowH + gap);
      const owned = !!state.pets[spec.id];
      const selected = state.active === spec.id;
      if (selected) this.box(20, y, 350, rowH, 19, C.wash);
      else this.box(20, y + rowH - 1, 350, 1, 1, C.line);
      const thumbY = y + 12;
      this.box(32, thumbY, 112, rowH - 24, 17,
        i === 0 ? '#F9EBDD' : i === 1 ? '#EEE7E7' : '#F4E5D8');
      const petSize = (rowH - 28) / 300;
      this.pet(spec.id, 88, y + rowH - 21 - petSize * 130, petSize, this.time);
      this.readableText(spec.type, 155, y + 31, 10, C.muted);
      this.text(spec.name, 155, y + 56, 20, C.ink, 'left', 'bold');
      this.readableText(spec.line, 155, y + 81, 10, C.muted);
      this.readableText(owned ? `LV. ${state.pets[spec.id].level} · 陪伴中` :
        spec.cost ? `领养需 ✦ ${spec.cost}` : '免费领养', 155, y + rowH - 24, 10, C.coral);
      this.button(owned ? 'select_' + spec.id : 'adopt_' + spec.id,
        282, y + rowH - 40, 76, 29,
        owned ? selected ? '陪伴中' : '去陪伴' : state.coins >= spec.cost ? '领养' : '去领币',
        selected ? C.coral : C.paper, selected ? '#FFF' : C.brown,
        selected ? null : C.line, 10);
    });
    this.nav('collection');
  }

  welcome(state, ui) {
    this.header(state, '欢迎来到小屋', '一起慢慢长大', '从第一位小伙伴开始', !!ui.debugEnabled);
    const { sceneY, sceneH } = this.layout();
    const visualH = sceneH + Math.max(70, (this.h - 680) * .25);
    this.sceneBackdrop('home_afternoon', 20, sceneY, 350, visualH, 23, '#F2D8B8');
    this.box(20, sceneY, 350, visualH, 23, 'rgba(0,0,0,0)', C.coral, 1.5);
    const petSize = clamp(visualH / 300, .72, 1.08);
    this.pet('cat', 195, sceneY + visualH - 130 * petSize - 6, petSize, this.time);
    const infoY = sceneY + visualH + 23;
    this.text('奶糖', 195, infoY, 24, C.ink, 'center', 'bold');
    this.readableText('喜欢晒太阳的奶油小猫，正等着你',
      195, infoY + 29, 12, C.muted, 'center');
    this.readableText('糯米和团团也会在小屋里等你认识',
      195, this.h - 137, 11, C.muted, 'center');
    this.button('adopt_selected', 53, this.h - 114, 284, 53,
      '免费领养奶糖  →', C.coral, '#FFF', null, 15);
  }

  tasks(state) {
    this.header(state, '每日清单', '今天的小小约定', '做一点小事，换一份好心情');
    const { sceneY, ratio, extra } = this.layout();
    const progress = state.tasks && state.tasks.progress || {};
    const claimed = state.tasks && state.tasks.claimed || {};
    const completed = TASKS.filter(task => (progress[task.id] || 0) >= task.target).length;
    this.box(20, sceneY, 350, 58, 18, '#EED7B4');
    const compact = this.scale < .9;
    this.readableText(`今天已完成 ${completed} / ${TASKS.length}`, 38,
      sceneY + (compact ? 19 : 29), 14, C.brown, 'left', 'bold');
    this.readableText('把小事变成好回忆  ✦', 352,
      sceneY + (compact ? 43 : 29), 10, C.muted, 'right');
    const rowStart = sceneY + 69;
    const rowStep = 105 + 19 * ratio;
    TASKS.forEach((task, i) => {
      const y = rowStart + i * rowStep;
      const art = TASK_ART[task.id];
      const count = clamp(Number(progress[task.id]) || 0, 0, task.target);
      const done = count >= task.target;
      const claimedThis = !!claimed[task.id];
      this.circle(54, y + 24, 19, art.color);
      this.text(art.mark, 54, y + 25, 20, C.coral, 'center', 'bold');
      this.text(art.title, 82, y + 17, 15, C.ink, 'left', 'bold');
      this.readableText(claimedThis ? '今天已完成，明天继续吧' : task.label,
        82, y + 40, 10, C.muted);
      this.readableText('✦ ' + task.reward, 354, y + 18, 10, C.coral, 'right', 'bold');
      this.readableText(`${count} / ${task.target}`, 82, y + 74, 11, C.muted);
      this.button(claimedThis ? 'task_done_' + task.id : done ? 'claim_' + task.id :
        'task_go_' + task.id, 277, y + 62, 80, 30,
        claimedThis ? '已领取' : done ? '领取奖励' : task.id === 'game' ? '去游戏 →' : '去完成 →',
        claimedThis ? '#EFE3D3' : done ? C.coral : C.paper,
        claimedThis ? C.muted : done ? '#FFF' : C.coral,
        !claimedThis && !done ? C.line : null, 10);
      this.box(36, y + rowStep - 1, 318, 1, 1, C.line);
    });
    const giftY = rowStart + TASKS.length * rowStep + 6 + extra;
    this.box(20, giftY, 350, 51, 17, C.wash);
    this.readableText('✦  每日礼物 · +30 爪爪币', 37, giftY + 26, 11, C.brown);
    this.button('daily', 281, giftY + 11, 77, 30,
      canDaily(state) ? '领取礼物' : '明天再来',
      canDaily(state) ? C.coral : '#E6D5C0', canDaily(state) ? '#FFF' : C.muted,
      null, 10);
    this.nav('tasks');
  }

  gameField() {
    const { sceneY, ratio, extra } = this.layout();
    const h = 356 + 104 * ratio + extra;
    return { x: 20, y: sceneY, w: 350, h, bottom: sceneY + h };
  }

  game(state, ui) {
    this.header(state, '星星接接乐', '把星光装进小篮子', '20 秒，来一场轻松的冒险');
    const field = this.gameField();
    const fieldY = field.y, fieldH = field.h;
    this.sceneBackdrop('star_sky', field.x, fieldY, field.w, fieldH, 23, '#174768', .12);
    this.box(field.x, fieldY, field.w, fieldH, 23, 'rgba(0,0,0,0)', C.coral, 1.5);
    if (ui.playing) {
      this.box(36, fieldY + 13, 246, 38, 19, C.paper);
      this.text('✦  ' + ui.score, 54, fieldY + 33, 16, C.ink, 'left', 'bold');
      this.readableText(Math.ceil(ui.remaining) + ' 秒', 267,
        fieldY + 33, 12, C.brown, 'right', 'bold');
      this.button('pause_game', 306, fieldY + 13, 43, 38, 'Ⅱ', C.paper, C.brown);
      (ui.stars || []).forEach(s => this.text('✦', s.x, s.y, 34, '#FFD777', 'center', 'bold'));
      this.box(ui.basketX - 43, fieldY + fieldH - 50, 86, 28, 12, '#D8937E');
      this.box(ui.basketX - 48, fieldY + fieldH - 53, 96, 10, 5, '#A46B56');
    } else {
      this.text('✦', 195, fieldY + fieldH * .43, 64, '#FFE1A0', 'center', 'bold');
      if (ui.gameResult) {
        this.text('本局完成！', 195, field.bottom - 158, 20, '#FFF9E7', 'center', 'bold');
        this.readableText(ui.gameResult, 195, field.bottom - 130, 11, '#FFF1D3', 'center');
        if (ui.gameGrowth) this.readableText(ui.gameGrowth, 195, field.bottom - 108,
          11, '#FFD777', 'center', 'bold');
      } else {
        this.text('接住每一颗小星星', 195, field.bottom - 137, 18, '#FFF9E7', 'center', 'bold');
        this.readableText('左右滑动篮子，收集闪亮的好心情',
          195, field.bottom - 109, 11, '#FFF1D3', 'center');
      }
      this.button('start_game', 93, fieldY + fieldH - 67, 204, 46,
        ui.gameResult ? '再玩一局  →' : '开始接星星  →', C.coral, '#FFF');
    }
    this.readableText('每局 20 秒 · 星星越多奖励越多', 21, field.bottom + 24, 10, C.muted);
    this.readableText('玩法说明  ›', 368, field.bottom + 24, 10, C.coral, 'right');
    this.buttons.push({ id: 'game_help', x: 281, y: field.bottom + 7, w: 91, h: 34 });
    this.nav('game');
    if (ui.playing && ui.paused) {
      this.dim(); this.buttons = [];
      const y = this.h / 2 - 128;
      this.box(39, y, 312, 258, 24, C.paper);
      this.text('暂停一下', 195, y + 50, 23, C.ink, 'center', 'bold');
      this.text('星星会等你回来', 195, y + 84, 13, C.muted, 'center');
      this.button('resume_game', 74, y + 120, 242, 48, '继续游戏', C.coral, '#FFF');
      this.button('quit_game', 74, y + 184, 242, 42, '结束本局', '#F6EDE6', C.brown);
    }
  }

  dim() {
    this.ctx.fillStyle = 'rgba(65, 44, 36, 0.35)';
    this.ctx.fillRect(0, 0, 390, this.h);
  }

  guide(step) {
    const pages = [
      ['先认识小伙伴', '四项状态告诉你它现在的心情。', '饱腹、清洁、快乐、精力都值得照顾。'],
      ['一起度过陪伴时光', '喂食、清洁、玩耍、休息都能帮助它成长。', '摸摸小伙伴，也能完成每日互动任务。'],
      ['去接住星星吧', '游戏里移动篮子接星星，收集爪爪币。', '每日任务完成后，记得领取奖励。'],
    ];
    const page = pages[clamp(step - 1, 0, 2)];
    this.dim(); this.buttons = [];
    const y = this.h / 2 - 158;
    this.box(29, y, 332, 317, 24, C.paper);
    this.text(`${step} / 3`, 195, y + 31, 12, C.coral, 'center', 'bold');
    this.circle(195, y + 91, 36, step === 3 ? '#FFF0D4' : step === 2 ? '#FBE3DB' : '#E9F0E8');
    this.text(step === 3 ? '✦' : step === 2 ? '♥' : '♡', 195, y + 93, 35, C.coral, 'center');
    this.text(page[0], 195, y + 150, 21, C.ink, 'center', 'bold');
    this.readableText(page[1], 195, y + 188, 12, C.brown, 'center');
    this.readableText(page[2], 195, y + 211, 11, C.muted, 'center');
    this.button('guide_next', 62, y + 244, 266, 45, step === 3 ? '开始陪伴' : '下一步', C.coral, '#FFF');
    this.button('guide_skip', 293, y + 11, 50, 29, '跳过', C.paper, C.muted, null, 11);
  }

  settings(state, ui) {
    this.dim(); this.buttons = [];
    const enabled = !!ui.debugEnabled;
    const height = enabled ? 338 : 274;
    const y = this.h / 2 - height / 2;
    this.box(31, y, 328, height, 24, C.paper);
    this.text('小屋设置', 58, y + 45, 21, C.ink, 'left', 'bold');
    this.button('settings_close', 304, y + 22, 33, 33, '×', '#F8EEE8', C.brown, null, 20);
    this.text('音效', 58, y + 110, 15, C.ink, 'left', 'bold');
    this.box(281, y + 94, 53, 31, 16, state.soundEnabled ? '#A97958' : '#DED0BE');
    this.circle(state.soundEnabled ? 318.5 : 296.5, y + 109.5, 12.5, '#FFFAF2');
    this.line([[58, y + 143], [332, y + 143]], '#E5D1B8', 1);
    this.buttons.push({ id: 'sound_toggle', x: 51, y: y + 78, w: 288, h: 65 });
    if (enabled) {
      this.button('debug_open', 51, y + 159, 288, 48, '调试模式  ›', '#F7E1D0', C.brown, C.line, 14);
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
    this.box(10, 12, 370, this.h - 24, 20, C.paper);
    this.text('开发调试已开启', 28, 38, 11, C.coral, 'left', 'bold');
    this.text('调试模式', 28, 71, 21, C.ink, 'left', 'bold');
    this.button('debug_close', 330, 42, 34, 34, '×', '#F8EEE8', C.brown, null, 20);
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
          this.box(29, y + 3, 331, 50, 11, error ? '#FFF0EA' : C.paper,
            error ? C.coral : C.line);
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
      this.button('debug_save', 184, this.h - 76, 182, 51, '保存修改', C.coral, '#FFF');
    }
    if (editor.confirmDiscard) {
      this.dim(); this.buttons = [];
      const y = this.h / 2 - 96;
      this.box(36, y, 318, 190, 20, C.paper);
      this.text('放弃未保存的修改？', 195, y + 51, 17, C.ink, 'center', 'bold');
      this.text('已输入的调试数值不会保存。', 195, y + 85, 11, C.muted, 'center');
      this.button('debug_keep', 55, y + 119, 129, 46, '继续编辑', '#F6EDE6', C.brown);
      this.button('debug_discard', 200, y + 119, 135, 46, '放弃修改', C.coral, '#FFF');
    }
  }

  debugKeypad(ui) {
    const keyboard = ui.debugKeyboard;
    const y = this.h - 298;
    this.box(20, y, 350, 280, 17, '#EBD8C4');
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

  draw(state, ui) {
    this.resize(); this.time = Date.now() / 1000; this.buttons = [];
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = C.cream; c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(this.scale, 0, 0, this.scale, this.offsetX, this.offsetY);
    c.clearRect(0, 0, 390, this.h);
    this.background();
    if (!state.active) this.welcome(state, ui);
    else if (ui.page === 'collection') this.collection(state);
    else if (ui.page === 'tasks') this.tasks(state);
    else if (ui.page === 'game') this.game(state, ui);
    else this.home(state, ui);
    this.toast(ui);
    if (state.active && ui.guideStep > 0) this.guide(ui.guideStep);
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
