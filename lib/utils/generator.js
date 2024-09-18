"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.repeat = exports.scan = exports.zipWith = exports.zip3 = exports.zip = exports.take = exports.map = exports.constant = void 0;
function* constant(value) {
    while (true) {
        yield value;
    }
}
exports.constant = constant;
function* map(mapper, generator) {
    for (const x of generator) {
        yield mapper(x);
    }
}
exports.map = map;
function* take(count, generator) {
    let i = 0;
    for (const val of generator) {
        if (i < count) {
            yield val;
            i++;
        }
        else {
            return;
        }
    }
}
exports.take = take;
function* zip(a, b) {
    while (true) {
        const anext = a.next();
        const bnext = b.next();
        if (anext.done || bnext.done) {
            return;
        }
        else {
            yield [anext.value, bnext.value];
        }
    }
}
exports.zip = zip;
function* zip3(a, b, c) {
    while (true) {
        const anext = a.next();
        const bnext = b.next();
        const cnext = c.next();
        if (anext.done || bnext.done || cnext.done) {
            return;
        }
        else {
            yield [anext.value, bnext.value, cnext.value];
        }
    }
}
exports.zip3 = zip3;
function zipWith(fn, a, b) {
    return map(args => fn(...args), zip(a, b));
}
exports.zipWith = zipWith;
function* scan(fn, gen) {
    const val1 = gen.next();
    if (!val1.done) {
        yield val1.value;
        const val2 = gen.next();
        if (!val2.done) {
            let applied = fn(val1.value, val2.value);
            yield applied;
            for (const val of gen) {
                applied = fn(applied, val);
                yield applied;
            }
        }
    }
}
exports.scan = scan;
function* repeat(items, count) {
    for (const item of items) {
        for (let i = 0; i < count; i++) {
            yield item;
        }
    }
}
exports.repeat = repeat;
