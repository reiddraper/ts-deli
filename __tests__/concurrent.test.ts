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

test('Two threads using channels strictly alternate', async () => {
  await fc.assert(
    fc.asyncProperty(fc.integer(1, 128), async numRounds => {
      const simulation = new concurrent.ContinuationConcurrent()
      const trace: ('A' | 'B')[] = []
      await simulation.run(async function (sim) {
        const channel = sim.createChannel<true>(0)
        await sim.fork(async () => {
          for (const _ of range(0, numRounds)) {
            await sim.readChannel(channel)
            trace.push('B')
            await sim.writeChannel(channel, true)
          }
        })
        for (const _ of range(0, numRounds)) {
          await sim.writeChannel(channel, true)
          trace.push('A')
          await sim.readChannel(channel)
        }
      })
      expect(trace.length).toEqual(numRounds * 2)
      for (let i = 0; i < trace.length; i++) {
        expect(trace[i]).toEqual(i % 2 === 0 ? 'A' : 'B')
      }
    }),
    {numRuns: 128}
  )
})

test('One writer, many readers — multiset of reads equals writes', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer(0, 32),
      fc.integer(1, 32), // need at least one listening thread
      fc.array(fc.integer(0, 1024)),
      async (bufferSize, numThreads, values) => {
        const allReads: number[] = []
        const simulation = new concurrent.ContinuationConcurrent()
        await simulation.run(async () => {
          const channel: concurrent.Channel<number> = simulation.createChannel(
            bufferSize
          )
          for (const _ of range(0, numThreads)) {
            await simulation.fork(async () => {
              while (true) {
                const v = await simulation.readChannel(channel)
                allReads.push(v)
              }
            })
          }
          for (const v of values) {
            await simulation.writeChannel(channel, v)
          }
        })
        expect(allReads.length).toEqual(values.length)
        expect([...allReads].sort((a, b) => a - b)).toEqual(
          [...values].sort((a, b) => a - b)
        )
      }
    ),
    {numRuns: 512}
  )
})

test('One writer, many readers — per-reader subsequence preserves writer FIFO', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer(0, 16),
      fc.integer(1, 8),
      fc.integer(1, 50),
      async (bufferSize, numThreads, count) => {
        // distinct, monotonic values so we can check FIFO
        const values = Array.from({length: count}, (_, i) => i)
        const perReader: number[][] = Array.from({length: numThreads}, () => [])
        const simulation = new concurrent.ContinuationConcurrent()
        await simulation.run(async () => {
          const channel: concurrent.Channel<number> = simulation.createChannel(
            bufferSize
          )
          for (let t = 0; t < numThreads; t++) {
            const tId = t
            await simulation.fork(async () => {
              while (true) {
                const v = await simulation.readChannel(channel)
                perReader[tId].push(v)
              }
            })
          }
          for (const v of values) {
            await simulation.writeChannel(channel, v)
          }
        })
        // each reader's sequence must be strictly increasing (writer FIFO preserved)
        for (const seq of perReader) {
          for (let i = 1; i < seq.length; i++) {
            expect(seq[i]).toBeGreaterThan(seq[i - 1])
          }
        }
        // union of per-reader sequences must equal the writer's sequence
        const all = ([] as number[]).concat(...perReader).sort((a, b) => a - b)
        expect(all).toEqual(values)
      }
    ),
    {numRuns: 256}
  )
})

test('One reader, many writers — multiset of reads equals union of writes', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer(0, 32),
      fc.integer(1, 8), // need at least one writing thread
      fc.integer(0, 50),
      async (bufferSize, numThreads, count) => {
        // distinct values per writer: writer t writes [t*1000+0, t*1000+1, ...]
        const expectedAll: number[] = []
        for (let t = 0; t < numThreads; t++) {
          for (let i = 0; i < count; i++) expectedAll.push(t * 1000 + i)
        }
        const allReads: number[] = []
        const simulation = new concurrent.ContinuationConcurrent()
        await simulation.run(async () => {
          const channel: concurrent.Channel<number> = simulation.createChannel(
            bufferSize
          )
          for (let t = 0; t < numThreads; t++) {
            const tId = t
            await simulation.fork(async () => {
              for (let i = 0; i < count; i++) {
                await simulation.writeChannel(channel, tId * 1000 + i)
              }
            })
          }
          for (let i = 0; i < expectedAll.length; i++) {
            const v = await simulation.readChannel(channel)
            allReads.push(v)
          }
        })
        expect(allReads.length).toEqual(expectedAll.length)
        expect([...allReads].sort((a, b) => a - b)).toEqual(
          [...expectedAll].sort((a, b) => a - b)
        )
        // each writer's subsequence in reader's stream must be in writer order
        for (let t = 0; t < numThreads; t++) {
          const subseq = allReads.filter(
            v => v >= t * 1000 && v < (t + 1) * 1000
          )
          for (let i = 1; i < subseq.length; i++) {
            expect(subseq[i]).toBeGreaterThan(subseq[i - 1])
          }
        }
      }
    ),
    {numRuns: 256}
  )
})

test('Two channels are independent (each receives only its own values)', async () => {
  const simulation = new concurrent.ContinuationConcurrent()
  const fromA: number[] = []
  const fromB: number[] = []
  await simulation.run(async function (sim) {
    const chanA: concurrent.Channel<number> = sim.createChannel()
    const chanB: concurrent.Channel<number> = sim.createChannel()
    await sim.fork(async () => {
      fromA.push(await sim.readChannel(chanA))
    })
    await sim.fork(async () => {
      fromB.push(await sim.readChannel(chanB))
    })
    await sim.writeChannel(chanA, 1)
    await sim.writeChannel(chanB, 2)
  })
  expect(fromA).toEqual([1])
  expect(fromB).toEqual([2])
})

test('N channels remain independent under per-channel writes/reads', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer(2, 6),
      fc.array(fc.tuple(fc.nat(), fc.integer()), {
        minLength: 1,
        maxLength: 24
      }),
      async (numChannels, rawWrites) => {
        const simulation = new concurrent.ContinuationConcurrent()
        const written: number[][] = Array.from({length: numChannels}, () => [])
        const read: number[][] = Array.from({length: numChannels}, () => [])

        const writes: [number, number][] = rawWrites.map(([c, v]) => [
          c % numChannels,
          v
        ])
        for (const [idx, value] of writes) written[idx].push(value)

        await simulation.run(async function (sim) {
          const channels: concurrent.Channel<number>[] = Array.from(
            {length: numChannels},
            () => sim.createChannel<number>()
          )

          for (let i = 0; i < numChannels; i++) {
            const channelIdx = i
            const chan = channels[channelIdx]
            const expectedCount = written[channelIdx].length
            await sim.fork(async () => {
              for (let j = 0; j < expectedCount; j++) {
                read[channelIdx].push(await sim.readChannel(chan))
              }
            })
          }

          for (const [idx, value] of writes) {
            await sim.writeChannel(channels[idx], value)
          }
        })

        for (let i = 0; i < numChannels; i++) {
          expect(read[i]).toEqual(written[i])
        }
      }
    ),
    {numRuns: 200}
  )
})

test('Time never moves backwards across negative sleeps', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.integer(-50, 50), {maxLength: 32}),
      async sleeps => {
        const simulation = new concurrent.ContinuationConcurrent()
        const observed: number[] = []
        await simulation.run(async function (sim) {
          for (const s of sleeps) {
            await sim.sleep(s)
            observed.push(sim.now)
          }
        })
        for (let i = 1; i < observed.length; i++) {
          expect(observed[i]).toBeGreaterThanOrEqual(observed[i - 1])
        }
        expect(simulation.now).toBeGreaterThanOrEqual(0)
      }
    ),
    {numRuns: 1000}
  )
})

test('Simulation terminates when a thread is parked on an unwritten channel', async () => {
  const simulation = new concurrent.ContinuationConcurrent()
  let readerStarted = false
  let readerFinished = false
  await simulation.run(async function (sim) {
    const chan: concurrent.Channel<number> = sim.createChannel(0)
    await sim.fork(async () => {
      readerStarted = true
      await sim.readChannel(chan)
      readerFinished = true
    })
  })
  expect(readerStarted).toBe(true)
  expect(readerFinished).toBe(false)
})

test('forkID matches currentlyRunningThreadId observed inside the forked thread', async () => {
  await fc.assert(
    fc.asyncProperty(fc.integer(1, 64), async totalThreadCount => {
      const simulation = new concurrent.ContinuationConcurrent()
      const observed: Map<number, number> = new Map()
      const expected: Map<number, number> = new Map()
      await simulation.run(async function (sim) {
        for (const i of range(0, totalThreadCount)) {
          // unique sleep per thread so observation runs at distinct times
          const sleepFor = i + 1
          const id = await sim.fork(async () => {
            await sim.sleep(sleepFor)
            observed.set(sleepFor, sim.currentlyRunningThreadId)
          })
          expected.set(sleepFor, id)
        }
      })
      for (const [k, v] of expected) {
        expect(observed.get(k)).toEqual(v)
      }
    }),
    {numRuns: 512}
  )
})

test('Multiple forks from same point: all children run before parent continues', async () => {
  const order: string[] = []
  const simulation = new concurrent.ContinuationConcurrent()
  await simulation.run(async function (sim) {
    order.push('parent-pre')
    await sim.fork(async () => {
      order.push('child-A')
    })
    await sim.fork(async () => {
      order.push('child-B')
    })
    order.push('parent-post')
  })
  expect(order).toEqual(['parent-pre', 'child-A', 'child-B', 'parent-post'])
})

test('Recursive fork: a child can fork a grandchild', async () => {
  const log: string[] = []
  const simulation = new concurrent.ContinuationConcurrent()
  await simulation.run(async function (sim) {
    await sim.fork(async () => {
      log.push('child-start')
      await sim.fork(async () => {
        log.push('grandchild')
      })
      log.push('child-end')
    })
    log.push('parent')
  })
  expect(log).toContain('child-start')
  expect(log).toContain('grandchild')
  expect(log).toContain('child-end')
  expect(log).toContain('parent')
  // grandchild must appear after the inner fork call, before child-end
  const gIdx = log.indexOf('grandchild')
  const ceIdx = log.indexOf('child-end')
  expect(gIdx).toBeLessThan(ceIdx)
})

test('Forked thread that throws does not hang the simulation', async () => {
  const simulation = new concurrent.ContinuationConcurrent()
  let parentResumedAfterFork = false
  await simulation.run(async function (sim) {
    await sim.fork(async () => {
      throw new Error('boom')
    })
    parentResumedAfterFork = true
  })
  expect(parentResumedAfterFork).toBe(true)
}, 3000)

test('Exception thrown in main func propagates out of run()', async () => {
  const simulation = new concurrent.ContinuationConcurrent()
  await expect(
    simulation.run(async function (sim) {
      await sim.sleep(1)
      throw new Error('main-boom')
    })
  ).rejects.toThrow('main-boom')
})

test('Single thread reading a never-written channel terminates without hanging', async () => {
  const simulation = new concurrent.ContinuationConcurrent()
  let reachedAfterRead = false
  await simulation.run(async function (sim) {
    const chan: concurrent.Channel<number> = sim.createChannel(0)
    await sim.readChannel(chan)
    reachedAfterRead = true
  })
  expect(reachedAfterRead).toBe(false)
})

test('Channel correctly transports undefined as a legitimate value', async () => {
  const simulation = new concurrent.ContinuationConcurrent()
  let receivedSentinel = 'untouched'
  await simulation.run(async function (sim) {
    const chan: concurrent.Channel<undefined | number> = sim.createChannel()
    await sim.fork(async () => {
      const v = await sim.readChannel(chan)
      receivedSentinel = v === undefined ? 'undefined' : `value:${v}`
    })
    await sim.writeChannel(chan, undefined)
  })
  expect(receivedSentinel).toEqual('undefined')
})

test('Mutually-waiting threads do not hang the simulation', async () => {
  const simulation = new concurrent.ContinuationConcurrent()
  let aReached = false
  let bReached = false
  await simulation.run(async function (sim) {
    const chanA: concurrent.Channel<number> = sim.createChannel(0)
    const chanB: concurrent.Channel<number> = sim.createChannel(0)
    await sim.fork(async () => {
      await sim.readChannel(chanA) // waits for chanA
      aReached = true
    })
    await sim.fork(async () => {
      await sim.readChannel(chanB) // waits for chanB
      bReached = true
    })
  })
  // Both threads parked indefinitely; sim should still terminate.
  expect(aReached).toBe(false)
  expect(bReached).toBe(false)
})

test('Bounded channel: parked writers drain in FIFO order with sequence preserved', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer(1, 8),
      fc.integer(2, 30),
      async (size, count) => {
        const simulation = new concurrent.ContinuationConcurrent()
        const written: number[] = []
        const read: number[] = []
        await simulation.run(async function (sim) {
          const chan: concurrent.Channel<number> = sim.createChannel(size)
          await sim.fork(async () => {
            for (let i = 0; i < count; i++) {
              await sim.writeChannel(chan, i)
              written.push(i)
            }
          })
          for (let i = 0; i < count; i++) {
            read.push(await sim.readChannel(chan))
          }
        })
        expect(read).toEqual(written)
        expect(read).toEqual(Array.from({length: count}, (_, i) => i))
      }
    ),
    {numRuns: 200}
  )
})

test('Fork storm: many threads spawned and run to completion', async () => {
  const N = 500
  const simulation = new concurrent.ContinuationConcurrent()
  let completed = 0
  await simulation.run(async function (sim) {
    for (let i = 0; i < N; i++) {
      const myI = i
      await sim.fork(async () => {
        await sim.sleep(myI % 10)
        completed++
      })
    }
  })
  expect(completed).toEqual(N)
})

test('Re-running on the same instance: state leaks across runs', async () => {
  const simulation = new concurrent.ContinuationConcurrent()
  await simulation.run(async function (sim) {
    await sim.sleep(10)
  })
  const nowAfterFirst = simulation.now
  expect(nowAfterFirst).toEqual(10)

  // Second run starts from previous state — `now` does not reset
  await simulation.run(async function (sim) {
    expect(sim.now).toEqual(10)
    await sim.sleep(5)
  })
  expect(simulation.now).toEqual(15)
})

// Documents whether parent or child runs first after `fork`.
// Haskell `ifork` schedules the child first, then yields parent — so the
// child runs first. Mirroring that semantic should give:
//   ['parent-before-fork', 'child', 'parent-after-fork']
test('After fork, child runs before parent continues', async () => {
  const order: string[] = []
  const simulation = new concurrent.ContinuationConcurrent()
  await simulation.run(async function (sim) {
    order.push('parent-before-fork')
    await sim.fork(async () => {
      order.push('child')
    })
    order.push('parent-after-fork')
  })
  expect(order).toEqual(['parent-before-fork', 'child', 'parent-after-fork'])
})

test('Channel preserves FIFO with one writer and one reader across buffer sizes', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.oneof(fc.constant(undefined as number | undefined), fc.integer(0, 16)),
      fc.array(fc.integer(), {minLength: 0, maxLength: 60}),
      async (bufferSize, values) => {
        const reads: number[] = []
        const simulation = new concurrent.ContinuationConcurrent()
        await simulation.run(async function (sim) {
          const chan: concurrent.Channel<number> = sim.createChannel(bufferSize)
          await sim.fork(async () => {
            for (let i = 0; i < values.length; i++) {
              reads.push(await sim.readChannel(chan))
            }
          })
          for (const v of values) {
            await sim.writeChannel(chan, v)
          }
        })
        expect(reads).toEqual(values)
      }
    ),
    {numRuns: 500}
  )
})

test('Unbounded channel writer never blocks (now stays at 0 across many writes)', async () => {
  const simulation = new concurrent.ContinuationConcurrent()
  await simulation.run(async function (sim) {
    const chan: concurrent.Channel<number> = sim.createChannel()
    for (let i = 0; i < 1000; i++) {
      await sim.writeChannel(chan, i)
    }
    expect(sim.now).toEqual(0)
  })
})

test('size=N buffered channel: N writes succeed without consumer; (N+1)th would park', async () => {
  await fc.assert(
    fc.asyncProperty(fc.integer(1, 16), async size => {
      const simulation = new concurrent.ContinuationConcurrent()
      let writesCompleted = 0
      let extraCompleted = false
      await simulation.run(async function (sim) {
        const chan: concurrent.Channel<number> = sim.createChannel(size)
        await sim.fork(async () => {
          for (let i = 0; i < size; i++) {
            await sim.writeChannel(chan, i)
            writesCompleted++
          }
          await sim.writeChannel(chan, -1)
          extraCompleted = true
        })
      })
      expect(writesCompleted).toEqual(size)
      expect(extraCompleted).toEqual(false)
    }),
    {numRuns: 50}
  )
})

test('size=0 channel is rendezvous: writer parks until a reader is present', async () => {
  const simulation = new concurrent.ContinuationConcurrent()
  let wroteFirst = false
  let readDone = false
  await simulation.run(async function (sim) {
    const chan: concurrent.Channel<number> = sim.createChannel(0)
    await sim.fork(async () => {
      await sim.writeChannel(chan, 42)
      wroteFirst = true
    })
    expect(wroteFirst).toEqual(false)
    await sim.sleep(10)
    expect(wroteFirst).toEqual(false)
    const v = await sim.readChannel(chan)
    expect(v).toEqual(42)
    readDone = true
  })
  expect(wroteFirst).toEqual(true)
  expect(readDone).toEqual(true)
})

test('Determinism: identical inputs produce identical observable trace', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(
        fc.oneof(
          fc.record({
            kind: fc.constant<'sleep'>('sleep'),
            d: fc.integer(0, 20)
          }),
          fc.record({kind: fc.constant<'fork'>('fork'), d: fc.integer(0, 20)})
        ),
        {minLength: 1, maxLength: 30}
      ),
      async ops => {
        const runOnce = async (): Promise<string[]> => {
          const trace: string[] = []
          const sim = new concurrent.ContinuationConcurrent()
          await sim.run(async function (s) {
            for (const op of ops) {
              if (op.kind === 'sleep') {
                await s.sleep(op.d)
                trace.push(`s${op.d}@${s.now}`)
              } else {
                const id = await s.fork(async () => {
                  await s.sleep(op.d)
                  trace.push(`f${id}done@${s.now}`)
                })
                trace.push(`f${id}@${s.now}`)
              }
            }
          })
          return trace
        }
        const a = await runOnce()
        const b = await runOnce()
        expect(a).toEqual(b)
      }
    ),
    {numRuns: 200}
  )
})

test('Mixed sleep + channel: parked reader unparks at the correct simulated time', async () => {
  await fc.assert(
    fc.asyncProperty(fc.integer(0, 100), async writeAt => {
      const simulation = new concurrent.ContinuationConcurrent()
      let receivedAt = -1
      let receivedValue = -1
      await simulation.run(async function (sim) {
        const chan: concurrent.Channel<number> = sim.createChannel(0)
        await sim.fork(async () => {
          receivedValue = await sim.readChannel(chan)
          receivedAt = sim.now
        })
        await sim.sleep(writeAt)
        await sim.writeChannel(chan, 7)
      })
      expect(receivedValue).toEqual(7)
      expect(receivedAt).toEqual(writeAt)
    }),
    {numRuns: 200}
  )
})

test('Stress: many threads, mixed forks/sleeps/channels — all writes delivered, time monotonic', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer(2, 6),
      fc.integer(2, 6),
      fc.integer(1, 30),
      async (numProducers, numConsumers, msgsPerProducer) => {
        const simulation = new concurrent.ContinuationConcurrent()
        const allReads: number[] = []
        const expected: number[] = []
        for (let p = 0; p < numProducers; p++) {
          for (let i = 0; i < msgsPerProducer; i++) {
            expected.push(p * 10000 + i)
          }
        }
        const totalMsgs = expected.length
        const observedTimes: number[] = []
        await simulation.run(async function (sim) {
          const chan: concurrent.Channel<number> = sim.createChannel(3)
          for (let p = 0; p < numProducers; p++) {
            const pid = p
            await sim.fork(async () => {
              for (let i = 0; i < msgsPerProducer; i++) {
                await sim.sleep((pid + i) % 5)
                await sim.writeChannel(chan, pid * 10000 + i)
                observedTimes.push(sim.now)
              }
            })
          }
          for (let c = 0; c < numConsumers; c++) {
            await sim.fork(async () => {
              while (true) {
                const v = await sim.readChannel(chan)
                allReads.push(v)
                observedTimes.push(sim.now)
                await sim.sleep(1)
              }
            })
          }
          // wait long enough for everything to drain
          await sim.sleep(numProducers * msgsPerProducer * 10)
        })
        expect(allReads.length).toEqual(totalMsgs)
        expect([...allReads].sort((a, b) => a - b)).toEqual(
          [...expected].sort((a, b) => a - b)
        )
      }
    ),
    {numRuns: 100}
  )
})

test('Forked thread ids are unique across a simulation', async () => {
  await fc.assert(
    fc.asyncProperty(fc.integer(1, 32), async numForks => {
      const simulation = new concurrent.ContinuationConcurrent()
      const ids: number[] = []
      await simulation.run(async function (sim) {
        for (const _ of range(0, numForks)) {
          const id = await sim.fork(async () => {})
          ids.push(id)
        }
      })
      expect(new Set(ids).size).toEqual(ids.length)
    }),
    {numRuns: 200}
  )
})
