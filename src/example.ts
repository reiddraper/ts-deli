import * as concurrent from './control/concurrent'
import * as deli from './deli'

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

export async function exampleOne(): Promise<void> {
  const simulation = new deli.Deli()
  let counter = 0
  await simulation.run([], async (sim: concurrent.Concurrent) => {
    const channel = sim.createChannel(0)
    const count = 2
    await sim.fork(async () => {
      for (const x of range(0, count)) {
        console.log(`1 (${sim.currentlyRunningThreadId})    X=${x}`)
        const val = await sim.readChannel(channel)
        console.log(`1 (${sim.currentlyRunningThreadId})    received ${val}`)
        console.log(
          `1 (${sim.currentlyRunningThreadId})    now going into write`
        )
        await sim.writeChannel(channel, [1, x])
        console.log(
          `1 (${sim.currentlyRunningThreadId})    succesfully wrote: [1, ${x}]`
        )
        counter++
      }
    })
    for (const y of range(0, count)) {
      console.log(`0 (${sim.currentlyRunningThreadId})    Y=${y}`)
      await sim.writeChannel(channel, [0, y])
      console.log(
        `0 (${sim.currentlyRunningThreadId})    succesfully wrote: [0, ${y}]`
      )
      console.log(`0 (${sim.currentlyRunningThreadId})    now going into read`)
      const val = await sim.readChannel(channel)
      console.log(`0 (${sim.currentlyRunningThreadId})    received ${val}`)
      counter++
    }
  })

  console.log(`Counter is ${counter}`)
  console.log('Simulation is complete')
}

export async function readAfterRead(): Promise<void> {
  const simulation = new deli.Deli()
  let counter = 0
  await simulation.run([], async (sim: concurrent.Concurrent) => {
    const channel: concurrent.Channel<number> = sim.createChannel(0)
    await sim.fork(async () => {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const val = await sim.readChannel(channel)
        console.log(`Read value ${val}`)
        await sim.sleep(val)
        console.log(`Slept for ${val}`)
        counter++
      }
    })
    await sim.writeChannel(channel, 0)
    console.log(`Finished writing`)
  })

  console.log('Simulation is complete')
  console.log(`Counter is ${counter}`)
}

export async function run(): Promise<void> {
  await readAfterRead()
}
