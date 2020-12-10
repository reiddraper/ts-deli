export interface JobTiming {
    start: number;
    duration: number;
}
export interface RunJob {
    runJob(job: JobTiming): Promise<void>;
}
