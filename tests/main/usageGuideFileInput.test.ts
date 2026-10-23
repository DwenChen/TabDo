import { describe, expect, it, vi, type Mock } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { File } from 'node:buffer'
import { pathToFileURL } from 'node:url'

const preload = fs.readFileSync(
  path.join(process.cwd(), 'internal-plugins/system/public/preload.js'),
  'utf8'
)

interface FileInputHarness {
  controller: AbortController
  cleanups: Array<() => void>
  listeners: Map<string, (event: any) => Promise<void>>
  choose: Mock<() => string[]>
  stat: Mock<() => Promise<{ size: number; isFile: () => boolean }>>
  read: Mock<() => Promise<Buffer>>
  input: { files: File[]; dispatchEvent: Mock }
  event: { target: object; preventDefault: Mock; stopImmediatePropagation: Mock }
  window: any
  nativePath: Mock<() => string>
}

/**
 * 运行实际内置工具 preload，替换系统选择器和有界读文件依赖以检查会话边界。
 * @param guide 是否运行在隔离教学实例。
 * @returns 实际点击入口、DOM 输入、取消信号与读文件依赖。
 */
function loadPreload(guide = true): FileInputHarness {
  const controller = new AbortController()
  const cleanups: Array<() => void> = []
  const listeners = new Map<string, (event: any) => Promise<void>>()
  const choose = vi.fn(() => ['C:/practice/image.png'])
  const stat = vi.fn(async () => ({ size: 3, isFile: () => true }))
  const read = vi.fn(async () => Buffer.from('png'))
  const nativePath = vi.fn(() => 'C:/native/image.png')
  const window = {
    tabdo: {
      lifecycle: {
        signal: controller.signal,
        addCleanup: (cleanup: () => void) => cleanups.push(cleanup),
        dispose: vi.fn()
      },
      showOpenDialog: choose,
      getPath: vi.fn(() => 'C:/practice')
    },
    addEventListener: vi.fn((name, listener) => listeners.set(name, listener)),
    removeEventListener: vi.fn()
  }
  class Input {}
  class Transfer {
    files: File[] = []
    items = { add: (file: File) => this.files.push(file) }
  }
  const input = Object.assign(new Input(), {
    type: 'file',
    accept: 'image/*',
    multiple: false,
    isConnected: true,
    files: [] as File[],
    dispatchEvent: vi.fn()
  })
  const event = { target: input, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() }
  vm.runInNewContext(preload, {
    window,
    process: { env: { TABDO_USAGE_GUIDE: guide ? '1' : undefined } },
    require: (name: string) => {
      if (name === './tool-lifecycle.cjs') return { ToolLifecycle: class {} }
      if (name === './tools-files.cjs') return { createFilesBridge: () => ({}), readImage: vi.fn() }
      if (name === 'electron')
        return { clipboard: {}, webUtils: { getPathForFile: nativePath }, ipcRenderer: {} }
      if (name === 'node:fs/promises') return { stat, readFile: read }
      if (name === 'node:path') return path
      if (name === 'node:url') return { pathToFileURL }
      throw new Error(`Unexpected dependency ${name}`)
    },
    HTMLInputElement: Input,
    DataTransfer: Transfer,
    File,
    Event,
    console
  })
  return { controller, cleanups, listeners, choose, stat, read, input, event, window, nativePath }
}

describe('guide native image input boundaries', () => {
  it('leaves ordinary file inputs unchanged and does not replace the formal chooser', () => {
    const state = loadPreload(false)
    expect(state.listeners.has('click')).toBe(false)
    expect(state.choose).not.toHaveBeenCalled()
    expect((state.window as any).toolsProvider.filePath(new File(['png'], 'native.png'))).toBe(
      'C:/native/image.png'
    )
    expect(state.nativePath).toHaveBeenCalledOnce()
  })

  it('merges repeated clicks and delivers only the actual confirmed file to the original change handler', async () => {
    const state = loadPreload()
    let release!: (value: any) => void
    state.stat.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve
        })
    )
    const click = state.listeners.get('click')!
    const first = click(state.event)
    await click(state.event)
    expect(state.choose).toHaveBeenCalledOnce()
    expect(state.input.dispatchEvent).not.toHaveBeenCalled()
    release({ size: 3, isFile: () => true })
    await first
    expect(await state.input.files[0].text()).toBe('png')
    expect((state.window as any).toolsProvider.filePath(state.input.files[0])).toBe(
      'C:/practice/image.png'
    )
    expect(state.nativePath).not.toHaveBeenCalled()
    expect(state.input.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'change', bubbles: true })
    )
    expect(state.read).toHaveBeenCalledWith('C:/practice/image.png', {
      signal: state.controller.signal
    })
  })

  it('allows retry after dialog cancellation and does not fill a retired document after reading', async () => {
    const state = loadPreload()
    const click = state.listeners.get('click')!
    state.choose.mockReturnValueOnce([])
    await click(state.event)
    expect(state.input.dispatchEvent).not.toHaveBeenCalled()
    let release!: (value: Buffer) => void
    state.read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve
        })
    )
    const pending = click(state.event)
    await vi.waitFor(() => expect(state.read).toHaveBeenCalledOnce())
    state.controller.abort()
    state.cleanups[0]()
    release(Buffer.from('png'))
    await pending
    expect(state.choose).toHaveBeenCalledTimes(2)
    expect(state.input.dispatchEvent).not.toHaveBeenCalled()
    expect(state.input.files).toHaveLength(0)
    expect(state.window.removeEventListener).toHaveBeenCalledWith('click', click, true)
  })
})
