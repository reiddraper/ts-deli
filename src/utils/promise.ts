export interface ResolvablePromise {
  promise: Promise<void>
  resolve: () => void
}

export function resolvablePromise(): ResolvablePromise {
  const resolveReceiver: Record<string, () => void> = {}
  const promise: Promise<void> = new Promise(resolve => {
    resolveReceiver['resolve'] = resolve
  })
  return {promise, resolve: resolveReceiver['resolve']}
}
