import { Label, Slider } from '@heroui/react'
import { memo, useId } from 'react'
interface SliderControlProps {
  label: string
  ariaLabel?: string
  description?: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  formatValue: (value: number) => string
}
/**
 * 使用统一选项和描述字号展示数值滑条，让说明与读屏关联保持一致。
 * @param props 标签、说明、数值范围和变更回调。
 * @returns 滑块及与其关联的说明；没有说明时保持原布局。
 */
export const SliderControl = memo(function SliderControl({
  label,
  ariaLabel,
  description,
  value,
  min,
  max,
  step,
  onChange,
  formatValue
}: SliderControlProps) {
  const descriptionId = useId()
  const slider = (
    <Slider
      aria-label={ariaLabel ?? label}
      aria-describedby={description ? descriptionId : undefined}
      value={value}
      minValue={min}
      maxValue={max}
      step={step}
      onChange={(value) => onChange(Number(value))}
      className="my-1 w-full gap-y-2"
    >
      <Label className="inspector-control-label">{label}</Label>
      <Slider.Output className="inspector-control-label font-normal">
        {() => formatValue(value)}
      </Slider.Output>
      <Slider.Track>
        <Slider.Fill />
        <Slider.Thumb />
      </Slider.Track>
    </Slider>
  )
  return description ? (
    <div className="w-full">
      {slider}
      <p id={descriptionId} className="inspector-description mt-1">
        {description}
      </p>
    </div>
  ) : (
    slider
  )
})
