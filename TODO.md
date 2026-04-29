# TODO

Items noticed during the property-test pass that weren't fixed in scope.

## Latent / unresolved correctness

- **State leaks across `run()` calls.** `now`, `nextThreadId`, `nextChannelId`,
  and `channelAndWaiters` all carry over between successive `run()` invocations
  on the same `ContinuationConcurrent` instance. Currently captured as a test
  that documents the behavior. Decide: reset state in `run()`, or make `run()`
  one-shot and document?
- **`WakeupReason` enum is dead state.** Every parked thread record carries a
  `reason` field, but nothing in the scheduler ever reads it. Either start using
  it (e.g. for diagnostics / fairness policy) or remove it.
- **`as ChannelInternals<T>` cast is unsound.** The new
  `Map<number, ChannelInternals<unknown>>` requires a cast at every
  `read/writeChannel` call site. Acceptable because users only get back the
  type they put in via `Channel<T>`, but worth a comment + a runtime check
  on `chan.id` lookup miss (currently throws via an undefined deref instead
  of a clear error).

## Performance

- **`PriorityQueue.insert` is O(n).** Linear-scan + `Array.splice`. For 250k-job
  simulations this turns the scheduler into O(n²). Replace with a binary heap
  (~50 lines) and keep the FIFO-stability invariant locked down by the
  existing property test.

## Haskell-parity gaps (intentional un-features at first port — worth porting if used)

- **`Time` / `Duration` newtypes.** TS uses raw `number`; the Haskell version
  has distinct phantom types so adding a `Time` to a `Time` doesn't typecheck.
  Branded types in TS (`type Time = number & { __brand: 'Time' }`) would close
  the gap.
- **`lazySchedule`.** Haskell threads an arrival stream directly through the
  scheduler instead of forcing a producer fork. The TS port substitutes a
  producer thread, which is functionally equivalent but slower.
- **`yield`.** Haskell's `yield` advances the clock by 1µs to model a CPU
  cycle. Not present in TS.
- **`readChannelNonblocking` / `writeChannelNonblocking`.** Both exist in
  Haskell, neither in TS.
- **Pareto duration distribution.** Haskell ships exponential + pareto; TS
  ships only exponential.
- **Per-minute temporal stats.** Haskell's `DeliState.temporalStats` keeps a
  rolling per-minute response-time digest; TS keeps only the global digests.
- **`priority` (SRTF).** Haskell exposes a priority function for shortest-
  remaining-time-first workers. Not in TS.
- **Time-conversion helpers.** `microsecond` / `millisecond` constants and
  `microsecondsToTime` / `microsecondsToDuration` etc. are absent.

## Code-quality nits

- The five-line `resolveReceiver: Record<string, () => void>` /
  `new Promise(r => { resolveReceiver['resolve'] = r })` dance is open-coded
  in five places (`fork`, `sleep`, `readChannel` IF, `readChannel` else,
  `writeChannel`). Extract a `park(reason)` helper that returns
  `{ thread, wait }`.
- `// TODO: extract this into a function or better named variable?` comment
  on `currentlyRunningThreadId` is unaddressed.

## Tests not yet written (Phase 4+ from the test plan)

The public `Deli` class is still untested. Properties to add:
- `perfectStats` distribution exactly equals input job-duration distribution.
- For any worker function, every recorded sojourn ≥ corresponding duration.
- With one fork-per-job worker, `waitStats` is identically 0 and sojourn ===
  duration.
- `endTime ≥ max(j.start + j.duration)` for any worker.
- Determinism: same seed + same worker → identical t-digest contents across
  two runs.
