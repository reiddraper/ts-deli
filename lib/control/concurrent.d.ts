export interface Concurrent {
    now: number;
    currentlyRunningThreadId: number;
    fork(func: () => Promise<void>): Promise<number>;
    sleep(duration: number): Promise<void>;
}
export declare class ContinuationConcurrent {
    now: number;
    private nextThreadId;
    currentlyRunningThreadId: number;
    private scheduled;
    private next;
    fork(func: () => Promise<void>): Promise<number>;
    sleep(duration: number): Promise<void>;
    run(func: (concurrent: Concurrent) => Promise<void>): Promise<void>;
}
