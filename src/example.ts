import * as deli from './deli'
import {JobTiming, RunJob} from './types/job'

export async function simpleExample(): Promise<void> {
  const simulation = new deli.Deli()
  const jobs: JobTiming[] = [
    {start: 15, duration: 10},
    {start: 20, duration: 10},
    {start: 25, duration: 10}
  ]
  await simulation.run(
    jobs,
    async (sim: deli.Concurrent, channel: deli.Channel<JobTiming & RunJob>) => {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const job = await sim.readChannel(channel)
        await job.runJob()
      }
    }
  )

  console.log('Simulation is complete')
  console.log(`End time is ${simulation.endTime}`)
  console.log(`p50 job time ${simulation.stats().sojournStats.percentile(0.5)}`)
  console.log(
    `p99 job time ${simulation.stats().sojournStats.percentile(0.99)}`
  )
}

export async function run(): Promise<void> {
  await simpleExample()
}
