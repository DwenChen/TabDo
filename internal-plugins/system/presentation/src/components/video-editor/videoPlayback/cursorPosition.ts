import type { CursorTelemetryPoint } from "../types";
import { cursorSampleIndexAt, indexCursorTelemetry } from "./cursorTelemetryIndex";
import type { CursorSpringTuning } from './motionSmoothing';
/** Linearly interpolate the neighboring telemetry samples at a media timestamp. */
export function interpolateCursorPosition(
	samples: CursorTelemetryPoint[],
	timeMs: number
): { cx: number; cy: number } | null {
	if (!samples || samples.length === 0) return null;

	if (timeMs <= samples[0].timeMs) {
		return { cx: samples[0].cx, cy: samples[0].cy };
	}

	if (timeMs >= samples[samples.length - 1].timeMs) {
		return {
			cx: samples[samples.length - 1].cx,
			cy: samples[samples.length - 1].cy
		};
	}

	let lo = 0;
	let hi = samples.length - 1;
	while (lo < hi - 1) {
		const mid = (lo + hi) >> 1;
		if (samples[mid].timeMs <= timeMs) {
			lo = mid;
		} else {
			hi = mid;
		}
	}

	const a = samples[lo];
	const b = samples[hi];
	const span = b.timeMs - a.timeMs;
	if (span <= 0) return { cx: a.cx, cy: a.cy };

	const t = (timeMs - a.timeMs) / span;
	return {
		cx: a.cx + (b.cx - a.cx) * t,
		cy: a.cy + (b.cy - a.cy) * t
	};
}

/**
 * 以源视频时间为中心平滑轨迹，消除追赶式弹簧造成的累计延迟。
 * @param samples 已排序的素材轨迹。
 * @param timeMs 当前视频帧时间，单位毫秒。
 * @param smoothing 平滑强度；零为原始插值，窗口最大为左右各 64ms。
 * @param tuning 项目已有的刚度、阻尼与质量参数，转换为有界的滤波窗口。
 * @returns 对称采样的坐标；真实点击处严格经过原始位置，没有轨迹时为空。
 */
export function sampleSmoothedCursorPosition(
	samples: CursorTelemetryPoint[],
	timeMs: number,
	smoothing: number,
	tuning?: CursorSpringTuning
) {
	const center = interpolateCursorPosition(samples, timeMs);
	if (!center || smoothing <= 0) return center;
	const stiffness = Math.max(0.25, Math.min(3, tuning?.stiffnessMultiplier ?? 1));
	const damping = Math.max(0.25, Math.min(3, tuning?.dampingMultiplier ?? 1));
	const mass = Math.max(0.25, Math.min(3, tuning?.massMultiplier ?? 1));
	const radius = Math.min(64, Math.max(0, smoothing) * 32 * Math.sqrt(mass / stiffness) * damping);
	const { clicks } = indexCursorTelemetry(samples);
	const index = cursorSampleIndexAt(clicks, timeMs);
	const distance = Math.min(
		index >= 0 ? Math.abs(timeMs - clicks[index].timeMs) : Infinity,
		index + 1 < clicks.length ? Math.abs(clicks[index + 1].timeMs - timeMs) : Infinity
	);
	const weight = Math.min(1, distance / Math.max(1, radius));
	const before = interpolateCursorPosition(samples, timeMs - radius)!;
	const after = interpolateCursorPosition(samples, timeMs + radius)!;
	return {
		cx: center.cx + ((before.cx + after.cx - 2 * center.cx) * weight) / 4,
		cy: center.cy + ((before.cy + after.cy - 2 * center.cy) * weight) / 4
	};
}
