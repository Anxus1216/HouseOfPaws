import { SPECIES, TASKS, canDaily, getDailyGrowth, MAX_DAILY_GROWTH } from './model.js';
import { petDisplay } from './pet-display.js';

const C = {
  ink: '#49352F', muted: '#806C63', paper: '#FFFCF6', cream: '#FFF7EB',
  peach: '#F8E5D4', coral: '#C96D58', pink: '#E8A69A', mint: '#8FB9A2',
  brown: '#75564A', gold: '#E9B956', line: '#E9D9CA', shadow: '#D5BBA7',
};

const TASK_ART = {
  care: { title: '照顾小伙伴', mark: '♥', color: '#FBE3DB' },
  interact: { title: '亲密时光', mark: '♡', color: '#E9F0E8' },
  game: { title: '星星收集家', mark: '✦', color: '#FFF0D4' },
};

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

export default class Scene {
  constructor(ctx, canvas) {
    this.ctx = ctx;
    this.canvas = canvas;
    this.scale = 1;
    this.h = 844;
    this.offsetX = 0;
    this.offsetY = 0;
    this.buttons = [];
    this.time = 0;
    this.petImages = new Map();
  }

  resize() {
    // All pages share a 390-unit width. Height follows the visible safe area.
    let top = 0, bottom = 0;
    try {
      const info = wx.getSystemInfoSync && wx.getSystemInfoSync();
      if (info && info.safeArea && info.windowWidth) {
        const ratio = this.canvas.width / info.windowWidth;
        top = clamp(info.safeArea.top * ratio, 0, this.canvas.height * .1);
        bottom = clamp((info.screenHeight - info.safeArea.bottom) * ratio, 0, this.canvas.height * .08);
      }
    } catch (e) { /* The simulator may not expose safeArea. */ }
    const usable = this.canvas.height - top - bottom;
    this.scale = Math.min(this.canvas.width / 390, usable / 680);
    this.h = usable / this.scale;
    this.offsetX = (this.canvas.width - 390 * this.scale) / 2;
    this.offsetY = top;
  }

  box(x, y, w, h, r, fill, stroke, line = 1) {
    const c = this.ctx, radius = Math.min(r, w / 2, h / 2);
    c.beginPath(); c.moveTo(x + radius, y);
    c.lineTo(x + w - radius, y); c.quadraticCurveTo(x + w, y, x + w, y + radius);
    c.lineTo(x + w, y + h - radius); c.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    c.lineTo(x + radius, y + h); c.quadraticCurveTo(x, y + h, x, y + h - radius);
    c.lineTo(x, y + radius); c.quadraticCurveTo(x, y, x + radius, y); c.closePath();
    c.fillStyle = fill; c.fill();
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = line; c.stroke(); }
  }

  text(value, x, y, size = 14, color = C.ink, align = 'left', weight = 'normal') {
    const c = this.ctx;
    c.fillStyle = color; c.textAlign = align; c.textBaseline = 'middle';
    c.font = `${weight} ${size}px sans-serif`;
    c.fillText(String(value), x, y);
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
    this.text(label, x + w / 2, y + h / 2 + 1, fontSize, color, 'center', 'bold');
    this.buttons.push({ id, x, y, w, h });
  }

  background() {
    const c = this.ctx;
    c.fillStyle = C.cream; c.fillRect(0, 0, 390, this.h);
    c.fillStyle = '#F9EBDD'; c.fillRect(0, 0, 390, 132);
    this.circle(356, 18, 92, '#FFF2E4');
    this.circle(-21, 190, 69, '#FFF0E2');
    this.circle(351, this.h - 185, 57, '#FFF0E2');
    for (let i = 0; i < 7; i++) {
      this.circle(26 + i * 56, 126, 1.7, '#DDBEAA');
    }
  }

  header(state, title, subtitle, settings = true) {
    this.text('✦  爪 爪 小 屋  /  PAWPAW', 22, 29, 11, C.coral, 'left', 'bold');
    this.text(title, 22, 72, 25, C.ink, 'left', 'bold');
    this.text(subtitle, 23, 103, 12, C.muted);
    if (settings) this.button('settings', 246, 15, 40, 40, '⚙', C.paper, C.brown, C.line, 19);
    this.box(293, 15, 77, 40, 20, C.paper, C.line);
    this.text('✦ ' + state.coins, 331, 36, 14, C.brown, 'center', 'bold');
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
        image.onload = () => { entry.ready = true; };
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
      ['饱腹', pet.hunger, '#E9AD7D'], ['清洁', pet.clean, '#A7C9C7'],
      ['快乐', pet.happy, '#E9A9B8'], ['精力', pet.energy, '#B9B6D9'],
    ];
    items.forEach((item, i) => {
      const x = 39 + (i % 2) * 163, yy = y + Math.floor(i / 2) * 42;
      const low = item[1] < 25;
      this.text(item[0], x, yy, 12, low ? C.coral : C.brown, 'left', 'bold');
      this.text(Math.round(item[1]) + '%', x + 125, yy, 11, low ? C.coral : C.muted, 'right', 'bold');
      this.box(x, yy + 12, 125, 7, 4, '#F0E8E2');
      this.box(x, yy + 12, 125 * clamp(item[1], 0, 100) / 100, 7, 4, low ? C.coral : item[2]);
    });
  }

  home(state, ui) {
    const pet = state.pets[state.active];
    this.header(state, pet.name + '的小小日常', '照顾它的心情，一起收集好时光');
    const actionsY = this.h - 195;
    const cardBottom = actionsY - 30;
    const roomY = 150;
    // Reserve space below the room for the daily growth label and both stat rows.
    const roomH = Math.max(162, cardBottom - roomY - 143);
    this.box(20, 132, 350, cardBottom - 132, 25, C.paper, C.line, 1.3);
    // The room is a little paper theatre: a window, wall trim and rug frame the pet.
    this.box(35, roomY, 320, roomH, 20, '#F7E8D5');
    this.box(35, roomY + roomH * .69, 320, roomH * .31, 0, '#E7CAB0');
    this.line([[36, roomY + roomH * .69], [354, roomY + roomH * .69]], '#D5AE91', 2);
    this.box(53, roomY + 14, 75, Math.min(78, roomH * .45), 23, '#FFF8E9', '#DDBCA1', 3);
    this.circle(91, roomY + 47, 20, '#F7D98E');
    this.line([[91, roomY + 17], [91, roomY + Math.min(78, roomH * .45) + 12]], '#E8C6A5', 2);
    this.ellipse(299, roomY + 42, 17, 19, '#E6A58E');
    this.ellipse(285, roomY + 55, 5, 13, C.mint, -.6);
    this.ellipse(312, roomY + 55, 5, 13, C.mint, .6);
    this.box(281, roomY + 64, 38, 8, 3, '#A8755D');
    this.ellipse(195, roomY + roomH - 13, 103, 18, '#DABFA9');
    this.ellipse(195, roomY + roomH - 16, 89, 12, '#F3DECA');
    const petSize = clamp(roomH / 345, .54, .88);
    const display = petDisplay(pet, ui);
    this.pet(pet.id, 195, roomY + roomH - petSize * 107 - 10, petSize, this.time,
      display.expression, display.action);
    this.buttons.push({ id: 'pet_tap', x: 94, y: roomY + 5, w: 204, h: roomH - 12 });
    if (display.speech) {
      this.box(181, roomY + 12, 157, 32, 16, C.paper);
      this.text(display.speech.slice(0, 13), 259, roomY + 29, 11, C.brown, 'center');
    }
    if (display.statDelta) {
      const lines = display.statDelta.split('|');
      const twoLines = lines.length > 1;
      this.box(43, roomY + roomH - (twoLines ? 59 : 44), 304,
        twoLines ? 43 : 27, 13, '#FFF9EE');
      this.text(lines[0], 195, roomY + roomH - (twoLines ? 45 : 30),
        twoLines ? 10 : 12, C.coral, 'center', 'bold');
      if (twoLines) this.text(lines[1], 195, roomY + roomH - 26,
        11, C.brown, 'center', 'bold');
    }
    const cardY = roomY + roomH + 12;
    this.text('LV.' + pet.level + '  ' + pet.name, 39, cardY + 4, 15, C.ink, 'left', 'bold');
    const needed = pet.level * 40;
    this.text(pet.level >= 99 ? '已满级' : `成长 ${pet.xp}/${needed}`, 336, cardY + 4, 11, C.muted, 'right');
    this.box(39, cardY + 20, 312, 6, 3, '#F0E7E0');
    this.box(39, cardY + 20, 312 * clamp(pet.xp / needed, 0, 1), 6, 3, C.pink);
    const todayGrowth = getDailyGrowth(pet);
    this.text(`今日成长 ${todayGrowth}/${MAX_DAILY_GROWTH}`, 39, cardY + 40, 11,
      todayGrowth >= MAX_DAILY_GROWTH ? C.coral : C.muted);
    this.stats(pet, cardY + 59);
    this.text('照料小伙伴', 22, actionsY - 17, 16, C.ink, 'left', 'bold');
    const tasks = state.tasks || {};
    const ready = TASKS.filter(task =>
      (tasks.progress || {})[task.id] >= task.target &&
      !(tasks.claimed || {})[task.id]).length;
    this.button('home_tasks', 254, actionsY - 34, 115, 29,
      ready ? `待领奖励 ${ready} ›` : '今日目标  ›',
      ready ? '#F8DDC8' : C.paper, ready ? C.coral : C.brown, C.line, 11);
    [['feed', '◉', '喂食', '✦ 5'], ['wash', '◌', '清洁', '免费'],
      ['play', '✿', '玩耍', '免费'], ['rest', '☾', '休息', '免费']].forEach((a, i) => {
      const x = 20 + i * 91;
      const value = [pet.hunger, pet.clean, pet.happy, pet.energy][i];
      const unavailable = Math.round(value) >= 100 || (a[0] === 'play' && pet.energy < 29) ||
        (a[0] === 'feed' && state.coins < 5);
      this.box(x, actionsY, 78, 81, 17, unavailable ? '#F5EFE8' : C.paper, C.line);
      this.circle(x + 39, actionsY + 27, 19, unavailable ? '#EAE1D9' :
        i === 1 ? '#E2F0EC' : i === 3 ? '#EEEAF4' : '#FBE7DB');
      this.text(a[1], x + 39, actionsY + 28, 23,
        unavailable ? '#A99B90' : i === 1 ? '#5E9C9A' : i === 3 ? '#8883AD' : C.coral, 'center');
      this.text(a[2], x + 39, actionsY + 56, 12, unavailable ? C.muted : C.brown, 'center', 'bold');
      this.text(unavailable ? '暂不可用' : a[3], x + 39, actionsY + 72, 9, C.muted, 'center');
      this.buttons.push({ id: a[0], x, y: actionsY, w: 78, h: 81 });
    });
    this.nav('home');
  }

  nav(active) {
    const y = this.h - 91;
    this.box(16, y, 358, 72, 22, C.paper, C.line, 1.3);
    [['home', '⌂', '小屋'], ['collection', '♡', '萌宠'],
      ['tasks', '✓', '任务'], ['game', '✦', '游戏']].forEach((item, i) => {
      const x = 22 + i * 88;
      const selected = active === item[0];
      if (selected) this.box(x + 2, y + 7, 82, 58, 17, '#F7E4D7');
      this.text(item[1], x + 43, y + 27, 24, selected ? C.coral : C.muted, 'center');
      this.text(item[2], x + 43, y + 51, 11, selected ? C.coral : C.muted, 'center', 'bold');
      this.buttons.push({ id: 'nav_' + item[0], x, y: y + 5, w: 86, h: 62 });
    });
  }

  collection(state) {
    this.header(state, '小伙伴们', '每一段陪伴，都有自己的故事');
    const space = Math.min(151, (this.h - 243) / 3);
    SPECIES.forEach((spec, i) => {
      const y = 137 + i * space;
      const owned = !!state.pets[spec.id];
      const selected = state.active === spec.id;
      this.box(20, y, 350, 132, 21, selected ? '#FFF8EC' : C.paper,
        selected ? '#DBAD88' : C.line, selected ? 2 : 1);
      this.circle(91, y + 66, 50, i === 0 ? '#FAE6D5' : i === 1 ? '#F2E7E7' : '#F5E2D3');
      this.pet(spec.id, 91, y + 80, .34, this.time);
      this.text(spec.name, 158, y + 28, 19, C.ink, 'left', 'bold');
      this.text(spec.type, 158, y + 54, 11, C.muted);
      this.text(spec.line, 158, y + 72, 10, C.muted);
      this.text(owned ? `LV.${state.pets[spec.id].level}  已领养` :
        spec.cost ? `✦ ${spec.cost} 爪爪币` : '免费领养', 158, y + 105, 11, C.brown, 'left', 'bold');
      this.button(owned ? 'select_' + spec.id : 'adopt_' + spec.id, 265, y + 84, 90, 42,
        owned ? selected ? '陪伴中' : '去陪伴' : state.coins >= spec.cost ? '领养' :
          `还差 ${spec.cost - state.coins}`,
        selected ? '#F5E8D9' : !owned && state.coins < spec.cost ? '#F7EEE6' : C.coral,
        selected || !owned && state.coins < spec.cost ? C.brown : '#FFF', null, 11);
    });
    this.nav('collection');
  }

  welcome(state) {
    this.header(state, '欢迎来到爪爪小屋', '你的第一段陪伴，就从这里开始', false);
    this.box(20, 132, 350, this.h - 150, 25, C.paper, C.line, 1.3);
    const centerY = clamp((this.h - 680) * .35 + 295, 295, 348);
    this.box(43, 153, 304, Math.max(285, centerY - 8), 26, '#F7E7D3');
    this.circle(195, centerY - 23, 119, '#FDEFD9');
    this.ellipse(195, centerY + 105, 106, 16, '#D7B79D');
    this.pet('cat', 195, centerY, 1.04, this.time);
    this.box(117, centerY + 123, 156, 29, 15, '#F7E2CF');
    this.text('免费领养', 195, centerY + 139, 12, C.coral, 'center', 'bold');
    this.text('奶糖', 195, centerY + 176, 25, C.ink, 'center', 'bold');
    this.text('喜欢晒太阳的奶油小猫，正等着你', 195, centerY + 205, 12, C.muted, 'center');
    this.text('糯米和团团会在小屋里等你认识', 195, this.h - 151, 11, C.muted, 'center');
    this.button('adopt_selected', 53, this.h - 125, 284, 57,
      '领养奶糖 · 开始陪伴  →', C.coral, '#FFF', null, 16);
  }

  tasks(state) {
    this.header(state, '今天的陪伴清单', '做一点小事，攒一份好心情');
    const progress = state.tasks && state.tasks.progress || {};
    const claimed = state.tasks && state.tasks.claimed || {};
    const gap = clamp((this.h - 700) / 9 + 14, 12, 28);
    TASKS.forEach((task, i) => {
      const y = 139 + i * (129 + gap);
      const art = TASK_ART[task.id];
      const count = clamp(Number(progress[task.id]) || 0, 0, task.target);
      const done = count >= task.target;
      const claimedThis = !!claimed[task.id];
      this.box(20, y, 350, 129, 21, done && !claimedThis ? '#FFF7E9' : C.paper,
        done && !claimedThis ? '#E8BE85' : C.line, done && !claimedThis ? 1.6 : 1);
      this.circle(60, y + 37, 22, art.color);
      this.text(art.mark, 60, y + 38, 22, C.brown, 'center', 'bold');
      this.text(art.title, 91, y + 29, 17, C.ink, 'left', 'bold');
      this.text(claimedThis ? '今天已完成，明天继续吧' : task.label, 91, y + 55, 11, C.muted);
      this.box(38, y + 79, 190, 7, 4, '#F0E8E2');
      this.box(38, y + 79, 190 * count / task.target, 7, 4, done ? C.mint : C.gold);
      this.text(`${count}/${task.target}`, 236, y + 82, 11, C.muted);
      this.text(`奖励  ✦ ${task.reward}`, 39, y + 108, 12, C.brown, 'left', 'bold');
      this.button(claimedThis ? 'task_done_' + task.id : done ? 'claim_' + task.id :
        'task_go_' + task.id, 251, y + 86, 98, 40,
        claimedThis ? '已领取 ✓' : done ? '领取奖励' : '去完成 →',
        claimedThis ? '#F1EBE5' : done ? C.coral : '#F8EEE4',
        claimedThis ? C.muted : done ? '#FFF' : C.brown, null, 11);
    });
    this.nav('tasks');
  }

  game(state, ui) {
    this.header(state, '星星接接乐', '把闪亮的星星装进小篮子');
    this.box(20, 132, 350, this.h - 235, 25, C.paper, C.line, 1.3);
    const fieldY = 153, fieldH = this.h - 320;
    this.box(36, fieldY, 318, fieldH, 21, '#42645F');
    this.circle(86, fieldY + 93, 42, '#55766B');
    this.circle(301, fieldY + 167, 54, '#4C6D66');
    this.circle(285, fieldY + 70, 23, '#F9E8BA');
    for (const [x, y, size] of [[75, 49, 11], [155, 91, 7], [220, 44, 8],
      [315, 122, 7], [113, 171, 7], [246, 208, 10]]) {
      if (y < fieldH - 34) this.text('✦', x, fieldY + y, size, '#EECF87', 'center');
    }
    if (ui.playing) {
      this.box(49, fieldY + 11, 235, 40, 20, '#F8F0DC');
      this.text('✦  ' + ui.score, 66, fieldY + 32, 17, C.ink, 'left', 'bold');
      this.text(Math.ceil(ui.remaining) + ' 秒', 265, fieldY + 32, 13, C.brown, 'right', 'bold');
      this.button('pause_game', 294, fieldY + 11, 44, 40, 'Ⅱ', C.paper, C.brown);
      (ui.stars || []).forEach(s => this.text('✦', s.x, s.y, 34, '#FFD777', 'center', 'bold'));
      this.box(ui.basketX - 43, fieldY + fieldH - 50, 86, 28, 12, '#D8937E');
      this.box(ui.basketX - 48, fieldY + fieldH - 53, 96, 10, 5, '#A46B56');
    } else {
      this.circle(195, fieldY + fieldH * .32, 66, '#587B6F');
      this.text('✦', 195, fieldY + fieldH * .32, 75, '#FFD777', 'center', 'bold');
      if (ui.gameResult) {
        this.text('本局完成！', 195, fieldY + fieldH * .55, 21, '#FFF9E7', 'center', 'bold');
        this.text(ui.gameResult, 195, fieldY + fieldH * .64, 12, '#FFF1D3', 'center');
        if (ui.gameGrowth) this.text(ui.gameGrowth, 195, fieldY + fieldH * .70,
          11, '#FFD777', 'center', 'bold');
      } else {
        this.text('左右滑动篮子，接住小星星', 195, fieldY + fieldH * .60, 15, '#FFF9E7', 'center');
        this.text('每局 20 秒 · 星星越多奖励越多', 195, fieldY + fieldH * .69, 11, '#DCE8D8', 'center');
      }
      this.button('start_game', 93, fieldY + fieldH - 79, 204, 50,
        ui.gameResult ? '再玩一局  →' : '开始接星星  →', C.coral, '#FFF');
    }
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
    this.text(page[1], 195, y + 188, 12, C.brown, 'center');
    this.text(page[2], 195, y + 211, 11, C.muted, 'center');
    this.button('guide_next', 62, y + 244, 266, 45, step === 3 ? '开始陪伴' : '下一步', C.coral, '#FFF');
    this.button('guide_skip', 293, y + 11, 50, 29, '跳过', C.paper, C.muted, null, 11);
  }

  settings(state) {
    this.dim(); this.buttons = [];
    const y = this.h / 2 - 137;
    this.box(31, y, 328, 274, 24, C.paper);
    this.text('小屋设置', 58, y + 45, 21, C.ink, 'left', 'bold');
    this.button('settings_close', 304, y + 22, 33, 33, '×', '#F8EEE8', C.brown, null, 20);
    this.box(51, y + 78, 288, 65, 15, '#FFF7F0');
    this.text('音效', 68, y + 105, 15, C.ink, 'left', 'bold');
    this.text(state.soundEnabled ? '已开启' : '已关闭', 242, y + 105, 12, C.muted, 'right');
    this.button('sound_toggle', 260, y + 91, 65, 34, state.soundEnabled ? '关闭' : '开启',
      state.soundEnabled ? C.mint : C.coral, '#FFF', null, 11);
    this.text('游戏进度会保存在当前设备。', 58, y + 185, 12, C.brown);
    this.text('重新安装或清除数据后，存档无法恢复。', 58, y + 211, 11, C.muted);
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
    if (state.active && canDaily(state) && ui.page !== 'game') {
      this.button('daily', 255, 83, 113, 32, '✦ 每日礼物', C.paper, C.coral, null, 11);
    }
    this.toast(ui);
    if (state.active && ui.guideStep > 0) this.guide(ui.guideStep);
    if (ui.showSettings) this.settings(state);
  }

  hit(x, y) {
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      const b = this.buttons[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
    }
    return null;
  }
}
