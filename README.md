# sas-box

Declare how an agent host can acquire a tool's inputs before running its provider.

`sas-box` gives agent runtimes and tool plugins a typed contract for acquiring
tool definitions, configuration, and context synchronously, asynchronously, or
both. A local validation step can require a synchronous provider; a running agent
can await a remote provider through the same interface. The host can inspect the
available route before invoking code that may start I/O.

- Declare a provider's capabilities in its TypeScript type.
- Supply separate sync and async implementations when both are available.
- Adapt values, callbacks, and thenables with consistent Promise behavior.

## Install

```sh
npm install sas-box
```

Includes TypeScript declarations, CommonJS and ESM import support, and no runtime
dependencies.

## Quick start: local and remote tool definitions

```ts
import { SasBox } from 'sas-box';

const tool = SasBox.fromValue({ name: 'search', readOnly: true }, 'search-tool');
console.log(tool.sync().name); // 'search'

const generated = SasBox.fromSync(() => 42);
console.log(generated.sync()); // 42
generated.async().then(console.log); // 42

const remote = SasBox.fromAsync(async () => ({ name: 'search', readOnly: true }));
remote.async().then((value) => console.log(value.name)); // 'search'
console.log(remote.sync); // undefined
```

Each call is an acquisition attempt. `fromValue` returns the supplied value
by identity; callbacks may produce a different value on every invocation.
The async callback above is an in-memory fixture; replace it with your tool
registry request in an application.

## Require a capability at an agent host boundary

A synchronous host accepts `SasBox.Sync<T>`. A host that can await accepts
`SasBox.Unknown<T>`, which includes both sync-capable and async-only providers.

```ts
import { SasBox } from 'sas-box';

type ToolDefinition = { name: string; readOnly: boolean };

function validateTool(provider: SasBox.Sync<ToolDefinition>): string {
  return provider.sync().name;
}

async function loadTool(provider: SasBox.Unknown<ToolDefinition>): Promise<string> {
  return (await provider.async()).name;
}

const bundled = SasBox.fromValue({ name: 'search', readOnly: true });
const hosted = SasBox.fromAsync(async () => ({ name: 'search', readOnly: true }));

console.log(validateTool(bundled)); // 'search'
loadTool(hosted).then(console.log); // 'search'
// validateTool(hosted) is a type error: hosted has no synchronous route.
```

A callback typed `() => T | Promise<T>` describes what it might return after
invocation. A box makes the available routes inspectable before invocation.
A tool validation hook can reject an async-only provider before it starts I/O.
The `readOnly` field is application data; the box does not verify or enforce it.

## Supply separate implementations

Use `new SasBox.Sync(sync, async, alias?)` when the same value can be acquired
through two implementations. This Node.js example reads a settings file;
create the file and run the example:

```sh
node -e "require('node:fs').writeFileSync('settings.json', JSON.stringify({port: 3000}))"
```

```ts
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { SasBox } from 'sas-box';

const source = new SasBox.Sync(
  () => readFileSync('settings.json', 'utf8'),
  () => readFile('settings.json', 'utf8'),
  'settings-file',
);

console.log(source.sync()); // {"port":3000}
source.async().then(console.log); // {"port":3000}
```

The caller chooses the route. Both implementations should satisfy the same
application contract. `fromSync(fn).async()` invokes `fn` immediately; it does
not move blocking work off the event loop.

## API

All exports come from `sas-box`.

| Factory or constructor | Result |
| --- | --- |
| `SasBox.fromValue(value, alias?)` | `SasBox.Sync<T>` returning the supplied value |
| `SasBox.fromSync(fn, alias?)` | `SasBox.Sync<T>` with a Promise adapter |
| `SasBox.fromAsync(fn, alias?)` | `SasBox.Async<Awaited<T>>`; accepts Promise-like results |
| `new SasBox.Sync(sync, async, alias?)` | Both acquisition routes |
| `new SasBox.Async(async, alias?)` | Async-only acquisition |
| `new SasBox.Unknown(syncOrUndefined, async, alias?)` | A capability determined at runtime |

| Member | Behavior |
| --- | --- |
| `sync` | A callback returning exactly `T`, or `undefined` |
| `async()` | Returns `Promise<Awaited<T>>` |
| `hasSync()` | Checks for a sync callback without invoking it; returns a boolean |
| `assertHasSync()` | Returns a sync-capable view or throws `SasBoxAssertionError` |
| `getAsSasBoxSync()` | Checks the capability and returns a plain `{ sync, async }` view |
| `getAsSasBoxAsync()` | Returns a plain `{ async }` view |
| `resolveSyncFirst(thisArg?)` | Invokes sync if present, otherwise async; always returns a Promise |
| `getSyncFirstResolver(thisArg?)` | Returns a callback with the same sync-first behavior |
| `alias` | Readonly label used in assertion messages |

`ISasBoxSync<T>`, `ISasBoxAsync<T>`, and their union `ISasBox<T>`
describe the structural views without requiring a class instance.
`hasSync()` does not narrow an unknown box's static type; use the return
value of `assertHasSync()` when a callable sync route is required.

## Promise and error behavior

`.sync()` preserves the callback's exact return type, even if that type is a
Promise. Promise-returning entry points assimilate Promises and structural
thenables:

```ts
import { SasBox } from 'sas-box';

const box = SasBox.fromSync(() => Promise.resolve(42));
const raw: Promise<number> = box.sync();
const flattened: Promise<number> = box.async();
const selected: Promise<number> = box.resolveSyncFirst();

Promise.all([raw, flattened, selected]).then(console.log); // [42, 42, 42]
```

A direct sync callback throw is synchronous. Throws through `.async()` or
sync-first resolution become rejected Promises. A `SasBox.Sync<Promise<T>>`
provides a Promise synchronously; it does not make the eventual `T` available.

Sync-first resolution passes `thisArg` to the selected callback, defaulting to
`null`. Prefer callbacks that close over their dependencies, or bind methods
before passing them to a factory.

## Scope and composition

### Agent integration contract

| Decision | Owner |
| --- | --- |
| Which acquisition routes exist | Provider and its box type |
| Which route this execution phase accepts | Agent host |
| Whether a tool may run and which arguments are valid | Host authorization and input validation |
| Timeouts, cancellation, retries, and sharing | Application execution policy |

Acquire a tool definition or context with the box, validate it in the host, then
invoke the tool through your executor. A successful acquisition does not certify
that the tool is authorized, safe, fresh, or free of side effects.

Boxes do not cache, deduplicate, retry, cancel, dispose of, or own acquired
resources. An async-only box does not gain a sync route after resolution.
The provider owns freshness and resource policy; create a new box if the
available capabilities change.

Use a plain value or factory when callers already agree on one acquisition
mode. Use a box when multiple producers and hosts need to inspect or require
different modes through one contract.

With a dependency container such as [DI Bag](https://www.npmjs.com/package/di-bag),
register a factory calling the chosen route: `() => provider.sync()` or
`() => provider.async()`. The container controls its own sharing and disposal;
the provider contract works independently of the container.

## Validate a change

With Node.js, npm, and Bun installed:

```sh
npm ci
npm run check
npm pack --dry-run
```

[Release notes](CHANGELOG.md) · [npm package](https://www.npmjs.com/package/sas-box)
