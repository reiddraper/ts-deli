export interface ResolvablePromise {
    promise: Promise<void>;
    resolve: () => void;
}
export declare function resolvablePromise(): ResolvablePromise;
