# Sas Box in harness engineering

Sas Box is an optional acquisition-mode contract for agentic development and
LLM harness graph nodes. Its narrow role is to let independently implemented
providers and consumers agree on whether synchronous acquisition is available.
It can support a harness integration boundary, but it does not implement an
agent workflow. This assessment audits commit
`5d553c52914b6becbdc661d77a67d94ea66b7ada` on 2026-09-12 against the
[source](src/index.ts) and [runtime tests](tests/runtime.test.ts).

## Where the mechanism helps

Consider a plugin family serving both a synchronous configuration validator and
an asynchronous retrieval node. The validator requires `SasBox.Sync<Config>`;
an async-only replacement fails TypeScript checking. If capability is unknown
until assembly, the host can use the provider returned by `assertHasSync()`.
`hasSync()` inspects the callback without running acquisition, but its boolean
result does not statically narrow an unknown box. The host still defines the
phase, validates configuration, and decides what an acceptable provider means.

That chain matters when the caller actually requires an immediate result.
`Sync<Promise<T>>` only provides a Promise synchronously: it does not provide the
eventual `T`. A synchronous invariant therefore needs a concrete non-Promise
payload type. `resolveSyncFirst()` always returns a Promise and selects a route;
it is not an immediate-result API or an error-triggered fallback policy.

Async access also provides a consistent rejection boundary. The
[normalization helper](src/index.ts#L19-L28) catches callback throws and
assimilates returned thenables. Direct `.sync()` preserves exact returns and
synchronous throws. Calling `.async()` on a sync factory invokes that factory
immediately; it does not move blocking work off the event loop.

## What plain TypeScript already supplies

A small structural contract and adapter cover the central behavior:

```ts
type Provider<T> = {
  sync?: () => T;
  async: () => Promise<Awaited<T>>;
};
const fromSync = <T>(fn: () => T) => ({
  sync: fn,
  async: async () => fn(),
});
```

An interface requiring `sync` rejects async-only producers without a library.
The async function also converts throws into rejections; merely wrapping
`fn()` in `Promise.resolve(fn())` does not catch a throw during argument
evaluation. Sas Box adds a shared API vocabulary, capability assertions,
aliases, receiver handling, and convenience adapters. If every consumer is
already asynchronous, injecting `() => Promise<T>` may meet the entire need.
Modular dependencies and fixture substitution are ordinary TypeScript design
techniques, not exclusive benefits of this package.

## Host work and counterexamples

Callbacks accept no arguments. A node normally acquires a client and then
passes its query and cancellation signal to that client's methods. Request
binding, authorization, schema validation, retries, and execution policy remain
host work. Separate sync and async implementations can return different values
despite matching types; the host must establish their semantic equivalence.

The box has no caching, failure retention, single-flight behavior, mapping,
metadata API, scope, reset, disposal, timeout, or cycle detection. Repeated
access repeats acquisition, including after failure. Two concurrent calls can
initialize two clients. A closure can supply sharing, but then owns freshness
and cleanup. A host catalog can place owner/purpose fields beside the box;
Sas Box supplies acquisition inspection, not that metadata's meaning.

A provider ecosystem spanning synchronous and asynchronous hosts is a plausible
adoption case. An all-async node with one injected factory, or a client pool
needing lifecycle management, is a weak case. Within DI Bag, registrations and
lifecycle policies already cover much of dependency assembly; an additional
box is useful chiefly when the provider contract also crosses other host
boundaries.

## Evidence and claims

The audit ran 13 runtime tests, package no-emit typechecking, and comparative
probes. Sas Box and plain closures both repeated failed acquisition and started
two operations for concurrent calls. These demonstrate semantics, not improved
LLM task completion. Smaller coding context is conditional on adequate
contracts, representative fixtures, and deliberate context selection. “Quick
evals” here means static contract checks plus deterministic behavioral fixtures.

See the [detailed evidence chapter](https://github.com/dany-fedorov/di-bag/blob/main/docs/research/2026-09-12-box-harness-evidence.md),
[runtime comparisons](https://github.com/dany-fedorov/di-bag/blob/main/docs/research/box-harness-probe.ts),
[compile-only comparisons](https://github.com/dany-fedorov/di-bag/blob/main/docs/research/box-harness-types.ts),
and [cross-library synthesis](https://github.com/dany-fedorov/di-bag/blob/main/docs/research/2026-09-12-harness-engineering-claim-audit.md).
The evidence report specifies sibling checkout revisions and portable commands.
A comparative agent experiment would need equal tasks and context budgets,
repeated trials, and measured defects or completion rates before making a
productivity claim.
