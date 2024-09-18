import * as fc from 'fast-check'
import * as generator from '../src/utils/generator'
import * as deli from '../src/deli'
import {JobTiming} from '../src/deli'

test('With n jobs every every second that each take one second, we can have zero queue time with n workers', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer(1, 128),
      fc.integer(1, 1024),
      async (simultaneousJobsAndNumberOfThreads, numJobs) => {
        const simulation = new deli.Deli()
        const durations = deli.generator.constant(1)
        const arrivals = deli.generator.constant(1)
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
        const truncatedJobs = deli.generator.take(
          numJobs,
          deli.generator.repeat(jobs, simultaneousJobsAndNumberOfThreads)
        )
        await simulation.run(
          truncatedJobs,
          async (
            sim: deli.Concurrent,
            channel: deli.Channel<deli.JobTiming & deli.RunJob>
          ) => {
            for (let n = 0; n < simultaneousJobsAndNumberOfThreads; n++) {
              await sim.fork(async () => {
                // eslint-disable-next-line no-constant-condition
                while (true) {
                  const job = await sim.readChannel(channel)
                  await job.runJob()
                }
              })
            }
          }
        )
        expect(simulation.stats().waitStats.percentile(0.5)).toEqual(0)
        expect(simulation.stats().waitStats.percentile(0.99)).toEqual(0)
      }
    ),
    {numRuns: 256}
  )
})
