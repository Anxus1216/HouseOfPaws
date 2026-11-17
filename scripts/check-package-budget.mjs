import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAIN_BUDGET_BYTES = 3.5 * 1024 * 1024;
export const TOTAL_BUDGET_BYTES = 30 * 1024 * 1024;
export const NON_RUNTIME_FOLDERS = ['tmp'];
const UPLOAD_EXTENSIONS = new Set(('png jpg jpeg gif svg js json cer obj dae fbx mtl stl 3ds mp3 pvr wav plist ttf fnt gz ccz m4a mp4 bmp atlas swf ani part proto bin sk mipmaps txt zip tt map ogg silk dbbin dbmv etc lmat lm ls lh lani lav lsani ltc aac astc br csv cur dat dds glb gltf ico ktx lmani lml pkm prefab scene skel wasm xml').split(' '));
const PETS = ['cat', 'rabbit', 'dog'];
const PET_STATES = ['normal', 'happy', 'sleepy', 'need', 'feed', 'wash', 'play', 'rest'];
const SFX = ['adopt', 'care', 'care_feed', 'care_wash', 'care_play', 'care_rest', 'catch_a', 'catch_b',
  'catch_c', 'daily_gift', 'drawer_close', 'drawer_open', 'game_end', 'game_end_quiet', 'game_pause',
  'game_resume', 'game_start', 'game_time_low', 'level', 'pet_select', 'pet_tap', 'soft_block', 'task_claim'];
export const REQUIRED_PACKAGES = [
  { name: 'petSprites', root: 'assets/pets/sprites', files: PETS.flatMap(pet =>
    PET_STATES.map(state => `pet_${pet}_${state}.png`)) },
  { name: 'gameAudio', root: 'audio', files: [
    ...['home', 'night', 'stars'].map(name => `bgm/bgm_${name}.mp3`),
    ...SFX.map(name => `sfx/${name}.wav`),
  ] },
];

function relativePath(value) {
  if (typeof value !== 'string' || !value || /(^[/\\]|^[a-z]:)/i.test(value)) throw new Error('路径必须为项目内相对路径');
  const path = value.replaceAll('\\', '/').replace(/\/$/, '');
  if (path.split('/').some(part => part === '..' || part === '.' || !part)) throw new Error(`无效相对路径：${value}`);
  return path;
}

function ruleMatcher(rule) {
  if (!rule || typeof rule.value !== 'string') throw new Error('无效 packOptions 规则');
  if (rule.type === 'regexp') { const pattern = new RegExp(rule.value); return path => pattern.test(path); }
  const value = relativePath(rule.value);
  if (rule.type === 'file') return path => path === value;
  if (rule.type === 'folder') return path => path === value || path.startsWith(`${value}/`);
  if (rule.type === 'prefix') return path => path.startsWith(value);
  if (rule.type === 'suffix') return path => path.endsWith(value);
  throw new Error(`不支持的 packOptions 规则类型：${rule.type}`);
}

export function inspectPackageBudget({ root, mainBudgetBytes = MAIN_BUDGET_BYTES,
  totalBudgetBytes = TOTAL_BUDGET_BYTES } = {}) {
  const projectRoot = resolve(root);
  const config = JSON.parse(readFileSync(join(projectRoot, 'project.config.json'), 'utf8'));
  const game = JSON.parse(readFileSync(join(projectRoot, 'game.json'), 'utf8'));
  const ignored = (config.packOptions?.ignore || []).map(ruleMatcher);
  const included = (config.packOptions?.include || []).map(ruleMatcher);
  const isExcluded = path => ignored.some(match => match(path)) && !included.some(match => match(path));
  const errors = [];
  for (const folder of NON_RUNTIME_FOLDERS) {
    if (!isExcluded(`${folder}/__package_probe__.js`)) errors.push(`本地工具目录必须从打包排除：${folder}`);
  }
  const packages = (game.subpackages || []).map(item => ({ name: item.name, root: relativePath(item.root), bytes: 0, files: 0 }));
  const names = new Set();
  for (const pack of packages) {
    if (!pack.name || names.has(pack.name)) errors.push(`分包名称缺失或重复：${pack.name}`);
    names.add(pack.name);
    for (const other of packages) if (pack !== other &&
      (pack.root === other.root || pack.root.startsWith(`${other.root}/`))) errors.push(`分包根重叠：${pack.root} / ${other.root}`);
    const entry = `${pack.root}/game.js`;
    try {
      if (!lstatSync(join(projectRoot, entry)).isFile() || isExcluded(entry)) errors.push(`分包入口不可打包：${entry}`);
    } catch (error) { errors.push(`分包入口不存在：${entry}`); }
    if (included.some(match => match(pack.root) || match(entry))) errors.push(`请移除分包根的强制 include：${pack.root}`);
  }
  for (const expected of REQUIRED_PACKAGES) {
    if (!packages.some(pack => pack.name === expected.name && pack.root === expected.root)) errors.push(`缺少预期分包：${expected.name} (${expected.root})`);
    for (const file of expected.files) {
      const path = `${expected.root}/${file}`;
      try {
        const stat = lstatSync(join(projectRoot, path));
        if (!stat.isFile() || !stat.size || isExcluded(path)) errors.push(`必需资源不可打包：${path}`);
      } catch (error) { errors.push(`必需资源不存在：${path}`); }
    }
  }
  const main = { name: 'main', bytes: 0, files: 0 };
  const unclassified = [];
  function visit(directory, prefix = '') {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) { errors.push(`不统计指向未知目标的链接：${path}`); continue; }
      if (entry.isDirectory()) {
        // A whole ignored folder can be skipped only when no include can override it.
        if (!included.length && isExcluded(path)) continue;
        visit(join(directory, entry.name), path);
      } else if (entry.isFile()) {
        const extension = entry.name.split('.').at(-1).toLowerCase();
        if (!UPLOAD_EXTENSIONS.has(extension) || isExcluded(path)) continue;
        if (NON_RUNTIME_FOLDERS.some(folder => path.startsWith(`${folder}/`))) errors.push(`本地工具文件被重新纳入打包：${path}`);
        const pack = packages.find(pack => path.startsWith(`${pack.root}/`)) || main;
        pack.bytes += lstatSync(join(projectRoot, path)).size;
        pack.files++;
        if (pack === main && !/^(js\/|assets\/|game\.js$|game\.json$|project\.(?:private\.)?config\.json$|package\.json$|\.eslintrc\.js$)/.test(path)) unclassified.push(path);
      }
    }
  }
  visit(projectRoot);
  const totalBytes = main.bytes + packages.reduce((sum, pack) => sum + pack.bytes, 0);
  if (main.bytes > mainBudgetBytes) errors.push(`主包原始预算超限：${main.bytes} > ${mainBudgetBytes} B`);
  if (totalBytes > totalBudgetBytes) errors.push(`总包原始预算超限：${totalBytes} > ${totalBudgetBytes} B`);
  return { main, packages, totalBytes, unclassified, errors };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = inspectPackageBudget({ root: dirname(dirname(fileURLToPath(import.meta.url))) });
    console.log('包体预算（磁盘原始字节，含保守计入的工具配置；微信实际包体以开发者工具为准）');
    for (const pack of [report.main, ...report.packages]) console.log(`${pack.name}: ${pack.bytes} B / ${(pack.bytes / 1024 / 1024).toFixed(3)} MiB / ${pack.files} files`);
    console.log(`total: ${report.totalBytes} B / ${(report.totalBytes / 1024 / 1024).toFixed(3)} MiB`);
    if (report.unclassified.length) console.warn('已保守计入主包的其他文件：', report.unclassified.join(', '));
    if (report.errors.length) { for (const error of report.errors) console.error(error); process.exitCode = 1; }
  } catch (error) { console.error(`包体检查失败：${error.message}`); process.exitCode = 1; }
}
