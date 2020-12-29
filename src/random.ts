import {RandomGenerator} from 'pure-rand'

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
