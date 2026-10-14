const canvas = wx.createCanvas();
GameGlobal.canvas = canvas;

const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();

canvas.width = windowInfo.windowWidth || windowInfo.screenWidth;
canvas.height = windowInfo.windowHeight || windowInfo.screenHeight;

export const SCREEN_WIDTH = windowInfo.screenWidth;
export const SCREEN_HEIGHT = windowInfo.screenHeight;
