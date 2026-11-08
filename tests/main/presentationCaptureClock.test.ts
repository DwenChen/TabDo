import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

describe.skipIf(process.platform !== 'win32')('native shared capture clock', () => {
  /**
   * Run the actual native clock implementation with captured-time vectors.
   * @returns Frame mappings and PCM slices from the compiled source implementation.
   */
  function observe(): {
    durationMs: number
    frames: (number | null)[]
    packets: { offset: number; count: number; outputFrame: number }[][]
    audioPacketTimes: number[]
  } {
    return JSON.parse(
      execFileSync(
        path.resolve('resources/presentation/native/bin/win32-x64/wgc-capture.exe'),
        ['--test-clock'],
        { encoding: 'utf8', windowsHide: true }
      )
    )
  }
  it('excludes preparation, paused frames and post-stop capture at common boundaries', () => {
    const actual = observe()
    expect(actual.frames).toEqual([null, 0, 1, null, 50, 139.9999, null])
    expect(actual.durationMs).toBe(140)
  })
  it('slices a late packet across start, pause, resume and stop without shifting content', () => {
    expect(observe().packets[0]).toEqual([
      { offset: 10, count: 50, outputFrame: 0 },
      { offset: 110, count: 90, outputFrame: 50 }
    ])
  })
  it('keeps sample positions when smaller packets straddle pause and stop', () => {
    expect(observe().packets.slice(1)).toEqual([
      [{ offset: 0, count: 2, outputFrame: 138 }],
      [
        { offset: 0, count: 10, outputFrame: 40 },
        { offset: 60, count: 10, outputFrame: 50 }
      ]
    ])
  })
  it('preserves contiguous PCM through QPC jitter and timestamp errors while retaining real gaps and resets', () => {
    expect(observe().audioPacketTimes).toEqual([
      10000000, 10100000, 10200000, 10300000, 10400000, 10610000, 10710000, 10825000
    ])
  })
})
