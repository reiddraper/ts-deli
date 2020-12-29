"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exponential = void 0;
function exponentialQuantile(gen, rate) {
    const [nInt, nextState] = gen.next();
    const nFloat = (nInt + gen.min()) / (gen.min() + gen.max());
    const value = -Math.log(1.0 - nFloat) / rate;
    return [value, nextState];
}
function* exponential(gen, rate) {
    let [n, nextState] = exponentialQuantile(gen, rate);
    yield n;
    while (true) {
        ;
        [n, nextState] = exponentialQuantile(nextState, rate);
        yield n;
    }
}
exports.exponential = exponential;
