import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  store: {} as Record<string, unknown>
}))

vi.mock('../../src/main/api/shared/database', () => ({
  default: {
    /**
     * 读取测试数据库中保存的值。
     * @param key 存储键。
     * @returns 已保存的值。
     */
    dbGet: (key: string) => mocks.store[key],
    /**
     * 写入测试数据库。
     * @param key 存储键。
     * @param value 新值。
     * @returns 无返回值。
     */
    dbPut: (key: string, value: unknown) => {
      mocks.store[key] = value
    }
  }
}))

import {
  normalizeRememberedWindowSize,
  readRememberedWindowSize,
  writeRememberedWindowSize
} from '../../src/main/core/windowSizeMemory'

describe('window size memory', () => {
  beforeEach(() => {
    mocks.store = {}
  })

  it('returns null when no size was saved', () => {
    expect(readRememberedWindowSize('system', 'clipboard')).toBeNull()
  })

  it('keeps each tool feature in its own size entry', () => {
    writeRememberedWindowSize('system', 'clipboard', 860, 620)
    writeRememberedWindowSize('system', 'local-search', 1020, 700)

    expect(readRememberedWindowSize('system', 'clipboard')).toEqual({
      width: 860,
      height: 620
    })
    expect(readRememberedWindowSize('system', 'local-search')).toEqual({
      width: 1020,
      height: 700
    })
    expect(readRememberedWindowSize('system', 'screen-recorder')).toBeNull()
  })

  it('clamps sizes to a restorable range', () => {
    expect(normalizeRememberedWindowSize(120, 80)).toEqual({ width: 400, height: 260 })
    expect(normalizeRememberedWindowSize(900.6, 540.4)).toEqual({ width: 901, height: 540 })
  })

  it('ignores malformed entries', () => {
    mocks.store['detached-window-sizes'] = { 'system:clipboard': { width: 'bad', height: 500 } }
    expect(readRememberedWindowSize('system', 'clipboard')).toBeNull()
  })
})
