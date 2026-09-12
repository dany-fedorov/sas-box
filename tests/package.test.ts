import { beforeAll, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const packageRoot = resolve(__dirname, '..');

beforeAll(() => {
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: packageRoot,
    encoding: 'utf8',
  });

  if (build.error) {
    throw build.error;
  }
  if (build.status !== 0) {
    throw new Error(`Package build failed:\n${build.stdout}\n${build.stderr}`);
  }
});

test('Node CommonJS consumes fulfilled values and normalized errors from the public entry', () => {
  const script = String.raw`
    const { SasBox } = require('sas-box');

    (async () => {
      const fulfilled = await SasBox.fromSync(() => Promise.resolve(42)).async();
      const expected = new Error('cjs callback failed');
      const rejection = SasBox.fromSync(() => { throw expected; }).async();
      let identical = false;
      try {
        await rejection;
      } catch (error) {
        identical = error === expected;
      }
      if (fulfilled !== 42 || !identical) process.exitCode = 1;
      else console.log('cjs-ok');
    })();
  `;
  const consumer = spawnSync('node', ['--eval', script], {
    cwd: packageRoot,
    encoding: 'utf8',
  });

  if (consumer.error) {
    throw consumer.error;
  }
  expect(consumer.stderr).toBe('');
  expect(consumer.status).toBe(0);
  expect(consumer.stdout.trim()).toBe('cjs-ok');
});

test('Node ESM consumes named exports, fulfilled values, and normalized errors from the public entry', () => {
  const script = String.raw`
    import { SasBox } from 'sas-box';

    const fulfilled = await SasBox.fromAsync(async () => 42).async();
    const expected = new Error('esm callback failed');
    const box = new SasBox.Unknown(undefined, () => { throw expected; });
    let identical = false;
    try {
      await box.resolveSyncFirst();
    } catch (error) {
      identical = error === expected;
    }
    if (fulfilled !== 42 || !identical) process.exitCode = 1;
    else console.log('esm-ok');
  `;
  const consumer = spawnSync(
    'node',
    ['--input-type=module', '--eval', script],
    { cwd: packageRoot, encoding: 'utf8' },
  );

  if (consumer.error) {
    throw consumer.error;
  }
  expect(consumer.stderr).toBe('');
  expect(consumer.status).toBe(0);
  expect(consumer.stdout.trim()).toBe('esm-ok');
});
