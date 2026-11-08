import { SettingsRow } from './SettingsRow'
import { SliderControl } from './SliderControl'
import { ANNOTATION_ANIMATIONS } from './annotationMotion'
import type { AnnotationTextStyle } from './types'

/**
 * 为每种注释及按键提供同一进出场选项，参数沿片段样式保存和撤销。
 * @param props 当前样式、默认效果和编辑回调。
 * @returns 统一侧栏动画控件。
 */
export function AnnotationAnimationControls({
  style,
  onChange
}: {
  style: AnnotationTextStyle
  onChange: (patch: Partial<AnnotationTextStyle>) => void
}) {
  return (
    <section className="space-y-4" aria-label="注释动画">
      <span className="inspector-section-title">动画</span>
      {(['enterAnimation', 'exitAnimation'] as const).map((field, i) => (
        <SettingsRow key={field} title={i ? '退出效果' : '进入效果'}>
          <select
            aria-label={i ? '退出效果' : '进入效果'}
            className="max-w-32 rounded border border-foreground/15 bg-background px-2 py-1 text-foreground inspector-control-label"
            value={style[field] ?? 'none'}
            onChange={(e) => onChange({ [field]: e.target.value })}
          >
            {Object.entries(ANNOTATION_ANIMATIONS).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </SettingsRow>
      ))}
      {((style.enterAnimation && style.enterAnimation !== 'none') ||
        (style.exitAnimation && style.exitAnimation !== 'none')) && (
        <>
          <SliderControl
            label="动画时长"
            value={style.animationDurationMs ?? 280}
            min={80}
            max={1500}
            step={20}
            onChange={(animationDurationMs) => onChange({ animationDurationMs })}
            formatValue={(v) => `${v} ms`}
          />
          <p className="inspector-description">短片段会自动缩短进出场，拖动时间尺可预览每一帧。</p>
        </>
      )}
    </section>
  )
}
