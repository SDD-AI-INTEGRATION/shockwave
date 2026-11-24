import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { checkDependencies } from './check-dependencies.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'pmo-dependency-test-'));
  t.after(() => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(basename(root).startsWith('pmo-dependency-test-'));
    rmSync(root, { recursive: true, force: true });
  });
  const write = (file, data) => { const path = join(root, file); mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, JSON.stringify(data)); };
  const manifest = { dependencies: { example: '1.0.0' } };
  const entry = { version: '1.0.0', integrity: 'sha512-example' };
  write('package.json', manifest);
  write('package-lock.json', { packages: { '': manifest, 'node_modules/example': entry, 'node_modules/other-platform': { version: '1.0.0', optional: true } } });
  write('node_modules/.package-lock.json', { packages: { 'node_modules/example': entry } });
  write('node_modules/example/package.json', { version: '1.0.0' });
  return { root, write };
}
test('reuse a complete installation, allowing absent optional platform binaries', t => {
  const { root } = fixture(t); assert.equal(checkDependencies(root).ready, true);
});
test('reject a partial installation left behind by failed npm ci', t => {
  const { root } = fixture(t); rmSync(join(root, 'node_modules/.package-lock.json'));
  assert.equal(checkDependencies(root).ready, false);
});
test('reject a missing required package even with an installed lockfile', t => {
  const { root } = fixture(t); rmSync(join(root, 'node_modules/example/package.json'));
  assert.equal(checkDependencies(root).ready, false);
});
test('reject outdated package versions', t => {
  const { root, write } = fixture(t); write('node_modules/example/package.json', { version: '0.9.0' });
  assert.equal(checkDependencies(root).ready, false);
});
test('reject manifest changes not represented in the lockfile', t => {
  const { root, write } = fixture(t); write('package.json', { dependencies: { example: '2.0.0' } });
  assert.equal(checkDependencies(root).ready, false);
});
test('reject an installation recorded with different package integrity', t => {
  const { root, write } = fixture(t); write('node_modules/.package-lock.json', { packages: { 'node_modules/example': { version: '1.0.0', integrity: 'sha512-other' } } });
  assert.equal(checkDependencies(root).ready, false);
});
