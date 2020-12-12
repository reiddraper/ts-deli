import * as concurrent from './control/concurrent';
import * as tdigest from 'tdigest';
import { JobTiming, RunJob } from './types/job';
export { Concurrent, Channel } from './control/concurrent';
export { JobTiming, RunJob } from './types/job';
export * from 'tdigest';
export declare class Deli {
    endTime?: number;
    private sojournStats;
    private waitStats;
    private perfectStats;
    stats(): {
        sojournStats: tdigest.TDigestReadOnly;
        waitStats: tdigest.TDigestReadOnly;
        perfectStats: tdigest.TDigestReadOnly;
    };
    run(jobs: Generator<JobTiming> | JobTiming[], func: (conc: concurrent.Concurrent, chan: concurrent.Channel<JobTiming & RunJob>) => Promise<void>): Promise<void>;
}
