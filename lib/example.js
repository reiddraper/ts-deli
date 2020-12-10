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
exports.run = exports.readAfterRead = exports.exampleOne = void 0;
const deli = __importStar(require("./deli"));
function* range(start, stop, step = 1) {
    if (stop == null) {
        // one param defined
        stop = start;
        start = 0;
    }
    for (let i = start; step > 0 ? i < stop : i > stop; i += step) {
        yield i;
    }
}
function exampleOne() {
    return __awaiter(this, void 0, void 0, function* () {
        const simulation = new deli.Deli();
        let counter = 0;
        yield simulation.run([], (sim) => __awaiter(this, void 0, void 0, function* () {
            const channel = sim.createChannel(0);
            const count = 2;
            yield sim.fork(() => __awaiter(this, void 0, void 0, function* () {
                for (const x of range(0, count)) {
                    console.log(`1 (${sim.currentlyRunningThreadId})    X=${x}`);
                    const val = yield sim.readChannel(channel);
                    console.log(`1 (${sim.currentlyRunningThreadId})    received ${val}`);
                    console.log(`1 (${sim.currentlyRunningThreadId})    now going into write`);
                    yield sim.writeChannel(channel, [1, x]);
                    console.log(`1 (${sim.currentlyRunningThreadId})    succesfully wrote: [1, ${x}]`);
                    counter++;
                }
            }));
            for (const y of range(0, count)) {
                console.log(`0 (${sim.currentlyRunningThreadId})    Y=${y}`);
                yield sim.writeChannel(channel, [0, y]);
                console.log(`0 (${sim.currentlyRunningThreadId})    succesfully wrote: [0, ${y}]`);
                console.log(`0 (${sim.currentlyRunningThreadId})    now going into read`);
                const val = yield sim.readChannel(channel);
                console.log(`0 (${sim.currentlyRunningThreadId})    received ${val}`);
                counter++;
            }
        }));
        console.log(`Counter is ${counter}`);
        console.log('Simulation is complete');
    });
}
exports.exampleOne = exampleOne;
function readAfterRead() {
    return __awaiter(this, void 0, void 0, function* () {
        const simulation = new deli.Deli();
        let counter = 0;
        yield simulation.run([], (sim) => __awaiter(this, void 0, void 0, function* () {
            const channel = sim.createChannel(0);
            yield sim.fork(() => __awaiter(this, void 0, void 0, function* () {
                // eslint-disable-next-line no-constant-condition
                while (true) {
                    const val = yield sim.readChannel(channel);
                    console.log(`Read value ${val}`);
                    yield sim.sleep(val);
                    console.log(`Slept for ${val}`);
                    counter++;
                }
            }));
            yield sim.writeChannel(channel, 0);
            console.log(`Finished writing`);
        }));
        console.log('Simulation is complete');
        console.log(`Counter is ${counter}`);
    });
}
exports.readAfterRead = readAfterRead;
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        yield readAfterRead();
    });
}
exports.run = run;
