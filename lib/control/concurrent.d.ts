export declare class Concurrent {
    now: number;
    private nextThreadId;
    currentlyRunningThreadId: number;
    private scheduled;
    next(): Promise<void>;
    fork(func: () => Promise<void>): Promise<number>;
    sleep(duration: number): Promise<void>;
    run(func: (concurrent: Concurrent) => Promise<void>): Promise<void>;
}
