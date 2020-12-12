"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContinuationConcurrent = void 0;
const pqueue = __importStar(require("../data/priority-queue"));
var WakeupReason;
(function (WakeupReason) {
    WakeupReason["Sleep"] = "Sleep";
    WakeupReason["Fork"] = "Fork";
    WakeupReason["ForkYield"] = "ForkYield";
    WakeupReason["ReadYield"] = "ReadYield";
    WakeupReason["WriteYield"] = "WriteYield";
    WakeupReason["ChannelReadReady"] = "ChannelReadReady";
    WakeupReason["ChannelWriteReady"] = "ChannelWriteReady";
})(WakeupReason || (WakeupReason = {}));
class ContinuationConcurrent {
    constructor() {
        this.now = 0;
        // TODO: extract this into a function or better named variable?
        this.currentlyRunningThreadId = 0;
        this.nextThreadId = 0;
        this.nextChannelId = 0;
        this.scheduled = new pqueue.PriorityQueue();
        // we have to 'cast up' to `any` here, as we allow channels to be created with
        // different `T` values, and so there is no single `T` to use here for:
        // Record<Channel<T>, ChannelInternals<T>>
        this.channelAndWaiters = {};
        this.stillRunning = new Map();
    }
    clearThreadWaitingPromise() {
        if (this.stillRunning.has(this.currentlyRunningThreadId)) {
            const threadPromise = this.stillRunning.get(this.currentlyRunningThreadId);
            threadPromise.resolve();
            this.stillRunning.delete(this.currentlyRunningThreadId);
        }
    }
    next() {
        return __awaiter(this, void 0, void 0, function* () {
            const nextThread = this.scheduled.pop();
            if (nextThread === undefined) {
                return;
            }
            else {
                const [newNow, thread] = nextThread;
                this.now = newNow;
                this.currentlyRunningThreadId = thread.threadId;
                const resolveReceiver = {};
                const promise = new Promise(resolve => {
                    resolveReceiver['resolve'] = resolve;
                });
                const promiseTillNextYield = {
                    promise: promise,
                    resolve: resolveReceiver['resolve']
                };
                this.stillRunning.set(thread.threadId, promiseTillNextYield);
                thread.resolve();
                yield promise;
            }
        });
    }
    fork(func) {
        return __awaiter(this, void 0, void 0, function* () {
            this.clearThreadWaitingPromise();
            this.nextThreadId++;
            const threadId = this.nextThreadId;
            const funcWithClearedRunning = () => __awaiter(this, void 0, void 0, function* () {
                yield func();
                this.clearThreadWaitingPromise();
            });
            const resolveReceiver = {};
            const promise = new Promise(resolve => {
                resolveReceiver['resolve'] = resolve;
            });
            this.scheduled.insert(this.now, {
                threadId: this.currentlyRunningThreadId,
                resolve: resolveReceiver['resolve'],
                promise: promise,
                reason: WakeupReason.ForkYield
            });
            this.scheduled.insert(this.now, {
                threadId,
                resolve: funcWithClearedRunning,
                reason: WakeupReason.Fork
            });
            yield promise;
            return threadId;
        });
    }
    sleep(duration) {
        return __awaiter(this, void 0, void 0, function* () {
            this.clearThreadWaitingPromise();
            const when = this.now + duration;
            const resolveReceiver = {};
            const promise = new Promise(resolve => {
                resolveReceiver['resolve'] = resolve;
            });
            this.scheduled.insert(when, {
                threadId: this.currentlyRunningThreadId,
                resolve: resolveReceiver['resolve'],
                promise: promise,
                reason: WakeupReason.Sleep
            });
            yield promise;
        });
    }
    createChannel(size) {
        const channelId = this.nextChannelId;
        this.nextChannelId++;
        const channel = { id: channelId, size };
        this.channelAndWaiters[channel] = {
            contents: [],
            readers: [],
            writers: []
        };
        return channel;
    }
    readChannel(chan) {
        return __awaiter(this, void 0, void 0, function* () {
            const channelInternals = this.channelAndWaiters[chan];
            if (channelInternals.contents.length === 0) {
                const resolveReceiver = {};
                const promise = new Promise(resolve => {
                    resolveReceiver['resolve'] = resolve;
                });
                const thread = {
                    threadId: this.currentlyRunningThreadId,
                    resolve: resolveReceiver['resolve'],
                    promise: promise,
                    reason: WakeupReason.ChannelReadReady
                };
                channelInternals.readers.push(thread);
                // before we wait, wake up any writers
                if (channelInternals.writers.length > 0) {
                    // we know this non-null assertion is safe because
                    // of the length check above
                    const nextWriter = channelInternals.writers.shift();
                    this.scheduled.insert(this.now, nextWriter);
                }
                this.clearThreadWaitingPromise();
                yield promise;
                return this.readChannel(chan);
            }
            else {
                if (channelInternals.writers.length > 0) {
                    // we know this non-null assertion is safe because
                    // of the length check above
                    const nextWriter = channelInternals.writers.shift();
                    this.scheduled.insert(this.now, nextWriter);
                }
                const resolveReceiver = {};
                const promise = new Promise(resolve => {
                    resolveReceiver['resolve'] = resolve;
                });
                const myThread = {
                    threadId: this.currentlyRunningThreadId,
                    resolve: resolveReceiver['resolve'],
                    promise: promise,
                    reason: WakeupReason.ReadYield
                };
                this.scheduled.insert(this.now, myThread);
                const item = channelInternals.contents.shift();
                this.clearThreadWaitingPromise();
                yield promise;
                return item;
            }
        });
    }
    writeChannel(chan, item) {
        return __awaiter(this, void 0, void 0, function* () {
            const channelInternals = this.channelAndWaiters[chan];
            if (chan.size !== undefined &&
                channelInternals.contents.length >= chan.size &&
                channelInternals.readers.length === 0) {
                const resolveReceiver = {};
                const promise = new Promise(resolve => {
                    resolveReceiver['resolve'] = resolve;
                });
                const thread = {
                    threadId: this.currentlyRunningThreadId,
                    resolve: resolveReceiver['resolve'],
                    promise: promise,
                    reason: WakeupReason.ChannelWriteReady
                };
                channelInternals.writers.push(thread);
                this.clearThreadWaitingPromise();
                yield promise;
            }
            channelInternals.contents.push(item);
            // now notify any pending readers
            if (channelInternals.readers.length > 0) {
                // we know this non-null assertion is safe because
                // of the length check above
                const nextReader = channelInternals.readers.shift();
                this.scheduled.insert(this.now, nextReader);
            }
            // now we need to yield, in order to make sure
            // if there is another thread waiting to read,
            // that they are now woken up, instead of us
            // potentially going right into another read
            // call in our own thread.
            // This also ensures we don't return until the
            // reader has actually read the value, which is
            // part of the correctness for buffered channels
            const resolveReceiver = {};
            const promise = new Promise(resolve => {
                resolveReceiver['resolve'] = resolve;
            });
            const thread = {
                threadId: this.currentlyRunningThreadId,
                resolve: resolveReceiver['resolve'],
                promise: promise,
                reason: WakeupReason.WriteYield
            };
            this.scheduled.insert(this.now, thread);
            this.clearThreadWaitingPromise();
            yield promise;
        });
    }
    run(func) {
        return __awaiter(this, void 0, void 0, function* () {
            const funcWithClearedRunning = () => __awaiter(this, void 0, void 0, function* () {
                yield func(this);
                this.clearThreadWaitingPromise();
            });
            funcWithClearedRunning();
            while (this.scheduled.length() > 0) {
                while (this.scheduled.length() > 0) {
                    yield this.next();
                }
                //await Promise.all(this.stillRunning.values())
            }
        });
    }
}
exports.ContinuationConcurrent = ContinuationConcurrent;
