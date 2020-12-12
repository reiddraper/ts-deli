export interface JobTiming {
    start: number;
    duration: number;
}
export interface RunJob {
    runJob(): Promise<void>;
}
