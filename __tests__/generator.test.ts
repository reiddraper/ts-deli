import * as fc from 'fast-check'
import * as gen from '../src/utils/generator'

function* fromArray<T>(arr: T[]): Generator<T> {
  for (const x of arr) yield x
}

function* infinite(): Generator<number> {
  let i = 0
  while (true) yield i++
}

function* counted(arr: number[], counter: {n: number}): Generator<number> {
  for (const x of arr) {
    counter.n++
    yield x
  }
}

// -- map --

test('map matches Array.prototype.map for finite arrays', async () => {
  await fc.assert(
    fc.property(fc.array(fc.integer()), arr => {
      const f = (x: number): number => x * 2 + 1
      expect([...gen.map(f, fromArray(arr))]).toEqual(arr.map(f))
    }),
    {numRuns: 500}
  )
})

test('map on empty generator yields nothing', () => {
  expect([...gen.map((x: number) => x, fromArray([]))]).toEqual([])
})

// -- take --

test('take(n, finite) yields the first min(n, |xs|) elements', async () => {
  await fc.assert(
    fc.property(fc.array(fc.integer()), fc.integer(0, 100), (arr, n) => {
      const got = [...gen.take(n, fromArray(arr))]
      expect(got).toEqual(arr.slice(0, n))
    }),
    {numRuns: 500}
  )
})

test('take(n, infinite) yields exactly n elements', async () => {
  await fc.assert(
    fc.property(fc.integer(0, 1000), n => {
      const got = [...gen.take(n, infinite())]
      expect(got.length).toEqual(n)
      expect(got).toEqual(Array.from({length: n}, (_, i) => i))
    }),
    {numRuns: 100}
  )
})

test('take(n, gen) consumes exactly n items from the source', async () => {
  // Catches over-consumption: a `take` that calls .next() once more than
  // it yields would advance the source past where the user expects.
  await fc.assert(
    fc.property(fc.integer(0, 50), fc.integer(0, 50), (n, total) => {
      const arr = Array.from({length: total}, (_, i) => i)
      const counter = {n: 0}
      const src = counted(arr, counter)
      const taken = [...gen.take(n, src)]
      expect(taken.length).toEqual(Math.min(n, total))
      expect(counter.n).toEqual(Math.min(n, total))
    }),
    {numRuns: 500}
  )
})

test('take(0, gen) yields nothing and (ideally) consumes nothing', () => {
  const counter = {n: 0}
  const src = counted([10, 20, 30], counter)
  const taken = [...gen.take(0, src)]
  expect(taken).toEqual([])
  expect(counter.n).toEqual(0)
})

// -- zip / zip3 --

test('zip length is min of input lengths', async () => {
  await fc.assert(
    fc.property(fc.array(fc.integer()), fc.array(fc.integer()), (a, b) => {
      const got = [...gen.zip(fromArray(a), fromArray(b))]
      expect(got.length).toEqual(Math.min(a.length, b.length))
    }),
    {numRuns: 500}
  )
})

test('zip pairs corresponding indices', async () => {
  await fc.assert(
    fc.property(fc.array(fc.integer()), fc.array(fc.integer()), (a, b) => {
      const got = [...gen.zip(fromArray(a), fromArray(b))]
      const limit = Math.min(a.length, b.length)
      for (let i = 0; i < limit; i++) {
        expect(got[i]).toEqual([a[i], b[i]])
      }
    }),
    {numRuns: 500}
  )
})

test('zip3 length is min of three input lengths', async () => {
  await fc.assert(
    fc.property(
      fc.array(fc.integer()),
      fc.array(fc.integer()),
      fc.array(fc.integer()),
      (a, b, c) => {
        const got = [...gen.zip3(fromArray(a), fromArray(b), fromArray(c))]
        expect(got.length).toEqual(Math.min(a.length, b.length, c.length))
      }
    ),
    {numRuns: 500}
  )
})

// -- zipWith --

test('zipWith equals map(f) over zip(a,b)', async () => {
  await fc.assert(
    fc.property(fc.array(fc.integer()), fc.array(fc.integer()), (a, b) => {
      const f = (x: number, y: number): number => x + y * 100
      const direct = [...gen.zipWith(f, fromArray(a), fromArray(b))]
      const indirect = [...gen.zip(fromArray(a), fromArray(b))].map(([x, y]) =>
        f(x, y)
      )
      expect(direct).toEqual(indirect)
    }),
    {numRuns: 500}
  )
})

// -- scan --

test('scan on empty yields nothing', () => {
  const f = (a: number, b: number): number => a + b
  expect([...gen.scan(f, fromArray([]))]).toEqual([])
})

test('scan on single element yields just that element', async () => {
  await fc.assert(
    fc.property(fc.integer(), x => {
      const f = (a: number, b: number): number => a + b
      expect([...gen.scan(f, fromArray([x]))]).toEqual([x])
    }),
    {numRuns: 100}
  )
})

test('scan with addition produces running sum', async () => {
  await fc.assert(
    fc.property(fc.array(fc.integer(-1000, 1000), {minLength: 1}), arr => {
      const f = (a: number, b: number): number => a + b
      const got = [...gen.scan(f, fromArray(arr))]
      const expected: number[] = []
      let acc = arr[0]
      expected.push(acc)
      for (let i = 1; i < arr.length; i++) {
        acc = f(acc, arr[i])
        expected.push(acc)
      }
      expect(got).toEqual(expected)
    }),
    {numRuns: 500}
  )
})

test('scan output length equals input length', async () => {
  await fc.assert(
    fc.property(fc.array(fc.integer()), arr => {
      const f = (a: number, b: number): number => a * b
      expect([...gen.scan(f, fromArray(arr))].length).toEqual(arr.length)
    }),
    {numRuns: 500}
  )
})

// -- composition: example.ts shape --

test('scan over zipWith mimics the example.ts arrival-time pipeline', () => {
  // Mirrors what example.ts does: take random "starts" (relative deltas) and
  // accumulate them into absolute arrival times.
  type Job = {start: number; duration: number}
  const durations = fromArray([0.1, 0.2, 0.3, 0.4, 0.5])
  const arrivals = fromArray([10, 20, 30, 40, 50])
  const random = gen.zipWith(
    (duration: number, arrival: number): Job => ({start: arrival, duration}),
    durations,
    arrivals
  )
  const cumulative = gen.scan(
    (a: Job, b: Job): Job => ({start: a.start + b.start, duration: b.duration}),
    random
  )
  const out = [...cumulative]
  expect(out.map(j => j.start)).toEqual([10, 30, 60, 100, 150])
  expect(out.map(j => j.duration)).toEqual([0.1, 0.2, 0.3, 0.4, 0.5])
})
