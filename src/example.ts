import * as deli from './deli'
import * as prand from 'pure-rand'
import {JobTiming} from './types/job'

export async function simpleExample(): Promise<void> {
  const simulation = new deli.Deli()
  const gen = prand.mersenne(Math.random() * Number.MAX_SAFE_INTEGER)
  const gen2 = prand.mersenne(Math.random() * Number.MAX_SAFE_INTEGER)
  const durations = deli.random.exponential(gen, 1 / 0.08)
  const arrivals = deli.random.exponential(gen2, 10)
  const randomJobs = deli.generator.zipWith(
    (duration: number, arrival: number) => {
      return {start: arrival, duration}
    },
    durations,
    arrivals
  )
  const jobs = deli.generator.scan((a: JobTiming, b: JobTiming) => {
    return {start: a.start + b.start, duration: b.duration}
  }, randomJobs)
  const truncatedJobs = deli.generator.take(250000, jobs)
  await simulation.run(
    truncatedJobs,
    async (
      sim: deli.Concurrent,
      channel: deli.Channel<deli.JobTiming & deli.RunJob>
    ) => {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const job = await sim.readChannel(channel)
        await job.runJob()
      }
    }
  )

  console.log('Simulation is complete')
  console.log(`End time is ${simulation.endTime}`)
  console.log(`\n`)
  console.log(`Total request time`)
  console.log(`p50 ${simulation.stats().sojournStats.percentile(0.5)}`)
  console.log(`p99 ${simulation.stats().sojournStats.percentile(0.99)}`)
  console.log(`\n`)
  console.log(`Time waiting in queues`)
  console.log(`p50 ${simulation.stats().waitStats.percentile(0.5)}`)
  console.log(`p99 ${simulation.stats().waitStats.percentile(0.99)}`)
  console.log(`\n`)
  console.log(`Theoretical best total time`)
  console.log(`p50 ${simulation.stats().perfectStats.percentile(0.5)}`)
  console.log(`p99 ${simulation.stats().perfectStats.percentile(0.99)}`)
}

export async function run(): Promise<void> {
  await simpleExample()
}
