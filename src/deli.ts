import * as pqueue from './priority-queue'
//import * as util from 'util'

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
export class Deli {
  now: number = 0
  private nextThreadId: number = 0
  // TODO: extract this into a function or better named variable?
  currentlyRunningThreadId: number = 0
  private scheduled: pqueue.PriorityQueue<Thread> = new pqueue.PriorityQueue()

  debug(): void {
    //console.log(util.inspect(this.scheduled.inspect()))
  }
  async next(): Promise<void> {
    const nextThread = this.scheduled.pop()
    if (nextThread === undefined) {
      return
    } else {
      const [newNow, thread] = nextThread
      //console.log(`next() is running: ${util.inspect(thread)}`)
      this.now = newNow
      this.currentlyRunningThreadId = thread.threadId
      thread.run()
      if (thread.promise !== undefined) {
        await thread.promise
      }
      //console.log(`Ran ${thread.threadId} for reason ${thread.reason}`)
    }
  }

  async fork(func: () => Promise<void>): Promise<number> {
    //console.log(`Fork was called`)
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

    //console.log(`Inside fork, queue now looks like:`)
    this.debug()

    await promise
    //console.log(`Fork complete`)
    return threadId
  }

  async sleep(duration: number): Promise<void> {
    //console.log(`Sleep called: duration=${duration}`)
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
    //console.log(`Sleep for duration ${duration} complete`)
  }

  async run(func: (deli: Deli) => Promise<void>): Promise<void> {
    func(this)
    while (this.scheduled.length() > 0) {
      //console.log(`Next is running from the while loop`)
      this.debug()
      await this.next()
    }
  }
}
