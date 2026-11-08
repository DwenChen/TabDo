import { getRenderableVideoUrl } from '@presentation/lib/assetPath'

interface FrameSource {
  owners: number
  controller: AbortController
  frames: Map<number, string>
  queue: Promise<unknown>
  ready?: Promise<HTMLVideoElement>
  video?: HTMLVideoElement
  canvas?: HTMLCanvasElement
}
const sources = new Map<string, FrameSource>()
const MAX_SOURCE_FRAMES = 128
let decodedFrames = 0

/**
 * 等待媒体事件，退出或取消立即撤销监听，不留下旧请求阻塞新视口。
 * @param video 当前素材独占的取帧元素。
 * @param event 所需媒体事件。
 * @param signal 本次等待的取消信号。
 * @returns 事件发生后完成的Promise。
 * @throws 媒体出错、取消或等待超时时拒绝。
 */
function waitForVideo(video: HTMLVideoElement, event: string, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    /**
     * 撤销本次等待拥有的监听和超时。
     * @returns 无返回值；释放全部等待资源。
     */
    const cleanup = (): void => {
      clearTimeout(timeout)
      video.removeEventListener(event, ready)
      video.removeEventListener('error', failed)
      signal.removeEventListener('abort', failed)
    }
    /**
     * 完成事件等待。
     * @returns 无返回值；通知调用方继续取帧。
     */
    const ready = (): void => {
      cleanup()
      resolve()
    }
    /**
     * 终止不可继续的等待。
     * @returns 无返回值；以失败结束当前Promise。
     */
    const failed = (): void => {
      cleanup()
      reject(new Error("取帧已取消或素材不可用"))
    }
    const timeout = setTimeout(failed, 8000)
    video.addEventListener(event, ready, { once: true })
    video.addEventListener('error', failed, { once: true })
    signal.addEventListener('abort', failed, { once: true })
    if (signal.aborted) failed()
  })
}

/**
 * 只在当前可见编辑会话内共享源解码器和有界帧缓存。
 * @param path 源素材路径。
 * @returns 释放该使用者的函数，最后一位退出立即取消任务并释放媒体。
 */
export function retainFilmstripSource(path: string): () => void {
  let source = sources.get(path)
  if (!source) {
    source = {
      owners: 0,
      controller: new AbortController(),
      frames: new Map(),
      queue: Promise.resolve()
    }
    sources.set(path, source)
  }
  source.owners++
  const owned = source
  let released = false
  /**
   * 按引用归属释放素材，旧请求迟到不能重建已退出的源。
   * @returns 无返回值；最后使用者退出时清空帧、队列和解码器。
   */
  return (): void => {
    if (released) return
    released = true
    if (--owned.owners > 0) return
    sources.delete(path)
    owned.controller.abort()
    owned.frames.clear()
    if (owned.video) {
      owned.video.pause()
      owned.video.removeAttribute('src')
      owned.video.load()
      owned.video = undefined
    }
    if (owned.canvas) {
      owned.canvas.width = 0
      owned.canvas.height = 0
      owned.canvas = undefined
    }
  }
}

/**
 * 读取精确缓存帧；新块尚未就绪时可复用邻近帧保持连续显示。
 * @param path 素材路径。
 * @param timeMs 请求的源毫秒时间。
 * @param nearest 是否允许临时使用邻近缓存。
 * @returns 实际缓存时间和图像，未命中时为空值。
 */
export function getCachedFilmstripFrame(
  path: string,
  timeMs: number,
  nearest = false
): { timeMs: number; image: string } | null {
  const frames = sources.get(path)?.frames
  if (!frames?.size) return null
  const exact = frames.get(timeMs)
  if (exact) return { timeMs, image: exact }
  if (!nearest) return null
  let closest = Infinity
  let result: { timeMs: number; image: string } | null = null
  for (const [time, image] of frames)
    if (Math.abs(time - timeMs) < closest) {
      closest = Math.abs(time - timeMs)
      result = { timeMs: time, image }
    }
  return result
}

/**
 * 按素材准备一次解码元素，不占用编辑预览的播放视频。
 * @param path 素材路径。
 * @param source 当前仍被会话持有的素材缓存。
 * @returns 完成初始加载的独立视频元素。
 * @throws 素材无法加载或所属会话已释放时拒绝。
 */
function prepareVideo(path: string, source: FrameSource): Promise<HTMLVideoElement> {
  if (!source.ready)
    source.ready = (async () => {
      const url = await getRenderableVideoUrl(path)
      source.controller.signal.throwIfAborted()
      const video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      video.preload = 'auto'
      video.crossOrigin = 'anonymous'
      source.video = video
      const loaded = waitForVideo(video, 'loadeddata', source.controller.signal)
      video.src = url
      await loaded
      return video
    })()
  return source.ready
}

/**
 * 每个源独立串行定位；复用已加载的解码器和固定采样缓存，并逐帧发布结果。
 * @param path 素材路径。
 * @param times 稳定采样网格上的源毫秒时间。
 * @param signal 当前视口请求的取消信号。
 * @param onFrame 单帧就绪回调，用于渐进更新而非等待整组。
 * @returns 本次已完成的帧；失效请求不再发布结果。
 * @throws 解码或准确定位失败时拒绝，调用方可保留临时缓存画面。
 */
export function extractFilmstrip(
  path: string,
  times: number[],
  signal: AbortSignal,
  onFrame?: (timeMs: number) => void
): Promise<string[]> {
  const source = sources.get(path)
  if (!source || signal.aborted) return Promise.resolve([])
  const job = source.queue.then(async () => {
    if (signal.aborted || source.controller.signal.aborted) return []
    const missing = times.some((time) => !source.frames.has(time))
    if (!missing) return times.map((time) => source.frames.get(time)!)
    const video = await prepareVideo(path, source)
    const combined = AbortSignal.any([signal, source.controller.signal])
    const canvas = source.canvas ?? (source.canvas = document.createElement('canvas'))
    canvas.width = 160
    canvas.height = 90
    const context = canvas.getContext('2d')
    if (!context) return []
    const result: string[] = []
    for (const timeMs of times) {
      if (combined.aborted) break
      let frame = source.frames.get(timeMs)
      if (!frame) {
        const time = Math.max(0, Math.min(timeMs / 1000, video.duration - 0.001))
        if (video.seeking || Math.abs(video.currentTime - time) > 0.0001) {
          const sought = waitForVideo(video, 'seeked', combined)
          video.currentTime = time
          await sought
        }
        combined.throwIfAborted()
        // 不把不支持准确定位的素材伪装为重复的第一帧。
        if (Math.abs(video.currentTime - time) > 0.12)
          throw new Error("该素材不支持精确定位")
        const scale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight)
        const width = video.videoWidth * scale
        const height = video.videoHeight * scale
        context.drawImage(
          video,
          (canvas.width - width) / 2,
          (canvas.height - height) / 2,
          width,
          height
        )
        frame = canvas.toDataURL('image/jpeg', 0.65)
        source.frames.set(timeMs, frame)
        decodedFrames++
        if (source.frames.size > MAX_SOURCE_FRAMES)
          source.frames.delete(source.frames.keys().next().value!)
      }
      result.push(frame)
      onFrame?.(timeMs)
    }
    return result
  })
  source.queue = job.catch(() => undefined)
  return job
}

/**
 * 提供无素材内容的资源和解码计数，用于验证缓存复用及会话释放。
 * @returns 当前源数、解码器数、有界缓存数和累计实际解码帧数。
 */
export function getFilmstripCacheStats(): {
  sources: number
  decoders: number
  cachedFrames: number
  decodedFrames: number
} {
  return {
    sources: sources.size,
    decoders: [...sources.values()].filter((source) => source.video).length,
    cachedFrames: [...sources.values()].reduce((count, source) => count + source.frames.size, 0),
    decodedFrames
  }
}
