import { describe, expect, it } from 'vitest'
import { toTabDoIconUrl } from '../../src/main/common/iconUtils'

describe('toTabDoIconUrl', () => {
  it('将 UWP 绝对图标路径转换为动态图标协议', () => {
    const iconPath =
      'C:\\Program Files\\WindowsApps\\Microsoft.GetHelp_1.0.0.0_x64__8wekyb3d8bbwe\\Assets\\应用图标.png'

    expect(toTabDoIconUrl(iconPath)).toBe(`ztools-icon://${encodeURIComponent(iconPath)}`)
  })

  it('空路径保持为空，避免生成无效图标 URL', () => {
    expect(toTabDoIconUrl('')).toBe('')
  })
})
