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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
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
exports.Deli = void 0;
const concurrent = __importStar(require("./control/concurrent"));
const tdigest = __importStar(require("tdigest"));
const generator = __importStar(require("./utils/generator"));
__exportStar(require("tdigest"), exports);
class Deli {
    constructor() {
        this.sojournStats = new tdigest.TDigest();
        this.waitStats = new tdigest.TDigest();
        this.perfectStats = new tdigest.TDigest();
    }
    stats() {
        return {
            sojournStats: this.sojournStats,
            waitStats: this.waitStats,
            perfectStats: this.perfectStats
        };
    }
    run(jobs, func) {
        return __awaiter(this, void 0, void 0, function* () {
            const conc = new concurrent.ContinuationConcurrent();
            const performJob = (j) => __awaiter(this, void 0, void 0, function* () {
                const beforeJob = conc.now;
                yield conc.sleep(j.duration);
                const afterJob = conc.now;
                this.sojournStats.push(afterJob - j.start);
                this.waitStats.push(beforeJob - j.start);
                this.perfectStats.push(j.duration);
            });
            const runnableJobs = generator.map(jobs, j => {
                return Object.assign(Object.assign({}, j), { runJob: () => __awaiter(this, void 0, void 0, function* () { return performJob(j); }) });
            });
            yield conc.run((sim) => __awaiter(this, void 0, void 0, function* () {
                const channel = sim.createChannel();
                yield sim.fork(() => __awaiter(this, void 0, void 0, function* () {
                    yield func(sim, channel);
                }));
                for (const job of runnableJobs) {
                    yield sim.sleep(job.start - sim.now);
                    yield sim.writeChannel(channel, job);
                }
            }));
            this.endTime = conc.now;
        });
    }
}
exports.Deli = Deli;
