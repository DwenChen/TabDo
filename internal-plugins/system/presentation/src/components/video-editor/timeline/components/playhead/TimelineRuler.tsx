import type { ReactElement } from "react";
import { useTimelineContext } from "dnd-timeline";
import { calculateAxisScale, formatTimeLabel } from "../../core/time";
import { getPlayheadDisplayTime, type ClipPresentation } from "../../core/clipPresentation";
import { TIMELINE_AXIS_HEIGHT_PX } from "../../timelineLayout";

/**
 * Draw adaptive major labels and minor ticks in the timeline coordinate system.
 * @param props - Visual clip gutters used by the playback cursor.
 * @returns A ruler whose background uses the timeline's normal seek interaction.
 */
export default function TimelineRuler({ clips }: { clips: ClipPresentation[] }): ReactElement {
	const { range, sidebarWidth, setSidebarRef, direction, valueToPixels } = useTimelineContext();
	const { intervalMs, gridMs } = calculateAxisScale(
		range.end - range.start,
		valueToPixels(range.end - range.start)
	);
	const ticks: number[] = [];
	for (
		let time = Math.ceil(range.start / gridMs) * gridMs;
		time <= range.end && ticks.length < 1000;
		time += gridMs
	)
		ticks.push(time);
	const side = direction === "rtl" ? "right" : "left";
	// 固定刻度必须接收点击；穿透会命中滚动后位于其下方的片段。
	return (
		<div
			data-testid="timeline-ruler"
			aria-hidden="true"
			className="sticky top-0 z-[60] shrink-0 overflow-hidden border-b border-foreground/15 pointer-events-auto"
			style={{ height: TIMELINE_AXIS_HEIGHT_PX }}
		>
			<span className="absolute inset-0 bg-editor-bg" />
			<span ref={setSidebarRef} className="absolute inset-y-0 left-0 z-10 w-20 border-r border-foreground/10 bg-editor-bg" />
			{ticks.map((time) => (
				<span
					key={time}
					data-ruler-tick={time}
					className={`absolute bottom-0 border-l ${time % intervalMs === 0 ? "border-foreground/45" : "border-foreground/20"}`}
					style={{
						[side]: sidebarWidth + valueToPixels(getPlayheadDisplayTime(time, clips) - range.start),
						height: time % intervalMs === 0 ? 8 : 4
					}}
				>
					{time % intervalMs === 0 && (
						<span className="absolute bottom-2.5 left-1.5 text-[11px] tabular-nums whitespace-nowrap text-muted-foreground">
							{formatTimeLabel(time, intervalMs)}
						</span>
					)}
				</span>
			))}
		</div>
	);
}
