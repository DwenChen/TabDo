import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import images from '../../resources/media/images.cjs'
import videos from '../../resources/media/videos.cjs'
import engine from '../../resources/media/engine.cjs'
const { imageInfo, transformImage, mergeImages } = images
const { transformVideo, mergeVideos, tempo } = videos
const { ffmpeg, videoInfo, publish, dimension } = engine
const temporary: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(
    temporary.splice(0).map((file) => fs.rm(file, { recursive: true, force: true }))
  )
})

/**
 * 生成仅用于媒体回归的合成图片，原文件始终留存用于哈希核对。
 * @returns 临时目录、图片和取消信号。
 */
async function fixture(): Promise<{ directory: string; item: any; signal: AbortSignal }> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-media-unit-'))
  temporary.push(directory)
  const file = path.join(directory, '原图.png')
  await sharp({ create: { width: 96, height: 64, channels: 4, background: '#19c37d' } })
    .png()
    .toFile(file)
  return {
    directory,
    item: { path: file, name: '原图.png', ...(await imageInfo(file)) },
    signal: new AbortController().signal
  }
}
describe('isolated image operations', () => {
  it.each([
    ['resize', { width: '50%', height: '' }, 48, 32],
    ['crop', { left: 5, top: 6, width: 20, height: 30 }, 20, 30],
    ['manual', { left: 1, top: 2, width: 60, height: 40 }, 60, 40],
    ['rotate', { angle: 90 }, 64, 96],
    ['flip', { direction: 'vertical' }, 96, 64],
    ['pad', { top: 2, bottom: 4, left: 6, right: 8 }, 110, 70],
    ['border', { border: 4 }, 104, 72],
    ['corner', { radius: 10 }, 96, 64],
    ['convert', { format: 'webp' }, 96, 64],
    ['compress', { quality: 70 }, 96, 64]
  ])('creates decodable %s output with expected geometry', async (mode, params, width, height) => {
    const { directory, item, signal } = await fixture(),
      before = await fs.readFile(item.path),
      output = await transformImage(item, mode, params, directory, signal),
      meta = await sharp(output).metadata()
    expect([meta.width, meta.height]).toEqual([width, height])
    expect(await fs.readFile(item.path)).toEqual(before)
  })
  it('renders an alpha watermark, ordered image/PDF/GIF merges and refuses invalid crops', async () => {
    const { directory, item, signal } = await fixture(),
      second = path.join(directory, 'second.png')
    await sharp({ create: { width: 96, height: 64, channels: 4, background: '#ff0000' } })
      .png()
      .toFile(second)
    const items = [item, { ...item, path: second, name: 'second.png' }],
      stamp =
        'data:image/png;base64,' +
        (
          await sharp({ create: { width: 10, height: 10, channels: 4, background: '#ff00ff' } })
            .png()
            .toBuffer()
        ).toString('base64')
    const marked = await transformImage(
      item,
      'watermark',
      { watermark: stamp, position: 'center' },
      directory,
      signal
    )
    const pixels = await sharp(marked).ensureAlpha().raw().toBuffer(),
      center = (32 * 96 + 48) * 4
    expect([...pixels.subarray(center, center + 3)]).toEqual([255, 0, 255])
    expect([...pixels.subarray(0, 3)]).toEqual([25, 195, 125])
    const imageDir = path.join(directory, 'image')
    await fs.mkdir(imageDir)
    const merged = await mergeImages(
      items,
      'merge',
      { width: 120, direction: 'vertical', gap: 4, margin: 8 },
      imageDir,
      signal
    )
    expect((await sharp(merged).metadata()).height).toBe(148)
    const pdf = await mergeImages(items, 'pdf', { pageSize: 'A4', margin: 12 }, directory, signal)
    expect((await fs.readFile(pdf)).subarray(0, 5).toString()).toBe('%PDF-')
    const gif = await mergeImages(
      items,
      'gif',
      { width: 48, height: 32, delay: 200 },
      directory,
      signal
    )
    expect((await sharp(gif, { animated: true }).metadata()).pages).toBe(2)
    await expect(
      transformImage(item, 'crop', { left: 95, width: 10 }, directory, signal)
    ).rejects.toThrow()
    await expect(
      transformImage(item, 'resize', { width: 16384, height: 16384 }, directory, signal)
    ).rejects.toThrow('画布')
  })
  it('publishes complete results without overwriting existing names and checks percentages', async () => {
    const { directory, item } = await fixture()
    const a = await publish(item.path, directory, '输出.png'),
      b = await publish(item.path, directory, '输出.png')
    expect(a).not.toBe(b)
    expect(await fs.readFile(a)).toEqual(await fs.readFile(item.path))
    expect(dimension('25%', 96)).toBe(24)
    expect(() => dimension('-2', 96)).toThrow()
  })
  it('copies exclusively on a filesystem without hard links and keeps existing results intact', async () => {
    const { directory, item } = await fixture(),
      source = await fs.readFile(item.path)
    vi.spyOn(fs, 'link').mockRejectedValue(
      Object.assign(new Error('no hard links'), { code: 'EXDEV' })
    )
    const first = await publish(item.path, directory, 'copy.png'),
      second = await publish(item.path, directory, 'copy.png')
    expect(second).not.toBe(first)
    expect(await fs.readFile(first)).toEqual(source)
    expect(await fs.readFile(second)).toEqual(source)
  })
  it('encodes every offered image format and enforces the compression size limit', async () => {
    const { directory, item, signal } = await fixture()
    for (const format of ['png', 'jpeg', 'webp', 'tiff', 'avif', 'gif', 'bmp', 'ico', 'svg']) {
      const folder = path.join(directory, format)
      await fs.mkdir(folder)
      const output = await transformImage(item, 'convert', { format }, folder, signal)
      // BMP/ICO 由 FFmpeg 编解码，其余格式直接核对 Sharp 的真实像素尺寸。
      if (['bmp', 'ico'].includes(format)) {
        const decoded = path.join(folder, 'decoded-for-test.png')
        await ffmpeg(['-i', output, '-frames:v', '1', decoded], signal)
        const meta = await sharp(decoded).metadata()
        expect(meta.width).toBeGreaterThan(0)
        expect(meta.width).toBeLessThanOrEqual(256)
      } else {
        const meta = await sharp(output).metadata()
        expect([meta.width, meta.height]).toEqual([96, 64])
      }
    }
    await expect(
      transformImage(item, 'compress', { maxSize: 0.01 }, directory, signal)
    ).rejects.toThrow('目标大小')
  })
})
describe('real video transformations', () => {
  it('produces decodable trim, resize, rotate, speed, animation, audio, frames and merged results', async () => {
    const { directory, signal } = await fixture(),
      file = path.join(directory, 'source.mp4')
    await ffmpeg(
      [
        '-f',
        'lavfi',
        '-i',
        'color=c=green:s=96x64:r=10:d=1',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=1',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-shortest',
        file
      ],
      signal
    )
    const item = { path: file, name: 'source.mp4', ...(await videoInfo(file, signal)) }
    const stamp =
      'data:image/png;base64,' +
      (
        await sharp({ create: { width: 10, height: 10, channels: 4, background: '#ff00ff' } })
          .png()
          .toBuffer()
      ).toString('base64')
    const cases = [
      ['compress', { crf: 28 }],
      ['cut', { start: 0.2, duration: 0.5 }],
      ['crop', { ratio: '1:1' }],
      ['resize', { width: 48, height: '' }],
      ['rotate', { angle: 90 }],
      ['speed', { speed: 2 }],
      ['flip', { direction: 'horizontal' }],
      ['convert', { format: 'webm' }],
      ['gif', { width: 48, fps: 5, duration: 0.5 }],
      ['audio', { audioMode: 'extract', format: 'wav' }],
      ['audio', { audioMode: 'mute' }],
      ['audio', { audioMode: 'volume', volume: 0.5 }],
      ['audio', { audioMode: 'replace', audioFile: file.replace(/mp4$/, 'wav') }],
      ['thumbnail', { cover: path.join(directory, '原图.png') }],
      ['watermark', { watermark: stamp, position: 'center' }],
      ['frame', { count: 2, interval: 0.3 }]
    ] as const
    await ffmpeg(['-i', file, '-vn', file.replace(/mp4$/, 'wav')], signal)
    for (let i = 0; i < cases.length; i++) {
      const [mode, params] = cases[i],
        folder = path.join(directory, String(i))
      await fs.mkdir(folder)
      const output = await transformVideo(item, mode, params, folder, signal)
      if (mode === 'frame') expect((await fs.readdir(output)).length).toBe(2)
      else expect((await fs.stat(output)).size).toBeGreaterThan(0)
      if (['resize', 'rotate', 'crop'].includes(mode)) {
        const meta = await videoInfo(output, signal)
        expect(mode === 'resize' ? meta.width : mode === 'rotate' ? meta.width : meta.height).toBe(
          mode === 'resize' ? 48 : 64
        )
      }
      if (mode === 'audio' && 'audioMode' in params && params.audioMode === 'mute')
        expect((await videoInfo(output, signal)).audio).toBe(false)
      if (mode === 'thumbnail')
        expect(await ffmpeg(['-i', output], signal, true)).toContain('attached pic')
      if (mode === 'audio' && 'audioMode' in params && params.audioMode === 'replace')
        expect((await videoInfo(output, signal)).audio).toBe(true)
      if (mode === 'watermark') {
        const frame = path.join(folder, 'watermark-frame.png')
        await ffmpeg(['-i', output, '-frames:v', '1', frame], signal)
        const pixels = await sharp(frame).removeAlpha().raw().toBuffer(),
          center = (32 * 96 + 48) * 3
        expect(pixels[center]).toBeGreaterThan(160)
        expect(pixels[center + 1]).toBeLessThan(100)
        expect(pixels[center + 2]).toBeGreaterThan(120)
      }
    }
    const mergeDir = path.join(directory, 'merge')
    await fs.mkdir(mergeDir)
    const merged = await mergeVideos([item, item], {}, mergeDir, signal)
    expect((await videoInfo(merged, signal)).duration).toBeGreaterThan(1.8)
    const silent = path.join(directory, 'silent.mp4'),
      mixedDir = path.join(directory, 'mixed')
    await ffmpeg(['-i', file, '-vf', 'scale=48:32', '-an', silent], signal)
    await fs.mkdir(mixedDir)
    const mixed = await mergeVideos(
      [item, { path: silent, ...(await videoInfo(silent, signal)) }],
      {},
      mixedDir,
      signal
    )
    expect(await videoInfo(mixed, signal)).toMatchObject({ width: 96, height: 64, audio: true })
    expect((await videoInfo(mixed, signal)).duration).toBeGreaterThan(1.8)
    expect(tempo(0.1)).toContain('atempo=0.5')
    expect(tempo(8)).toBe('atempo=2,atempo=2,atempo=2')
    const abort = new AbortController()
    abort.abort()
    await expect(ffmpeg(['-i', file], abort.signal)).rejects.toThrow('取消')
  }, 60000)
})
