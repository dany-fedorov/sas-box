# sas-box

`sas-box` represents whether a value can be acquired synchronously, only
asynchronously, or through either capability. It does not cache acquisitions or
own acquired resources.

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
