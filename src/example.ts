import * as deli from './deli'

function logNowAndThread(msg: string, simulation: deli.Deli): void {
  console.log(
    `${msg} threadId=${simulation.currentlyRunningThreadId} now=${simulation.now}`
  )
}

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

export async function run(): Promise<void> {
  const simulation = new deli.Deli()

  let counter = 0
  await simulation.run(async function (sim) {
    for (const x of range(0, 10 * 10)) {
      await sim.fork(async () => {
        for (const y of range(0, 10 * 10)) {
          await sim.sleep(1)
          logNowAndThread(`Did sleep ${x} ${y}`, sim)
          counter++
        }
      })
    }
  })

  console.log(`Counter is ${counter}`)
  console.log('Simulation is complete')
}
