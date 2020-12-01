import * as fc from 'fast-check'
import * as deli from '../src/deli'

function* range(start: number, stop: number, step = 1): Generator<number> {
  if (stop == null) {
    // one param defined
    stop = start
    start = 0
  }

  for (let i = start; step > 0 ? i < stop : i > stop; i += step) {
    yield i
  }
}

test('The code following a fork and a sleep is always ran', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer(0, 15),
      fc.integer(0, 15),
      async (numForks, numSleeps) => {
        let counter = 0
        const simulation = new deli.Deli()
        await simulation.run(async function (sim) {
          for (const x of range(0, numForks)) {
            await sim.fork(async () => {
              for (const y of range(0, numSleeps)) {
                await sim.sleep(1)
                counter++
              }
            })
          }
        })
        expect(counter).toEqual(numForks * numSleeps)
      }
    ),
    {numRuns: 1000}
  )
})

test('A set of sleep calls advances the clock by the sum of the sleep calls', async () => {
  await fc.assert(
    fc.asyncProperty(fc.array(fc.integer(0, 99)), async sleeps => {
      const simulation = new deli.Deli()
      let now = 0
      await simulation.run(async function (sim) {
        for (const y of sleeps) {
          await sim.sleep(y)
        }
        now = sim.now
      })
      expect(now).toEqual(sleeps.reduce((a, b) => a + b, 0))
    }),
    {numRuns: 10000}
  )
})
