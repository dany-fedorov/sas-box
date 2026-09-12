import { describe, expect, test } from 'bun:test';
import {
  SasBox,
  SasBoxAssertionError,
  SasBoxUnknown,
} from '../src/index';

class StructuralThenable implements PromiseLike<number> {
  then<TResult1 = number, TResult2 = never>(
    onfulfilled?: ((value: number) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(73).then(onfulfilled, onrejected);
  }
}

describe('sync acquisition capability', () => {
  test('returns an ordinary value through sync and async access', async () => {
    const box = SasBox.Unknown.fromSync(() => 42);

    expect(box.sync()).toBe(42);
    await expect(box.async()).resolves.toBe(42);
  });

  test('preserves a Promise-valued sync result and flattens async access', async () => {
    const promised = Promise.resolve(42);
    const box = SasBox.Unknown.fromSync(() => promised);

    expect(box.sync()).toBe(promised);
    await expect(box.async()).resolves.toBe(42);
    await expect(box.resolveSyncFirst()).resolves.toBe(42);
  });

  test('assimilates a structural thenable through async access', async () => {
    const box = SasBox.Unknown.fromSync(() => new StructuralThenable());

    await expect(box.async()).resolves.toBe(73);
  });

  test('keeps direct sync throws synchronous and rejects Promise-shaped access', async () => {
    const error = new Error('sync failed');
    const box = SasBox.Unknown.fromSync(() => {
      throw error;
    });

    expect(() => box.sync()).toThrow(error);
    await expect(box.async()).rejects.toBe(error);
    await expect(box.resolveSyncFirst()).rejects.toBe(error);
    await expect(box.getSyncFirstResolver()()).rejects.toBe(error);
  });

  test('forwards the supplied receiver to the selected sync callback', async () => {
    const box = new SasBox.Unknown(
      function (this: { value: number }) {
        return this.value;
      },
      async function (this: { value: number }) {
        return this.value + 1;
      },
    );

    await expect(box.resolveSyncFirst({ value: 18 })).resolves.toBe(18);
  });

  test('selects sync when a dual-capability box resolves sync-first', async () => {
    const box = new SasBox.Unknown(() => 'sync', async () => 'async');

    await expect(box.resolveSyncFirst()).resolves.toBe('sync');
  });

  test('does not memoize repeated acquisition', async () => {
    let acquisitions = 0;
    const box = SasBox.fromSync(() => ++acquisitions);

    expect(box.sync()).toBe(1);
    await expect(box.async()).resolves.toBe(2);
    await expect(box.resolveSyncFirst()).resolves.toBe(3);
  });
});

describe('async-only acquisition capability', () => {
  test('normalizes an explicitly throwing async callback into a rejection', async () => {
    const error = new Error('async failed');
    const box = new SasBox.Unknown<number>(undefined, () => {
      throw error;
    });

    await expect(box.async()).rejects.toBe(error);
    await expect(box.resolveSyncFirst()).rejects.toBe(error);
    await expect(box.getSyncFirstResolver()()).rejects.toBe(error);
  });

  test('forwards the supplied receiver to the selected async callback', async () => {
    const box = new SasBox.Unknown<number>(
      undefined,
      function (this: { value: number }) {
        return Promise.resolve(this.value);
      },
    );

    await expect(box.resolveSyncFirst({ value: 24 })).resolves.toBe(24);
  });

  test('throws the assertion error when sync acquisition is unavailable', () => {
    const box = SasBox.Unknown.fromAsync(async () => 42, 'remote-value');

    expect(() => box.assertHasSync()).toThrow(SasBoxAssertionError);
    expect(() => box.assertHasSync()).toThrow(
      'SasBox "remote-value" has no "sync" method.',
    );
  });

  test('fromAsync returns the concrete async-only alias', () => {
    const box = SasBox.fromAsync(async () => 42);

    expect(box).toBeInstanceOf(SasBox.Async);
    expect(box.hasSync()).toBe(false);
    expect(box.sync).toBeUndefined();
  });
});

test('namespace conveniences share the ordinary creation behavior', async () => {
  const syncBox = SasBox.fromSync(() => 41);
  const asyncBox = SasBox.fromAsync(async () => 42);
  const valueBox = SasBox.fromValue(43);

  expect(syncBox).toBeInstanceOf(SasBox.Sync);
  expect(asyncBox).toBeInstanceOf(SasBox.Async);
  expect(valueBox.sync()).toBe(43);
  await expect(syncBox.async()).resolves.toBe(41);
  await expect(asyncBox.async()).resolves.toBe(42);
});

test('named Unknown class remains directly constructible', async () => {
  const box = SasBoxUnknown.fromSync(() => 42);

  await expect(box.resolveSyncFirst()).resolves.toBe(42);
});
