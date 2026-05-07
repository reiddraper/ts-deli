# Deli tutorial

Welcome to the Deli tutorial. Through a sequence of examples, this guide
will give you a feel for what Deli is for and how to use it.

Deli is a discrete-event simulation library: you describe a system using
a small concurrency DSL (channels, forks, sleeps) and Deli runs millions
of simulated events to give you back wait-time and sojourn-time
percentiles. The point is to evaluate architecture choices — number of
workers, queue topology, routing policy — *before* you build them, on
job streams that look like your real load.

This document isn't quite literate Haskell, but every code block below
comes verbatim from [`src/tutorial.ts`](../src/tutorial.ts). You can run
the same code yourself:

```shell
$ npm run build
$ bin/deli-tutorial
```

First, the imports:

```typescript
import * as deli from './deli'
import * as prand from 'pure-rand'
import {JobTiming} from './types/job'

type JobChan = deli.Channel<deli.JobTiming & deli.RunJob>
```

`pure-rand` is the seedable PRNG Deli's `random` namespace builds on.
`JobChan` is just a convenience alias — every example consumes a channel
of jobs paired with a `runJob()` callback that the simulation provides.

## Simple queues

Let's start with the simplest possible system: one queue, one worker.
Jobs arrive on the queue; the worker reads from it and runs them in
order.

```typescript
async function singleQueue(
  sim: deli.Concurrent,
  channel: JobChan
): Promise<void> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const job = await sim.readChannel(channel)
    await job.runJob()
  }
}
```

That's the whole worker. `readChannel` blocks (in simulated time) until
a job is available; `runJob()` advances the simulation clock by the
job's duration.

Now we set up the simulation: a stream of jobs that arrive once per
simulated second, each with a duration drawn from the cycle
`[0.8, 0.9, 1.0, 1.1, 1.2]` (mean = 1.0s).

```typescript
async function singleQueueExample(): Promise<void> {
  const simulation = new deli.Deli()
  await simulation.run(deterministicJobs(100_000), singleQueue)
  printResults('singleQueue', simulation)
}
```

`deterministicJobs` is the one piece of plumbing not shipped by Deli
today — Haskell's `cycle` and arithmetic-progression sugar do this in
two lines, while in TypeScript we compose `generator.scan`,
`generator.zipWith`, and a small inline `cycle` helper. The construction
itself is worth seeing once:

```typescript
function deterministicJobs(count: number): Generator<JobTiming> {
  const durations = cycle([0.8, 0.9, 1.0, 1.1, 1.2])
  const arrivalGaps = deli.generator.constant(1)
  const interleaved = deli.generator.zipWith(
    (duration: number, gap: number) => ({start: gap, duration}),
    durations,
    arrivalGaps
  )
  const cumulative = deli.generator.scan(
    (a: JobTiming, b: JobTiming) => ({
      start: a.start + b.start,
      duration: b.duration
    }),
    interleaved
  )
  return deli.generator.take(count, cumulative)
}

function* cycle<T>(items: T[]): Generator<T> {
  while (true) {
    for (const item of items) yield item
  }
}
```

The pattern is: zip durations with inter-arrival *gaps*, then `scan` to
turn the gaps into absolute arrival times. This same pattern handles
Poisson arrivals later — the only thing that changes is the gap
generator.

Running gives you something like:

```
## singleQueue ##
end time: 100001.30s
wait (ms):    p50=100.00 p95=300.00 p99=300.00
sojourn (ms): p50=1100.00 p95=1300.00 p99=1300.00
```

Two distributions to read here. **Wait** is how long jobs sat in the
queue before a worker picked them up. **Sojourn** is wait + service
time: end-to-end latency. With one worker handling a 1-job-per-second
arrival stream where the mean service time is 1s, we're at exactly 100%
utilization on average — and the variance in durations means we
periodically tip over capacity, building queue. p99 wait of 300ms tells
you that 1% of jobs spent 300ms or longer queueing.

## Variable workers

Now let's parameterize the worker count:

```typescript
function variableWorkers(num: number) {
  return async (sim: deli.Concurrent, channel: JobChan): Promise<void> => {
    for (let i = 0; i < num; i++) {
      await sim.fork(async () => {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const job = await sim.readChannel(channel)
          await job.runJob()
        }
      })
    }
  }
}
```

`sim.fork` schedules a new lightweight thread on the simulation. Each
forked thread loops on the same channel, so they share work — when a
job arrives, whichever thread has been waiting longest gets it. This is
the Deli API's most important shape: write your model with the same
concurrency primitives you'd use to write the real system, and you'll
believe the simulator's answers more.

Same arrival stream as before, two workers:

```typescript
async function twoWorkerQueueExample(): Promise<void> {
  const simulation = new deli.Deli()
  await simulation.run(deterministicJobs(100_000), variableWorkers(2))
  printResults('twoWorkers', simulation)
}
```

```
## twoWorkers ##
end time: 100001.20s
wait (ms):    p50=0.00 p95=0.00 p99=0.00
sojourn (ms): p50=1000.00 p95=1200.00 p99=1200.00
```

With two workers and a 1.0-erlang offered load, utilization drops to
50% and the wait time collapses to zero. Sojourn now equals the service
time exactly — we won't beat this performance on this workload, no
matter what architecture we try.

## A more complex example: partitioning with work stealing

Real systems rarely have unimodal service times. A common pattern is a
mix of fast requests (hits a cache) and slow requests (hits a database).
A natural architectural reaction is to *partition* the workers: dedicate
a few to slow requests, the rest to fast, so a slow job can never block
a fast one — and let workers *steal* from the other lane when their own
is empty so no capacity goes idle.

Let's build that and see whether it pays off, on a workload with the
classic heavy-tailed service time: a Pareto distribution.

First, a worker that prefers its own lane but can steal from a sibling:

```typescript
async function stealingWorker(
  sim: deli.Concurrent,
  primary: JobChan,
  secondary: JobChan
): Promise<void> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const own = await sim.readChannelNonblocking(primary)
    if (own !== undefined) {
      await own.runJob()
      continue
    }
    const stolen = await sim.readChannelNonblocking(secondary)
    if (stolen !== undefined) {
      await stolen.runJob()
      continue
    }
    // Both lanes empty — block on primary so we don't busy-loop.
    const job = await sim.readChannel(primary)
    await job.runJob()
  }
}
```

`readChannelNonblocking` returns `T | undefined` immediately rather than
parking. That's what makes the polling pattern legal: if the primary is
empty, we *try* the secondary, and only block (on the primary) when both
are dry. That blocking fallback is essential — without it the worker
would tight-loop in zero simulated time and the simulator would hang.

The system itself: 4 slow workers, 16 fast workers, and a router that
classifies inbound jobs by predicted duration.

```typescript
const SLOW_THRESHOLD = 0.5 // 500 ms

async function partitionedQueues(
  sim: deli.Concurrent,
  jobChannel: JobChan
): Promise<void> {
  const slowChannel: JobChan = sim.createChannel(16)
  const fastChannel: JobChan = sim.createChannel(16)

  // 4 slow workers — primary: slow, steal from: fast.
  for (let i = 0; i < 4; i++) {
    await sim.fork(async () => stealingWorker(sim, slowChannel, fastChannel))
  }

  // 16 fast workers — primary: fast, steal from: slow.
  for (let i = 0; i < 16; i++) {
    await sim.fork(async () => stealingWorker(sim, fastChannel, slowChannel))
  }

  // Router: read from the main channel and dispatch by predicted duration.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const item = await sim.readChannel(jobChannel)
    if (item.duration > SLOW_THRESHOLD) {
      await sim.writeChannel(slowChannel, item)
    } else {
      await sim.writeChannel(fastChannel, item)
    }
  }
}
```

Two new things: `sim.createChannel(16)` creates a *bounded* channel — a
write to a full channel will park the writer until a reader drains it,
which gives the model backpressure. And the router (the trailing
`while (true)` loop) reads from the main channel and writes to the
right lane. In production the duration would have to be predicted from
request features; here we read it off the synthesized job, which is
fine for a model.

For comparison we run the same jobs through `variableWorkers(20)` —
the simpler architecture from the previous section.

Now the workload. Poisson arrivals (which means exponential
interarrival times), Pareto service times:

```typescript
async function paretoExample(): Promise<void> {
  const seed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)

  // Poisson arrivals at 650/s, matching the Haskell tutorial. Offered load
  // ≈ 1.95 erlangs ≈ 10% utilization on 20 workers — light, so neither
  // architecture queues much.
  const interarrivals = deli.random.exponential(prand.mersenne(seed), 650)
  // Pareto service times with mean=3ms and α=1.16 (matches the Haskell
  // tutorial). Mean is finite, variance is infinite — the heavy tail is
  // why partitioning starts to matter.
  const services = deli.random.pareto(prand.mersenne(seed + 1), 0.003, 1.16)
  const jobs: JobTiming[] = [
    ...deli.generator.take(
      200_000,
      deli.generator.scan(
        (a, b) => ({start: a.start + b.start, duration: b.duration}),
        deli.generator.zipWith(
          (duration: number, gap: number) => ({start: gap, duration}),
          services,
          interarrivals
        )
      )
    )
  ]

  const generic = new deli.Deli()
  await generic.run(jobs, variableWorkers(20))

  const partitioned = new deli.Deli()
  await partitioned.run(jobs, partitionedQueues)

  printResults('twentyWorkers', generic)
  console.log('')
  printResults('partitionedQueues', partitioned)
}
```

(Note that we materialize the job stream into an array before running
both simulations against it — using a generator would exhaust it on the
first run.)

Running:

```
## twentyWorkers ##
end time: 307.75s
wait (ms):    p50=0.00 p95=0.00 p99=0.00 p99.9=0.00 p99.99=0.00
sojourn (ms): p50=0.75 p95=5.49 p99=21.64 p99.9=155.93 p99.99=1542.36

## partitionedQueues ##
end time: 307.75s
wait (ms):    p50=0.00 p95=0.00 p99=0.00 p99.9=0.00 p99.99=0.00
sojourn (ms): p50=0.75 p95=5.49 p99=21.64 p99.9=155.93 p99.99=1542.36
```

The two architectures produce **identical** results out to p99.99.

That's not a bug — it's an honest empirical finding. At 650/s with
α=1.16 Pareto and 20 workers, utilization is ~10% and *neither
architecture ever queues*. Sojourn equals service time for every job;
the percentile column is a snapshot of the Pareto distribution itself
(0.75ms median, 22ms p99, 1.5s p99.99 — the heavy tail is unmistakable).
With no queueing, work stealing has nothing to do, and both
architectures are functionally equivalent.

This is actually the most useful answer Deli can give you: **at this
load, the architectural choice doesn't matter.** You'd reach for
partitioning as insurance against bursts that drive utilization higher,
not as a free win at light load. Cranking the arrival rate to 4000/s
(60% util) makes the difference visible — and at that load the
partitioned 4+16 split actually *loses* on aggregate p99 wait, because
the slow lane saturates faster than the single 20-pool does. Try it
yourself by editing `src/tutorial.ts`.

The general lesson: discrete-event simulation lets you *test* an
architecture hypothesis instead of arguing about it. The result is
sometimes the boring answer ("they're the same"), and that's fine — it
means your headroom is doing the work, not your design.

## What the Deli API looks like, in summary

If you've made it this far, you've seen essentially the whole DSL:

- `sim.fork(fn)` — spawn a lightweight simulated thread.
- `sim.sleep(duration)` — advance simulated time.
- `sim.createChannel(size?)` — create a (optionally bounded) channel.
- `sim.readChannel(c)` / `sim.writeChannel(c, x)` — blocking channel I/O.
- `sim.readChannelNonblocking(c)` / `sim.writeChannelNonblocking(c, x)`
  — non-blocking variants used in the work-stealing pattern.
- `Deli#run(jobs, worker)` — feed a job stream into a worker function
  and collect wait / sojourn / service-time t-digests.
- `deli.generator` — `constant`, `map`, `take`, `zip`, `zipWith`,
  `scan`, `repeat` for composing job streams.
- `deli.random` — `exponential`, `uniform`, `pareto` for stochastic
  streams.

That's enough surface area to model most queueing systems. The pattern
in every example is the same: build a generator of `JobTiming`, write a
worker function that consumes the channel, run it through `Deli`, read
the percentiles.

## What's next

The Haskell tutorial closes with "we'll be looking to expand it in the
future." Same here. The most useful follow-ups (per [`TODO.md`](../TODO.md)):

- Helper functions to bundle the
  zip-with-interarrivals-then-scan-into-cumulative-times pattern into
  one call (something like `arrivalsFromInterarrivals`), matching
  Haskell's `Deli.Random.arrivalTimePoissonDistribution` and
  `distributionToJobs`.
- Branded `Time` / `Duration` types so adding two times is a type error
  (Haskell uses phantom types for this).
- O(log n) priority queue — current insert is O(n).
- A web visualizer for the t-digest output.

Patches welcome on any of these.
