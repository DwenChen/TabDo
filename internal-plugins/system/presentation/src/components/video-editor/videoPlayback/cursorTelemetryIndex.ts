import type { CursorTelemetryPoint } from "../types";

const indexes = new WeakMap<
	CursorTelemetryPoint[],
	{
		length: number;
		clicks: CursorTelemetryPoint[];
		types: CursorTelemetryPoint[];
	}
>();

/**
 * 查找不晚于媒体时间的最后一个采样，支持重复时间戳和任意跳转。
 * @param samples 按时间排序的轨迹或事件索引。
 * @param timeMs 源视频时间，单位毫秒。
 * @returns 最后一个匹配采样的位置；首帧之前返回 -1。
 */
export function cursorSampleIndexAt(samples: CursorTelemetryPoint[], timeMs: number): number {
	let lo = 0;
	let hi = samples.length;
	while (lo < hi) {
		const mid = (lo + hi) >>> 1;
		if (samples[mid].timeMs <= timeMs) lo = mid + 1;
		else hi = mid;
	}
	return lo - 1;
}

/**
 * 为只读轨迹缓存稀疏点击和形状索引，避免每帧倒扫全部录制数据。
 * @param samples 当前素材的归一化轨迹；长度变化时重新建立索引。
 * @returns 供二分查询的点击与稳定形状采样；轨迹释放后缓存可自动回收。
 */
export function indexCursorTelemetry(samples: CursorTelemetryPoint[]) {
	let index = indexes.get(samples);
	if (!index || index.length !== samples.length) {
		const clicks: CursorTelemetryPoint[] = [];
		const types: CursorTelemetryPoint[] = [];
		// 一次遍历建立索引，索引不拥有素材之外的进程或资源。
		for (const sample of samples) {
			const click =
				sample.interactionType === "click" ||
				sample.interactionType === "double-click" ||
				sample.interactionType === "right-click" ||
				sample.interactionType === "middle-click";
			if (click) clicks.push(sample);
			else if (sample.cursorType && sample.cursorType !== types[types.length - 1]?.cursorType)
				types.push(sample);
		}
		index = { length: samples.length, clicks, types };
		indexes.set(samples, index);
	}
	return index;
}
