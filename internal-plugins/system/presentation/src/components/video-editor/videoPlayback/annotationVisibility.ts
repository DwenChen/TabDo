import type { AnnotationRegion } from "../types";

/**
 * 判断注释是否覆盖当前媒体时间，片段尾边界只属于后一片段。
 * @param annotation 片段起止时间。
 * @param timeMs 当前媒体时间。
 * @returns 当前时间位于左闭右开区间时为 true。
 */
export function isAnnotationActiveAtTime(
	annotation: Pick<AnnotationRegion, "startMs" | "endMs">,
	timeMs: number,
): boolean {
	return (
		Number.isFinite(annotation.startMs) &&
		Number.isFinite(annotation.endMs) &&
		timeMs >= annotation.startMs &&
		timeMs < annotation.endMs
	);
}
