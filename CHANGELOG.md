# Changelog

## 0.1.0

- Correct async access and sync-first resolution to return
  `Promise<Awaited<T>>`, including Promise-valued sync callbacks and structural
  thenables.
- Normalize callback throws into rejected promises at Promise-shaped entry
  points while retaining ordinary synchronous throws from direct `.sync()`
  calls.
- Make `fromAsync` return the concrete async-only capability and add
  `SasBox.fromSync`, `SasBox.fromAsync`, and `SasBox.fromValue` conveniences.
- Add strict declaration fixtures, Node CommonJS and ESM package consumers, and
  release-ready package metadata.
