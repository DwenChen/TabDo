import { normalizeAnnotationRotation } from "../annotationGeometry";
import { findPasteTrack } from "../timeline/timelineClipboard";
import type { Span } from "dnd-timeline";
import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback } from "react";
import {
	type AnnotationRegion,
	DEFAULT_ANNOTATION_POSITION,
	DEFAULT_ANNOTATION_SIZE,
	DEFAULT_ANNOTATION_STYLE,
	DEFAULT_FIGURE_DATA,
	DEFAULT_FIGURE_SIZE,
	type FigureData,
} from "../types";

interface UseAnnotationRegionCommandsParams {
	onSelectAnnotation: (id: string | null) => void;
	setAnnotationRegions: Dispatch<SetStateAction<AnnotationRegion[]>>;
	selectedAnnotationId: string | null;
	setSelectedAnnotationId: Dispatch<SetStateAction<string | null>>;
	setSelectedZoomId: Dispatch<SetStateAction<string | null>>;
	nextAnnotationIdRef: MutableRefObject<number>;
	nextAnnotationZIndexRef: MutableRefObject<number>;
}

/**
 * 管理注释的创建、类型和画面参数，重叠的新注释放入空闲导轨。
 * @param props 当前注释状态、身份计数及选区回调。
 * @returns 当前项目的注释编辑命令。
 */
export function useAnnotationRegionCommands({
	onSelectAnnotation,
	setAnnotationRegions,
	selectedAnnotationId,
	setSelectedAnnotationId,
	setSelectedZoomId,
	nextAnnotationIdRef,
	nextAnnotationZIndexRef,
}: UseAnnotationRegionCommandsParams) {
	/**
	 * 在请求时间创建注释，保留同时间的其他注释并避免导轨遮挡。
	 * @param span 目标毫秒区间。
	 * @param trackIndex 优先使用的导轨编号。
	 * @returns 无返回值；发布并选中新注释。
	 */
	const handleAnnotationAdded = useCallback(
		(span: Span, trackIndex = 0) => {
			const id = `annotation-${nextAnnotationIdRef.current++}`;
			const newRegion: AnnotationRegion = {
				id,
				startMs: Math.round(span.start),
				endMs: Math.round(span.end),
				type: "text",
				content: "输入文字…",
				position: { ...DEFAULT_ANNOTATION_POSITION },
				size: { ...DEFAULT_ANNOTATION_SIZE },
				style: { ...DEFAULT_ANNOTATION_STYLE },
				zIndex: nextAnnotationZIndexRef.current++,
				trackIndex,
			};
			// 与粘贴共用空闲轨道分配，不移动用户已有注释的时间或图层。
			setAnnotationRegions((current) => [...current, {
				...newRegion,
				trackIndex: findPasteTrack(current, newRegion.startMs, newRegion.endMs, trackIndex),
			}]);
			onSelectAnnotation(id);
			setSelectedZoomId(null);
		},
		[
			onSelectAnnotation,
			nextAnnotationIdRef,
			nextAnnotationZIndexRef,
			setAnnotationRegions,
			setSelectedZoomId,
		],
	);

	const handleAnnotationSpanChange = useCallback(
		(id: string, span: Span, trackIndex?: number) => {
			const normalizedTrackIndex =
				typeof trackIndex === "number" && Number.isFinite(trackIndex)
					? Math.max(0, Math.floor(trackIndex))
					: undefined;
			setAnnotationRegions((current) =>
				current.map((region) =>
					region.id === id
						? {
								...region,
								startMs: Math.round(span.start),
								endMs: Math.round(span.end),
								...(normalizedTrackIndex === undefined
									? {}
									: { trackIndex: normalizedTrackIndex }),
							}
						: region,
				),
			);
		},
		[setAnnotationRegions],
	);

	const handleAnnotationDelete = useCallback(
		(id: string) => {
			setAnnotationRegions((current) => current.filter((region) => region.id !== id));
			if (selectedAnnotationId === id) setSelectedAnnotationId(null);
		},
		[selectedAnnotationId, setAnnotationRegions, setSelectedAnnotationId],
	);

	const handleAnnotationContentChange = useCallback(
		(id: string, content: string) => {
			setAnnotationRegions((current) =>
				current.map((region) => {
					if (region.id !== id) return region;
					if (region.type === "text" || region.type === "keystroke") return { ...region, content, textContent: content };
					if (region.type === "image")
						return { ...region, content, imageContent: content };
					return { ...region, content };
				}),
			);
		},
		[setAnnotationRegions],
	);

	const handleAnnotationTypeChange = useCallback(
		(id: string, type: AnnotationRegion["type"]) => {
			setAnnotationRegions((current) =>
				current.map((region) => {
					if (region.id !== id) return region;
					const updated = { ...region, type };
					if (type === "text") updated.content = region.textContent || "输入文字…";
					else if (type === "image") updated.content = region.imageContent || "";
					else if (type === "figure") {
						updated.content = "";
						if (!region.figureData) {
							// 首次选择箭头使用小号白底黑边外观，保留原对象中心。
							updated.figureData = { ...DEFAULT_FIGURE_DATA };
							updated.size = { ...DEFAULT_FIGURE_SIZE };
							updated.position = { x: region.position.x + (region.size.width - DEFAULT_FIGURE_SIZE.width) / 2, y: region.position.y + (region.size.height - DEFAULT_FIGURE_SIZE.height) / 2 };
						}
					} else if (["blur", "mosaic", "focus"].includes(type)) {
						updated.content = "";
						if (region.blurIntensity === undefined) updated.blurIntensity = type === "focus" ? 60 : 20;
					}
					return updated;
				}),
			);
		},
		[setAnnotationRegions],
	);

	const updateRegion = useCallback(
		(id: string, patch: Partial<AnnotationRegion>) => {
			setAnnotationRegions((current) =>
				current.map((region) => (region.id === id ? { ...region, ...patch } : region)),
			);
		},
		[setAnnotationRegions],
	);

	const handleAnnotationStyleChange = useCallback(
		(id: string, style: Partial<AnnotationRegion["style"]>) => {
			setAnnotationRegions((current) =>
				current.map((region) =>
					region.id === id ? { ...region, style: { ...region.style, ...style } } : region,
				),
			);
		},
		[setAnnotationRegions],
	);
	const handleAnnotationFigureDataChange = useCallback(
		(id: string, figureData: FigureData) => updateRegion(id, { figureData }),
		[updateRegion],
	);
	const handleAnnotationBlurIntensityChange = useCallback(
		(id: string, blurIntensity: number) => updateRegion(id, { blurIntensity }),
		[updateRegion],
	);
	const handleAnnotationBlurColorChange = useCallback(
		(id: string, blurColor: string) => updateRegion(id, { blurColor }),
		[updateRegion],
	);
	const handleAnnotationPositionChange = useCallback(
		(id: string, position: { x: number; y: number }) => updateRegion(id, { position }),
		[updateRegion],
	);
	const handleAnnotationSizeChange = useCallback(
		(id: string, size: { width: number; height: number }) => updateRegion(id, { size }),
		[updateRegion],
	);

	/**
	 * 发布对象的顺时针旋转，与位置尺寸共用历史和保存链。
	 * @param id 注释身份。
	 * @param rotation 用户选择的角度。
	 * @returns 无返回值；更新当前注释。
	 */
	const handleAnnotationRotationChange = useCallback(
		(id: string, rotation: number) => updateRegion(id, { rotation: normalizeAnnotationRotation(rotation) }),
		[updateRegion],
	);

	return {
		handleAnnotationRotationChange,
		handleAnnotationAdded,
		handleAnnotationSpanChange,
		handleAnnotationDelete,
		handleAnnotationContentChange,
		handleAnnotationTypeChange,
		handleAnnotationStyleChange,
		handleAnnotationFigureDataChange,
		handleAnnotationBlurIntensityChange,
		handleAnnotationBlurColorChange,
		handleAnnotationPositionChange,
		handleAnnotationSizeChange,
	};
}
