export declare class PriorityQueue<T> {
    data: [number, T][];
    insert(p: number, i: T): void;
    pop(): undefined | [number, T];
    length(): number;
    inspect(): [number, T][];
}
