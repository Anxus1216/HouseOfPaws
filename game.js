import Main from './js/main.js';
import { startGameWithPackages } from './js/startup.js';

startGameWithPackages({ platform: wx, canvas: GameGlobal.canvas, startGame: () => new Main() });
