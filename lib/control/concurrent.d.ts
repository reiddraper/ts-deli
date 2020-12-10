export declare type Channel<T> = {
    id: number;
    size?: number;
};
export interface Concurrent {
    now: number;
    currentlyRunningThreadId: number;
    fork(func: () => Promise<void>): Promise<number>;
    sleep(duration: number): Promise<void>;
    createChannel<T>(size?: number): Channel<T>;
    readChannel<T>(chan: Channel<T>): Promise<T>;
    writeChannel<T>(chan: Channel<T>, item: T): Promise<void>;
}
export declare class ContinuationConcurrent {
    now: number;
    currentlyRunningThreadId: number;
    private nextThreadId;
    private nextChannelId;
    private scheduled;
    private channelAndWaiters;
    private stillRunning;
    clearThreadWaitingPromise(): void;
    private next;
    fork(func: () => Promise<void>): Promise<number>;
    sleep(duration: number): Promise<void>;
    createChannel<T>(size?: number): Channel<T>;
    readChannel<T>(chan: Channel<T>): Promise<T>;
    writeChannel<T>(chan: Channel<T>, item: T): Promise<void>;
    run(func: (concurrent: Concurrent) => Promise<void>): Promise<void>;
}
