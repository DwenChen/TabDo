import { WebDemuxer } from 'web-demuxer'
import { getEffectiveVideoStreamDurationSeconds } from '@presentation/lib/mediaTiming'
import { createFallbackDemuxerSource, resolveMediaResourceUrl } from './localMediaSource'
import { getDecodedFrameTimelineOffsetUs } from './streamingDecoder'

const DEFAULT_MAX_DECODE_QUEUE = 12
const DEFAULT_MAX_PENDING_FRAMES = 32

export interface ForwardFrameSourceMetadata {
  width: number
  height: number
  duration: number
  mediaStartTime?: number
  streamStartTime?: number
  streamDuration?: number
  codec: string
}

/**
 * Forward-only decoded frame source for monotonic timestamp access.
 *
 * This avoids per-frame HTMLVideoElement seeking during export and returns
 * the nearest decoded frame for increasing target timestamps.
 */
export class ForwardFrameSource {
  private demuxer: WebDemuxer | null = null
  private decoder: VideoDecoder | null = null
  private cancelled = false
  private metadata: ForwardFrameSourceMetadata | null = null
  private pendingFrames: VideoFrame[] = []
  private frameResolve: ((frame: VideoFrame | null) => void) | null = null
  private decodeError: Error | null = null
  private decodeDone = false
  private feedPromise: Promise<void> | null = null
  private reader: ReadableStreamDefaultReader<EncodedVideoChunk> | null = null
  private heldFrame: VideoFrame | null = null
  private heldFrameSec = 0
  private lastTargetTimeSec = 0
  private lastFrameIntervalSec = 0
  private resolvedDecodedDurationSec: number | null = null
  private firstFrameTimestampUs: number | null = null
  private frameTimelineOffsetUs = 0
  private decodeCapacityWaiters = new Set<() => void>()
  private destruction: Promise<void> | null = null

  /**
   * Reject work which arrives after cancellation or destruction.
   * @returns Nothing while the source is active.
   * @throws {DOMException} When this source has been cancelled.
   */
  private ensureActive(): void {
    if (this.cancelled) throw new DOMException('Frame source cancelled', 'AbortError')
  }

  /**
   * Prepare a single-use source without reviving resources after cancellation.
   * @param videoUrl Local or served media URL.
   * @returns Metadata for the prepared video stream.
   * @throws {Error} When loading, decoder setup or cancellation prevents preparation.
   */
  async initialize(videoUrl: string): Promise<ForwardFrameSourceMetadata> {
    try {
      return await this.prepare(videoUrl)
    } catch (error) {
      // Failed setup has no published owner yet; retire its worker and decoder here.
      await this.destroy()
      throw error
    }
  }

  /**
   * Load metadata and configure the decoder within the current cancellation boundary.
   * @param videoUrl Local or served media URL.
   * @returns Metadata for the prepared stream.
   * @throws {Error} When loading, decoder configuration or cancellation fails.
   */
  private async prepare(videoUrl: string): Promise<ForwardFrameSourceMetadata> {
    this.ensureActive()
    const resourceUrl = await resolveMediaResourceUrl(videoUrl)
    this.ensureActive()
    const wasmUrl = new URL('./presentation-assets/wasm/web-demuxer.wasm', window.location.href)
      .href
    /**
     * Load metadata using a locally owned demuxer across asynchronous boundaries.
     * @param source Resolved URL or fallback file.
     * @returns Media information while this source remains active.
     * @throws {Error} When loading fails or the source is cancelled.
     */
    const loadMediaInfo = async (source: string | File) => {
      this.ensureActive()
      const demuxer = new WebDemuxer({ wasmFilePath: wasmUrl })
      this.demuxer = demuxer
      await demuxer.load(source)
      this.ensureActive()
      const info = await demuxer.getMediaInfo()
      this.ensureActive()
      return info
    }

    let mediaInfo
    try {
      mediaInfo = await loadMediaInfo(resourceUrl)
    } catch (error) {
      // Cancellation must not trigger fallback loading and resurrect a worker.
      this.ensureActive()
      console.warn(
        '[ForwardFrameSource] Direct source load failed, retrying with a fresh media source:',
        error
      )
      const currentDemuxer = this.demuxer
      if (currentDemuxer) {
        try {
          ;(currentDemuxer as unknown as { destroy: () => void }).destroy()
        } catch {
          // Ignore cleanup errors before fallback re-init.
        }
      }
      this.demuxer = null
      mediaInfo = await loadMediaInfo(await createFallbackDemuxerSource(videoUrl))
    }

    const videoStream = mediaInfo.streams.find((stream) => stream.codec_type_string === 'video')
    const mediaStartTime =
      typeof mediaInfo.start_time === 'number' && Number.isFinite(mediaInfo.start_time)
        ? mediaInfo.start_time
        : 0
    const streamStartTime =
      typeof videoStream?.start_time === 'number' && Number.isFinite(videoStream.start_time)
        ? videoStream.start_time
        : mediaStartTime

    this.metadata = {
      width: videoStream?.width || 0,
      height: videoStream?.height || 0,
      duration: mediaInfo.duration,
      mediaStartTime,
      streamStartTime,
      streamDuration:
        typeof videoStream?.duration === 'number' && Number.isFinite(videoStream.duration)
          ? videoStream.duration
          : undefined,
      codec: videoStream?.codec_string || 'unknown'
    }

    await this.startDecoder()
    this.ensureActive()
    return this.metadata
  }

  /**
   * Start bounded decoding for the active demuxer and release late output frames.
   * @returns Completion after decoder setup; feeding continues within this source.
   * @throws {Error} When metadata, configuration or cancellation prevents setup.
   */
  private async startDecoder(): Promise<void> {
    if (!this.demuxer || !this.metadata) {
      throw new Error('Must call initialize() before starting decoder')
    }

    const decoderConfig = await this.demuxer.getDecoderConfig('video')
    this.ensureActive()
    const codec = this.metadata.codec.toLowerCase()
    const shouldPreferSoftwareDecode = codec.includes('av01') || codec.includes('av1')

    this.decoder = new VideoDecoder({
      output: (frame: VideoFrame) => {
        if (this.cancelled) {
          frame.close()
          return
        }
        if (this.frameResolve) {
          const resolve = this.frameResolve
          this.frameResolve = null
          resolve(frame)
        } else {
          this.pendingFrames.push(frame)
        }
        this.notifyDecoderCapacityAvailable()
      },
      error: (error: DOMException) => {
        this.decodeError = new Error(`VideoDecoder error: ${error.message}`)
        if (this.frameResolve) {
          const resolve = this.frameResolve
          this.frameResolve = null
          resolve(null)
        }
        this.notifyDecoderCapacityAvailable()
      }
    })

    const preferredDecoderConfig = shouldPreferSoftwareDecode
      ? {
          ...decoderConfig,
          hardwareAcceleration: 'prefer-software' as const
        }
      : decoderConfig

    try {
      this.decoder.configure(preferredDecoderConfig)
    } catch (error) {
      if (!shouldPreferSoftwareDecode) {
        throw error
      }
      this.decoder.configure(decoderConfig)
    }

    const readEndSec =
      Math.max(
        this.metadata.duration + (this.metadata.mediaStartTime ?? 0),
        (this.metadata.streamDuration ?? this.metadata.duration) +
          (this.metadata.streamStartTime ?? this.metadata.mediaStartTime ?? 0)
      ) + 0.5
    this.reader = this.demuxer.read('video', 0, readEndSec).getReader()

    this.feedPromise = (async () => {
      try {
        while (!this.cancelled) {
          const { done, value: chunk } = await this.reader!.read()
          if (done || !chunk) {
            break
          }

          while (
            (this.decoder!.decodeQueueSize > DEFAULT_MAX_DECODE_QUEUE ||
              this.pendingFrames.length > DEFAULT_MAX_PENDING_FRAMES) &&
            !this.cancelled &&
            !this.decodeError
          ) {
            await this.waitForDecoderCapacity()
          }

          if (this.cancelled) {
            break
          }
          if (this.decodeError) throw this.decodeError

          this.decoder!.decode(chunk)
        }

        if (!this.cancelled && this.decoder?.state === 'configured') {
          await this.decoder.flush()
        }
      } catch (error) {
        this.decodeError = error instanceof Error ? error : new Error(String(error))
      } finally {
        this.decodeDone = true
        this.notifyDecoderCapacityAvailable()
        if (this.frameResolve) {
          const resolve = this.frameResolve
          this.frameResolve = null
          resolve(null)
        }
      }
    })()
  }

  private getNextFrame(): Promise<VideoFrame | null> {
    if (this.decodeError) {
      throw this.decodeError
    }

    if (this.pendingFrames.length > 0) {
      const frame = this.pendingFrames.shift()!
      this.notifyDecoderCapacityAvailable()
      return Promise.resolve(frame)
    }

    if (this.decodeDone) {
      return Promise.resolve(null)
    }

    if (this.frameResolve) {
      throw new Error('Concurrent getFrameAtTime() calls are not supported')
    }

    return new Promise((resolve) => {
      this.frameResolve = resolve
    })
  }

  private waitForDecoderCapacity(): Promise<void> {
    return new Promise((resolve) => {
      this.decodeCapacityWaiters.add(resolve)
    })
  }

  private notifyDecoderCapacityAvailable(): void {
    if (this.decodeCapacityWaiters.size === 0) {
      return
    }

    const waiters = [...this.decodeCapacityWaiters]
    this.decodeCapacityWaiters.clear()
    for (const resolve of waiters) {
      resolve()
    }
  }

  /**
   * Read the nearest frame in increasing timeline order.
   * @param targetTimeSec Desired video time in seconds.
   * @returns An owned frame to close, or null when cancelled or exhausted.
   * @throws {Error} When uninitialized, decoding fails or access is not sequential.
   */
  async getFrameAtTime(targetTimeSec: number): Promise<VideoFrame | null> {
    if (this.cancelled) return null
    if (!this.metadata) {
      throw new Error('Frame source not initialized')
    }

    const clampedTargetTime = Math.max(
      0,
      Math.min(
        targetTimeSec,
        getEffectiveVideoStreamDurationSeconds({
          duration: this.metadata.duration,
          streamDuration: this.metadata.streamDuration
        }) || targetTimeSec
      )
    )
    if (clampedTargetTime + 0.001 < this.lastTargetTimeSec) {
      throw new Error('ForwardFrameSource only supports increasing timestamps')
    }
    this.lastTargetTimeSec = clampedTargetTime

    if (!this.heldFrame) {
      const firstFrame = await this.getNextFrame()
      if (this.cancelled) {
        firstFrame?.close()
        return null
      }
      if (this.decodeError) throw this.decodeError
      if (!firstFrame) {
        return null
      }
      this.firstFrameTimestampUs = firstFrame.timestamp
      this.frameTimelineOffsetUs = getDecodedFrameTimelineOffsetUs(
        firstFrame.timestamp,
        this.metadata
      )
      this.heldFrame = firstFrame
      this.heldFrameSec = Math.max(0, this.frameTimelineOffsetUs / 1_000_000)
    }

    while (!this.cancelled) {
      const nextFrame = await this.getNextFrame()
      if (this.cancelled) {
        nextFrame?.close()
        return null
      }
      if (this.decodeError) throw this.decodeError
      if (!nextFrame) {
        this.resolvedDecodedDurationSec = Math.max(
          this.heldFrameSec,
          this.heldFrameSec + Math.max(0, this.lastFrameIntervalSec)
        )
        return new VideoFrame(this.heldFrame, {
          timestamp: this.heldFrame.timestamp
        })
      }

      const nextFrameSec = Math.max(
        this.heldFrameSec,
        Math.max(
          0,
          (nextFrame.timestamp -
            (this.firstFrameTimestampUs ?? nextFrame.timestamp) +
            this.frameTimelineOffsetUs) /
            1_000_000
        )
      )
      const handoffBoundarySec = (this.heldFrameSec + nextFrameSec) / 2
      if (clampedTargetTime <= handoffBoundarySec) {
        this.pendingFrames.unshift(nextFrame)
        return new VideoFrame(this.heldFrame, {
          timestamp: this.heldFrame.timestamp
        })
      }

      this.lastFrameIntervalSec = Math.max(0, nextFrameSec - this.heldFrameSec)
      this.heldFrame.close()
      this.heldFrame = nextFrame
      this.heldFrameSec = nextFrameSec
    }

    return null
  }

  getResolvedDurationSec(): number | null {
    return this.resolvedDecodedDurationSec
  }

  hasReachedEndOfStream(): boolean {
    return this.decodeDone && this.pendingFrames.length === 0
  }

  /**
   * Unblock frame consumers and decoder backpressure before releasing resources.
   * @returns Nothing; repeated cancellation is harmless.
   */
  cancel(): void {
    this.cancelled = true
    this.notifyDecoderCapacityAvailable()
    if (this.frameResolve) {
      const resolve = this.frameResolve
      this.frameResolve = null
      resolve(null)
    }
    if (this.reader) {
      void this.reader.cancel().catch(() => {
        // Ignore cancellation errors during shutdown.
      })
    }
  }

  /**
   * Release this source once, including a producer blocked by a full frame queue.
   * @returns Completion after readers, frames, decoder and demuxer are released.
   */
  destroy(): Promise<void> {
    if (!this.destruction) this.destruction = this.release()
    return this.destruction
  }

  /**
   * Cancel every waiter before awaiting asynchronous shutdown.
   * @returns Completion after all resources owned by this source are released.
   */
  private async release(): Promise<void> {
    this.cancel()
    // Closing first also interrupts a pending decoder flush during cancellation.
    if (this.decoder && this.decoder.state !== 'closed') {
      try {
        this.decoder.close()
      } catch {
        /* Already closing. */
      }
    }

    if (this.reader) {
      try {
        await this.reader.cancel()
      } catch {
        // Ignore cancellation errors during shutdown.
      }
      this.reader = null
    }

    if (this.feedPromise) {
      try {
        await this.feedPromise
      } catch {
        // Decoder errors are already surfaced through getFrameAtTime.
      }
      this.feedPromise = null
    }

    if (this.heldFrame) {
      this.heldFrame.close()
      this.heldFrame = null
    }

    for (const frame of this.pendingFrames) {
      frame.close()
    }
    this.pendingFrames = []

    if (this.decoder) {
      try {
        if (this.decoder.state === 'configured') {
          this.decoder.close()
        }
      } catch {
        // Ignore decoder shutdown errors.
      }
      this.decoder = null
    }

    if (this.demuxer) {
      try {
        this.demuxer.destroy()
      } catch {
        // Ignore demuxer shutdown errors.
      }
      this.demuxer = null
    }

    this.metadata = null
    this.decodeDone = false
    this.decodeError = null
    this.lastTargetTimeSec = 0
    this.lastFrameIntervalSec = 0
    this.resolvedDecodedDurationSec = null
    this.firstFrameTimestampUs = null
    this.frameTimelineOffsetUs = 0
    this.decodeCapacityWaiters.clear()
  }
}
