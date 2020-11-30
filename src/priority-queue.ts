export class PriorityQueue<T> {
  data: [number, T][] = []

  insert(p: number, i: T): void {
    if (this.data.length === 0) {
      this.data.push([p, i])
      return
    }

    for (let index = 0; index <= this.data.length; index++) {
      if (index === this.data.length) {
        this.data.push([p, i])
        return
      }

      if (this.data[index][0] > p) {
        this.data.splice(index, 0, [p, i])
        return
      }
    }
  }

  pop(): undefined | [number, T] {
    return this.data.shift()
  }

  length(): number {
    return this.data.length
  }

  inspect(): [number, T][] {
    return this.data
  }
}
