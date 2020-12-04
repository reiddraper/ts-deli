import * as pqueue from '../data/priority-queue'

enum WakeupReason {
  Sleep = 'Sleep',
  Fork = 'Fork'
}

type Thread = {
  threadId: number
  run: () => void
  promise?: Promise<void>
  reason: WakeupReason
}
export class Concurrent {
  now: number = 0
  private nextThreadId: number = 0
  // TODO: extract this into a function or better named variable?
  currentlyRunningThreadId: number = 0
  private scheduled: pqueue.PriorityQueue<Thread> = new pqueue.PriorityQueue()

  async next(): Promise<void> {
    const nextThread = this.scheduled.pop()
    if (nextThread === undefined) {
      return
    } else {
      const [newNow, thread] = nextThread
      this.now = newNow
      this.currentlyRunningThreadId = thread.threadId
      thread.run()
      if (thread.promise !== undefined) {
        await thread.promise
      }
    }
  }

  async fork(func: () => Promise<void>): Promise<number> {
    this.nextThreadId++
    const threadId = this.nextThreadId

    const resolveReceiver: Record<string, () => void> = {}
    const promise = new Promise(resolve => {
      resolveReceiver['resolve'] = resolve
    })
    this.scheduled.insert(this.now, {
      threadId: this.currentlyRunningThreadId,
      run: resolveReceiver['resolve'],
      promise: promise as Promise<void>,
      reason: WakeupReason.Fork
    })
    this.scheduled.insert(this.now, {
      threadId,
      run: func,
      reason: WakeupReason.Fork
    })

    await promise
    return threadId
  }

  async sleep(duration: number): Promise<void> {
    const when = this.now + duration
    const threadId = this.currentlyRunningThreadId

    const resolveReceiver: Record<string, () => void> = {}
    const promise = new Promise(resolve => {
      resolveReceiver['resolve'] = resolve
    })

    this.scheduled.insert(when, {
      threadId,
      run: resolveReceiver['resolve'],
      promise: promise as Promise<void>,
      reason: WakeupReason.Sleep
    })

    await promise
  }

  async run(func: (concurrent: Concurrent) => Promise<void>): Promise<void> {
    func(this)
    while (this.scheduled.length() > 0) {
      await this.next()
    }
  }
}
