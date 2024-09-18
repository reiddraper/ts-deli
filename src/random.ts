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
  const nFloat = (nInt + gen.min()) / (gen.min() + gen.max())
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
