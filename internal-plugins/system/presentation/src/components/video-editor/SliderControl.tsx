import { Label, Slider } from "@heroui/react";
import { memo, useId } from "react";
interface SliderControlProps {
	label: string;
	ariaLabel?: string;
	description?: string;
	value: number;
	min: number;
	max: number;
	step: number;
	onChange: (value: number) => void;
	formatValue: (value: number) => string;
}
/**
 * 展示可调数值及可选的就地说明，让单位和作用范围可见且可被读屏读取。
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
	formatValue,
}: SliderControlProps) {
	const descriptionId = useId();
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
			<Label className="text-xs">{label}</Label>
			<Slider.Output className="text-xs font-normal">{() => formatValue(value)}</Slider.Output>
			<Slider.Track>
				<Slider.Fill />
				<Slider.Thumb />
			</Slider.Track>
		</Slider>
	);
	return description ? (
		<div className="w-full">
			{slider}
			<p id={descriptionId} className="mt-1 text-xs leading-5 text-muted-foreground">
				{description}
			</p>
		</div>
	) : (
		slider
	);
});
