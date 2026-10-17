import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Scene from '../js/scene.js';

// Export the original Canvas character art as a legacy reference. Runtime
// gouache sprites are built by package-gouache-sprites.ps1 instead.
const require = createRequire(import.meta.url);
const sharp = require('sharp');

const esc = value => String(value).replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
const n = value => Number(value.toFixed(3));

class SvgContext {
  constructor() {
    this.items = [];
    this.path = [];
    this.shape = null;
    this.transform = '';
    this.stack = [];
    this.fillStyle = '#000';
    this.strokeStyle = '#000';
    this.lineWidth = 1;
    this.lineCap = 'butt';
    this.lineJoin = 'miter';
    this.font = '14px sans-serif';
    this.textAlign = 'left';
  }
  save() { this.stack.push({ transform: this.transform }); }
  restore() { this.transform = this.stack.pop().transform; }
  translate(x, y) { this.transform += ` translate(${n(x)} ${n(y)})`; }
  scale(x, y) { this.transform += ` scale(${n(x)} ${n(y)})`; }
  beginPath() { this.path = []; this.shape = null; }
  moveTo(x, y) { this.path.push(`M${n(x)} ${n(y)}`); }
  lineTo(x, y) { this.path.push(`L${n(x)} ${n(y)}`); }
  quadraticCurveTo(cx, cy, x, y) { this.path.push(`Q${n(cx)} ${n(cy)} ${n(x)} ${n(y)}`); }
  closePath() { this.path.push('Z'); }
  arc(x, y, radius) { this.shape = { tag: 'circle', attrs: `cx="${n(x)}" cy="${n(y)}" r="${n(radius)}"` }; }
  ellipse(x, y, rx, ry, rotation) {
    this.shape = { tag: 'ellipse', attrs: `cx="${n(x)}" cy="${n(y)}" rx="${n(rx)}" ry="${n(ry)}"`,
      rotation: rotation ? ` rotate(${n(rotation * 180 / Math.PI)} ${n(x)} ${n(y)})` : '' };
  }
  draw(fill) {
    const attrs = this.shape ? this.shape.attrs : `d="${this.path.join(' ')}"`;
    const tag = this.shape ? this.shape.tag : 'path';
    const transform = `${this.transform}${this.shape && this.shape.rotation || ''}`.trim();
    this.items.push(`<${tag} ${attrs} transform="${esc(transform)}" fill="${fill ? esc(this.fillStyle) : 'none'}" stroke="${fill ? 'none' : esc(this.strokeStyle)}" stroke-width="${n(this.lineWidth)}" stroke-linecap="${esc(this.lineCap)}" stroke-linejoin="${esc(this.lineJoin)}"/>`);
  }
  fill() { this.draw(true); }
  stroke() { this.draw(false); }
  fillText(value, x, y) {
    const size = Number((this.font.match(/(\d+)px/) || [0, 14])[1]);
    const anchor = this.textAlign === 'center' ? 'middle' : this.textAlign === 'right' ? 'end' : 'start';
    this.items.push(`<text x="${n(x)}" y="${n(y)}" transform="${esc(this.transform.trim())}" fill="${esc(this.fillStyle)}" font-size="${size}" font-family="sans-serif" font-weight="${this.font.includes('bold') ? 'bold' : 'normal'}" dominant-baseline="middle" text-anchor="${anchor}">${esc(value)}</text>`);
  }
  svg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="-130 -170 260 300" preserveAspectRatio="xMidYMid meet">${this.items.join('')}</svg>`;
  }
}

const out = join(process.cwd(), 'assets', 'pets', 'legacy-sprites');
mkdirSync(out, { recursive: true });
const states = [
  ['normal', 'normal', ''], ['happy', 'happy', ''],
  ['sleepy', 'sleepy', ''], ['need', 'need', ''],
  ['feed', 'happy', 'feed'], ['wash', 'happy', 'wash'],
  ['play', 'happy', 'play'], ['rest', 'sleepy', 'rest'],
];

for (const id of ['cat', 'rabbit', 'dog']) {
  for (const [name, expression, action] of states) {
    const ctx = new SvgContext();
    const scene = new Scene(ctx, { width: 512, height: 512 });
    scene.pet(id, 0, 0, 1, 0, expression, action);
    await sharp(Buffer.from(ctx.svg())).png().toFile(join(out, `pet_${id}_${name}.png`));
  }
}
