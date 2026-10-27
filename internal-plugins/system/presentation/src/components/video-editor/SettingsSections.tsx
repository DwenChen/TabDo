import { createContext, useContext, useState, type ReactNode } from 'react'
import { ChoiceGroup, ChoiceItem } from '@presentation/components/ui/choice-group'

type Category = 'general' | 'account' | 'motion' | 'recording' | 'files' | 'advanced'
const labels: Record<Category, string> = {
  general: '通用',
  account: '账户',
  motion: '动态效果',
  recording: '录制',
  files: '文件',
  advanced: '高级'
}
const SettingsCategoryContext = createContext<Category | null>(null)

/**
 * 按调用方提供的非空分类显示共享设置区域，导航与正文均使用中文。
 * @param props 分类清单及其设置正文。
 * @returns 设置导航与当前区域。
 */
export function SettingsSections({
  children,
  categories
}: {
  children: ReactNode
  categories: Category[]
}) {
  const parent = useContext(SettingsCategoryContext)
  const [selected, setSelected] = useState<Category>('general')
  if (parent) return <div className="space-y-6">{children}</div>
  const active = categories.includes(selected) ? selected : categories[0]
  return (
    <SettingsCategoryContext.Provider value={active}>
      <div className="space-y-6">
        <ChoiceGroup
          aria-label="设置分类"
          value={active}
          onValueChange={(value) => setSelected(value as Category)}
          size="sm"
        >
          {categories.map((category) => (
            <ChoiceItem key={category} value={category}>
              {labels[category]}
            </ChoiceItem>
          ))}
        </ChoiceGroup>
        <div role="region" aria-label={`${labels[active]}设置`} className="space-y-6">
          {children}
        </div>
      </div>
    </SettingsCategoryContext.Provider>
  )
}

/**
 * 仅渲染当前设置分类的正文。
 * @param props 此正文所属的分类及内容。
 * @returns 当前分类正文，其他分类返回空值。
 */
export function SettingsCategory({
  category,
  children
}: {
  category: Category | Category[]
  children: ReactNode
}) {
  const active = useContext(SettingsCategoryContext)
  const visible = Array.isArray(category)
    ? active !== null && category.includes(active)
    : active === category
  return visible ? <div className="space-y-6">{children}</div> : null
}
