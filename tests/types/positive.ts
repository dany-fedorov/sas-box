import { SasBox } from '../../dist/index';

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

void raw;
void awaited;
void syncFirst;
void resolverResult;
void definitelyAsync;
void namespaceSync;
void namespaceAsync;
void namespaceValue;
