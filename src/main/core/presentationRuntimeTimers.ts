interface PresentationRuntimeTimers {
  setTimeout(callback: (...args: any[]) => void, delay?: number, ...args: any[]): NodeJS.Timeout
  setInterval(callback: (...args: any[]) => void, delay?: number, ...args: any[]): NodeJS.Timeout
  clearTimeout(timer: NodeJS.Timeout | undefined): void
  clearInterval(timer: NodeJS.Timeout | undefined): void
  clearAll(): void
}

/**
 * Track only live timers belonging to one presentation backend closure.
 * @returns Scoped scheduling, cancellation and final cleanup functions.
 */
export function createPresentationRuntimeTimers(): PresentationRuntimeTimers {
  const timers = new Set<ReturnType<typeof setTimeout>>()
  return {
    /**
     * Schedule a timeout and drop its retained handle before invoking user code.
     * @param callback Function to run at the deadline.
     * @param delay Delay in milliseconds.
     * @param args Arguments passed to the callback.
     * @returns The native timer handle.
     */
    setTimeout(callback: (...args: any[]) => void, delay?: number, ...args: any[]) {
      const timer = setTimeout(() => {
        timers.delete(timer)
        callback(...args)
      }, delay)
      timers.add(timer)
      return timer
    },
    /**
     * Schedule an interval owned by this backend.
     * @param callback Function to run repeatedly.
     * @param delay Interval in milliseconds.
     * @param args Arguments passed to the callback.
     * @returns The native timer handle.
     */
    setInterval(callback: (...args: any[]) => void, delay?: number, ...args: any[]) {
      const timer = setInterval(callback, delay, ...args)
      timers.add(timer)
      return timer
    },
    /**
     * Cancel a timeout and immediately release its tracking reference.
     * @param timer Timer handle or undefined when no timer was acquired.
     * @returns Nothing; cleared and completed handles are safe.
     */
    clearTimeout(timer: ReturnType<typeof setTimeout> | undefined): void {
      if (timer !== undefined) timers.delete(timer)
      clearTimeout(timer)
    },
    /**
     * Cancel an interval and immediately release its tracking reference.
     * @param timer Timer handle or undefined when no timer was acquired.
     * @returns Nothing; repeated cancellation is harmless.
     */
    clearInterval(timer: ReturnType<typeof setInterval> | undefined): void {
      if (timer !== undefined) timers.delete(timer)
      clearInterval(timer)
    },
    /**
     * Stop all remaining timers, including timers created during backend disposal.
     * @returns Nothing; the empty scope can be cleared repeatedly.
     */
    clearAll(): void {
      // Node timeout and interval handles share the same cancellation mechanism.
      for (const timer of timers) clearTimeout(timer)
      timers.clear()
    }
  }
}
