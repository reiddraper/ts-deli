"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uniform = exports.exponential = void 0;
// Value should be a float between 0 and 1
function scale(min, max, value) {
    const scaledValue = value * (max - min);
    return min + scaledValue;
}
function float(gen) {
    const [nInt, newGen] = gen.next();
    return [(nInt + gen.min()) / (gen.min() + gen.max()), newGen];
}
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
function* uniform(gen, min, max) {
    let [n, nextState] = float(gen);
    yield scale(min, max, n);
    while (true) {
        ;
        [n, nextState] = float(nextState);
        yield scale(min, max, n);
    }
}
exports.uniform = uniform;
