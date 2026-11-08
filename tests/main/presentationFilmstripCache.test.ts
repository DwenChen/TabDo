import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  extractFilmstrip,
  getCachedFilmstripFrame,
  getFilmstripCacheStats,
  retainFilmstripSource
} from '../../internal-plugins/system/presentation/src/components/video-editor/timeline/components/filmstrip/frameCache'

vi.mock('@presentation/lib/assetPath', () => ({
  getRenderableVideoUrl: async (path: string) => path
}))

const releases: Array<() => void> = []
let videos: TestVideo[] = []

class TestVideo extends EventTarget {
  duration = 20
  videoWidth = 640
  videoHeight = 360
  seeking = false
  url = ''
  time = 0
  blockedTime: number | null = null
  pause = vi.fn()
  load = vi.fn()
  /**
   * 模拟测试媒体的源设置，不发出被明确阻塞的加载事件。
   * @param value 测试素材名称。
   * @returns 无返回值；安排加载完成事件。
   */
  set src(value: string) {
    this.url = value
    if (value !== 'blocked') queueMicrotask(() => this.dispatchEvent(new Event('loadeddata')))
  }
  /**
   * 返回当前模拟媒体位置。
   * @returns 秒位置。
   */
  get currentTime(): number {
    return this.time
  }
  /**
   * 模拟一次异步定位，指定位置可阻塞以验证取消边界。
   * @param value 目标秒位置。
   * @returns 无返回值；未阻塞时安排定位完成事件。
   */
  set currentTime(value: number) {
    this.time = value
    this.seeking = true
    if (value !== this.blockedTime)
      queueMicrotask(() => {
        this.seeking = false
        this.dispatchEvent(new Event('seeked'))
      })
  }
  /**
   * 模拟媒体释放源属性。
   * @returns 无返回值；清空模拟源。
   */
  removeAttribute(): void {
    this.url = ''
  }
}

beforeEach(() => {
  videos = []
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      if (tag === 'video') {
        const video = new TestVideo()
        videos.push(video)
        return video
      }
      return {
        width: 160,
        height: 90,
        getContext: () => ({ drawImage: vi.fn() }),
        toDataURL: () =>
          'data:image/jpeg;base64,' + videos.map((video) => video.currentTime).join(',')
      }
    }
  })
})
afterEach(() => {
  releases.splice(0).forEach((release) => release())
  vi.unstubAllGlobals()
})

/**
 * 为测试登记媒体引用，失败时同样由afterEach释放。
 * @param path 测试素材身份。
 * @returns 幂等释放当前引用的函数。
 */
function retain(path: string): () => void {
  const release = retainFilmstripSource(path)
  releases.push(release)
  return release
}

describe('presentation filmstrip cache', () => {
  it('does not let a slow screen source block camera frames and releases only after the last owner', async () => {
    const releaseBlocked = retain('blocked')
    const releaseCamera = retain('camera')
    const releaseSecondOwner = retain('camera')
    const blocked = extractFilmstrip('blocked', [100], new AbortController().signal).catch(() => [])
    const frames: number[] = []
    await extractFilmstrip('camera', [0, 100, 200], new AbortController().signal, (time) =>
      frames.push(time)
    )
    expect(frames).toEqual([0, 100, 200])
    expect(getFilmstripCacheStats()).toMatchObject({ sources: 2, decoders: 2, cachedFrames: 3 })
    const count = getFilmstripCacheStats().decodedFrames
    await extractFilmstrip('camera', [100, 200], new AbortController().signal)
    expect(getFilmstripCacheStats().decodedFrames).toBe(count)
    releaseCamera()
    expect(getCachedFilmstripFrame('camera', 100)).not.toBeNull()
    releaseSecondOwner()
    expect(getCachedFilmstripFrame('camera', 100)).toBeNull()
    expect(videos.find((video) => video.url === '')?.pause).toHaveBeenCalled()
    releaseBlocked()
    await blocked
    expect(getFilmstripCacheStats()).toMatchObject({ sources: 0, decoders: 0, cachedFrames: 0 })
  })

  it('publishes early frames, cancels a stale seek immediately and then serves the newest viewport', async () => {
    retain('screen')
    await extractFilmstrip('screen', [0], new AbortController().signal)
    videos[0].blockedTime = 1
    const controller = new AbortController()
    const published: number[] = []
    const stale = extractFilmstrip('screen', [500, 1000, 1500], controller.signal, (time) =>
      published.push(time)
    ).catch(() => [])
    await vi.waitFor(() => expect(published).toEqual([500]))
    controller.abort()
    await stale
    await extractFilmstrip('screen', [2000], new AbortController().signal)
    expect(published).toEqual([500])
    expect(getCachedFilmstripFrame('screen', 2000)).not.toBeNull()
    expect(getCachedFilmstripFrame('screen', 1500)).toBeNull()
    videos[0].blockedTime = null
    await extractFilmstrip(
      'screen',
      Array.from({ length: 150 }, (_, i) => i * 50),
      new AbortController().signal
    )
    expect(getFilmstripCacheStats().cachedFrames).toBeLessThanOrEqual(128)
  })
})
