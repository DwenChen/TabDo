import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { diagnosticToneSample, findDiagnosticTone } from '../fixtures/diagnostic-tone'

describe('coded capture diagnostic tone', () => {
  it('locates the owned pulse behind earlier background audio without shifting its timestamp', () => {
    const rate = 48000
    const start = 4800
    const pcm = Float32Array.from(
      { length: 12000 },
      (_, index) =>
        0.2 +
        0.08 * Math.sin((2 * Math.PI * 440 * index) / rate) +
        diagnosticToneSample(index - start, rate)
    )
    const found = findDiagnosticTone(pcm, rate)!
    expect(Math.abs(found.sample - start)).toBeLessThanOrEqual(2)
    expect(found.correlation).toBeGreaterThan(0.9)
  })
  it('rejects silence, ordinary tones and notification-like impulses', () => {
    expect(findDiagnosticTone(new Float32Array(6000), 48000)).toBeNull()
    const tone = Float32Array.from(
      { length: 6000 },
      (_, index) => 0.35 * Math.sin((2 * Math.PI * 880 * index) / 48000)
    )
    tone[1500] = 1
    expect(findDiagnosticTone(tone, 48000)).toBeNull()
    const carrier = Float32Array.from(
      { length: 6000 },
      (_, index) => 0.35 * Math.sin((2 * Math.PI * 3000 * index) / 48000)
    )
    expect(findDiagnosticTone(carrier, 48000)).toBeNull()
  })
  it('preserves the pulse origin across a captured packet phase reversal', () => {
    const start = 4800
    const pcm = Float32Array.from({ length: 12000 }, (_, index) => {
      const offset = index - start
      return (
        0.08 * Math.sin((2 * Math.PI * 440 * index) / 48000) +
        diagnosticToneSample(offset, 48000) * (offset >= 1056 ? -1 : 1)
      )
    })
    const match = findDiagnosticTone(pcm, 48000)!
    expect(Math.abs(match.sample - start)).toBeLessThanOrEqual(2)
    expect(match.correlation).toBeGreaterThan(0.75)
  })
  it('rejects a partial pulse instead of moving its start into the tail', () => {
    const partial = Float32Array.from({ length: 7000 }, (_, index) =>
      index >= 2400 && index < 3072 ? diagnosticToneSample(index - 2400, 48000) : 0
    )
    expect(findDiagnosticTone(partial, 48000)).toBeNull()
  })
  it('preserves gain, polarity and the requested search window', () => {
    const pcm = Float32Array.from(
      { length: 10000 },
      (_, index) => -0.12 * diagnosticToneSample(index - 2400, 48000)
    )
    expect(Math.abs(findDiagnosticTone(pcm, 48000, 2000, 2800)!.sample - 2400)).toBeLessThanOrEqual(
      2
    )
    expect(findDiagnosticTone(pcm, 48000, 4000, 6000)).toBeNull()
  })
  it.skipIf(process.platform !== 'win32')(
    'agrees with the compiled native detector in background audio',
    () => {
      const actual = JSON.parse(
        execFileSync(
          path.resolve('resources/presentation/native/bin/win32-x64/wgc-capture.exe'),
          ['--test-tone-detector'],
          { encoding: 'utf8', windowsHide: true }
        )
      )
      expect(Math.abs(actual.sample - 4800)).toBeLessThanOrEqual(2)
      const pcm = Float32Array.from(
        { length: 12000 },
        (_, index) =>
          0.08 * Math.sin((2 * Math.PI * 440 * index) / 48000) +
          diagnosticToneSample(index - 4800, 48000)
      )
      expect(actual.sample).toBe(findDiagnosticTone(pcm, 48000)!.sample)
      expect(actual.backgroundOnly).toBe(false)
      expect(actual.partial).toBe(false)
      expect(actual.correlation).toBeGreaterThan(0.9)
    }
  )
})
