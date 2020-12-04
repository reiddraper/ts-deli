import * as concurrent from './control/concurrent'

export class Deli {
  endTime?: number
  async run(
    func: (conc: concurrent.Concurrent) => Promise<void>
  ): Promise<void> {
    const conc = new concurrent.ContinuationConcurrent()
    await conc.run(func)
    this.endTime = conc.now
  }
}
