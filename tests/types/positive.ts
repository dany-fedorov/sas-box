import { SasBox } from '../../dist/index';

function makeUnknown<T>(
  sync: () => T,
  async: () => Promise<T>,
): SasBox.Unknown<T> {
  const box = new SasBox.Unknown(sync, async);
  const raw: T = box.sync!();
  const awaited: Promise<Awaited<T>> = box.async();
  void raw;
  void awaited;
  return box;
}

function makeAsyncOnlyUnknown<T>(async: () => Promise<T>): SasBox.Unknown<T> {
  return new SasBox.Unknown(undefined, async);
}

function adaptSync<T>(sync: () => T): SasBox.Sync<T> {
  const box = new SasBox.Sync(sync, async () => sync());
  const raw: T = box.sync();
  const awaited: Promise<Awaited<T>> = box.async();
  void raw;
  void awaited;
  return box;
}

class StructuralThenable implements PromiseLike<number> {
  then<TResult1 = number, TResult2 = never>(
    onfulfilled?: ((value: number) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(73).then(onfulfilled, onrejected);
  }
}

const box = SasBox.Unknown.fromSync(() => Promise.resolve(42));
const raw: Promise<number> = box.sync();
const awaited: Promise<number> = box.async();
const syncFirst: Promise<number> = box.resolveSyncFirst();
const resolverResult: Promise<number> = box.getSyncFirstResolver()();
const asyncOnly = SasBox.Unknown.fromAsync(async () => 42);
const definitelyAsync: SasBox.Async<number> = asyncOnly;

const namespaceSync: SasBox.Sync<number> = SasBox.fromSync(() => 42);
const namespaceAsync: SasBox.Async<number> = SasBox.fromAsync(async () => 42);
const namespaceValue: SasBox.Sync<number> = SasBox.fromValue(42);

const genericUnknown: SasBox.Unknown<number> = makeUnknown(
  () => 42,
  async () => 42,
);
const genericAsyncOnly: SasBox.Unknown<number> = makeAsyncOnlyUnknown(
  async () => 42,
);
const genericSync: SasBox.Sync<number> = adaptSync(() => 42);

const promisedSync = new SasBox.Unknown(
  () => Promise.resolve(42),
  async () => 42,
);
const promisedSyncRaw: Promise<number> = promisedSync.sync!();
const promisedSyncAwaited: Promise<number> = promisedSync.async();

const thenableSync = new SasBox.Sync(
  () => new StructuralThenable(),
  async () => 73,
);
const thenableSyncRaw: PromiseLike<number> = thenableSync.sync();
const thenableSyncAwaited: Promise<number> = thenableSync.async();

void raw;
void awaited;
void syncFirst;
void resolverResult;
void definitelyAsync;
void namespaceSync;
void namespaceAsync;
void namespaceValue;
void genericUnknown;
void genericAsyncOnly;
void genericSync;
void promisedSyncRaw;
void promisedSyncAwaited;
void thenableSyncRaw;
void thenableSyncAwaited;
