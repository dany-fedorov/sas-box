# sas-box

Typed sync/async acquisition contracts for agentic development, LLM harnesses, and agent graphs.

One typed provider contract for a value, synchronous loader, or asynchronous
loader. Swap how a feature acquires its dependencies, require synchronous access
where needed, and test consumers with local fixtures.

- **[Replaceable acquisition boundaries](#replaceable-acquisition-boundaries).**
  Develop providers and consumers separately against the same contract.
- **[Typed provider checks and fixtures](#typed-provider-checks-and-fixtures).**
  Catch payload and acquisition-mode mismatches before invoking a provider.
- **[Acquisition capabilities for host tooling](#acquisition-capabilities-for-host-tooling).**
  Inspect available acquisition modes without running the loader.

Use it for mixed sync/async provider contracts, including dependencies
[inside an LLM agent harness](#inside-an-llm-agent-harness).
For an all-async consumer, a plain `() => Promise<T>` may be enough.

## Install

```sh
npm install sas-box
```

Includes TypeScript declarations, CommonJS and ESM import support, and no runtime
dependencies.

## Replaceable acquisition boundaries

A shipping feature needs rates; its provider owns how those rates are obtained.
The feature exposes a quote function and never reaches into provider internals.

```ts
import assert from 'node:assert/strict';
import { SasBox } from 'sas-box';

type Rates = { shippingCents: number; freeShippingFromCents: number };

function createQuote(rates: SasBox.Unknown<Rates>) {
  return async (subtotalCents: number): Promise<number> => {
    const current = await rates.async();
    return subtotalCents + (
      subtotalCents >= current.freeShippingFromCents ? 0 : current.shippingCents
    );
  };
}

async function main() {
  const fixture = SasBox.fromValue({
    shippingCents: 500, freeShippingFromCents: 5000,
  });
  const quote = createQuote(fixture);
  assert.equal(await quote(2500), 3000);
  assert.equal(await quote(6000), 6000);

  // In-memory implementation of an asynchronous provider.
  const alternate = SasBox.fromAsync(async () => ({
    shippingCents: 300, freeShippingFromCents: 4000,
  }));
  assert.equal(await createQuote(alternate)(2500), 2800);
  console.log('Shipping feature passed with both providers');
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
```

In separate modules, export `Rates`, `createQuote`, and the selected provider.
A quoting-rule change belongs with the feature and its tests; a rate-loading
change belongs with the provider. Include both sides when a change affects
their shared behavior. The provider contract is an entry point for humans and
coding agents working on either module.

The example runs without a server, network connection, or dependency container.
Each invocation acquires rates again; the box does not cache. A cached provider
must implement its own sharing and freshness rules.

## Typed provider checks and fixtures

A synchronous build step requires `SasBox.Sync<Rates>`. An asynchronous feature
can accept `SasBox.Unknown<Rates>`. These requirements are checked before either
provider runs.

```ts
import assert from 'node:assert/strict';
import { SasBox } from 'sas-box';

type Rates = { shippingCents: number };

function buildShippingLabel(source: SasBox.Sync<Rates>): string {
  return `Shipping: ${source.sync().shippingCents} cents`;
}

const fixture = SasBox.fromValue({ shippingCents: 500 });
const asynchronous = SasBox.fromAsync(async () => ({ shippingCents: 500 }));

function rejectedContracts() {
  // @ts-expect-error An async-only provider cannot satisfy a sync consumer.
  buildShippingLabel(asynchronous);
  // @ts-expect-error The provider payload must contain numeric shippingCents.
  const wrongPayload: SasBox.Unknown<Rates> = SasBox.fromValue({ shippingCents: '500' });
  return wrongPayload;
}

assert.equal(buildShippingLabel(fixture), 'Shipping: 500 cents');
console.log('Synchronous provider contract passed');
```

Save each example in its own `example.ts` file. To check it:

```sh
npm install --save-dev typescript @types/node
npx tsc --noEmit --strict --skipLibCheck --target ES2022 --module Node16 --moduleResolution Node16 example.ts
```

Run a checked example with `bun example.ts`, or compile it without
`--noEmit` and run `node example.js`. Bun execution alone does not type-check.

The uncalled `rejectedContracts` function demonstrates rejected replacements.
Each `@ts-expect-error` also requires the compiler to find an error on that
line. Remove the directive to inspect the diagnostic. Type checking evaluates
the declared contract; assertions evaluate selected behavior. Neither establishes
that a real remote provider is correct or available.

## Acquisition capabilities for host tooling

A host can build tooling from a provider's `alias` and `hasSync()` result
without loading its value. Application-defined metadata can describe ownership
or purpose alongside the box.

```ts
import assert from 'node:assert/strict';
import { SasBox } from 'sas-box';

type DescribedProvider<T> = {
  metadata: { owner: string; purpose: string };
  provider: SasBox.Unknown<T>;
};

let acquisitions = 0;
const rates: DescribedProvider<{ shippingCents: number }> = {
  metadata: { owner: 'checkout', purpose: 'shipping rates' },
  provider: SasBox.fromSync(() => {
    acquisitions++;
    return { shippingCents: 500 };
  }, 'shipping-rates'),
};

function describe<T>(entry: DescribedProvider<T>) {
  return {
    ...entry.metadata,
    alias: entry.provider.alias,
    syncAvailable: entry.provider.hasSync(),
  };
}

assert.deepEqual(describe(rates), {
  owner: 'checkout',
  purpose: 'shipping rates',
  alias: 'shipping-rates',
  syncAvailable: true,
});
assert.equal(acquisitions, 0);
console.log(describe(rates));
```

The metadata record belongs to the application; `sas-box` supplies the
inspectable acquisition contract. A catalog can group providers by owner, and a
sync-only host can reject an incompatible provider before calling it.
`hasSync()` reports a capability, not readiness, cost, health, or permission.
Use the return value of `assertHasSync()` when the caller needs a statically
narrowed sync provider.

## Inside an LLM agent harness

An agent harness coordinates a large language model (LLM), tools, and their
execution environment.
An agent workflow graph organizes that work into nodes and routing edges.
`sas-box` supplies typed dependencies to those nodes: configuration, context,
or clients acquired through a local fixture or an asynchronous provider.

This retrieval node receives its query from graph state and obtains a search
client through a provider. Its input and output stay the same when the provider
changes.

```ts
import assert from 'node:assert/strict';
import { SasBox } from 'sas-box';

type Retriever = { search(query: string): Promise<readonly string[]> };
type RetrievalState = { query: string };

function createRetrieveNode(provider: SasBox.Unknown<Retriever>) {
  return async (state: RetrievalState): Promise<{ documents: readonly string[] }> => {
    const retriever = await provider.async();
    return { documents: await retriever.search(state.query) };
  };
}

async function main() {
  const fixture = SasBox.fromValue<Retriever>({
    async search(query) {
      return query === 'refunds' ? ['Refunds are available within 30 days.'] : [];
    },
  }, 'fixture-retriever');

  // In-memory async initialization; an application can create its remote client here.
  let initializations = 0;
  const initialized = SasBox.fromAsync<Retriever>(async () => {
    initializations++;
    const documents = new Map([
      ['refunds', ['Refunds are available within 30 days.']],
    ]);
    return { async search(query) { return documents.get(query) ?? []; } };
  }, 'initialized-retriever');

  const expected = { documents: ['Refunds are available within 30 days.'] };
  assert.equal(initialized.hasSync(), false);
  assert.equal(initializations, 0);
  assert.deepEqual(await createRetrieveNode(fixture)({ query: 'refunds' }), expected);
  assert.deepEqual(await createRetrieveNode(initialized)({ query: 'refunds' }), expected);
  assert.equal(initializations, 1);
  assert.deepEqual(await createRetrieveNode(fixture)({ query: 'unknown' }), { documents: [] });
  console.log('Retrieval node passed with local and asynchronous providers');
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
```

The provider acquires a callable client; the node passes the query to that
client. This keeps state-dependent work explicit because box callbacks take no
arguments. When the contract and fixtures cover the proposed change, a coding
agent can use them as a focused working context, then run the type check and
assertions before integrating the node into the harness.

The harness owns node routing, retries, cancellation, and persistence.
Acquisition runs on every node invocation; share a client in the provider when
its lifetime should span multiple calls. The example needs no graph framework,
model API, or network connection.

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
