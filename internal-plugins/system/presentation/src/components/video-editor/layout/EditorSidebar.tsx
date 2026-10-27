import type { User } from '@supabase/supabase-js'
import { Camera, ClosedCaptioning, Cursor, FrameCorners } from '@presentation/components/ui/icons'
import {
  ToggleButtonGroup,
  ToggleButton,
  Button,
  Tooltip,
  Card,
  Switch,
  Label
} from '@heroui/react'
import type { ComponentProps, ReactNode } from 'react'
import { useMemo, useState } from 'react'
import type { useI18n } from '@presentation/contexts/I18nContext'
import { SettingsPanel } from '../SettingsPanel'
import type { EditorEffectSection } from '../types'

type Props = {
  accountUser?: User | null
  panelContent?: ReactNode
  onAccountClick?: () => void
  t: ReturnType<typeof useI18n>['t']
  activeSection: EditorEffectSection
  setActiveSection: (section: EditorEffectSection) => void
  settingsPanelProps: ComponentProps<typeof SettingsPanel>
}

/**
 * 显示编辑工具与检查器；应用设置集中在项目主页。
 * @param props 当前工具分类及其设置状态。
 * @returns 编辑工具导航和可滚动检查器。
 */
export function EditorSidebar({
  t,
  accountUser,
  activeSection,
  setActiveSection,
  settingsPanelProps,
  panelContent,
  onAccountClick
}: Props) {
  const [advancedSections, setAdvancedSections] = useState<Record<string, boolean>>({})
  const advanced = advancedSections[activeSection] ?? false
  const hasAdvanced =
    !settingsPanelProps.selectedAnnotationId &&
    ['scene', 'frame', 'crop', 'cursor', 'webcam', 'captions', 'zoom'].includes(activeSection)
  const sections = useMemo(
    () => [
      {
        id: 'scene' as const,
        label: t('settings.sections.scene', 'Scene'),
        icon: FrameCorners
      },
      { id: 'cursor' as const, label: t('settings.sections.cursor', 'Cursor'), icon: Cursor },
      { id: 'webcam' as const, label: t('settings.sections.webcam', '摄像头'), icon: Camera },
      {
        id: 'captions' as const,
        label: t('settings.sections.captions', 'Captions'),
        icon: ClosedCaptioning
      }
    ],
    [t]
  )
  return (
    <div className="flex min-h-0 shrink-0 pb-3 pr-2">
      <nav
        aria-label={t('settings.sections.title', '编辑工具')}
        className="flex w-16 shrink-0 flex-col items-center gap-3 py-2.5"
      >
        <ToggleButtonGroup
          orientation="vertical"
          isDetached
          className="w-full items-center gap-2"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={panelContent ? [] : [activeSection]}
          onSelectionChange={(keys) => {
            const key = Array.from(keys)[0]
            if (key) setActiveSection(key as EditorEffectSection)
          }}
        >
          {sections.map((section) => (
            <Tooltip key={section.id}>
              <ToggleButton id={section.id} variant="ghost" isIconOnly aria-label={section.label}>
                <section.icon
                  weight={!panelContent && activeSection === section.id ? 'fill' : 'regular'}
                  className="size-5"
                />
              </ToggleButton>
              <Tooltip.Content placement="right">{section.label}</Tooltip.Content>
            </Tooltip>
          ))}
        </ToggleButtonGroup>
      </nav>
      <aside
        aria-label={panelContent ? '片段' : undefined}
        className="editor-inspector [--text-sm:0.8125rem] [--text-base:0.8125rem] flex w-[320px] min-h-0 flex-col"
      >
        <Card className="min-h-0 flex-1 gap-0 overflow-hidden p-0">
          {panelContent ?? (
            <>
              <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 px-5 py-3">
                <Card.Title className="text-[14px]">
                  {settingsPanelProps.selectedAnnotationId
                    ? t('timeline.annotation.label', 'Annotation')
                    : (sections.find((section) => section.id === activeSection)?.label ??
                      t(
                        `settings.sections.${activeSection}`,
                        activeSection.charAt(0).toUpperCase() + activeSection.slice(1)
                      ))}
                </Card.Title>
                {hasAdvanced && (
                  <Switch
                    size="sm"
                    isSelected={advanced}
                    onChange={(value) =>
                      setAdvancedSections((current) => ({
                        ...current,
                        [activeSection]: value
                      }))
                    }
                    aria-label="高级设置"
                  >
                    <Switch.Content>
                      <Label className="text-xs">高级</Label>
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                    </Switch.Content>
                  </Switch>
                )}
              </header>
              <SettingsPanel {...settingsPanelProps} advanced={advanced} />
            </>
          )}
        </Card>
      </aside>
    </div>
  )
}
