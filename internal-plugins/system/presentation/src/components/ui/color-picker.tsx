import {
	ColorArea,
	ColorField,
	ColorPicker,
	ColorSlider,
	ColorSwatch,
	ColorSwatchPicker,
	Input,
	Label,
	Popover,
} from "@heroui/react";
import { Button } from "./button";

type PaletteProps = {
	color?: string;
	colors: readonly string[];
	onChange: (color: { hex: string }) => void;
	style?: React.CSSProperties;
};
export const ANNOTATION_COLOR_PALETTE = ['#FF0000', '#FFD700', '#00FF00', '#FFFFFF', '#0000FF', '#FF6B00', '#9B59B6', '#E91E63', '#00BCD4', '#FF5722', '#8BC34A', '#FFC107', '#2563EB', '#000000', '#607D8B', '#795548'] as const;
export function ColorPalette({ color = "#000000", colors, onChange }: PaletteProps) {
	return (
		<div className="flex flex-col gap-3">
			<ColorSwatchPicker
				aria-label="颜色"
				value={color}
				onChange={(value) => onChange({ hex: value.toString("hex") })}
			>
				{colors.map((color) => (
					<ColorSwatchPicker.Item key={color} color={color}>
						<ColorSwatchPicker.Swatch className="ring-1 ring-inset ring-foreground/10" />
						<ColorSwatchPicker.Indicator />
					</ColorSwatchPicker.Item>
				))}
			</ColorSwatchPicker>
		</div>
	);
}
/**
 * 提供统一颜色菜单，侧向展开以利用窗口高度，避免预设及色值输入被挤出。
 * @param props 当前颜色、标签、公共色板及更新或清除回调。
 * @returns 带颜色区域、色相、预设及十六进制输入的菜单。
 */
export function ColorControl({
	value,
	onChange,
	label,
	colors,
	compact = false,
	onClear,
}: {
	value: string;
	onChange: (value: string) => void;
	label: string;
	colors?: readonly string[];
	compact?: boolean;
	onClear?: () => void;
}) {
	return (
		<ColorPicker
			value={value === "transparent" ? "#00000000" : value}
			onChange={(color) => onChange(color.toString("hex"))}
		>
			<Button
				variant="secondary"
				aria-label={label}
				className="h-9 min-w-0 max-w-full gap-2 px-3 text-[13px]"
			>
				<ColorSwatch size="sm" />
				<span className="truncate">
					{compact ? (value === "transparent" ? "无" : value.toUpperCase()) : label}
				</span>
			</Button>
			<ColorPicker.Popover placement="right top">
				<Popover.Dialog aria-label={label} className="flex w-64 flex-col gap-4 p-4">
					<ColorArea colorSpace="hsb" xChannel="saturation" yChannel="brightness">
						<ColorArea.Thumb />
					</ColorArea>
					<ColorSlider colorSpace="hsb" channel="hue">
						<ColorSlider.Track>
							<ColorSlider.Thumb />
						</ColorSlider.Track>
					</ColorSlider>
					{colors && (
						<ColorSwatchPicker aria-label="预设颜色">
							{colors.map((color) => (
								<ColorSwatchPicker.Item key={color} color={color}>
									<ColorSwatchPicker.Swatch />
									<ColorSwatchPicker.Indicator />
								</ColorSwatchPicker.Item>
							))}
						</ColorSwatchPicker>
					)}
					<ColorField>
						<Label>十六进制颜色</Label>
						<Input />
					</ColorField>
					{onClear && (
						<Button variant="ghost" onClick={onClear}>

							清除背景
						</Button>
					)}
				</Popover.Dialog>
			</ColorPicker.Popover>
		</ColorPicker>
	);
}
