import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectPackageBudget, REQUIRED_PACKAGES } from '../scripts/check-package-budget.mjs';

function fixture(t, config = {}) {
  const root = mkdtempSync(join(tmpdir(), 'paw-package-budget-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (path, value) => {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), value);
  };
  put('project.config.json', JSON.stringify(config));
  put('game.json', JSON.stringify({ subpackages: REQUIRED_PACKAGES.map(({ name, root }) => ({ name, root: `${root}/` })) }));
  put('game.js', 'startup();');
  for (const pack of REQUIRED_PACKAGES) {
    put(`${pack.root}/game.js`, '// resource entry');
    for (const file of pack.files) put(`${pack.root}/${file}`, Buffer.alloc(10));
  }
  return { root, put, report: options => inspectPackageBudget({ root, ...options }) };
}

test('counts actual package ownership, excludes drafts, and reports new main files rather than dropping them', t => {
  const f = fixture(t, { packOptions: { ignore: [{ type: 'folder', value: 'docs' }] } });
  f.put('docs/huge.png', Buffer.alloc(100_000));
  f.put('future/new.png', Buffer.alloc(37));
  const report = f.report();
  assert.deepEqual(report.errors, []);
  assert.equal(report.packages.find(p => p.name === 'petSprites').files, 25);
  assert.equal(report.packages.find(p => p.name === 'gameAudio').files, 27);
  assert.deepEqual(report.unclassified, ['future/new.png']);
  assert.equal(report.totalBytes, report.main.bytes + report.packages.reduce((sum, pack) => sum + pack.bytes, 0));
  assert.ok(report.main.bytes < 100_000);
});

test('missing entry, required image and overlapping roots block the budget check', t => {
  const f = fixture(t);
  rmSync(join(f.root, 'audio/game.js'));
  rmSync(join(f.root, 'assets/pets/sprites/pet_cat_feed.png'));
  f.put('game.json', JSON.stringify({ subpackages: [
    { name: 'petSprites', root: 'assets/pets/sprites/' }, { name: 'gameAudio', root: 'audio/' },
    { name: 'nested', root: 'audio/bgm/' },
  ] }));
  const errors = f.report().errors.join('\n');
  assert.match(errors, /audio\/game.js/);
  assert.match(errors, /pet_cat_feed.png/);
  assert.match(errors, /分包根重叠/);
});

test('ignored runtime resources and forced subpackage includes are rejected', t => {
  const f = fixture(t, { packOptions: { ignore: [{ type: 'file', value: 'audio/sfx/adopt.wav' }],
    include: [{ type: 'folder', value: 'assets/pets/sprites' }] } });
  const errors = f.report().errors.join('\n');
  assert.match(errors, /必需资源不可打包.*adopt.wav/);
  assert.match(errors, /强制 include/);
});

test('main and total raw budgets fail independently', t => {
  const f = fixture(t);
  const report = f.report({ mainBudgetBytes: 1, totalBudgetBytes: 1 });
  assert.match(report.errors.join('\n'), /主包原始预算超限/);
  assert.match(report.errors.join('\n'), /总包原始预算超限/);
});

test('unsupported rules and escaped package roots are explicit failures', t => {
  const f = fixture(t, { packOptions: { ignore: [{ type: 'unknown', value: 'docs' }] } });
  assert.throws(() => f.report(), /不支持/);
  f.put('project.config.json', '{}');
  f.put('game.json', JSON.stringify({ subpackages: [{ name: 'outside', root: '../outside' }] }));
  assert.throws(() => f.report(), /无效相对路径/);
});

test('the real workspace has two complete packages and stays within the conservative budget', () => {
  const report = inspectPackageBudget({ root: fileURLToPath(new URL('..', import.meta.url)) });
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.packages.map(p => p.name), ['petSprites', 'gameAudio']);
});
