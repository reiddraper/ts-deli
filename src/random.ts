import {RandomGenerator} from 'pure-rand'

// Value should be a float between 0 and 1
function scale(min: number, max: number, value: number): number {
  const scaledValue = value * (max - min)
  return min + scaledValue
}

function float(gen: RandomGenerator): [number, RandomGenerator] {
  const [nInt, newGen] = gen.next()
  return [(nInt + gen.min()) / (gen.min() + gen.max()), newGen]
}

function exponentialQuantile(
  gen: RandomGenerator,
  rate: number
): [number, RandomGenerator] {
  const [nInt, nextState] = gen.next()
  // Map uniformly into [0, 1): use `range + 1` as the divisor so that the
  // largest possible `nInt` (== gen.max()) cannot produce u == 1, which
  // would feed `Math.log(0) = -Infinity` and yield +Infinity from the
  // quantile function.
  const range = gen.max() - gen.min() + 1
  const nFloat = (nInt - gen.min()) / range
  const value = -Math.log(1.0 - nFloat) / rate
  return [value, nextState]
}

export function* exponential(
  gen: RandomGenerator,
  rate: number
): Generator<number> {
  let [n, nextState] = exponentialQuantile(gen, rate)
  yield n
  while (true) {
    ;[n, nextState] = exponentialQuantile(nextState, rate)
    yield n
  }
}

export function* uniform(
  gen: RandomGenerator,
  min: number,
  max: number
): Generator<number> {
  let [n, nextState] = float(gen)
  yield scale(min, max, n)
  while (true) {
    ;[n, nextState] = float(nextState)
    yield scale(min, max, n)
  }
}

function paretoQuantile(
  gen: RandomGenerator,
  alpha: number,
  xm: number
): [number, RandomGenerator] {
  const [nInt, nextState] = gen.next()
  // Map uniformly into [0, 1): same `range + 1` trick as exponentialQuantile
  // so u==1 cannot occur (which would feed Math.pow(0, ...)==0 and yield
  // Infinity from the quantile).
  const range = gen.max() - gen.min() + 1
  const nFloat = (nInt - gen.min()) / range
  const value = xm / Math.pow(1.0 - nFloat, 1.0 / alpha)
  return [value, nextState]
}

// Pareto Type I, parameterized by mean (1.16 default for α matches the
// Haskell Deli.Random.durationParetoDistribution). Mean exists for α > 1;
// variance is infinite for α ≤ 2 (true at α=1.16) — that heavy tail is the
// whole reason this distribution is interesting for queueing models.
export function* pareto(
  gen: RandomGenerator,
  mean: number,
  alpha = 1.16
): Generator<number> {
  const xm = (mean * (alpha - 1)) / alpha
  let [n, nextState] = paretoQuantile(gen, alpha, xm)
  yield n
  while (true) {
    ;[n, nextState] = paretoQuantile(nextState, alpha, xm)
    yield n
  }
}
