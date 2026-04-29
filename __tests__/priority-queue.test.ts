import * as fc from 'fast-check'
import {PriorityQueue} from '../src/data/priority-queue'

test('Empty queue: pop returns undefined, length is 0', () => {
  const q = new PriorityQueue<string>()
  expect(q.length()).toEqual(0)
  expect(q.pop()).toBeUndefined()
})

test('Pop returns items in non-decreasing priority order', async () => {
  await fc.assert(
    fc.property(
      fc.array(fc.tuple(fc.integer(), fc.string()), {maxLength: 64}),
      pairs => {
        const q = new PriorityQueue<string>()
        for (const [p, v] of pairs) q.insert(p, v)
        const popped: number[] = []
        while (q.length() > 0) {
          popped.push(q.pop()![0])
        }
        for (let i = 1; i < popped.length; i++) {
          expect(popped[i]).toBeGreaterThanOrEqual(popped[i - 1])
        }
      }
    ),
    {numRuns: 1000}
  )
})

test('Equal priorities pop in insertion order (FIFO stability)', async () => {
  // FIFO at equal priority is load-bearing: the scheduler relies on it for
  // fairness between same-time wakeups (e.g., woken reader vs. yielding writer).
  await fc.assert(
    fc.property(fc.array(fc.string(), {maxLength: 64}), values => {
      const q = new PriorityQueue<string>()
      for (const v of values) q.insert(7, v) // all the same priority
      const popped: string[] = []
      while (q.length() > 0) popped.push(q.pop()![1])
      expect(popped).toEqual(values)
    }),
    {numRuns: 500}
  )
})

test('Mixed priorities: equal-priority items maintain insertion order', () => {
  const q = new PriorityQueue<string>()
  q.insert(2, 'b1')
  q.insert(1, 'a1')
  q.insert(2, 'b2')
  q.insert(1, 'a2')
  q.insert(3, 'c1')
  q.insert(2, 'b3')
  const out: string[] = []
  while (q.length() > 0) out.push(q.pop()![1])
  expect(out).toEqual(['a1', 'a2', 'b1', 'b2', 'b3', 'c1'])
})

test('length() tracks insert/pop balance', async () => {
  await fc.assert(
    fc.property(
      fc.array(
        fc.oneof(
          fc.record({op: fc.constant<'i'>('i'), p: fc.integer()}),
          fc.record({op: fc.constant<'p'>('p')})
        ),
        {maxLength: 100}
      ),
      ops => {
        const q = new PriorityQueue<number>()
        let expectedLen = 0
        for (const op of ops) {
          if (op.op === 'i') {
            q.insert((op as {op: 'i'; p: number}).p, 0)
            expectedLen++
          } else {
            const r = q.pop()
            if (r !== undefined) expectedLen--
          }
          expect(q.length()).toEqual(expectedLen)
        }
      }
    ),
    {numRuns: 500}
  )
})
