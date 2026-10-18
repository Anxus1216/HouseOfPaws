import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const generated = readFileSync(join(root, 'js', 'debug-config.generated.js'), 'utf8');
const project = JSON.parse(readFileSync(join(root, 'project.config.json'), 'utf8'));
const ignored = project.packOptions?.ignore?.some(item =>
  item.type === 'folder' && item.value === 'config');

if (!/^export const DEBUG_ENABLED = false;$/m.test(generated) || !ignored) {
  console.error('发布检查失败：调试入口未关闭，或本地配置未从代码包排除。');
  process.exitCode = 1;
} else {
  console.log('发布检查通过：调试入口关闭，本地配置未打包。');
}
