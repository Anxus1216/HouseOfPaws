import { readViewport } from './viewport.js';

const canvas = wx.createCanvas();
GameGlobal.canvas = canvas;

const viewport = readViewport(wx, canvas);
if (viewport) {
  canvas.width = viewport.width;
  canvas.height = viewport.height;
}
GameGlobal.viewport = viewport;
