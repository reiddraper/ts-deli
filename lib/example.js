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
exports.run = void 0;
const deli = __importStar(require("./deli"));
function logNowAndThread(msg, simulation) {
    console.log(`${msg} threadId=${simulation.currentlyRunningThreadId} now=${simulation.now}`);
}
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
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        const simulation = new deli.Deli();
        let counter = 0;
        yield simulation.run(function (sim) {
            return __awaiter(this, void 0, void 0, function* () {
                for (const x of range(0, 10 * 10)) {
                    yield sim.fork(() => __awaiter(this, void 0, void 0, function* () {
                        for (const y of range(0, 10 * 10)) {
                            yield sim.sleep(1);
                            logNowAndThread(`Did sleep ${x} ${y}`, sim);
                            counter++;
                        }
                    }));
                }
            });
        });
        console.log(`Counter is ${counter}`);
        console.log('Simulation is complete');
    });
}
exports.run = run;
