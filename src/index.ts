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

export class SasBox<T> {
  static ANONYMOUS_SAS_BOX_ALIAS = '<<Anonymous SasBox>>';

  static fromSync<T>(sync: () => T, alias?: string): SasBoxSync<T> {
    return new SasBoxSync(sync, () => Promise.resolve(sync()), alias);
  }

  static fromAsync<T>(async: () => Promise<T>, alias?: string): SasBox<T> {
    return new SasBox(null, async, alias);
  }

  constructor(
    public readonly sync: (() => T) | null,
    public readonly async: () => Promise<T>,
    public readonly alias: string = SasBox.ANONYMOUS_SAS_BOX_ALIAS,
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

  getSasBoxSync(): ISasBoxSync<T> {
    this.assertHasSync();
    return {
      sync: this.sync!,
      async: this.async,
    };
  }

  getSasBoxAsync(): ISasBoxAsync<T> {
    return {
      async: this.async,
    };
  }
}

export class SasBoxSync<T> extends SasBox<T> implements ISasBoxSync<T> {
  declare sync: () => T;

  static ANONYMOUS_SAS_BOX_SYNC_ALIAS = '<<Anonymous SasBoxSync>>';

  constructor(
    sync: () => T,
    async: () => Promise<T>,
    alias: string = SasBoxSync.ANONYMOUS_SAS_BOX_SYNC_ALIAS,
  ) {
    super(sync, async, alias);
  }

  override hasSync(): true {
    return super.hasSync() as true;
  }
}
