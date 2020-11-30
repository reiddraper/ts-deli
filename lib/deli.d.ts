export declare class Deli {
    now: number;
    private nextThreadId;
    currentlyRunningThreadId: number;
    private scheduled;
    debug(): void;
    next(): Promise<void>;
    fork(func: () => Promise<void>): Promise<number>;
    sleep(duration: number): Promise<void>;
    run(func: (deli: Deli) => Promise<void>): Promise<void>;
}
