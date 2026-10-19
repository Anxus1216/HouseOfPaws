import { readViewport } from './viewport.js';
import { canvasBacking } from './canvas-resolution.js';

const canvas = wx.createCanvas();
GameGlobal.canvas = canvas;

const viewport = readViewport(wx, canvas);
if (viewport) {
  const backing = canvasBacking(viewport);
  canvas.width = backing.width;
  canvas.height = backing.height;
}
GameGlobal.viewport = viewport;
