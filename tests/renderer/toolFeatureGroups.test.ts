import { describe, expect, it } from 'vitest'
import { groupToolFeatures } from '../../internal-plugins/setting/src/utils/toolFeatureGroups'

describe('内置工具展示分类', () => {
  const features = [
    { code: 'screen-recorder-region', group: '录屏', explain: '区域录屏', icon: 'region.png' },
    { code: 'screen-recorder', group: '录屏', explain: '录屏', icon: 'recorder.png' },
    { code: 'screen-recorder-stop', group: '录屏', explain: '停止录屏', icon: 'stop.png' },
    { code: 'clipboard', group: '剪贴板', explain: '剪贴板', icon: 'clipboard.png' }
  ]

  it('将录屏指令归为同一卡片，菜单仍引用原始功能身份', () => {
    const groups = groupToolFeatures(features, true)
    expect(groups.map((group) => group.explain)).toEqual(['录屏', '剪贴板'])
    expect(groups[0].icon).toBe('recorder.png')
    expect(groups[0].features.map((feature) => feature.code)).toEqual([
      'screen-recorder-region',
      'screen-recorder',
      'screen-recorder-stop'
    ])
    expect(groups[0].features[0]).toBe(features[0])
    expect(features[0].code).toBe('screen-recorder-region')
  })

  it('筛选后只包含保留成员，不恢复隐藏指令或误改第三方分类', () => {
    expect(groupToolFeatures([features[2]], true)[0].features).toEqual([features[2]])
    const thirdParty = groupToolFeatures(features, false)
    expect(thirdParty.map((group) => group.code)).toEqual(features.map((feature) => feature.code))
    expect(thirdParty.every((group) => group.features.length === 1)).toBe(true)
  })
})
