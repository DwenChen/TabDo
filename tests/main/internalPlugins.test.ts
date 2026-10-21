import { describe, expect, it } from 'vitest'
import {
  BUNDLED_INTERNAL_PLUGIN_NAMES,
  INTERNAL_API_PLUGIN_NAMES,
  canPluginUseInternalApi,
  isBundledInternalPlugin,
  normalizeCustomInternalApiPluginNames
} from '../../src/main/core/internalPlugins'

describe('internal plugin privilege split', () => {
  it('应将开发者插件识别为仅拥有内部 API 权限', () => {
    expect(INTERNAL_API_PLUGIN_NAMES).toContain('tabdo-developer-plugin')
    expect(BUNDLED_INTERNAL_PLUGIN_NAMES).not.toContain('tabdo-developer-plugin')
    expect(canPluginUseInternalApi('tabdo-developer-plugin')).toBe(true)
    expect(isBundledInternalPlugin('tabdo-developer-plugin')).toBe(false)
  })

  it('应归一化用户自定义内部 API 授权插件名称', () => {
    expect(
      normalizeCustomInternalApiPluginNames([
        ' custom-plugin ',
        '',
        'custom-plugin',
        null,
        'another-plugin'
      ])
    ).toEqual(['custom-plugin', 'another-plugin'])
  })

  it('应支持通过用户授权名单授予内部 API 权限', () => {
    expect(canPluginUseInternalApi('custom-plugin')).toBe(false)
    expect(canPluginUseInternalApi('custom-plugin', ['custom-plugin'])).toBe(true)
  })
})
