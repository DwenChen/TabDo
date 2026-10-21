import { describe, expect, it } from 'vitest'
import { mapWithConcurrency } from '../../src/main/utils/asyncPool'

describe('bounded asynchronous file work', () => {
  it('stops scheduling on failure and waits for already started work', async () => {
    const started: number[] = [],
      finished: number[] = []
    await expect(
      mapWithConcurrency(
        Array.from({ length: 100 }, (_, index) => index),
        4,
        async (index) => {
          started.push(index)
          await new Promise((resolve) => setImmediate(resolve))
          if (index === 0) throw new Error('file unavailable')
          finished.push(index)
          return index
        }
      )
    ).rejects.toThrow('file unavailable')
    expect(started).toEqual([0, 1, 2, 3])
    expect(finished).toEqual([1, 2, 3])
  })

  it('preserves result order with only the requested number of operations in flight', async () => {
    let active = 0,
      peak = 0
    const result = await mapWithConcurrency(
      Array.from({ length: 1000 }, (_, index) => index),
      8,
      async (index) => {
        active++
        peak = Math.max(active, peak)
        await new Promise((resolve) => setImmediate(resolve))
        active--
        return index * 2
      }
    )
    expect(peak).toBe(8)
    expect(active).toBe(0)
    expect(result).toEqual(Array.from({ length: 1000 }, (_, index) => index * 2))
  })
})
