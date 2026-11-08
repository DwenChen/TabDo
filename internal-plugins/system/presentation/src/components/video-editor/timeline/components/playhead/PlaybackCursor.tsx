import { useTimelineContext } from "dnd-timeline";
import { useEffect, useState, type RefObject } from "react";
import { formatPlayheadTime } from "../../core/time";

import {
	getPlayheadDisplayTime,
	getTimeAtClipSeam,
	type ClipPresentation
} from "../../core/clipPresentation";

interface PlaybackCursorProps {
	clips: ClipPresentation[];
	currentTimeMs: number;
	videoDurationMs: number;
	onSeek?: (time: number) => void;
	timelineRef: RefObject<HTMLDivElement | null>;
	keyframes?: { id: string; time: number }[];
	isLoading?: boolean;
}

/**
 * 显示固定可见的毫秒游标头，支持拖动和键盘精细定位。
 * @param props 当前时间、可见区间、关键帧与定位回调。
 * @returns 与媒体时间一致且限制在视口内的游标。
 */
export default function PlaybackCursor({
	clips,
	currentTimeMs,
	videoDurationMs,
	onSeek,
	timelineRef,
	keyframes = [],
	isLoading = false
}: PlaybackCursorProps) {
	const { sidebarWidth, direction, range, valueToPixels, pixelsToValue } = useTimelineContext();
	const sideProperty = direction === "rtl" ? "right" : "left";
	const [isDragging, setIsDragging] = useState(false);

	useEffect(() => {
		if (!isDragging) return;

		const handleMouseMove = (e: MouseEvent) => {
			if (!timelineRef.current || !onSeek) return;
			const rect = timelineRef.current.getBoundingClientRect();
			const clickX =
				direction === "rtl"
					? rect.right - sidebarWidth - e.clientX
					: e.clientX - rect.left - sidebarWidth;
			const relativeMs = pixelsToValue(clickX);
			let absoluteMs = getTimeAtClipSeam(
				Math.max(0, Math.min(range.start + relativeMs, videoDurationMs)),
				clips
			);

			const snapThresholdMs = e.shiftKey ? 0 : pixelsToValue(8);
			const nearbyKeyframe = keyframes.find(
				(kf) =>
					Math.abs(kf.time - absoluteMs) <= snapThresholdMs &&
					kf.time >= range.start &&
					kf.time <= range.end
			);
			if (nearbyKeyframe) absoluteMs = nearbyKeyframe.time;

			onSeek(absoluteMs / 1000);
		};

		const handleMouseUp = () => {
			setIsDragging(false);
			document.body.style.cursor = "";
		};

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
		document.body.style.cursor = "ew-resize";

		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
			document.body.style.cursor = "";
		};
	}, [
		isDragging,
		clips,
		onSeek,
		timelineRef,
		sidebarWidth,
		range.start,
		range.end,
		videoDurationMs,
		pixelsToValue,
		keyframes,
		direction
	]);

	if (videoDurationMs <= 0 || currentTimeMs < 0) return null;
	const clampedTime = Math.min(currentTimeMs, videoDurationMs);
	if (clampedTime < range.start || clampedTime > range.end) return null;

	const offset = valueToPixels(getPlayheadDisplayTime(clampedTime, clips) - range.start);

	// Keep the timestamp inside the viewport even at either end of the timeline.
	const width = valueToPixels(range.end - range.start);
	const capShift = Math.max(0, 42 - offset) - Math.max(0, 42 - (width - offset));
	return (
		<div data-testid="timeline-playhead" className="absolute inset-0 z-[70] pointer-events-none">
			<div
				className="absolute top-0 bottom-0 w-px bg-accent"
				style={{ [sideProperty]: sidebarWidth + offset }}
			>
				<button
					type="button"
					aria-label={`播放位置 ${formatPlayheadTime(clampedTime)}`}
					title="拖动定位，方向键微调1毫秒，Shift＋方向键微调1秒"
					onKeyDown={(event) => {
						if (!onSeek || !["ArrowLeft", "ArrowRight", "Home", "终点"].includes(event.key)) return;
						event.preventDefault();
						event.stopPropagation();
						const delta = (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 1000 : 1);
						onSeek(
							(event.key === "Home"
								? 0
								: event.key === "终点"
									? videoDurationMs
									: Math.max(0, Math.min(videoDurationMs, clampedTime + delta))) / 1000
						);
					}}
					data-testid="playhead-cap"
					aria-busy={isLoading}
					onClick={(event) => event.stopPropagation()}
					onMouseDown={(event) => {
						if (event.button !== 0) return;
						event.preventDefault();
						event.stopPropagation();
						setIsDragging(true);
					}}
					className="sticky top-0.5 z-[70] h-[22px] rounded-md border border-foreground/15 bg-accent text-accent-foreground shadow-sm cursor-ew-resize pointer-events-auto focus-visible:outline-2 focus-visible:outline-foreground"
					style={{
						width: 84,
						left: "50%",
						transform: `translateX(calc(-50% + ${direction === "rtl" ? -capShift : capShift}px))`
					}}
				>
					<span className="block whitespace-nowrap text-[11px] font-medium tabular-nums">
						{formatPlayheadTime(clampedTime)}
					</span>
				</button>
			</div>
		</div>
	);
}
