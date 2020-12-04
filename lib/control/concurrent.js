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
})(WakeupReason || (WakeupReason = {}));
class ContinuationConcurrent {
    constructor() {
        this.now = 0;
        this.nextThreadId = 0;
        // TODO: extract this into a function or better named variable?
        this.currentlyRunningThreadId = 0;
        this.scheduled = new pqueue.PriorityQueue();
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
                thread.run();
                if (thread.promise !== undefined) {
                    yield thread.promise;
                }
            }
        });
    }
    fork(func) {
        return __awaiter(this, void 0, void 0, function* () {
            this.nextThreadId++;
            const threadId = this.nextThreadId;
            const resolveReceiver = {};
            const promise = new Promise(resolve => {
                resolveReceiver['resolve'] = resolve;
            });
            this.scheduled.insert(this.now, {
                threadId: this.currentlyRunningThreadId,
                run: resolveReceiver['resolve'],
                promise: promise,
                reason: WakeupReason.Fork
            });
            this.scheduled.insert(this.now, {
                threadId,
                run: func,
                reason: WakeupReason.Fork
            });
            yield promise;
            return threadId;
        });
    }
    sleep(duration) {
        return __awaiter(this, void 0, void 0, function* () {
            const when = this.now + duration;
            const threadId = this.currentlyRunningThreadId;
            const resolveReceiver = {};
            const promise = new Promise(resolve => {
                resolveReceiver['resolve'] = resolve;
            });
            this.scheduled.insert(when, {
                threadId,
                run: resolveReceiver['resolve'],
                promise: promise,
                reason: WakeupReason.Sleep
            });
            yield promise;
        });
    }
    run(func) {
        return __awaiter(this, void 0, void 0, function* () {
            func(this);
            while (this.scheduled.length() > 0) {
                yield this.next();
            }
        });
    }
}
exports.ContinuationConcurrent = ContinuationConcurrent;
