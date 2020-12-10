import * as concurrent from './control/concurrent';
import * as tdigest from 'tdigest';
import { JobTiming } from './types/job';
export declare class Deli {
    endTime?: number;
    sojournStats: tdigest.TDigest;
    waitStats: tdigest.TDigest;
    perfectStats: tdigest.TDigest;
    run(jobs: Generator<JobTiming> | JobTiming[], func: (conc: concurrent.Concurrent) => Promise<void>): Promise<void>;
}
