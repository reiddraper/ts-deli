// Runnable companion for docs/guide.md. Every code block in the guide is
// pulled from this file; if you change one, change the other.

import * as deli from './deli'
import * as prand from 'pure-rand'
import {JobTiming} from './types/job'

type JobChan = deli.Channel<deli.JobTiming & deli.RunJob>

// ---------------------------------------------------------------------------
// Simple queues
// ---------------------------------------------------------------------------

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

async function singleQueueExample(): Promise<void> {
  const simulation = new deli.Deli()
  await simulation.run(deterministicJobs(100_000), singleQueue)
  printResults('singleQueue', simulation)
}

// ---------------------------------------------------------------------------
// Variable workers
// ---------------------------------------------------------------------------

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

async function twoWorkerQueueExample(): Promise<void> {
  const simulation = new deli.Deli()
  await simulation.run(deterministicJobs(100_000), variableWorkers(2))
  printResults('twoWorkers', simulation)
}

// ---------------------------------------------------------------------------
// Partitioned queues with work stealing, on a Pareto workload
// ---------------------------------------------------------------------------

const SLOW_THRESHOLD = 0.5 // 500 ms

async function partitionedQueues(
  sim: deli.Concurrent,
  jobChannel: JobChan
): Promise<void> {
  const slowChannel: JobChan = sim.createChannel(16)
  const fastChannel: JobChan = sim.createChannel(16)

  // Each worker prefers its own lane, but if its primary is empty it
  // tries the sibling lane (work stealing). If both are empty it blocks
  // on its primary so it can be woken without busy-looping.

  // 4 slow workers — primary: slow, steal from: fast.
  for (let i = 0; i < 4; i++) {
    await sim.fork(async () => stealingWorker(sim, slowChannel, fastChannel))
  }

  // 16 fast workers — primary: fast, steal from: slow.
  for (let i = 0; i < 16; i++) {
    await sim.fork(async () => stealingWorker(sim, fastChannel, slowChannel))
  }

  // Router: read from the main channel and dispatch by predicted duration.
  // In production you'd predict from request features; here we cheat and
  // read it off the synthesized job, which is fine for a model.
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

async function paretoExample(): Promise<void> {
  const seed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)

  // Poisson arrivals at 650/s, matching the Haskell tutorial. Offered load
  // ≈ 1.95 erlangs ≈ 10% utilization on 20 workers — light, so neither
  // architecture queues much. The point of running both is to confirm the
  // partitioning + work-stealing model is sound; the architectural question
  // it's meant to answer (does isolating the long tail help?) needs higher
  // load to actually fire — see the discussion in docs/guide.md.
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

// ---------------------------------------------------------------------------
// Helpers used by the examples
// ---------------------------------------------------------------------------

// Cycle through a fixed list of durations, one per second of arrival.
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

function printResults(label: string, simulation: deli.Deli): void {
  const {sojournStats, waitStats} = simulation.stats()
  const ms = (s: number): string => (s * 1000).toFixed(2)
  console.log(`## ${label} ##`)
  console.log(`end time: ${simulation.endTime?.toFixed(2)}s`)
  console.log(
    'wait (ms):    ' +
      `p50=${ms(waitStats.percentile(0.5))} ` +
      `p95=${ms(waitStats.percentile(0.95))} ` +
      `p99=${ms(waitStats.percentile(0.99))} ` +
      `p99.9=${ms(waitStats.percentile(0.999))} ` +
      `p99.99=${ms(waitStats.percentile(0.9999))}`
  )
  console.log(
    'sojourn (ms): ' +
      `p50=${ms(sojournStats.percentile(0.5))} ` +
      `p95=${ms(sojournStats.percentile(0.95))} ` +
      `p99=${ms(sojournStats.percentile(0.99))} ` +
      `p99.9=${ms(sojournStats.percentile(0.999))} ` +
      `p99.99=${ms(sojournStats.percentile(0.9999))}`
  )
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function run(): Promise<void> {
  console.log('# singleQueueExample')
  await singleQueueExample()
  console.log('')

  console.log('# twoWorkerQueueExample')
  await twoWorkerQueueExample()
  console.log('')

  console.log('# paretoExample')
  await paretoExample()
}
