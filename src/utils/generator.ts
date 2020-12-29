export function* map<A, B>(
  mapper: (val: A) => B,
  generator: Generator<A> | A[]
): Generator<B> {
  for (const x of generator) {
    yield mapper(x)
  }
}

export function* take<A>(count: number, generator: Generator<A>): Generator<A> {
  let i = 0
  for (const val of generator) {
    if (i < count) {
      yield val
      i++
    } else {
      return
    }
  }
}

export function* zip<A, B>(
  a: Generator<A>,
  b: Generator<B>
): Generator<[A, B]> {
  while (true) {
    const anext = a.next()
    const bnext = b.next()
    if (anext.done || bnext.done) {
      return
    } else {
      yield [anext.value, bnext.value]
    }
  }
}
export function* zip3<A, B, C>(
  a: Generator<A>,
  b: Generator<B>,
  c: Generator<C>
): Generator<[A, B, C]> {
  while (true) {
    const anext = a.next()
    const bnext = b.next()
    const cnext = c.next()
    if (anext.done || bnext.done || cnext.done) {
      return
    } else {
      yield [anext.value, bnext.value, cnext.value]
    }
  }
}

export function zipWith<A, B, C>(
  fn: (a: A, b: B) => C,
  a: Generator<A>,
  b: Generator<B>
): Generator<C> {
  return map(args => fn(...args), zip(a, b))
}

export function* scan<A>(
  fn: (prev: A, current: A) => A,
  gen: Generator<A>
): Generator<A> {
  const val1 = gen.next()
  if (!val1.done) {
    yield val1.value
    const val2 = gen.next()
    if (!val2.done) {
      let applied = fn(val1.value, val2.value)
      yield applied
      for (const val of gen) {
        applied = fn(applied, val)
        yield applied
      }
    }
  }
}
