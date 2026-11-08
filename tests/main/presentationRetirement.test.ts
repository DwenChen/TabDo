import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { ToolLifecycle } = require('../../internal-plugins/system/public/tool-lifecycle.cjs')

/**
 * 驱动真实preload的演示生命周期，外部Electron边界仅记录关闭顺序。
 * @returns 独立会话、桥接与清理轨迹。
 */
function createSession(): { lifecycle: any; bridge: any; events: string[] } {
  const lifecycle = new ToolLifecycle()
  const events: string[] = []
  const window = { tabdo: { lifecycle } } as any
  const source = fs.readFileSync('internal-plugins/system/public/preload.js', 'utf8')
  // 仅加载演示会话声明；后续图片、文件等工具桥接不属于本次验证。
  vm.runInNewContext(source.slice(0, source.indexOf('const { readImage')), {
    window,
    document: {
      querySelectorAll: () => [
        { contentWindow: { disposePresentationRenderer: () => events.push('unmount') } }
      ]
    },
    require: (name: string) => {
      if (name === './tool-lifecycle.cjs') return { ToolLifecycle }
      if (name === './presentation-bridge.cjs') return { install: vi.fn() }
      if (name === 'electron')
        return {
          ipcRenderer: {
            invoke: async (channel: string) => {
              if (channel === 'internal:presentation-open')
                return { prefix: 'presentation:fixture:' }
              if (channel === 'internal:presentation-close') events.push('backend-close')
            }
          }
        }
      throw new Error('Unexpected dependency: ' + name)
    }
  })
  return { lifecycle, bridge: window.toolsPresentation, events }
}

describe('presentation editor retirement', () => {
  it('unmounts the editor before closing the backend on ordinary exit', async () => {
    const { lifecycle, bridge, events } = createSession()
    await bridge.open()
    await lifecycle.dispose()
    await lifecycle.dispose()
    expect(events).toEqual(['unmount', 'backend-close'])
  })

  it('waits for confirmed exports to finish before unmounting their renderer', async () => {
    const { lifecycle, bridge, events } = createSession()
    await bridge.open()
    let finish!: () => void
    const task = bridge.runTask(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    await Promise.resolve()
    const disposal = lifecycle.dispose()
    await Promise.resolve()
    expect(events).toEqual([])
    finish()
    await task
    await disposal
    expect(events).toEqual(['unmount', 'backend-close'])
  })
})
