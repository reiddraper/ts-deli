"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvablePromise = void 0;
function resolvablePromise() {
    const resolveReceiver = {};
    const promise = new Promise(resolve => {
        resolveReceiver['resolve'] = resolve;
    });
    return { promise, resolve: resolveReceiver['resolve'] };
}
exports.resolvablePromise = resolvablePromise;
