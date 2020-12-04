declare module 'tdigest' {
  export class TDigest {
    push(x: number): void
    compress: void
    percentile(percentile: number): number
  }
}
