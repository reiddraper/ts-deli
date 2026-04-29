import * as pqueue from '../data/priority-queue'
import {resolvablePromise, ResolvablePromise} from '../utils/promise'

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
  // Keyed by `chan.id`. The value type erases `T` because a single simulation
  // can create channels with different element types; each `read/writeChannel`
  // narrows back via the `Channel<T>` argument.
  private channelAndWaiters: Map<number, ChannelInternals<unknown>> = new Map()

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

      const rPromise = resolvablePromise()
      this.stillRunning.set(thread.threadId, rPromise)

      thread.resolve()
      await rPromise.promise
    }
  }

  async fork(func: () => Promise<void>): Promise<number> {
    this.clearThreadWaitingPromise()

    this.nextThreadId++
    const threadId = this.nextThreadId

    const funcWithClearedRunning = async (): Promise<void> => {
      try {
        await func()
      } catch {
        // Forked threads are detached; swallow exceptions so the scheduler
        // doesn't hang and Node doesn't crash on unhandled rejection. Users
        // who want to observe exceptions should catch inside their fork.
      } finally {
        this.clearThreadWaitingPromise()
      }
    }

    const rPromise = resolvablePromise()
    // Schedule child before parent (Haskell ifork semantics): the child runs
    // first up to its first await, then the parent continues past `fork`.
    this.scheduled.insert(this.now, {
      threadId,
      resolve: funcWithClearedRunning,
      reason: WakeupReason.Fork
    })
    this.scheduled.insert(this.now, {
      threadId: this.currentlyRunningThreadId,
      resolve: rPromise.resolve,
      promise: rPromise.promise,
      reason: WakeupReason.ForkYield
    })

    await rPromise.promise
    return threadId
  }

  async sleep(duration: number): Promise<void> {
    this.clearThreadWaitingPromise()

    // Mirror Haskell's `max time currentNow` — never schedule into the past.
    const when = this.now + Math.max(0, duration)

    const rPromise = resolvablePromise()

    this.scheduled.insert(when, {
      threadId: this.currentlyRunningThreadId,
      resolve: rPromise.resolve,
      promise: rPromise.promise,
      reason: WakeupReason.Sleep
    })

    await rPromise.promise
  }

  createChannel<T>(size?: number): Channel<T> {
    const channelId = this.nextChannelId
    this.nextChannelId++

    const channel: Channel<T> = {id: channelId, size}

    this.channelAndWaiters.set(channelId, {
      contents: [],
      readers: [],
      writers: []
    })
    return channel
  }

  async readChannel<T>(chan: Channel<T>): Promise<T> {
    const channelInternals = this.channelAndWaiters.get(
      chan.id
    ) as ChannelInternals<T>

    if (channelInternals.contents.length === 0) {
      const rPromise = resolvablePromise()
      const thread = {
        threadId: this.currentlyRunningThreadId,
        resolve: rPromise.resolve,
        promise: rPromise.promise,
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
      await rPromise.promise
      return this.readChannel(chan)
    } else {
      if (channelInternals.writers.length > 0) {
        // we know this non-null assertion is safe because
        // of the length check above
        const nextWriter = channelInternals.writers.shift()!
        this.scheduled.insert(this.now, nextWriter)
      }

      const rPromise = resolvablePromise()

      const myThread = {
        threadId: this.currentlyRunningThreadId,
        resolve: rPromise.resolve,
        promise: rPromise.promise,
        reason: WakeupReason.ReadYield
      }
      this.scheduled.insert(this.now, myThread)
      const item = channelInternals.contents.shift()
      this.clearThreadWaitingPromise()
      await rPromise.promise
      return item as T
    }
  }

  async writeChannel<T>(chan: Channel<T>, item: T): Promise<void> {
    const channelInternals = this.channelAndWaiters.get(
      chan.id
    ) as ChannelInternals<T>

    if (
      chan.size !== undefined &&
      channelInternals.contents.length >= chan.size &&
      channelInternals.readers.length === 0
    ) {
      const rPromise = resolvablePromise()
      const thread = {
        threadId: this.currentlyRunningThreadId,
        resolve: rPromise.resolve,
        promise: rPromise.promise,
        reason: WakeupReason.ChannelWriteReady
      }
      channelInternals.writers.push(thread)
      this.clearThreadWaitingPromise()
      await rPromise.promise
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
    const rPromise = resolvablePromise()
    const thread = {
      threadId: this.currentlyRunningThreadId,
      resolve: rPromise.resolve,
      promise: rPromise.promise,
      reason: WakeupReason.WriteYield
    }
    this.scheduled.insert(this.now, thread)
    this.clearThreadWaitingPromise()
    await rPromise.promise
  }

  async run(func: (concurrent: Concurrent) => Promise<void>): Promise<void> {
    let captured: {error: unknown} | undefined
      // Discard the returned promise. We can't `await` it: if `func` parks
      // indefinitely (e.g., reads from a never-written channel), awaiting
      // would hang. The catch synchronously sets `captured` before
      // clearThreadWaitingPromise releases the scheduler, so by the time the
      // dispatch loop exits, any thrown error is already visible.
    ;(async (): Promise<void> => {
      try {
        await func(this)
      } catch (e) {
        captured = {error: e}
      } finally {
        this.clearThreadWaitingPromise()
      }
    })()

    while (this.scheduled.length() > 0) {
      await this.next()
    }
    if (captured !== undefined) throw captured.error
  }
}
