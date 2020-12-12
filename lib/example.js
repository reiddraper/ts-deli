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
function simpleExample() {
    return __awaiter(this, void 0, void 0, function* () {
        const simulation = new deli.Deli();
        const jobs = [
            { start: 15, duration: 10 },
            { start: 20, duration: 10 },
            { start: 25, duration: 10 }
        ];
        yield simulation.run(jobs, (sim, channel) => __awaiter(this, void 0, void 0, function* () {
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const job = yield sim.readChannel(channel);
                yield job.runJob();
            }
        }));
        console.log('Simulation is complete');
        console.log(`End time is ${simulation.endTime}`);
        console.log(`p50 job time ${simulation.stats().sojournStats.percentile(0.5)}`);
        console.log(`p99 job time ${simulation.stats().sojournStats.percentile(0.99)}`);
    });
}
exports.simpleExample = simpleExample;
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        yield simpleExample();
    });
}
exports.run = run;
