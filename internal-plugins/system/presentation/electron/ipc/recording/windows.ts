import { execFile, type ChildProcessWithoutNullStreams } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { getFfmpegBinaryPath } from "../ffmpeg/binary";
import { probeVideoStreamDurationSeconds } from "./diagnostics";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import { BrowserWindow } from "@tabdo/presentation-electron";
import { getWindowsCaptureExePath } from "../paths/binaries";
import {
	selectedSource,
	setWindowsCaptureProcess,
	setWindowsCaptureStopRequested,
	setWindowsNativeCaptureActive,
	windowsCaptureOutputBuffer,
	windowsCaptureStopRequested,
	windowsCaptureTargetPath,
	windowsNativeCaptureActive,
} from "../state";
import { AudioSyncAdjustment } from "../types";
import { moveFileWithOverwrite } from "../utils";
import { emitRecordingInterrupted } from "./events";

const WINDOWS_CAPTURE_STOP_TIMEOUT_MS = 45_000;

export type NativeWindowsVideoPaddingResult = {
	padded: boolean;
	durationSeconds: number;
	containerDurationSeconds: number;
	targetDurationSeconds: number;
	padDurationSeconds: number;
};

export type NativeWindowsAudioMuxResult = {
	muxed: boolean;
	videoDurationSeconds: number;
	muxTimeoutMs: number;
	audioInputs: string[];
	audio: Record<
		string,
		{
			path: string;
			sizeBytes: number;
			durationSeconds: number;
			startDelayMs: number | null;
			adjustment: AudioSyncAdjustment;
		}
	>;
	outputPath?: string;
	keptAudioSidecars?: boolean;
};

export async function isNativeWindowsCaptureAvailable(): Promise<boolean> {
	if (process.platform !== "win32") return false;

	const os = await import("node:os");
	const [major, , build] = os.release().split(".").map(Number);
	const supported = major >= 10 && build >= 19041;
	if (!supported) return false;

	try {
		await fs.access(getWindowsCaptureExePath(), fsConstants.X_OK);
	} catch {
		return false;
	}

	return true;
}

/**
 * Wait for a real prepared frame or the first committed video frame.
 * @param proc Owned native capture process.
 * @param prepared Whether setup must stop before publishing recording content.
 * @returns Resolves at the requested protocol marker or rejects on startup failure.
 */
export function waitForWindowsCaptureStart(proc: ChildProcessWithoutNullStreams, prepared = false) {
	return new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => {
			cleanup();
			reject(new Error("Timed out waiting for native Windows capture to start"));
		}, 12000);

		let stdoutBuffer = "";
		const onStdout = (chunk: Buffer) => {
			stdoutBuffer += chunk.toString();
            if (stdoutBuffer.includes(prepared ? "Capture ready" : "Recording started")) {
				cleanup();
				resolve();
			}
		};

		const onError = (error: Error) => {
			cleanup();
			reject(error);
		};

		const onExit = (code: number | null) => {
			cleanup();
			reject(
				new Error(
					windowsCaptureOutputBuffer.trim() ||
						`Native Windows capture exited before recording started (code ${code ?? "unknown"})`,
				),
			);
		};

		const cleanup = () => {
			clearTimeout(timer);
			proc.stdout.off("data", onStdout);
			proc.off("error", onError);
			proc.off("exit", onExit);
		};

		proc.stdout.on("data", onStdout);
		proc.once("error", onError);
		proc.once("exit", onExit);
	});
}

export function waitForWindowsCaptureStop(
	proc: ChildProcessWithoutNullStreams,
	timeoutMs = WINDOWS_CAPTURE_STOP_TIMEOUT_MS,
) {
	return new Promise<string>((resolve, reject) => {
		let settled = false;
		const finish = (callback: () => void) => {
			if (settled) return;
			settled = true;
			cleanup();
			callback();
		};

		const timer = setTimeout(() => {
			finish(() => {
				try {
					if (!proc.killed) proc.kill();
				} catch {
					// The process may already be gone; the caller only needs the timeout error.
				}
				reject(new Error("Timed out waiting for native Windows capture to stop"));
			});
		}, timeoutMs);

		const onClose = (code: number | null) => {
			finish(() => {
				const match = windowsCaptureOutputBuffer.match(
					/Recording stopped\. Output path: (.+)/,
				);
				if (match?.[1]) {
					resolve(match[1].trim());
					return;
				}
				if (code === 0 && windowsCaptureTargetPath) {
					resolve(windowsCaptureTargetPath);
					return;
				}
				reject(
					new Error(
						windowsCaptureOutputBuffer.trim() ||
							`Native Windows capture exited with code ${code ?? "unknown"}`,
					),
				);
			});
		};

		const onError = (error: Error) => {
			finish(() => {
				reject(error);
			});
		};

		const cleanup = () => {
			clearTimeout(timer);
			proc.off("close", onClose);
			proc.off("error", onError);
		};

		proc.once("close", onClose);
		proc.once("error", onError);
	});
}

export function attachWindowsCaptureLifecycle(proc: ChildProcessWithoutNullStreams) {
	proc.once("close", () => {
		const wasActive = windowsNativeCaptureActive;
		setWindowsCaptureProcess(null);

		if (!wasActive || windowsCaptureStopRequested) {
			return;
		}

		setWindowsNativeCaptureActive(false);
		setWindowsCaptureStopRequested(false);

		const sourceName = selectedSource?.name ?? "屏幕";
		BrowserWindow.getAllWindows().forEach((window) => {
			if (!window.isDestroyed()) {
				window.webContents.send("recording-state-changed", {
					recording: false,
					sourceName,
				});
			}
		});

		emitRecordingInterrupted("capture-stopped", "Recording stopped unexpectedly.");
	});
}

/**
 * 按画面实际时长对齐原生系统音频及浏览器麦克风，保留两个独立音轨。
 * @param videoPath 已封装完成的无指针主视频。
 * @param systemAudioPath 原生系统音频，可为空。
 * @param micAudioPath 原生麦克风；浏览器麦克风从同名伴随路径发现。
 * @returns 独立音轨路径、原始延迟和对齐结果，不重编码主视频。
 * @throws 音轨读取、对齐或发布失败时抛错，并保留原音轨。
 */
export async function muxNativeWindowsVideoWithAudio(
    videoPath: string,
    systemAudioPath: string | null,
    micAudioPath: string | null,
): Promise<NativeWindowsAudioMuxResult> {
    const execute = promisify(execFile);
    const videoDurationSeconds = await probeVideoStreamDurationSeconds(videoPath);
    if (!(videoDurationSeconds > 0)) throw new Error("无法取得原生录制时长");
    const stem = videoPath.replace(/\.[^.]+$/u, "");
    const audio: NativeWindowsAudioMuxResult["audio"] = {};
    const audioInputs: string[] = [];
    for (const [kind, requested] of [["system", systemAudioPath], ["mic", micAudioPath]] as const) {
        const target = `${stem}.${kind}.wav`;
        const source = requested ?? target;
        const stat = await fs.stat(source).catch((error) => {
            if (error.code === "ENOENT") return null;
            throw error;
        });
        if (!stat || stat.size <= 44) continue;
        const metadata = await fs.readFile(source + ".json", "utf8").then((text) => JSON.parse(text)).catch((error) => {
            if (error.code === "ENOENT") return {};
            throw error;
        });
        const delayMs = typeof metadata.startDelayMs === "number" && Number.isFinite(metadata.startDelayMs)
            ? Math.max(0, Math.round(metadata.startDelayMs)) : 0;
        const temporary = path.join(path.dirname(target), `.recording-aligned-${randomUUID()}.wav`);
        try {
            // 只处理音频：补齐前置静音并裁切/延长尾部，视频画面保持逐字节不变。
            await execute(getFfmpegBinaryPath(), ["-v", "error", "-y", "-i", source, "-vn", "-af",
                `aresample=async=1:first_pts=0,adelay=${delayMs}:all=1,apad,atrim=duration=${videoDurationSeconds},asetpts=N/SR/TB`,
                "-c:a", "pcm_s16le", temporary], { windowsHide: true, timeout: 120000, maxBuffer: 1024 * 1024 });
            // 新音轨完整写好后原子替换，失败不能先删除已有音轨。
            await fs.rename(temporary, target);
            await fs.writeFile(target + ".json", JSON.stringify({ ...metadata, startDelayMs: 0,
                recordedStartDelayMs: metadata.recordedStartDelayMs ?? delayMs,
                alignedDurationMs: Math.round(videoDurationSeconds * 1000) }));
            audioInputs.push(kind);
            audio[kind] = { path: target, sizeBytes: (await fs.stat(target)).size,
                durationSeconds: videoDurationSeconds, startDelayMs: 0,
                adjustment: { mode: "delay", delayMs, tempoRatio: 1, durationDeltaMs: 0 } };
        } finally {
            await fs.rm(temporary, { force: true });
        }
    }
    return { muxed: false, videoDurationSeconds, muxTimeoutMs: 120000, audioInputs, audio, keptAudioSidecars: true };
}
