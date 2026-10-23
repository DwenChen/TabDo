import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  awaitGuideOperation,
  guideAttachedViewBounds,
  guideCardRectangle,
  guideCreationOrder,
  guideFileBaseline,
  guideSpotlightRectangle,
  GuideNativeDialogScope
} from '../../src/main/core/usageGuideRuntime'
import { GUIDE_STEPS } from '../../src/shared/usageGuideSteps'
import { verifyGuideStep } from '../../src/main/core/usageGuideVerification'

afterEach(() => vi.useRealTimers())

describe('usage guide runtime boundaries', () => {
  it('keeps the overlay hidden until all nested native dialogs complete', async () => {
    const changes: boolean[] = []
    const scope = new GuideNativeDialogScope((active) => changes.push(active))
    let closeInner!: (value: string) => void
    const inner = new Promise<string>((resolve) => {
      closeInner = resolve
    })
    const outer = scope.run(async () => {
      const selection = scope.run(() => inner)
      await Promise.resolve()
      expect(scope.active).toBe(true)
      expect(changes).toEqual([true])
      return selection
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(changes).toEqual([true])
    closeInner('selected.png')
    await expect(outer).resolves.toBe('selected.png')
    expect(scope.active).toBe(false)
    expect(changes).toEqual([true, false])
  })

  it('coalesces duplicate dialog operations without displaying a second modal', async () => {
    const changes: boolean[] = []
    const scope = new GuideNativeDialogScope((active) => changes.push(active))
    let close!: (value: string) => void
    const result = new Promise<string>((resolve) => {
      close = resolve
    })
    const operation = vi.fn(() => result)
    const first = scope.run(operation)
    const second = scope.run(operation)
    await Promise.resolve()
    expect(operation).toHaveBeenCalledTimes(1)
    close('cancelled')
    await expect(Promise.all([first, second])).resolves.toEqual(['cancelled', 'cancelled'])
    expect(changes).toEqual([true, false])
  })

  it('does not restore an exited overlay when a native dialog returns late', async () => {
    const changes: boolean[] = []
    const scope = new GuideNativeDialogScope((active) => changes.push(active))
    let close!: () => void
    const result = new Promise<void>((resolve) => {
      close = resolve
    })
    const pending = scope.run(() => result)
    await Promise.resolve()
    expect(changes).toEqual([true])
    scope.dispose()
    close()
    await pending
    expect(changes).toEqual([true])
    await expect(scope.run(async () => 'late')).rejects.toThrow('引导已退出')
  })

  it('restores the overlay on dialog errors and permits a subsequent operation', async () => {
    const changes: boolean[] = []
    const scope = new GuideNativeDialogScope((active) => changes.push(active))
    await expect(
      scope.run(async () => {
        throw new Error('原生选择失败')
      })
    ).rejects.toThrow('原生选择失败')
    await expect(scope.run(async () => 'saved')).resolves.toBe('saved')
    expect(changes).toEqual([true, false, true, false])
  })

  it('requires an attached visible view and accumulates offsets through layout wrappers', () => {
    const target = {
      children: [],
      getBounds: () => ({ x: 12, y: 28, width: 600, height: 400 }),
      getVisible: () => true
    }
    const wrapper = {
      children: [target],
      getBounds: () => ({ x: 8, y: 30, width: 700, height: 500 }),
      getVisible: () => true
    }
    const root = {
      children: [wrapper],
      getBounds: () => ({ x: 0, y: 0, width: 800, height: 600 }),
      getVisible: () => true
    }
    expect(guideAttachedViewBounds(root, target)).toEqual({ x: 20, y: 58, width: 600, height: 400 })
    wrapper.getVisible = () => false
    expect(guideAttachedViewBounds(root, target)).toBeNull()
    wrapper.getVisible = () => true
    wrapper.children = []
    expect(guideAttachedViewBounds(root, target)).toBeNull()
  })

  it('selects the newest floating page even when Electron enumerates windows in reverse order', () => {
    const older = { id: 6 },
      newer = { id: 14 }
    const enumerated = [newer, older]
    expect(guideCreationOrder(enumerated).at(-1)).toBe(newer)
    expect(enumerated[0]).toBe(newer)
  })

  it('retains original file identities when rename is executed during the parameter step', () => {
    const source = {
      '练习文件甲.txt': { size: 12, modified: 1, hash: 'first-source' },
      '练习文件乙.txt': { size: 16, modified: 1, hash: 'second-source' }
    }
    const renamed = {
      '练习-01.txt': { ...source['练习文件甲.txt'], modified: 2 },
      '练习-02.txt': { ...source['练习文件乙.txt'], modified: 2 }
    }
    const step = GUIDE_STEPS.find((item) => item.id === 'rename')!
    expect(verifyGuideStep(step, { files: renamed }, { files: renamed })).toBe(false)
    expect(
      verifyGuideStep(
        step,
        { files: guideFileBaseline('file-renamer', 'file-renamer', source, renamed) },
        { files: renamed }
      )
    ).toBe(true)
  })

  it('accepts media exported early in the same exercise and rejects output from another tool', () => {
    const original = { '图片/练习图片.png': { size: 100, modified: 1 } }
    const exported = {
      ...original,
      '练习输出/缩小.png': { size: 35, modified: 2 }
    }
    const step = GUIDE_STEPS.find((item) => item.id === 'resize')!
    expect(
      verifyGuideStep(
        step,
        { files: guideFileBaseline('image-batch', 'image-batch', original, exported) },
        { files: exported, outputNames: ['缩小.png'] }
      )
    ).toBe(true)
    expect(
      verifyGuideStep(
        step,
        { files: guideFileBaseline('image-annotate', 'image-batch', original, exported) },
        { files: exported, outputNames: ['缩小.png'] }
      )
    ).toBe(false)
  })

  it('maps zoomed view contents on a negative-origin display using DIP coordinates', () => {
    expect(
      guideSpotlightRectangle(
        { x: 40, y: 80, width: 120, height: 28 },
        { x: -1850, y: 90, width: 700, height: 800 },
        { x: -1920, y: 0, width: 1920, height: 1080 },
        1.25
      )
    ).toEqual({ x: 120, y: 190, width: 150, height: 35 })
  })

  it('clips scrolled and off-display targets instead of making invisible pixels interactive', () => {
    const view = { x: 100, y: 60, width: 600, height: 400 }
    const display = { x: 0, y: 0, width: 800, height: 600 }
    expect(
      guideSpotlightRectangle({ x: -20, y: -10, width: 100, height: 40 }, view, display, 1)
    ).toEqual({ x: 100, y: 60, width: 80, height: 30 })
    expect(
      guideSpotlightRectangle({ x: 30, y: 500, width: 120, height: 20 }, view, display, 1)
    ).toBeNull()
  })

  it('moves the hint card away from a precise option and keeps its buttons on a small display', () => {
    const display = { x: 0, y: 0, width: 900, height: 640 }
    const card = guideCardRectangle(
      display,
      { width: 350, height: 520 },
      {
        x: 700,
        y: 80,
        width: 120,
        height: 32
      }
    )
    expect(card.x + card.width).toBeLessThan(700)
    const constrained = guideCardRectangle(
      { x: 0, y: 0, width: 320, height: 400 },
      { width: 350, height: 560 },
      null
    )
    expect(constrained.x + constrained.width).toBeLessThanOrEqual(320)
    expect(constrained.y + constrained.height).toBeLessThanOrEqual(400)
  })

  it('immediately releases a stuck renderer wait on exit and absorbs its late rejection', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    let rejectLate!: (error: Error) => void
    const renderer = new Promise<void>((_resolve, reject) => {
      rejectLate = reject
    })
    const waiting = awaitGuideOperation(renderer, controller.signal, 1600, '读取状态')
    const failed = expect(waiting).rejects.toThrow('引导步骤已取消')
    controller.abort()
    await failed
    rejectLate(new Error('页面已经销毁'))
    await Promise.resolve()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('times out once and allows the next operation to finish without leftover timers', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const failed = expect(
      awaitGuideOperation(new Promise<void>(() => {}), controller.signal, 1000, '打开工具')
    ).rejects.toThrow('打开工具超时')
    await vi.advanceTimersByTimeAsync(1000)
    await failed
    await expect(
      awaitGuideOperation(Promise.resolve('ready'), controller.signal, 1000, '打开工具')
    ).resolves.toBe('ready')
    expect(vi.getTimerCount()).toBe(0)
  })
})
