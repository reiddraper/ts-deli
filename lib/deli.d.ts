import * as concurrent from './control/concurrent';
export declare class Deli {
    endTime?: number;
    run(func: (conc: concurrent.Concurrent) => Promise<void>): Promise<void>;
}
