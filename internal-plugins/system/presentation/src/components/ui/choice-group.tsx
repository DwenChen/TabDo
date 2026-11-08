import { Tag, TagGroup } from "@heroui/react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from '@presentation/lib/utils';

/** Mutually exclusive settings, with HeroUI's keyboard-accessible tag selection. */
export function ChoiceGroup({
	value,
	onValueChange,
	children,
	className,
	...props
}: {
	value?: string;
	onValueChange?: (value: string) => void;
	children: ReactNode;
	className?: string;
	type?: "single";
	size?: "sm" | "md" | "lg";
	fullWidth?: boolean;
	"aria-label"?: string;
}) {
	return (
		<TagGroup
			size={props.size ?? "md"}
			aria-label={props["aria-label"]}
			selectionMode="single"
			disallowEmptySelection
			selectedKeys={value ? [value] : []}
			onSelectionChange={(keys) => {
				if (keys !== "all") {
					const key = Array.from(keys)[0];
					if (key !== undefined) onValueChange?.(String(key));
				}
			}}
		>
			<TagGroup.List className={className ?? "flex flex-wrap gap-2"}>
				{children}
			</TagGroup.List>
		</TagGroup>
	);
}
/**
 * 为所有编辑器单选项统一提供明确选中轮廓，键盘与鼠标选择使用同一反馈。
 * @param props 选项值、可读名称、外观与内容。
 * @returns 带强调轮廓和标准无障碍选中状态的选项。
 */
export function ChoiceItem({
	value,
	title,
	children,
	className,
	...props
}: Omit<ComponentProps<typeof Tag>, "id"> & {
	value: string;
	title?: string;
	"aria-label"?: string;
}) {
	return (
		<Tag
			{...props}
			id={value}
			textValue={
				props.textValue ??
				title ??
				(typeof children === "string" ? children : props["aria-label"])
			}
			className={(state) => cn('min-h-8 justify-center',
				state.isSelected && 'ring-2 ring-inset ring-accent font-medium',
				typeof className === 'function' ? className(state) : className)}
		>
			{children}
		</Tag>
	);
}
