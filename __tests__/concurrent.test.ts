import * as fc from 'fast-check'
import * as concurrent from '../src/control/concurrent'
import * as generator from '../src/utils/generator'

// -- Helpers

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

// -- Tests

test('The code following a fork and a sleep is always ran', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer(0, 15),
      fc.integer(0, 15),
      async (numForks, numSleeps) => {
        let counter = 0
        const simulation = new concurrent.ContinuationConcurrent()
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
      const simulation = new concurrent.ContinuationConcurrent()
      let now = 0
      await simulation.run(async function (sim) {
        for (const y of sleeps) {
          await sim.sleep(y)
        }
        now = sim.now
      })
      expect(now).toEqual(sleeps.reduce((a, b) => a + b, 0))
    }),
    {numRuns: 5000}
  )
})

test('The runtime of several sleeping threads is only as long as the longest single thread', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.array(fc.integer(0, 99)), {maxLength: 8}),
      async threadsAndTheirSleeps => {
        const simulation = new concurrent.ContinuationConcurrent()
        let now = -1
        await simulation.run(async function (sim) {
          for (const sleepArray of threadsAndTheirSleeps) {
            await sim.fork(async () => {
              for (const y of sleepArray) {
                await sim.sleep(y)
              }
            })
          }
        })
        const sleepLengthofEachThread = threadsAndTheirSleeps.map(arr =>
          arr.reduce((a, b) => a + b, 0)
        )
        const maxSleep = Math.max(...sleepLengthofEachThread, 0)
        expect(simulation.now).toEqual(maxSleep)
      }
    ),
    {numRuns: 2000}
  )
})

test('Two threads are able to swap back and forth using channels', async () => {
  await fc.assert(
    fc.asyncProperty(fc.integer(0, 128), async numWrites => {
      let counter = 0
      const simulation = new concurrent.ContinuationConcurrent()
      await simulation.run(async function (sim) {
        const channel = sim.createChannel(0)
        await sim.fork(async () => {
          for (const _ of range(0, numWrites)) {
            await sim.readChannel(channel)
            await sim.writeChannel(channel, true)
            counter++
          }
        })
        for (const _ of range(0, numWrites)) {
          await sim.writeChannel(channel, true)
          await sim.readChannel(channel)
          counter++
        }
      })
      expect(counter).toEqual(numWrites * 2)
    }),
    {numRuns: 128}
  )
})

test('For all buffer sizes, worker counts, and jobs tasks, we eventually complete each task (sleep)', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer(0, 32),
      fc.integer(1, 32), // need at least one listening thread
      fc.array(fc.integer(0, 1024)),
      async (bufferSize, numThreads, sleeps) => {
        let counter = 0
        const simulation = new concurrent.ContinuationConcurrent()
        await simulation.run(async () => {
          const channel: concurrent.Channel<number> = simulation.createChannel(
            bufferSize
          )
          for (const _ of range(0, numThreads)) {
            await simulation.fork(async () => {
              while (true) {
                const sleepTime = await simulation.readChannel(channel)
                await simulation.sleep(sleepTime)
                counter++
              }
            })
          }

          for (const sleepTime of sleeps) {
            await simulation.writeChannel(channel, sleepTime)
          }
        })
        expect(counter).toEqual(sleeps.length)
      }
    ),
    {numRuns: 256}
  )
})
