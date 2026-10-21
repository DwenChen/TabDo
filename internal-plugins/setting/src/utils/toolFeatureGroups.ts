interface FeatureIdentity {
  code: string
  explain?: string
  icon?: string
  group?: string
}

/**
 * 将内置工具按清单分类展示，成员保留原功能码和指令操作身份。
 * @param features 经过当前页面筛选的原始功能。
 * @param tools 是否为内置工具；其他插件继续逐功能展示。
 * @returns 带有原始成员的展示分组。
 */
export function groupToolFeatures<T extends FeatureIdentity>(
  features: T[],
  tools: boolean
): Array<FeatureIdentity & { features: T[] }> {
  const groups: Array<FeatureIdentity & { features: T[] }> = []
  const primaryCodes = new Set(['web-quick-open', 'screen-recorder', 'image-batch'])
  for (const feature of features) {
    const code = tools && feature.group ? feature.group : feature.code
    const existing = groups.find((group) => group.code === code)
    if (existing) {
      existing.features.push(feature)
      if (primaryCodes.has(feature.code)) existing.icon = feature.icon
    } else {
      groups.push({
        ...feature,
        code,
        explain: tools && feature.group ? feature.group : feature.explain,
        features: [feature]
      })
    }
  }
  return groups
}
