import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAudioLevelMeter } from '../../internal-plugins/system/presentation/src/hooks/useAudioLevelMeter'

const hooks = vi.hoisted(() => ({
  effects: [] as Array<() => (() => void) | undefined>,
  setLevel: vi.fn()
}))
vi.mock('react', () => ({
  useEffect: (effect: () => (() => void) | undefined) => hooks.effects.push(effect),
  useState: () => [0, hooks.setLevel]
}))

/**
 * Create an explicitly controlled asynchronous device boundary.
 * @returns A promise and its resolve and reject functions.
 */
function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: Error) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept
    reject = fail
  })
  return { promise, resolve, reject }
}

const cleanups: Array<() => void> = []
let getUserMedia: ReturnType<typeof vi.fn>
let contexts: ReturnType<typeof createContext>[]
let tracks: Array<{ stop: ReturnType<typeof vi.fn> }>
let resumes: ReturnType<typeof deferred<void>>[]
let frames: Map<number, FrameRequestCallback>

/**
 * Build a controllable Web Audio boundary without replacing the hook lifecycle.
 * @returns A suspended context with independently delayed resume.
 */
function createContext(): {
  state: string
  resume: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  createAnalyser: ReturnType<typeof vi.fn>
  createMediaStreamSource: ReturnType<typeof vi.fn>
} {
  const resume = deferred<void>()
  resumes.push(resume)
  return {
    state: 'suspended',
    resume: vi.fn(() => resume.promise),
    close: vi.fn(async () => undefined),
    createAnalyser: vi.fn(() => ({
      fftSize: 0,
      smoothingTimeConstant: 0,
      frequencyBinCount: 4,
      getByteFrequencyData: vi.fn((data: Uint8Array) => data.fill(64))
    })),
    createMediaStreamSource: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() }))
  }
}

/**
 * Run one actual effect and retain its cleanup for failure-safe teardown.
 * @returns The cleanup for this independently owned microphone effect.
 */
function mount(): () => void {
  useAudioLevelMeter({ enabled: true })
  const cleanup = hooks.effects.pop()!()!
  cleanups.push(cleanup)
  return cleanup
}

beforeEach(() => {
  hooks.effects = []
  hooks.setLevel.mockClear()
  contexts = []
  tracks = []
  resumes = []
  frames = new Map()
  getUserMedia = vi.fn(async () => {
    const track = { stop: vi.fn() }
    tracks.push(track)
    return { getTracks: () => [track] }
  })
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  vi.stubGlobal(
    'AudioContext',
    vi.fn(function () {
      const context = createContext()
      contexts.push(context)
      return context
    })
  )
  let nextFrame = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback)
    return nextFrame
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
})

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('presentation microphone meter ownership', () => {
  it('releases a device granted after its menu closed', async () => {
    const acquisition = deferred<MediaStream>()
    const stop = vi.fn()
    getUserMedia.mockReturnValueOnce(acquisition.promise)
    mount()()
    acquisition.resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream)
    await Promise.resolve()
    expect(stop).toHaveBeenCalledOnce()
    expect(contexts).toHaveLength(0)
  })

  it('closes a suspended context and does not overwrite the next menu session', async () => {
    const closeFirst = mount()
    await Promise.resolve()
    closeFirst()
    expect(contexts[0].close).toHaveBeenCalledOnce()
    mount()
    await Promise.resolve()
    resumes[0].resolve()
    await Promise.resolve()
    expect(contexts[0].createAnalyser).not.toHaveBeenCalled()
    expect(contexts[1].close).not.toHaveBeenCalled()
    resumes[1].resolve()
    await Promise.resolve()
    expect(contexts[1].createAnalyser).toHaveBeenCalledOnce()
    expect(tracks[0].stop).toHaveBeenCalledOnce()
    expect(tracks[1].stop).not.toHaveBeenCalled()
  })

  it('releases an acquired microphone when audio resume fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mount()
    await Promise.resolve()
    resumes[0].reject(new Error('device unavailable'))
    await Promise.resolve()
    expect(tracks[0].stop).toHaveBeenCalledOnce()
    expect(contexts[0].close).toHaveBeenCalledOnce()
    expect(frames.size).toBe(0)
  })

  it('bounds analysis on a high refresh display and cancels the remaining frame', async () => {
    const close = mount()
    await Promise.resolve()
    resumes[0].resolve()
    await Promise.resolve()
    const start = performance.now()
    for (let elapsed = 0; elapsed < 1000; elapsed += 5) {
      const [id, callback] = frames.entries().next().value!
      frames.delete(id)
      callback(start + elapsed)
    }
    const analyser = contexts[0].createAnalyser.mock.results[0].value
    expect(analyser.getByteFrequencyData.mock.calls.length).toBeLessThanOrEqual(21)
    expect(analyser.getByteFrequencyData.mock.calls.length).toBeGreaterThanOrEqual(19)
    close()
    expect(frames.size).toBe(0)
    expect(tracks[0].stop).toHaveBeenCalledOnce()
  })
})
