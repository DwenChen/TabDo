import { useTimelinePresentation } from "../../core/TimelinePresentation";
import { getPlayheadDisplayTime, getTimeAtClipSeam } from "../../core/clipPresentation";
import { useTimelineContext } from "dnd-timeline";
import React, { useEffect, useState } from "react";
import { useTimelineDragCursor } from "../../hooks/useTimelineDragCursor";

interface Keyframe {
	id: string;
	time: number;
}

interface KeyframeMarkersProps {
	keyframes: Keyframe[];
	selectedKeyframeId: string | null;
	setSelectedKeyframeId: (id: string | null) => void;
	onKeyframeMove: (id: string, newTime: number) => void;
	videoDurationMs: number;
	timelineRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * 绘制并拖动时间轴关键帧，取消与卸载时释放当前手势。
 * @param props 关键帧、选区、媒体时长与移动回调。
 * @returns 当前可见范围内的关键帧标记。
 */
const KeyframeMarkers: React.FC<KeyframeMarkersProps> = ({
	keyframes,
	selectedKeyframeId,
	setSelectedKeyframeId,
	onKeyframeMove,
	videoDurationMs,
	timelineRef,
}) => {
	const { sidebarWidth, range, valueToPixels, pixelsToValue } = useTimelineContext();
	const { clips } = useTimelinePresentation();
	const [draggingKeyframeId, setDraggingKeyframeId] = useState<string | null>(null);
	useTimelineDragCursor(Boolean(draggingKeyframeId), () => setDraggingKeyframeId(null));

	useEffect(() => {
		if (!draggingKeyframeId) return;

		const handleMouseMove = (e: MouseEvent) => {
			if (!timelineRef.current) return;

			const rect = timelineRef.current.getBoundingClientRect();
			const clickX = e.clientX - rect.left - sidebarWidth;
			const relativeMs = pixelsToValue(clickX);
			const absoluteMs = Math.max(0, Math.min(range.start + relativeMs, videoDurationMs));

			// Update the keyframe position in real-time
			onKeyframeMove(draggingKeyframeId, getTimeAtClipSeam(absoluteMs, clips));
		};

		const handleMouseUp = () => {
			setDraggingKeyframeId(null);
		};

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);

		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		};
	}, [
		clips,
		draggingKeyframeId,
		onKeyframeMove,
		timelineRef,
		sidebarWidth,
		range.start,
		videoDurationMs,
		pixelsToValue,
	]);

	return (
		<>
			{keyframes.map((kf) => {
				const offset = valueToPixels(getPlayheadDisplayTime(kf.time, clips) - range.start);
				const isSelected = kf.id === selectedKeyframeId;
				const isDragging = kf.id === draggingKeyframeId;

				return (
					<div
						key={kf.id}
						className={`absolute top-8 cursor-grab active:cursor-grabbing ${isSelected ? "ring-2 ring-accent" : ""}`}
						style={{
							left: `${sidebarWidth + offset - 8}px`,
							zIndex: isDragging ? 50 : 40,
							transition: isDragging ? "none" : "left 0.1s ease-out",
						}}
						onMouseDown={(e) => {
							e.stopPropagation();
							setSelectedKeyframeId(kf.id);
							if (e.button !== 0) {
								return;
							}
							setDraggingKeyframeId(kf.id);
						}}
						onContextMenu={(e) => {
							e.preventDefault();
							e.stopPropagation();
							setSelectedKeyframeId(kf.id);
						}}
						title={`关键帧时间：${Math.round(kf.time)}ms (drag to move, Delete/Backspace to remove)`}
					>
						<div
							style={{
								width: "10px",
								height: "10px",
								background: "#ffe100ff",
								transform: "rotate(45deg)",
								border: "none",
								opacity: isSelected ? 1 : 0.6,
								transition: "opacity 0.15s",
							}}
						/>
					</div>
				);
			})}
		</>
	);
};

export default KeyframeMarkers;
