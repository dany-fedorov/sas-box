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

### The problem

An API that sometimes returns a value and sometimes a Promise forces every
caller to sniff the result or to `await` it. Sniffing spreads
`instanceof Promise` checks through consumer code. Awaiting turns a value that
was available immediately into one that is not, and some consumers cannot
await at all. Node.js `'exit'` listeners
["must only perform synchronous operations"](https://nodejs.org/api/process.html#event-exit).
React's `useSyncExternalStore` calls `getSnapshot` during render and compares
[its return value with `Object.is`](https://react.dev/reference/react/useSyncExternalStore).
`Symbol.dispose`, constructors, and getters have no place to put an `await`.

Isaac Schlueter's
["don't release Zalgo"](https://blog.izs.me/2013/08/designing-apis-for-asynchrony/)
rule and Havoc Pennington's
[earlier post](https://blog.ometer.com/2011/07/24/callbacks-synchronous-and-asynchronous/)
say a callback "should be either always sync or always async, as a documented
part of the API contract". They do not say how to describe a producer that can
honestly offer both.

`sas-box` describes the producer's capability rather than one result. A box
carries up to two routes with fixed shapes: `sync()` is always synchronous and
`async()` always returns a native Promise. The consumer picks a route, and the
producer never changes shape between calls. Which routes exist is part of the
static type. `SasBox.Sync<T>` proves both routes, `SasBox.Async<T>` proves that
`sync` is absent, and `SasBox.Unknown<T>` defers the question to `hasSync()`
when the answer depends on runtime state, such as a cache being warm.

### What it buys

- **A compile-time claim that a synchronous route exists.** Effect's
  `runSync`, Zod's `parse`, and InversifyJS's `get` all discover "sync
  consumer, async value" at runtime and throw
  ([Effect](https://effect.website/docs/getting-started/running-effects/),
  [Zod](https://zod.dev/api),
  [Inversify](https://inversify.io/docs/api/container/)). A consumer that
  requires `SasBox.Sync<T>` rejects an async-only producer at the type level
  instead. The precedent is .NET, where `Lazy<T>` and
  [`AsyncLazy<T>`](https://devblogs.microsoft.com/pfxteam/asynclazyt/) are
  distinct types.
- **Sync-to-async adaptation without Zalgo.** `fromSync(fn).async()` calls
  `fn` synchronously and turns its return or throw into a settled Promise,
  which is what the standard
  [`Promise.try`](https://tc39.es/proposal-promise-try/) does. Direct
  `sync()` calls keep throwing synchronously, so neither route lies about when
  its error arrives.
- **Sync-first as a deliberate performance choice.** `resolveSyncFirst()`
  takes the sync route when it exists and the async route otherwise, always
  returning a Promise. Sass documents that its synchronous `compile` is
  ["almost twice as fast as compileAsync"](https://sass-lang.com/documentation/js-api/functions/compileasync/)
  because making evaluation asynchronous has a cost. A producer that has the
  value now should not be forced through the microtask queue.
- **Capability without policy.** The box does not memoize, share, or own
  anything. Dagger keeps caching in a separate
  [`Lazy<T>`](https://dagger.dev/api/latest/dagger/Lazy.html) type rather
  than in `Provider<T>`. A dependency injection scope or a cache decides
  lifetime here for the same reason.

### Where it fits in production

1. **Warm-cache fast paths.** Configuration, secrets, and feature flags are
   cached in memory and refreshed over the network. A `SasBox.Unknown<T>` lets
   a hot request path take the sync route when the cache is warm and lets
   startup code await `async()` when it is cold.
2. **Portable service graphs.** The same graph can read a schema with
   `readFileSync` on Node.js (`SasBox.Sync`) and with `fetch` in a browser
   (`SasBox.Async`). Wiring the browser producer into a slot that requires
   the sync route is a compile-time error.
3. **Synchronous consumers fed by an async-capable graph.** Process exit
   handlers, `Symbol.dispose`, and synchronous store snapshots need values
   that are available now. Requiring a sync-capable box turns "should be
   available by then" into a type.
4. **Plugin capability declarations.** A host that accepts third-party
   providers can type a slot as `SasBox.Sync<T>` where synchronous access is
   mandatory and as `SasBox.Unknown<T>` where either route is acceptable.
   Prettier 3 removed its synchronous API and users had to reach for the
   separate [`@prettier/sync`](https://github.com/prettier/prettier-synchronized)
   package. A declared capability makes that kind of loss visible before it
   ships.

### Prior art

| Pattern | What it establishes |
| --- | --- |
| [`Symbol.dispose` / `Symbol.asyncDispose`](https://tc39.es/proposal-explicit-resource-management/) and [`Symbol.iterator` / `Symbol.asyncIterator`](https://tc39.es/ecma262/#sec-getiterator) | One object, two capability slots. `await using` and `for await` look for the async slot and adapt the sync slot into a Promise when it is the only one present, which is the shape of `SasBox.Unknown`. |
| [`Promise.try`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/try) | Calls the function synchronously and settles a Promise from its return or throw. `fromSync(fn).async()` has the same semantics. |
| [`Atomics.waitAsync`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Atomics/waitAsync) | Returns `{ async: false, value }` or `{ async: true, value: Promise }`. The language reports whether a result was available synchronously instead of hiding it behind a union. |
| [`Effect.sync` / `Effect.promise`](https://effect.website/docs/getting-started/creating-effects/) and [`Effect.runSync`](https://effect.website/docs/getting-started/running-effects/) | Sync and async are distinct constructors; `runSync` throws when the effect "involves asynchronous work". |
| [InversifyJS `get` / `getAsync`](https://inversify.io/docs/api/container/) | A DI container with two resolution routes; a sync `get` of an async binding throws "Unexpected asynchronous service". |
| [dotnet/runtime#65656](https://github.com/dotnet/runtime/issues/65656) and the [.NET DI guidelines](https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection-guidelines) | Async resolution "isn't supported"; the open proposal asks for a distinct async return type because adding it later touches the whole pipeline. |
| [`Lazy<T>` vs `AsyncLazy<T>`](https://devblogs.microsoft.com/pfxteam/asynclazyt/) | Sync and async lazies are distinct types; the async one composes the sync one with a Task. |
| [Node.js `fs`](https://nodejs.org/api/fs.html), [`sass`](https://sass-lang.com/documentation/js-api/functions/compileasync/), [`glob`](https://github.com/isaacs/node-glob), [`execa`](https://github.com/sindresorhus/execa) | Dual sync/async APIs are the norm for libraries whose consumers include both kinds of callers. |
| [Rollup `MaybePromise<T>`](https://github.com/rollup/rollup/blob/master/src/rollup/types.d.ts), [Vitest `Awaitable<T>`](https://github.com/vitest-dev/vitest/blob/main/packages/utils/src/types.ts) | The lighter alternative: a union the consumer always awaits. Sufficient whenever no consumer needs the sync route. |

### Limits and non-goals

- If every consumer can await, a `Promise<T>` or a `T | Promise<T>` union with
  `await` is simpler, and it is what Rollup, Vite, Vitest, and Fastify do. The
  box only pays for itself when a consumer must prove or choose the
  synchronous route.
- Most DI containers avoid the problem by policy. Microsoft's guidelines say
  to "keep DI factories fast and synchronous", Autofac's maintainers
  [decline `ResolveAsync`](https://github.com/autofac/Autofac/issues/1215),
  Awilix says to
  [create the container when everything is ready](https://github.com/jeffijoe/awilix/issues/12),
  and NestJS
  [awaits async providers at bootstrap](https://docs.nestjs.com/fundamentals/async-providers).
  A bootstrap-only async phase makes this package unnecessary. Lazily
  acquired async services next to synchronous ones are what it exists for.
- `fromSync(fn).async()` duplicates `Promise.try(fn)` on runtimes that have
  it. The value of the box is the capability slots and the static variants,
  not that helper.
- The platform's fallback direction is async-first: `await using` tries
  `Symbol.asyncDispose` before `Symbol.dispose`. `resolveSyncFirst()`
  deliberately prefers sync for the performance reason above. Consumers that
  must never run work synchronously should call `async()` directly.
- A producer that already ships both a sync and an async function gains
  nothing from wrapping them. The box is for the consumer side of a boundary
  where the producer's capability is not otherwise visible in the type.

### Use with DI Bag

[DI Bag](https://github.com/dany-fedorov/di-bag) ships a structural adapter,
`fromSasBox(registration, { mode })`, on its `di-bag/sas-box` entry. The
adapter does not import this package; any object with the `sync`/`async`
shape works. The `mode` is mandatory and is checked against the producer's
static type:

```ts
import { readFileSync } from 'node:fs';
import { DiBag } from 'di-bag/node';
import { fromSasBox } from 'di-bag/sas-box';
import { SasBox } from 'sas-box';

type Settings = { port: number };

const settings = fromSasBox(
  () => SasBox.fromSync((): Settings => JSON.parse(readFileSync('settings.json', 'utf8'))),
  { mode: 'sync' }, // a SasBox.Async producer here is a compile-time error
);
const remote = fromSasBox(
  () => SasBox.fromAsync(async (): Promise<Settings> => (await fetch('/settings')).json()),
  { mode: 'sync-first' }, // Promise<Settings>; uses sync() when the box has one
);

const bag = DiBag.begin().add({ settings, remote }).end();
bag.resolve('settings').port; // number, no await
(await bag.resolve('remote')).port; // number
await bag.close();
```

`sync` keeps the raw synchronous result, including a returned Promise's
identity. `async` and `sync-first` await the box and return a native Promise.
The bag, not the box, memoizes the result per scope and owns cleanup when the
registration is wrapped with `DiBag.withDisposal`. See the
[DI Bag box adapter reference](https://github.com/dany-fedorov/di-bag/blob/main/docs/guides/api-reference.md#optional-box-adapters).
