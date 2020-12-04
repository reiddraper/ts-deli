import * as concurrent from './control/concurrent';
import * as tdigest from 'tdigest';
export declare class Deli {
    endTime?: number;
    sojournStats: tdigest.TDigest;
    run(func: (conc: concurrent.Concurrent) => Promise<void>): Promise<void>;
}
