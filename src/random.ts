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
