import * as concurrent from './control/concurrent'
import * as tdigest from 'tdigest'
import {JobTiming, RunJob} from './types/job'
import * as generator from './utils/generator'

export {Concurrent, Channel} from './control/concurrent'
export {JobTiming, RunJob} from './types/job'
export * from 'tdigest'

export class Deli {
  endTime?: number
  private sojournStats: tdigest.TDigest = new tdigest.TDigest()
  private waitStats: tdigest.TDigest = new tdigest.TDigest()
  private perfectStats: tdigest.TDigest = new tdigest.TDigest()

  stats(): {
    sojournStats: tdigest.TDigestReadOnly
    waitStats: tdigest.TDigestReadOnly
    perfectStats: tdigest.TDigestReadOnly
  } {
    return {
      sojournStats: this.sojournStats,
      waitStats: this.waitStats,
      perfectStats: this.perfectStats
    }
  }

  async run(
    jobs: Generator<JobTiming> | JobTiming[],
    func: (
      conc: concurrent.Concurrent,
      chan: concurrent.Channel<JobTiming & RunJob>
    ) => Promise<void>
  ): Promise<void> {
    const conc = new concurrent.ContinuationConcurrent()

    const performJob = async (j: JobTiming): Promise<void> => {
      const beforeJob = conc.now
      await conc.sleep(j.duration)
      const afterJob = conc.now
      this.sojournStats.push(afterJob - j.start)
      this.waitStats.push(beforeJob - j.start)
      this.perfectStats.push(j.duration)
    }

    const runnableJobs: Generator<JobTiming & RunJob> = generator.map(
      jobs,
      j => {
        return {...j, ...{runJob: async () => performJob(j)}}
      }
    )

    await conc.run(async (sim: concurrent.Concurrent) => {
      const channel: concurrent.Channel<
        JobTiming & RunJob
      > = sim.createChannel()
      await sim.fork(async () => {
        await func(sim, channel)
      })
      for (const job of runnableJobs) {
        await sim.sleep(job.start - sim.now)
        await sim.writeChannel(channel, job)
      }
    })
    this.endTime = conc.now
  }
}
