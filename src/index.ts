export type ISasBoxSync<T> = {
  sync: () => T;
  async: () => Promise<T>;
};

export type ISasBoxAsync<T> = {
  sync?: never;
  async: () => Promise<T>;
};

export type ISasBox<T> = ISasBoxSync<T> | ISasBoxAsync<T>;

export class SasBoxAssertionError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class SasBoxAsync<T> {
  static ANONYMOUS_ALIAS = '<<Anonymous SasBox.Async>>';

  static fromSync<T>(sync: () => T, alias?: string): SasBoxSync<T> {
    return new SasBoxSync(sync, () => Promise.resolve(sync()), alias);
  }

  static fromAsync<T>(async: () => Promise<T>, alias?: string): SasBoxAsync<T> {
    return new SasBoxAsync(null, async, alias);
  }

  constructor(
    public readonly sync: (() => T) | null,
    public readonly async: () => Promise<T>,
    public readonly alias: string = SasBoxAsync.ANONYMOUS_ALIAS,
  ) {}

  hasSync(): boolean {
    return typeof this.sync === 'function';
  }

  resolveSyncFirst(thisArg: any = null): Promise<T> {
    return this.getSyncFirstResolver(thisArg)();
  }

  getSyncFirstResolver(thisArg: any = null): () => Promise<T> {
    const syncHere = this.sync;
    const asyncHere = this.async;
    return function sasBoxSyncFirstResolver() {
      if (syncHere !== null) {
        return Promise.resolve(syncHere.call(thisArg));
      }
      return asyncHere.call(thisArg);
    };
  }

  assertHasSync(): SasBoxSync<T> {
    if (!this.hasSync()) {
      throw new SasBoxAssertionError(
        `SasBox#assertHasSync: SasBox "${this.alias}" has no "sync" method.`,
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

export class SasBoxSync<T> extends SasBoxAsync<T> implements ISasBoxSync<T> {
  declare sync: () => T;

  static override ANONYMOUS_ALIAS = '<<Anonymous SasBox.Sync>>';

  static override fromAsync: never;

  constructor(
    sync: () => T,
    async: () => Promise<T>,
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
  export const Sync = SasBoxSync;
  export type Sync<T> = SasBoxSync<T>;

  export const Async = SasBoxAsync;
  export type Async<T> = SasBoxAsync<T>;
}
