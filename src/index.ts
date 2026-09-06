export type ISasBoxSync<T> = {
  sync: () => T;
  async: () => Promise<Awaited<T>>;
};

export type ISasBoxAsync<T> = {
  sync?: never | undefined;
  async: () => Promise<Awaited<T>>;
};

export type ISasBox<T> = ISasBoxSync<T> | ISasBoxAsync<T>;

export class SasBoxAssertionError extends Error {
  constructor(message: string) {
    super(message);
  }
}

function invokeAsPromise<T>(
  callback: () => T,
  thisArg: unknown,
): Promise<Awaited<T>> {
  try {
    return Promise.resolve(callback.call(thisArg));
  } catch (error) {
    return Promise.reject(error);
  }
}

export class SasBoxUnknown<T> {
  static ANONYMOUS_ALIAS = '<<Anonymous SasBox.Unknown>>';

  static fromSync<T>(sync: () => T, alias?: string): SasBoxSync<T> {
    return new SasBoxSync(sync, () => invokeAsPromise(sync, undefined), alias);
  }

  static fromAsync<T>(
    async: () => PromiseLike<T>,
    alias?: string,
  ): SasBoxAsync<Awaited<T>> {
    return new SasBoxAsync<Awaited<T>>(
      function normalizedFromAsync(this: unknown) {
        return invokeAsPromise(async, this);
      },
      alias,
    );
  }

  public readonly sync: (() => T) | undefined;

  public readonly async: () => Promise<Awaited<T>>;

  constructor(
    sync: (() => T) | undefined,
    async: () => PromiseLike<Awaited<T>>,
    public readonly alias: string = SasBoxUnknown.ANONYMOUS_ALIAS,
  ) {
    this.sync = sync;
    this.async = function normalizedAsync(this: unknown) {
      return invokeAsPromise(async, this);
    };
  }

  hasSync(): boolean {
    return typeof this.sync === 'function';
  }

  resolveSyncFirst(thisArg: unknown = null): Promise<Awaited<T>> {
    return this.getSyncFirstResolver(thisArg)();
  }

  getSyncFirstResolver(thisArg: unknown = null): () => Promise<Awaited<T>> {
    const syncHere = this.sync;
    const asyncHere = this.async;
    return function sasBoxSyncFirstResolver() {
      if (syncHere !== undefined) {
        return invokeAsPromise(syncHere, thisArg);
      }
      return invokeAsPromise(asyncHere, thisArg);
    };
  }

  assertHasSync(): SasBoxSync<T> {
    if (!this.hasSync()) {
      throw new SasBoxAssertionError(
        `${this.constructor.name}#assertHasSync: SasBox "${this.alias}" has no "sync" method.`,
      );
    }
    return this as SasBoxSync<T>;
  }

  getAsSasBoxSync(): ISasBoxSync<T> {
    this.assertHasSync();
    return {
      sync: this.sync!,
      async: this.async,
    };
  }

  getAsSasBoxAsync(): ISasBoxAsync<T> {
    return {
      async: this.async,
    };
  }
}

export class SasBoxAsync<T>
  extends SasBoxUnknown<T>
  implements ISasBoxAsync<T>
{
  override sync = undefined;

  static override ANONYMOUS_ALIAS = '<<Anonymous SasBox.Async>>';

  static override fromAsync: never;

  constructor(
    async: () => PromiseLike<T>,
    alias: string = SasBoxAsync.ANONYMOUS_ALIAS,
  ) {
    super(
      undefined,
      function normalizedAsyncConstructor(this: unknown) {
        return invokeAsPromise(async, this);
      },
      alias,
    );
  }

  override hasSync(): false {
    return super.hasSync() as false;
  }

  override assertHasSync(): never {
    return super.assertHasSync() as never;
  }
}

export class SasBoxSync<T> extends SasBoxUnknown<T> implements ISasBoxSync<T> {
  declare sync: () => T;

  static override ANONYMOUS_ALIAS = '<<Anonymous SasBox.Sync>>';

  static override fromAsync: never;

  constructor(
    sync: () => T,
    async: () => PromiseLike<Awaited<T>>,
    alias: string = SasBoxSync.ANONYMOUS_ALIAS,
  ) {
    super(sync, async, alias);
  }

  override hasSync(): true {
    return super.hasSync() as true;
  }

  override assertHasSync(): this {
    return super.assertHasSync() as this;
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace SasBox {
  export const Unknown = SasBoxUnknown;
  export type Unknown<T> = SasBoxUnknown<T>;

  export const Async = SasBoxAsync;
  export type Async<T> = SasBoxAsync<T>;

  export const Sync = SasBoxSync;
  export type Sync<T> = SasBoxSync<T>;

  export function fromSync<T>(sync: () => T, alias?: string): SasBoxSync<T> {
    return SasBoxUnknown.fromSync(sync, alias);
  }

  export function fromAsync<T>(
    async: () => PromiseLike<T>,
    alias?: string,
  ): SasBoxAsync<Awaited<T>> {
    return SasBoxUnknown.fromAsync(async, alias);
  }

  export function fromValue<T>(value: T, alias?: string): SasBoxSync<T> {
    return SasBoxUnknown.fromSync(() => value, alias);
  }
}
