export function* map<A, B>(
  generator: Generator<A> | A[],
  mapper: (val: A) => B
): Generator<B> {
  for (const x of generator) {
    yield mapper(x)
  }
}
