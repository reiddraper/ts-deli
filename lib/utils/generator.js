"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.map = void 0;
function* map(generator, mapper) {
    for (const x of generator) {
        yield mapper(x);
    }
}
exports.map = map;
