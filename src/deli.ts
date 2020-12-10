import * as concurrent from './control/concurrent'
import * as tdigest from 'tdigest'
import {JobTiming, RunJob} from './types/job'
import * as generator from './utils/generator'
export class Deli {
  endTime?: number
  sojournStats: tdigest.TDigest = new tdigest.TDigest()
  waitStats: tdigest.TDigest = new tdigest.TDigest()
  perfectStats: tdigest.TDigest = new tdigest.TDigest()

  async run(
    jobs: Generator<JobTiming> | JobTiming[],
    func: (conc: concurrent.Concurrent) => Promise<void>
  ): Promise<void> {
    const conc = new concurrent.ContinuationConcurrent()

    const performJob = async (j: JobTiming): Promise<void> => {
      conc.sleep(j.duration)
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const runnableJobs: Generator<JobTiming & RunJob> = generator.map(
      jobs,
      j => {
        return {...j, ...{runJob: async () => performJob(j)}}
      }
    )

    await conc.run(func)
    this.endTime = conc.now
  }
}
