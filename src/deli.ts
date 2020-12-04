import * as concurrent from './control/concurrent'
import * as tdigest from 'tdigest'

export class Deli {
  endTime?: number
  sojournStats: tdigest.TDigest = new tdigest.TDigest()
  waitStats: tdigest.TDigest = new tdigest.TDigest()
  perfectStats: tdigest.TDigest = new tdigest.TDigest()
  async run(
    func: (conc: concurrent.Concurrent) => Promise<void>
  ): Promise<void> {
    const conc = new concurrent.ContinuationConcurrent()
    await conc.run(func)
    this.endTime = conc.now
  }
}
