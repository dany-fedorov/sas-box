# sas-box

`sas-box` represents whether a value can be acquired synchronously, only
asynchronously, or through either capability. It does not cache acquisitions or
own acquired resources.

See [Why sas-box exists](#why-sas-box-exists) for the problem it solves,
production uses, prior art, and its limits.

## Installation

```sh
npm install sas-box
```

## Usage

```ts
import { SasBox } from 'sas-box';

const configured = SasBox.fromValue({ port: 3000 });
configured.sync(); // { port: 3000 }

const generated = SasBox.fromSync(() => 42);
generated.sync(); // 42
await generated.async(); // 42

const remote = SasBox.fromAsync(async () => 42);
await remote.async(); // 42
remote.sync; // undefined: this box is known to be async-only
```

The legacy class entry points remain available as `SasBox.Unknown.fromSync`
and `SasBox.Unknown.fromAsync`. Named exports `SasBoxUnknown`, `SasBoxSync`,
and `SasBoxAsync`, plus the `SasBox.Unknown`, `SasBox.Sync`, and `SasBox.Async`
aliases, are preserved.

## Promise-valued sync results

A sync callback's exact return type is preserved by `.sync()`. If the callback
returns a Promise or structural thenable, `.async()` and `resolveSyncFirst()`
assimilate it using normal Promise behavior:

```ts
const box = SasBox.fromSync(() => Promise.resolve(42));

const raw: Promise<number> = box.sync();
const flattened: Promise<number> = box.async();
```

Throws from direct `.sync()` calls remain synchronous. Throws from callbacks
invoked through `.async()` or `resolveSyncFirst()` become rejected promises.
`resolveSyncFirst(receiver)` selects the sync callback when one exists and
forwards `receiver` as the selected callback's `this` value.

## Capability checks

Use `hasSync()` to inspect an unknown box and `assertHasSync()` when the absence
of synchronous acquisition is an error. `getAsSasBoxSync()` and
`getAsSasBoxAsync()` expose structural capability views.

Each access is an acquisition attempt. Repeated calls may invoke the callback
repeatedly; `sas-box` performs no implicit memoization. Consumers that need
caching, sharing, lifetimes, disposal, or resource ownership must implement
those policies outside the box.

## Why sas-box exists

**The useful pattern is an explicit sync/async provider capability.** It earns
its place when independently written producers must serve both synchronous
and asynchronous hosts. Ordinary application factories rarely need it: DI Bag
already accepts synchronous factories and Promise-returning factories directly.

A return type such as `T | Promise<T>` describes the result of calling a
function. A box describes which acquisition routes are available **before
calling it**. That matters when invoking an unsuitable plugin could already
start I/O or other side effects. `SasBox.Sync<Settings>` lets a synchronous
host require a route returning `Settings`; `SasBox.Unknown<Settings>` lets an
async host accept either kind of producer.

The guarantee is about the declared callback return type. A
`SasBox.Sync<Promise<Settings>>` is legal and returns a Promise synchronously;
it does not prove that the eventual settings are ready. `hasSync()` is a
boolean check; use `assertHasSync()` for a narrowed capability. Neither checks
freshness, prevents exceptions, or makes an async-only operation synchronous.

### Production precedents

These are established uses of the pattern, not evidence that these projects
use `sas-box` itself. Sources were checked on 2026-09-10.

| Example | Relevant pattern and difference |
| --- | --- |
| [gensync](https://github.com/loganfsmyth/gensync) and [Babel's transform implementation](https://github.com/babel/babel/blob/main/packages/babel-core/src/transform.ts) | Babel runs shared transformation logic through sync and async entry points. gensync accepts separate implementations and supplies execution helpers. This is the closest architectural precedent; sas-box only describes and selects a zero-argument acquisition, without a generator runner or combinators. |
| [Sass importer types](https://sass-lang.com/documentation/js-api/interfaces/importer/) | `Importer<'sync'>` works in synchronous and asynchronous compilation; `Importer<'async'>` requires asynchronous compilation. This directly supports declaring plugin capabilities in types. |
| [InversifyJS `get` / `getAsync`](https://inversify.io/docs/api/container/) | Synchronous resolution requires synchronous bindings. sas-box can express the producer capability at a boundary; DI Bag's ordinary factory return types already express the distinction inside its graph. |
| [ECMAScript `Promise.try`](https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-promise.try) | Calling a callback immediately and turning either its return or throw into a Promise is a standard operation. `fromSync(fn).async()` packages that adaptation beside the original callback. |

### Where it fits with DI Bag

1. **Build-tool or plugin hosts with two execution modes.** A config loader,
   compiler input, or schema provider can expose both routes. A synchronous CLI
   or build hook requires `SasBox.Sync<T>`; a server host selects the async route
   so a genuinely asynchronous implementation can avoid blocking I/O. The host
   owns that choice, and the plugin need not depend on DI Bag.
2. **Interchangeable local and remote implementations.** A bundled schema can
   use `fromValue`; a remote schema can use `fromAsync`. A host with a stable
   Promise-based service contract accepts both. This helps when several plugins
   share the protocol; a single local factory is usually simpler unboxed.
3. **A captured cache result with an explicit fallback.** A producer can create
   a box whose sync callback closes over a cached value, or whose `sync` field
   is `undefined` on a miss. This requires a new box for a new capability state:
   a cold box does not gain `sync` after `async()` completes. TTLs, refresh,
   deduplication, and the decision to accept stale data belong to the producer.
   If all callers can await, an ordinary cache loader is enough.

The adapter is structural and adds no runtime dependency on `sas-box`:

```ts
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { DiBag } from 'di-bag/node';
import { fromSasBox } from 'di-bag/sas-box';
import { SasBox } from 'sas-box';

// A plugin exposes both implementations; it need not know about DI Bag.
const fileSource = new SasBox.Sync(
  () => readFileSync('settings.json', 'utf8'),
  () => readFile('settings.json', 'utf8'),
  'settings-file',
);

// The host chooses the route at composition time.
const bag = DiBag.begin().add({
  cliSettings: fromSasBox(() => fileSource, { mode: 'sync' }),
  serverSettings: fromSasBox(() => fileSource, { mode: 'async' }),
}).end();

const cliText: string = bag.resolve('cliSettings');
const serverText: string = await bag.resolve('serverSettings');
await bag.close();
```

This example expects a `settings.json` file. An async-only box cannot replace
`fileSource` in the `mode: 'sync'` registration without a type error.

| Adapter mode | Contract |
| --- | --- |
| `sync` | The source must immediately expose `sync()`. Its raw result is preserved, including a Promise if that is what it returns. |
| `async` | Await the source box, call `async()`, and return a native Promise of the awaited result. |
| `sync-first` | Await the source box, prefer callable `sync`, otherwise call `async`; the result is still a native Promise. |

The bag applies its configured lifetime to the adapted result; the default
shares an acquisition within the bag. The box itself never memoizes, and
separate registrations do not automatically share an acquisition. Adapters
preserve existing ownership but add none: `withDisposal` around the source owns
the source box, while `withDisposal` around the adapted provider owns that stage’s acquired
value (the fulfilled payload for normal Promise acquisition). See the [box adapter guide](https://github.com/dany-fedorov/di-bag/blob/main/docs/guides/tutorial.md#optional-box-adapters).

### When it is unnecessary or misleading

- **Ordinary DI wiring:** use `() => T` or `() => Promise<T>` directly. When all
  callers can await, `() => T | PromiseLike<T>` also suffices. If asynchronous
  work only happens at startup, resolve it before building the graph; a box
  does not improve a value that is already available.
- **One integration:** a small `{ sync, async }` object or a direct
  `DiBag.mapSync` / `mapAsync` projection may be enough. The package earns its
  dependency through shared constructors, capability views, and consistent
  error normalization across producers, not through exclusive functionality.
- **Nonblocking execution:** `fromSync(fn).async()` invokes `fn` immediately
  and wraps its completion. It cannot move blocking work off the event loop.
- **A universal fast path:** `resolveSyncFirst()` and DI Bag's `sync-first`
  return Promises; they do not preserve a synchronous consumer path or eliminate
  awaiting. Choosing a cheaper implementation can help, but measure it. Sass
  itself documents different preferences for [`sass` and `sass-embedded`](https://sass-lang.com/documentation/js-api/#speed).
- **A lifecycle or readiness abstraction:** the box offers no caching,
  cancellation, retries, disposal, reactive updates, or startup barrier. A sync
  callback can still fail, and the two implementations must honor the same
  application-level contract.

**Assessment:** there is a defensible niche for a small capability wrapper at
reusable plugin boundaries. There is little additional value in wrapping every
DI Bag registration. Keep the protocol small and introduce it where consumers
actually need to choose or require an acquisition mode.
