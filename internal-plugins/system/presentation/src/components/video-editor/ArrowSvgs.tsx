import type { ArrowDirection, FigureData } from "./types";
import { getStickerArrowLayout } from './arrowGeometry';
import { getArrowImageSource } from './arrowAppearance';

/**
 * 使用共享 SVG 材质显示箭头，缩略图、画布与导出使用相同图形。
 * @param props 方向、颜色、线宽、外观与可选样式。
 * @returns 可伸缩的箭头图形。
 */
export function ArrowPreview({ direction, color, strokeWidth, arrowStyle = 'cartoon', className, width = 180, height = 70 }: {
  direction: ArrowDirection; color: string; strokeWidth: number; arrowStyle?: FigureData['arrowStyle']; className?: string; width?: number; height?: number
}) {
  const layout = getStickerArrowLayout(direction, width, height)
  return <svg aria-hidden="true" viewBox={`0 0 ${width} ${height}`} className={className} style={{ width: '100%', height: '100%' }}><image href={getArrowImageSource({ arrowStyle, color, strokeWidth })} x={-layout.width / 2} y={-layout.height / 2} width={layout.width} height={layout.height} transform={`translate(${width / 2} ${height / 2}) rotate(${layout.angle * 180 / Math.PI})`} /></svg>
}

interface ArrowSvgProps {
	color: string;
	strokeWidth: number;
	className?: string;
}

/**
 * Inline SVG arrow components for 8 directions.
 * These match the visual style of the previous icon-based arrows but use
 * pure SVG paths for easy replication in export.
 */

export function ArrowUp({ color, strokeWidth, className }: ArrowSvgProps) {
	return (
		<svg viewBox="0 0 100 100" className={className} style={{ width: "100%", height: "100%" }}>
			<defs>
				<filter id="arrow-shadow">
					<feDropShadow dx="0" dy="2" stdDeviation="4" floodOpacity="0.3" />
				</filter>
			</defs>
			<path
				d="M 50 20 L 50 80 M 50 20 L 35 35 M 50 20 L 65 35"
				stroke={color}
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
				fill="none"
				filter="url(#arrow-shadow)"
			/>
		</svg>
	);
}

export function ArrowDown({ color, strokeWidth, className }: ArrowSvgProps) {
	return (
		<svg viewBox="0 0 100 100" className={className} style={{ width: "100%", height: "100%" }}>
			<defs>
				<filter id="arrow-shadow">
					<feDropShadow dx="0" dy="2" stdDeviation="4" floodOpacity="0.3" />
				</filter>
			</defs>
			<path
				d="M 50 20 L 50 80 M 50 80 L 35 65 M 50 80 L 65 65"
				stroke={color}
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
				fill="none"
				filter="url(#arrow-shadow)"
			/>
		</svg>
	);
}

export function ArrowLeft({ color, strokeWidth, className }: ArrowSvgProps) {
	return (
		<svg viewBox="0 0 100 100" className={className} style={{ width: "100%", height: "100%" }}>
			<defs>
				<filter id="arrow-shadow">
					<feDropShadow dx="0" dy="2" stdDeviation="4" floodOpacity="0.3" />
				</filter>
			</defs>
			<path
				d="M 80 50 L 20 50 M 20 50 L 35 35 M 20 50 L 35 65"
				stroke={color}
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
				fill="none"
				filter="url(#arrow-shadow)"
			/>
		</svg>
	);
}

export function ArrowRight({ color, strokeWidth, className }: ArrowSvgProps) {
	return (
		<svg viewBox="0 0 100 100" className={className} style={{ width: "100%", height: "100%" }}>
			<defs>
				<filter id="arrow-shadow">
					<feDropShadow dx="0" dy="2" stdDeviation="4" floodOpacity="0.3" />
				</filter>
			</defs>
			<path
				d="M 20 50 L 80 50 M 80 50 L 65 35 M 80 50 L 65 65"
				stroke={color}
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
				fill="none"
				filter="url(#arrow-shadow)"
			/>
		</svg>
	);
}

export function ArrowUpRight({ color, strokeWidth, className }: ArrowSvgProps) {
	return (
		<svg viewBox="0 0 100 100" className={className} style={{ width: "100%", height: "100%" }}>
			<defs>
				<filter id="arrow-shadow">
					<feDropShadow dx="0" dy="2" stdDeviation="4" floodOpacity="0.3" />
				</filter>
			</defs>
			<path
				d="M 25 75 L 75 25 M 75 25 L 60 30 M 75 25 L 70 40"
				stroke={color}
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
				fill="none"
				filter="url(#arrow-shadow)"
			/>
		</svg>
	);
}

export function ArrowUpLeft({ color, strokeWidth, className }: ArrowSvgProps) {
	return (
		<svg viewBox="0 0 100 100" className={className} style={{ width: "100%", height: "100%" }}>
			<defs>
				<filter id="arrow-shadow">
					<feDropShadow dx="0" dy="2" stdDeviation="4" floodOpacity="0.3" />
				</filter>
			</defs>
			<path
				d="M 75 75 L 25 25 M 25 25 L 40 30 M 25 25 L 30 40"
				stroke={color}
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
				fill="none"
				filter="url(#arrow-shadow)"
			/>
		</svg>
	);
}

export function ArrowDownRight({ color, strokeWidth, className }: ArrowSvgProps) {
	return (
		<svg viewBox="0 0 100 100" className={className} style={{ width: "100%", height: "100%" }}>
			<defs>
				<filter id="arrow-shadow">
					<feDropShadow dx="0" dy="2" stdDeviation="4" floodOpacity="0.3" />
				</filter>
			</defs>
			<path
				d="M 25 25 L 75 75 M 75 75 L 70 60 M 75 75 L 60 70"
				stroke={color}
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
				fill="none"
				filter="url(#arrow-shadow)"
			/>
		</svg>
	);
}

export function ArrowDownLeft({ color, strokeWidth, className }: ArrowSvgProps) {
	return (
		<svg viewBox="0 0 100 100" className={className} style={{ width: "100%", height: "100%" }}>
			<defs>
				<filter id="arrow-shadow">
					<feDropShadow dx="0" dy="2" stdDeviation="4" floodOpacity="0.3" />
				</filter>
			</defs>
			<path
				d="M 75 25 L 25 75 M 25 75 L 30 60 M 25 75 L 40 70"
				stroke={color}
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
				fill="none"
				filter="url(#arrow-shadow)"
			/>
		</svg>
	);
}

export function getArrowComponent(direction: ArrowDirection) {
	switch (direction) {
		case "up":
			return ArrowUp;
		case "down":
			return ArrowDown;
		case "left":
			return ArrowLeft;
		case "right":
			return ArrowRight;
		case "up-right":
			return ArrowUpRight;
		case "up-left":
			return ArrowUpLeft;
		case "down-right":
			return ArrowDownRight;
		case "down-left":
			return ArrowDownLeft;
	}
}
