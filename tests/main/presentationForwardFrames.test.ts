import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ForwardFrameSource } from '../../internal-plugins/system/presentation/src/lib/exporter/forwardFrameSource'

const boundary = vi.hoisted(() => ({
  url: vi.fn(),
  load: vi.fn(),
  config: vi.fn(),
  demuxers: [] as any[],
  reader: null as ReadableStreamDefaultController<EncodedVideoChunk> | null,
  chunks: 40
}))
vi.mock('@presentation/lib/exporter/localMediaSource', () => ({
  resolveMediaResourceUrl: boundary.url,
  createFallbackDemuxerSource: vi.fn(async () => 'fallback')
}))
vi.mock('@presentation/lib/exporter/streamingDecoder', () => ({
  getDecodedFrameTimelineOffsetUs: () => 0
}))
vi.mock('web-demuxer', () => ({
  WebDemuxer: class {
    destroy = vi.fn()
    load = boundary.load
    /**
     * Supply valid metadata for the deterministic video stream.
     * @returns The test stream's media information.
     */
    getMediaInfo = async (): Promise<{ duration: number; streams: object[] }> => ({
      duration: 60,
      streams: [{ codec_type_string: 'video', codec_string: 'avc1', width: 16, height: 16 }]
    })
    getDecoderConfig = boundary.config
    /**
     * Register this worker boundary for shutdown assertions.
     * @returns The independently owned test demuxer.
     */
    constructor() {
      boundary.demuxers.push(this)
    }
    /**
     * Provide actual stream cancellation and deterministic decoder backpressure.
     * @returns A stream which stays open until cancelled by its owner.
     */
    read(): ReadableStream<EncodedVideoChunk> {
      return new ReadableStream({
        start(controller) {
          boundary.reader = controller
          for (let i = 0; i < boundary.chunks; i++) controller.enqueue({ timestamp: i * 1000 })
        }
      })
    }
  }
}))

let decoders: TestDecoder[]
let decoded: Array<{ timestamp: number; close: ReturnType<typeof vi.fn> }>
const sources: ForwardFrameSource[] = []

class TestDecoder {
  state = 'configured'
  decodeQueueSize = 0
  configure = vi.fn()
  flush = vi.fn(async () => undefined)
  close = vi.fn(() => {
    this.state = 'closed'
  })
  /**
   * Retain callbacks for late-output and cancellation assertions.
   * @param callbacks Production decoder output and error handlers.
   * @returns The controllable test decoder.
   */
  constructor(readonly callbacks: VideoDecoderInit) {
    decoders.push(this)
  }
  /**
   * Deliver frames immediately so a slow consumer fills the real bounded queue.
   * @param chunk Timestamped test input.
   * @returns Nothing; output ownership moves to the source callback.
   */
  decode(chunk: EncodedVideoChunk): void {
    const frame = { timestamp: chunk.timestamp, close: vi.fn() }
    decoded.push(frame)
    this.callbacks.output(frame as unknown as VideoFrame)
  }
}

/**
 * Create an independently controlled preparation boundary.
 * @returns A promise and its explicit resolution function.
 */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

/**
 * Retain each source so test failures still release its stream and frames.
 * @returns A fresh production frame source.
 */
function source(): ForwardFrameSource {
  const item = new ForwardFrameSource()
  sources.push(item)
  return item
}

beforeEach(() => {
  boundary.url.mockReset().mockResolvedValue('media')
  boundary.load.mockReset().mockResolvedValue(undefined)
  boundary.config.mockReset().mockResolvedValue({ codec: 'avc1' })
  boundary.demuxers = []
  boundary.reader = null
  boundary.chunks = 40
  decoders = []
  decoded = []
  vi.stubGlobal('window', { location: { href: 'http://127.0.0.1/presentation.html' } })
  vi.stubGlobal('VideoDecoder', TestDecoder)
})
afterEach(async () => {
  await Promise.all(sources.splice(0).map((item) => item.destroy()))
  vi.unstubAllGlobals()
})

describe('presentation forward decoder retirement', () => {
  it('releases both failed demuxer attempts when preparation cannot publish a source', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    boundary.load.mockRejectedValue(new Error('corrupt media'))
    await expect(source().initialize('media')).rejects.toThrow('corrupt media')
    expect(boundary.demuxers).toHaveLength(2)
    expect(boundary.demuxers.every((item) => item.destroy.mock.calls.length === 1)).toBe(true)
    expect(decoders).toHaveLength(0)
    vi.restoreAllMocks()
  })

  it('surfaces a decoder failure to a pending frame consumer instead of treating it as EOF', async () => {
    boundary.chunks = 0
    const item = source()
    await item.initialize('media')
    const pending = expect(item.getFrameAtTime(0)).rejects.toThrow('decoder failed')
    decoders[0].callbacks.error(new DOMException('decoder failed'))
    await pending
  })

  it('destroys a full queue without waiting for the consumer and releases every frame once', async () => {
    const item = source()
    await item.initialize('media')
    await vi.waitFor(() => expect(decoded.length).toBe(33))
    const shutdown = item.destroy()
    expect(item.destroy()).toBe(shutdown)
    await shutdown
    expect(decoded.every((frame) => frame.close.mock.calls.length === 1)).toBe(true)
    expect(decoders[0].close).toHaveBeenCalledOnce()
    expect(boundary.demuxers[0].destroy).toHaveBeenCalledOnce()
    expect(await item.getFrameAtTime(0)).toBeNull()
  })

  it('unblocks a pending frame request and closes late decoder output', async () => {
    boundary.chunks = 0
    const item = source()
    await item.initialize('media')
    const pending = item.getFrameAtTime(0)
    await item.destroy()
    expect(await pending).toBeNull()
    const late = { close: vi.fn() }
    decoders[0].callbacks.output(late as unknown as VideoFrame)
    expect(late.close).toHaveBeenCalledOnce()
  })

  it('does not create a demux worker after URL resolution completes late', async () => {
    const url = deferred<string>()
    boundary.url.mockReturnValueOnce(url.promise)
    const item = source()
    const starting = item.initialize('media')
    const rejection = expect(starting).rejects.toMatchObject({ name: 'AbortError' })
    await item.destroy()
    url.resolve('late')
    await rejection
    expect(boundary.demuxers).toHaveLength(0)
  })

  it('does not retry a demuxer or configure a decoder after cancellation during loading', async () => {
    const loading = deferred<void>()
    boundary.load.mockReturnValueOnce(loading.promise)
    const item = source()
    const starting = item.initialize('media')
    const rejection = expect(starting).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(boundary.demuxers).toHaveLength(1))
    await item.destroy()
    loading.resolve()
    await rejection
    expect(boundary.demuxers).toHaveLength(1)
    expect(boundary.demuxers[0].destroy).toHaveBeenCalledOnce()
    expect(decoders).toHaveLength(0)
  })

  it('does not create a decoder after its configuration request completes late', async () => {
    const config = deferred<VideoDecoderConfig>()
    boundary.config.mockReturnValueOnce(config.promise)
    const item = source()
    const starting = item.initialize('media')
    const rejection = expect(starting).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(boundary.config).toHaveBeenCalledOnce())
    await item.destroy()
    config.resolve({ codec: 'avc1' })
    await rejection
    expect(decoders).toHaveLength(0)
  })
})
