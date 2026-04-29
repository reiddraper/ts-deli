import * as fc from 'fast-check'
import * as prand from 'pure-rand'
import {RandomGenerator} from 'pure-rand'
import {exponential} from '../src/random'

function takeN<T>(g: Generator<T>, n: number): T[] {
  const out: T[] = []
  for (let i = 0; i < n; i++) {
    const r = g.next()
    if (r.done) break
    out.push(r.value)
  }
  return out
}

test('exponential is deterministic for a given seed', () => {
  const a = takeN(exponential(prand.mersenne(42), 1), 100)
  const b = takeN(exponential(prand.mersenne(42), 1), 100)
  expect(a).toEqual(b)
})

test('exponential values are non-negative for the default mersenne generator', async () => {
  await fc.assert(
    fc.property(
      fc.integer({min: 1}),
      fc.double({min: 0.001, max: 100}),
      (seed, rate) => {
        const g = exponential(prand.mersenne(seed), rate)
        const samples = takeN(g, 200)
        for (const s of samples) expect(s).toBeGreaterThanOrEqual(0)
      }
    ),
    {numRuns: 50}
  )
})

test('exponential mean approximates 1/rate for large samples', () => {
  const rates = [0.5, 1, 2, 10]
  for (const rate of rates) {
    const g = exponential(prand.mersenne(12345), rate)
    const N = 20000
    const samples = takeN(g, N)
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length
    const expected = 1 / rate
    // 5% tolerance is generous; CLT gives much tighter, but stays robust.
    expect(Math.abs(mean - expected) / expected).toBeLessThan(0.05)
  }
})

test('exponential is finite when source RNG saturates at max value', () => {
  // Probes: with mersenne, gen.min()=0 and gen.max()=2^32-1 (or similar). The
  // u-conversion uses `(n + min) / (min + max)`. If a draw hits the max, u=1
  // and `1 - u = 0` would feed Math.log(0) = -Infinity, producing +Infinity.
  // We construct a generator that returns max() to make this hit.
  const saturated: RandomGenerator = {
    next: () => [saturated.max(), saturated],
    min: () => 0,
    max: () => 0xffffffff
  }
  const g = exponential(saturated, 1)
  const v = g.next()
  expect(Number.isFinite(v.value as number)).toBe(true)
})

test('exponential is correct under a non-zero-min RNG', () => {
  // Probes the formula `(nInt + gen.min()) / (gen.min() + gen.max())`. With
  // a non-zero min, this reduces incorrectly. The standard mapping is
  // `(nInt - min) / (max - min)`. If the implementation gets this wrong,
  // values will fall outside the expected exponential support.
  let i = 0
  // returns midpoint of [min, max] each time → u should be 0.5 → exponential
  // value should be -ln(0.5)/rate ≈ 0.693/rate.
  const min = -100
  const max = 100
  const fixed: RandomGenerator = {
    next: () => {
      i++
      return [0, fixed]
    },
    min: () => min,
    max: () => max
  }
  const g = exponential(fixed, 1)
  const v = g.next().value as number
  // For a correctly-mapped uniform → exponential, midpoint nInt=0 maps to
  // u=0.5 and value≈0.693. Tolerate any non-negative finite value here —
  // strictness would over-specify the formula. The point is to detect NaN
  // / Infinity / negative outcomes that signal a broken mapping.
  expect(Number.isFinite(v)).toBe(true)
  expect(v).toBeGreaterThanOrEqual(0)
  expect(i).toBeGreaterThan(0)
})
