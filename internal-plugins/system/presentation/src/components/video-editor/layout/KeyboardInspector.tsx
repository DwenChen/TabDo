import { useState, type ReactElement } from 'react'
import { Card } from '@heroui/react'
import { Button } from '@presentation/components/ui/button'
import { ChoiceGroup, ChoiceItem } from '@presentation/components/ui/choice-group'
import { Switch } from '@presentation/components/ui/switch'
import { SettingsRow } from '../SettingsRow'
import { SliderControl } from '../SliderControl'
import { DEFAULT_KEYBOARD_STYLE } from '../keyboardDisplay'
import { KeyboardVisual } from '../KeyboardVisual'
import type { AnnotationRegion } from '../types'
import { AnnotationAnimationControls } from '../AnnotationAnimationControls'
import { ColorControl, ANNOTATION_COLOR_PALETTE } from '@presentation/components/ui/color-picker'
import { getKeycapScale, resizeKeycaps } from '../keyboardSizing'

const styles = [
  {
    id: 'simple',
    name: '简约键帽',
    backgroundColor: '#171717dd',
    color: '#ffffff',
    borderRadius: 12,
    fontFamily: 'Arial',
    fontSize: 52
  },
  {
    id: 'apple',
    name: '苹果键盘',
    backgroundColor: '#f5f5f5f2',
    color: '#242424',
    borderRadius: 18,
    fontFamily: 'Arial',
    fontSize: 48
  },
  {
    id: 'clay',
    name: '立体键帽',
    backgroundColor: '#ddd6fef2',
    color: '#4c1d95',
    borderRadius: 30,
    fontFamily: 'Arial',
    fontSize: 54
  },
  {
    id: 'mechanical',
    name: '机械键盘',
    backgroundColor: '#262626f2',
    color: '#fbbf24',
    borderRadius: 4,
    fontFamily: 'Consolas',
    fontSize: 54
  },
  {
    id: 'rgb',
    name: 'RGB 键盘',
    backgroundColor: '#17172af2',
    color: '#67e8f9',
    borderRadius: 10,
    fontFamily: 'Consolas',
    fontSize: 56
  }
] as const

type Props = {
  regions: AnnotationRegion[]
  selectedId: string | null
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
  onChange: (regions: AnnotationRegion[]) => void
}

/**
 * 使用光标侧栏相同的行、选择卡片和控件编辑按键；开关保留片段内容及外观。
 * @param props 已载入按键、显示状态及项目更新回调。
 * @returns 按键显示开关与统一外观检查器。
 */
export function KeyboardInspector({
  regions,
  selectedId,
  enabled,
  onEnabledChange,
  onChange
}: Props): ReactElement {
  const [preset, setPreset] = useState<string>(
    () => regions.find((region) => region.type === 'keystroke')?.style.keycapStyle ?? styles[0].id
  )
  const keys = regions.filter((region) => region.type === 'keystroke')
  const selected = keys.find((region) => region.id === selectedId)
  const current = selected ?? keys[0]
  const activePreset = current?.style.keycapStyle ?? preset
  /**
   * Apply a visual change to all key displays so their appearance remains consistent.
   * @param patch Annotation style values to merge.
   * @returns Nothing; persists styles using the existing project annotation chain.
   */
  function applyStyle(patch: Partial<AnnotationRegion['style']>): void {
    onChange(
      regions.map((region) =>
        region.type === 'keystroke' ? { ...region, style: { ...region.style, ...patch } } : region
      )
    )
  }
  /**
   * 统一调整整条按键轨道的文字、键帽和显示框，保留内容与时间。
   * @param scale 相对标准键帽的倍率。
   * @returns 无返回值；沿项目历史发布一次大小编辑。
   */
  function applySize(scale: number): void {
    onChange(
      regions.map((region) => (region.type === 'keystroke' ? resizeKeycaps(region, scale) : region))
    )
  }
  /**
   * 恢复按键默认外观、大小和显示状态，保留内容、时间、组中心与轨道。
   * @returns 无返回值；将默认外观发布到当前按键片段。
   */
  function resetKeyboard(): void {
    setPreset('simple')
    // 覆盖完整外观，避免旧字体装饰或透明度残留；内容和剪辑范围继续保留。
    onChange(
      regions.map((region) =>
        region.type === 'keystroke'
          ? { ...resizeKeycaps(region, 1), style: { ...DEFAULT_KEYBOARD_STYLE } }
          : region
      )
    )
    onEnabledChange(true)
  }
  return (
    <section aria-label="按键设置" className="flex min-h-0 flex-1 flex-col">
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 px-5 py-3">
        <Card.Title className="inspector-panel-title">按键</Card.Title>
        <Button variant="ghost" size="sm" aria-label="重置按键设置" onClick={resetKeyboard}>
          重置
        </Button>
      </header>
      <div className="flex-1 inspector-scroll custom-scrollbar space-y-5">
        <SettingsRow title="显示按键输入">
          <Switch
            aria-label="显示按键输入"
            checked={enabled && keys.length > 0}
            disabled={!keys.length}
            onCheckedChange={onEnabledChange}
          />
        </SettingsRow>
        {!keys.length && (
          <p className="text-xs text-muted-foreground">
            录制时开启“录制按键”，停止后将自动加载按键轨道。
          </p>
        )}
        <section className="flex flex-col gap-4">
          <span className="inspector-section-title">外观</span>
          <ChoiceGroup
            className="grid grid-cols-2 gap-2"
            aria-label="按键样式"
            value={activePreset}
            onValueChange={(value) => {
              const item = styles.find((item) => item.id === value)
              if (!item) return
              setPreset(item.id)
              const { id, name: _name, fontSize: _fontSize, ...values } = item
              applyStyle({ ...values, keycapStyle: id })
            }}
          >
            {styles.map((item) => (
              <ChoiceItem
                value={item.id}
                key={item.id}
                aria-label={item.name}
                title={item.name}
                className="h-auto min-w-0 px-2 pt-2 pb-3 text-xs"
              >
                <span className="flex w-full min-w-0 flex-col items-center gap-4">
                  <span data-keycap-preview className="block h-12 w-full">
                    <KeyboardVisual
                      decorative
                      width={140}
                      height={48}
                      scale={1}
                      annotation={{
                        id: `preset-${item.id}`,
                        type: 'keystroke',
                        startMs: 0,
                        endMs: 1000,
                        content: 'Ctrl + C',
                        position: { x: 0, y: 0 },
                        size: { width: 100, height: 100 },
                        zIndex: 1,
                        style: {
                          ...DEFAULT_KEYBOARD_STYLE,
                          backgroundColor: item.backgroundColor,
                          color: item.color,
                          borderRadius: item.borderRadius,
                          fontFamily: item.fontFamily,
                          fontSize: 24,
                          keycapStyle: item.id
                        }
                      }}
                    />
                  </span>
                  <span data-keycap-label className="block leading-5">
                    {item.name}
                  </span>
                </span>
              </ChoiceItem>
            ))}
          </ChoiceGroup>
        </section>
        {current && (
          <>
            <section className="space-y-4" aria-label="键帽大小与配色">
              <span className="inspector-section-title">大小与配色</span>
              <SliderControl
                label="键帽大小"
                description="统一缩放文字、键帽和显示框。在预览中拖动位置；长组合超出画面时会整体缩小。"
                value={getKeycapScale(current.style) * 100}
                min={25}
                max={300}
                step={5}
                onChange={(value) => applySize(value / 100)}
                formatValue={(v) => `${Math.round(v)}%`}
              />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <span className="inspector-control-label">文字颜色</span>
                  <ColorControl
                    label="按键文字颜色"
                    compact
                    value={current.style.color}
                    colors={ANNOTATION_COLOR_PALETTE}
                    onChange={(color) => applyStyle({ color })}
                  />
                </div>
                <div className="space-y-2">
                  <span className="inspector-control-label">底色</span>
                  <ColorControl
                    label="按键底色"
                    compact
                    value={current.style.backgroundColor}
                    colors={ANNOTATION_COLOR_PALETTE}
                    onChange={(backgroundColor) => applyStyle({ backgroundColor })}
                    onClear={() => applyStyle({ backgroundColor: 'transparent' })}
                  />
                </div>
              </div>
            </section>
            <section className="space-y-4" aria-label="按键分组">
              <span className="inspector-section-title">按键分组</span>
              <SettingsRow
                title="连接相邻输入"
                description="符合间隔条件的输入依次加入同一组键帽，原始片段仍可独立编辑。"
              >
                <Switch
                  aria-label="连接相邻输入"
                  checked={current.style.connectInputs !== false}
                  onCheckedChange={(connectInputs) => applyStyle({ connectInputs })}
                />
              </SettingsRow>
              {current.style.connectInputs !== false && (
                <SliderControl
                  label="按键分组最大间隔"
                  description="从前一次按键按下到后一次按键按下计时。时间差小于或等于此值时，显示为同一组键帽；超过此值则另起一组。"
                  value={current.style.inputGapMs ?? 800}
                  min={100}
                  max={3000}
                  step={50}
                  onChange={(inputGapMs) => applyStyle({ inputGapMs })}
                  formatValue={(v) => `${v} ms`}
                />
              )}
            </section>
            {selected && (
              <label className="block text-xs">
                按键内容
                <input
                  aria-label="按键内容"
                  className="mt-2 w-full rounded border border-foreground/15 bg-transparent p-2"
                  value={selected.content}
                  onChange={(event) =>
                    onChange(
                      regions.map((region) =>
                        region.id === selected.id
                          ? {
                              ...region,
                              content: event.target.value,
                              textContent: event.target.value
                            }
                          : region
                      )
                    )
                  }
                />
              </label>
            )}
            <AnnotationAnimationControls style={current.style} onChange={applyStyle} />
          </>
        )}
      </div>
    </section>
  )
}
