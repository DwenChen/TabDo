import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ dialog: {} }))
import os from 'node:os'
import { getDefaultWindowMaterial } from '../../src/main/utils/windowUtils'

describe('system material defaults', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })
  it.each([
    ['win32', '10.0.22000', 'mica'],
    ['win32', '10.0.26100', 'mica'],
    ['win32', '10.0.19045', 'none'],
    ['darwin', '24.0.0', 'none'],
    ['linux', '6.8.0', 'none']
  ])('%s %s defaults to %s', (platform, release, material) => {
    vi.stubGlobal('process', { ...process, platform })
    vi.spyOn(os, 'release').mockReturnValue(release)
    expect(getDefaultWindowMaterial()).toBe(material)
  })
})
