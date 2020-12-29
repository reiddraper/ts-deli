import * as pqueue from '../data/priority-queue'

enum WakeupReason {
  Sleep = 'Sleep',
  Fork = 'Fork',
  ForkYield = 'ForkYield',
  ReadYield = 'ReadYield',
  WriteYield = 'WriteYield',
  ChannelReadReady = 'ChannelReadReady',
  ChannelWriteReady = 'ChannelWriteReady'
}

type Thread = {
  threadId: number
  resolve: () => void
  promise?: Promise<void>
  reason: WakeupReason
}

// Disabling this on purpose because this is
// a Phantom Type
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type Channel<T> = {
  id: number
  size?: number
}

type ChannelInternals<T> = {
  contents: T[]
  readers: Thread[]
  writers: Thread[]
}

interface ResolvablePromise {
  promise: Promise<void>
  resolve: () => void
}
export interface Concurrent {
  // basic concurrency support
  now: number
  currentlyRunningThreadId: number
  fork(func: () => Promise<void>): Promise<number>
  sleep(duration: number): Promise<void>

  // channels
  createChannel<T>(size?: number): Channel<T>
  readChannel<T>(chan: Channel<T>): Promise<T>
  writeChannel<T>(chan: Channel<T>, item: T): Promise<void>
}
export class ContinuationConcurrent {
  now: number = 0
  // TODO: extract this into a function or better named variable?
  currentlyRunningThreadId: number = 0

  private nextThreadId: number = 0
  private nextChannelId: number = 0

  private scheduled: pqueue.PriorityQueue<Thread> = new pqueue.PriorityQueue()
  // we have to 'cast up' to `any` here, as we allow channels to be created with
  // different `T` values, and so there is no single `T` to use here for:
  // Record<Channel<T>, ChannelInternals<T>>
  private channelAndWaiters: Record<any, any> = {}

  private stillRunning: Map<number, ResolvablePromise> = new Map()

  clearThreadWaitingPromise(): void {
    if (this.stillRunning.has(this.currentlyRunningThreadId)) {
      const threadPromise = this.stillRunning.get(
        this.currentlyRunningThreadId
      )!
      threadPromise.resolve()
      this.stillRunning.delete(this.currentlyRunningThreadId)
    }
  }

  private async next(): Promise<void> {
    const nextThread = this.scheduled.pop()
    if (nextThread === undefined) {
      return
    } else {
      const [newNow, thread] = nextThread
      this.now = newNow
      this.currentlyRunningThreadId = thread.threadId

      const resolveReceiver: Record<string, () => void> = {}
      const promise: Promise<void> = new Promise(resolve => {
        resolveReceiver['resolve'] = resolve
      })
      this.stillRunning.set(thread.threadId, {
        promise,
        resolve: resolveReceiver['resolve']
      })

      thread.resolve()
      await promise
    }
  }

  async fork(func: () => Promise<void>): Promise<number> {
    this.clearThreadWaitingPromise()

    this.nextThreadId++
    const threadId = this.nextThreadId

    const funcWithClearedRunning = async (): Promise<void> => {
      await func()
      this.clearThreadWaitingPromise()
    }

    const resolveReceiver: Record<string, () => void> = {}
    const promise: Promise<void> = new Promise(resolve => {
      resolveReceiver['resolve'] = resolve
    })
    this.scheduled.insert(this.now, {
      threadId: this.currentlyRunningThreadId,
      resolve: resolveReceiver['resolve'],
      promise,
      reason: WakeupReason.ForkYield
    })
    this.scheduled.insert(this.now, {
      threadId,
      resolve: funcWithClearedRunning,
      reason: WakeupReason.Fork
    })

    await promise
    return threadId
  }

  async sleep(duration: number): Promise<void> {
    this.clearThreadWaitingPromise()

    const when = this.now + duration

    const resolveReceiver: Record<string, () => void> = {}
    const promise: Promise<void> = new Promise(resolve => {
      resolveReceiver['resolve'] = resolve
    })

    this.scheduled.insert(when, {
      threadId: this.currentlyRunningThreadId,
      resolve: resolveReceiver['resolve'],
      promise,
      reason: WakeupReason.Sleep
    })

    await promise
  }

  createChannel<T>(size?: number): Channel<T> {
    const channelId = this.nextChannelId
    this.nextChannelId++

    const channel: Channel<T> = {id: channelId, size}

    this.channelAndWaiters[channel as any] = {
      contents: [],
      readers: [],
      writers: []
    }
    return channel
  }

  async readChannel<T>(chan: Channel<T>): Promise<T> {
    const channelInternals: ChannelInternals<T> = this.channelAndWaiters[
      chan as any
    ]

    if (channelInternals.contents.length === 0) {
      const resolveReceiver: Record<string, () => void> = {}
      const promise: Promise<void> = new Promise(resolve => {
        resolveReceiver['resolve'] = resolve
      })
      const thread = {
        threadId: this.currentlyRunningThreadId,
        resolve: resolveReceiver['resolve'],
        promise,
        reason: WakeupReason.ChannelReadReady
      }
      channelInternals.readers.push(thread)

      // before we wait, wake up any writers
      if (channelInternals.writers.length > 0) {
        // we know this non-null assertion is safe because
        // of the length check above
        const nextWriter = channelInternals.writers.shift()!
        this.scheduled.insert(this.now, nextWriter)
      }
      this.clearThreadWaitingPromise()
      await promise
      return this.readChannel(chan)
    } else {
      if (channelInternals.writers.length > 0) {
        // we know this non-null assertion is safe because
        // of the length check above
        const nextWriter = channelInternals.writers.shift()!
        this.scheduled.insert(this.now, nextWriter)
      }

      const resolveReceiver: Record<string, () => void> = {}
      const promise: Promise<void> = new Promise(resolve => {
        resolveReceiver['resolve'] = resolve
      })
      const myThread = {
        threadId: this.currentlyRunningThreadId,
        resolve: resolveReceiver['resolve'],
        promise,
        reason: WakeupReason.ReadYield
      }
      this.scheduled.insert(this.now, myThread)
      const item = channelInternals.contents.shift()
      this.clearThreadWaitingPromise()
      await promise
      return item as T
    }
  }

  async writeChannel<T>(chan: Channel<T>, item: T): Promise<void> {
    const channelInternals: ChannelInternals<T> = this.channelAndWaiters[
      chan as any
    ]

    if (
      chan.size !== undefined &&
      channelInternals.contents.length >= chan.size &&
      channelInternals.readers.length === 0
    ) {
      const resolveReceiver: Record<string, () => void> = {}
      const promise: Promise<void> = new Promise(resolve => {
        resolveReceiver['resolve'] = resolve
      })
      const thread = {
        threadId: this.currentlyRunningThreadId,
        resolve: resolveReceiver['resolve'],
        promise,
        reason: WakeupReason.ChannelWriteReady
      }
      channelInternals.writers.push(thread)
      this.clearThreadWaitingPromise()
      await promise
    }

    channelInternals.contents.push(item)

    // now notify any pending readers
    if (channelInternals.readers.length > 0) {
      // we know this non-null assertion is safe because
      // of the length check above
      const nextReader = channelInternals.readers.shift()!
      this.scheduled.insert(this.now, nextReader)
    }

    // now we need to yield, in order to make sure
    // if there is another thread waiting to read,
    // that they are now woken up, instead of us
    // potentially going right into another read
    // call in our own thread.
    // This also ensures we don't return until the
    // reader has actually read the value, which is
    // part of the correctness for buffered channels
    const resolveReceiver: Record<string, () => void> = {}
    const promise: Promise<void> = new Promise(resolve => {
      resolveReceiver['resolve'] = resolve
    })
    const thread = {
      threadId: this.currentlyRunningThreadId,
      resolve: resolveReceiver['resolve'],
      promise,
      reason: WakeupReason.WriteYield
    }
    this.scheduled.insert(this.now, thread)
    this.clearThreadWaitingPromise()
    await promise
  }

  async run(func: (concurrent: Concurrent) => Promise<void>): Promise<void> {
    const funcWithClearedRunning = async (): Promise<void> => {
      await func(this)
      this.clearThreadWaitingPromise()
    }

    funcWithClearedRunning()

    while (this.scheduled.length() > 0) {
      await this.next()
    }
  }
}
