import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PLUGIN_WINDOW_CONFIG,
  normalizePluginWindowConfig,
  resolvePluginWindowConfig
} from '../../src/shared/pluginWindowConfig'
import {
  clampWindowSizeToWorkArea,
  resolveCenteredWindowOrigin,
  resolveCursorWindowOrigin
} from '../../src/shared/windowPlacement'

const area = { x: 0, y: 0, width: 1200, height: 800 }

describe('plugin window config', () => {
  it('uses cursor and resizable defaults for missing values', () => {
    expect(normalizePluginWindowConfig(undefined)).toEqual({
      position: 'cursor',
      resizable: true,
      width: undefined,
      height: undefined
    })
    expect(DEFAULT_PLUGIN_WINDOW_CONFIG.resizable).toBe(true)
  })

  it('keeps declared fixed, non-resizable and bounded sizes', () => {
    expect(
      normalizePluginWindowConfig({
        position: 'fixed',
        resizable: false,
        width: 380.4,
        height: 10
      })
    ).toEqual({
      position: 'fixed',
      resizable: false,
      width: 380,
      height: 120
    })
  })

  it('prefers the feature config over the plugin default', () => {
    const config = {
      window: { position: 'fixed', resizable: false, width: 500 },
      features: [
        { code: 'tool-a', window: { position: 'cursor', height: 620 } },
        { code: 'tool-b' }
      ]
    }
    expect(resolvePluginWindowConfig(config, 'tool-a')).toEqual({
      position: 'cursor',
      resizable: false,
      width: 500,
      height: 620
    })
    expect(resolvePluginWindowConfig(config, 'tool-b')).toEqual({
      position: 'fixed',
      resizable: false,
      width: 500,
      height: undefined
    })
  })
})

describe('window placement', () => {
  it('places cursor windows to the bottom-right of the pointer', () => {
    expect(
      resolveCursorWindowOrigin({ x: 200, y: 200 }, { width: 400, height: 300 }, area)
    ).toEqual({ x: 212, y: 212 })
  })

  it('flips to the left and top near the work-area edge', () => {
    expect(
      resolveCursorWindowOrigin({ x: 1150, y: 780 }, { width: 400, height: 300 }, area)
    ).toEqual({ x: 738, y: 468 })
  })

  it('clamps oversized windows to the work area', () => {
    expect(clampWindowSizeToWorkArea({ width: 1600, height: 900 }, area)).toEqual({
      width: 1200,
      height: 800
    })
    expect(resolveCursorWindowOrigin({ x: 10, y: 10 }, { width: 1400, height: 900 }, area)).toEqual(
      { x: 0, y: 0 }
    )
  })

  it('centers fixed windows inside the work area', () => {
    expect(resolveCenteredWindowOrigin({ width: 400, height: 300 }, area)).toEqual({
      x: 400,
      y: 250
    })
  })
})
