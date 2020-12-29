export declare function map<A, B>(mapper: (val: A) => B, generator: Generator<A> | A[]): Generator<B>;
export declare function take<A>(count: number, generator: Generator<A>): Generator<A>;
export declare function zip<A, B>(a: Generator<A>, b: Generator<B>): Generator<[A, B]>;
export declare function zip3<A, B, C>(a: Generator<A>, b: Generator<B>, c: Generator<C>): Generator<[A, B, C]>;
export declare function zipWith<A, B, C>(fn: (a: A, b: B) => C, a: Generator<A>, b: Generator<B>): Generator<C>;
export declare function scan<A>(fn: (prev: A, current: A) => A, gen: Generator<A>): Generator<A>;
