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
exports.run = exports.simpleExample = void 0;
const deli = __importStar(require("./deli"));
const prand = __importStar(require("pure-rand"));
function simpleExample() {
    return __awaiter(this, void 0, void 0, function* () {
        const simulation = new deli.Deli();
        const gen = prand.mersenne(Math.random() * Number.MAX_SAFE_INTEGER);
        const gen2 = prand.mersenne(Math.random() * Number.MAX_SAFE_INTEGER);
        //const durations = deli.random.uniform(gen, 0, 4)
        //const durations = deli.random.exponential(gen, 0.693)
        const durations = deli.generator.constant(1);
        const arrivals = deli.generator.constant(1);
        const randomJobs = deli.generator.zipWith((duration, arrival) => {
            return { start: arrival, duration };
        }, durations, arrivals);
        const jobs = deli.generator.scan((a, b) => {
            return { start: a.start + b.start, duration: b.duration };
        }, randomJobs);
        // print first 100 jobs
        // for (const x of deli.generator.take(100, jobs)) {
        //   console.log(`${JSON.stringify(x)}`)
        // }
        //const truncatedJobs = deli.generator.take(64 * 1000, jobs)
        const truncatedJobs = deli.generator.take(64 * 1000, deli.generator.repeat(jobs, 2));
        yield simulation.run(truncatedJobs, (sim, channel) => __awaiter(this, void 0, void 0, function* () {
            for (let n = 0; n < 2; n++) {
                yield sim.fork(() => __awaiter(this, void 0, void 0, function* () {
                    // eslint-disable-next-line no-constant-condition
                    while (true) {
                        const job = yield sim.readChannel(channel);
                        yield job.runJob();
                    }
                }));
            }
        }));
        console.log('Simulation is complete');
        console.log(`End time is ${simulation.endTime}`);
        console.log(`\n`);
        console.log(`Total request time`);
        console.log(`p50 ${simulation.stats().sojournStats.percentile(0.5)}`);
        console.log(`p99 ${simulation.stats().sojournStats.percentile(0.99)}`);
        console.log(`\n`);
        console.log(`Time waiting in queues`);
        console.log(`p50 ${simulation.stats().waitStats.percentile(0.5)}`);
        console.log(`p99 ${simulation.stats().waitStats.percentile(0.99)}`);
        console.log(`\n`);
        console.log(`Theoretical best total time`);
        console.log(`p50 ${simulation.stats().perfectStats.percentile(0.5)}`);
        console.log(`p99 ${simulation.stats().perfectStats.percentile(0.99)}`);
    });
}
exports.simpleExample = simpleExample;
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        yield simpleExample();
    });
}
exports.run = run;
