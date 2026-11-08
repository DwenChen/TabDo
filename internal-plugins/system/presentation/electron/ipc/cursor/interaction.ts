import fs from "node:fs";
import { getHudOverlayWindow } from "../../windows";
import { createRequire } from "node:module";
import path from "node:path";
import { createKeyboardCapture, type CaptureKeyEvent } from './keyboard';
import {
	activeCursorSamples,
	hasLoggedInteractionHookFailure,
	interactionCaptureCleanup,
	isCursorCaptureActive,
	mouseCaptureEnabled,
	lastLeftClick,
	setHasLoggedInteractionHookFailure,
	setInteractionCaptureCleanup,
	setLastLeftClick,
	setLinuxCursorScreenPoint,
} from "../state";
import type {
	CursorInteractionType,
	HookMouseEvent,
	UiohookLike,
	UiohookModuleNamespace,
} from "../types";
import {
	getCursorCaptureElapsedMs,
	getHookCursorScreenPoint,
	getNormalizedCursorPoint,
	isCursorCapturePaused,
	pushCursorSample,
} from "./telemetry";

export let keyboardCaptureEnabled = false;

/**
 * Enable key display only for the current recording session.
 * @param enabled - Explicit user choice from the recording controls.
 * @returns Nothing; changes the session capture flag.
 */
export function setKeyboardCaptureEnabled(enabled: boolean): void { keyboardCaptureEnabled = enabled; }

const nodeRequire = createRequire(__TABDO_PRESENTATION_HOST__.moduleUrl);

export function normalizeHookMouseButton(rawButton: unknown): 1 | 2 | 3 {
	if (typeof rawButton !== "number" || !Number.isFinite(rawButton)) {
		return 1;
	}

	if (rawButton === 2 || rawButton === 39) {
		return 2;
	}

	if (rawButton === 3 || rawButton === 38) {
		return 3;
	}

	return 1;
}

export function getHookMouseButton(event: HookMouseEvent | null | undefined): 1 | 2 | 3 {
	return normalizeHookMouseButton(
		event?.button ?? event?.mouseButton ?? event?.data?.button ?? event?.data?.mouseButton,
	);
}

export function stopInteractionCapture() {
	if (interactionCaptureCleanup) {
		interactionCaptureCleanup();
		setInteractionCaptureCleanup(null);
	}
}

function isUiohookLike(value: unknown): value is UiohookLike {
	const candidate = value as Partial<UiohookLike> | null;
	return typeof candidate?.on === "function" && typeof candidate?.start === "function";
}

function resolveUiohookModule(moduleExports: UiohookModuleNamespace) {
	const defaultExport = moduleExports.default;

	if (moduleExports.uIOhook) {
		return moduleExports.uIOhook;
	}

	if (moduleExports.uiohook) {
		return moduleExports.uiohook;
	}

	if (moduleExports.Uiohook) {
		return moduleExports.Uiohook;
	}

	if (isUiohookLike(defaultExport)) {
		return defaultExport;
	}

	if (defaultExport?.uIOhook) {
		return defaultExport.uIOhook;
	}

	if (defaultExport?.uiohook) {
		return defaultExport.uiohook;
	}

	if (defaultExport?.Uiohook) {
		return defaultExport.Uiohook;
	}

	return null;
}

function shouldRepairBundledUiohookBinary(error: unknown): error is NodeJS.ErrnoException {
	if (process.platform !== "darwin") {
		return false;
	}

	if (process.arch !== "arm64") {
		return false;
	}

	const candidate = error as NodeJS.ErrnoException | null;
	return (
		candidate?.code === "ERR_DLOPEN_FAILED" &&
		typeof candidate.message === "string" &&
		candidate.message.includes("incompatible architecture")
	);
}

export function repairBundledUiohookBinaryForCurrentArch(
	error: unknown,
	options?: {
		packageRoot?: string;
		platform?: NodeJS.Platform;
		arch?: string;
		log?: (message: string) => void;
	},
) {
	const platform = options?.platform ?? process.platform;
	const arch = options?.arch ?? process.arch;

	if (platform !== "darwin" || arch !== "arm64") {
		return false;
	}

	const candidate = error as NodeJS.ErrnoException | null;
	if (
		candidate?.code !== "ERR_DLOPEN_FAILED" ||
		typeof candidate.message !== "string" ||
		!candidate.message.includes("incompatible architecture")
	) {
		return false;
	}

	const packageRoot =
		options?.packageRoot ?? path.dirname(nodeRequire.resolve("uiohook-napi/package.json"));
	const prebuildPath = path.join(packageRoot, "prebuilds", `darwin-${arch}`, "node.napi.node");
	const buildPath = path.join(packageRoot, "build", "Release", "uiohook_napi.node");

	if (!fs.existsSync(prebuildPath)) {
		return false;
	}

	try {
		fs.mkdirSync(path.dirname(buildPath), { recursive: true });
		fs.copyFileSync(prebuildPath, buildPath);
		(options?.log ?? console.warn)(
			"[CursorTelemetry] Repaired stale uiohook-napi binary using bundled darwin-arm64 prebuild.",
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * 优先取得宿主已加载的输入单例，独立上游环境才解析其本地依赖。
 * @returns 可订阅的全局输入源。
 * @throws 独立环境的原生模块不可加载且无法修复时抛错。
 */
function loadUiohookModule() {
	// 宿主提供已启动的同一个输入源，预览与正式包都不二次加载原生模块。
	if (__TABDO_PRESENTATION_HOST__.inputHook) return __TABDO_PRESENTATION_HOST__.inputHook.uIOhook;
	try {
		const moduleExports = nodeRequire("uiohook-napi") as UiohookModuleNamespace;
		return resolveUiohookModule(moduleExports);
	} catch (error) {
		if (!shouldRepairBundledUiohookBinary(error)) {
			throw error;
		}

		if (!repairBundledUiohookBinaryForCurrentArch(error)) {
			throw error;
		}

		delete nodeRequire.cache[nodeRequire.resolve("uiohook-napi")];
		const moduleExports = nodeRequire("uiohook-napi") as UiohookModuleNamespace;
		return resolveUiohookModule(moduleExports);
	}
}

export function shouldStartGlobalInteractionHook(platform: NodeJS.Platform = process.platform) {
	// On macOS, uiohook can block forever while its native event tap starts
	// (notably when Accessibility permission is unavailable or stale). Because
	// start() executes synchronously, that freezes Electron's main thread and
	// makes every window, including the recording HUD, unresponsive. Cursor
	// position and visual-state telemetry still come from the existing native
	// macOS monitor and Electron sampler.
	return platform !== "darwin";
}

/**
 * 仅在本次录制允许鼠标采集时记录点击。
 * @param button 物理鼠标按键。
 * @returns 无返回值；关闭鼠标采集时不写入轨迹。
 */
export function recordCursorMouseDown(button: 1 | 2 | 3) {
	if (!mouseCaptureEnabled || !isCursorCaptureActive || isCursorCapturePaused()) {
		return;
	}

	const point = getNormalizedCursorPoint();
	if (!point) {
		return;
	}

	const timeMs = getCursorCaptureElapsedMs();
	let interactionType: CursorInteractionType = "click";

	if (button === 2) {
		interactionType = "right-click";
	} else if (button === 3) {
		interactionType = "middle-click";
	} else {
		const thresholdMs = 350;
		const distance = lastLeftClick
			? Math.hypot(point.cx - lastLeftClick.cx, point.cy - lastLeftClick.cy)
			: Number.POSITIVE_INFINITY;

		if (lastLeftClick && timeMs - lastLeftClick.timeMs <= thresholdMs && distance <= 0.04) {
			interactionType = "double-click";
		}

		setLastLeftClick({ timeMs, cx: point.cx, cy: point.cy });
	}

	pushCursorSample(point.cx, point.cy, timeMs, interactionType);
}

/**
 * 记录本次鼠标释放，遵循独立鼠标开关和暂停边界。
 * @returns 无返回值。
 */
export function recordCursorMouseUp() {
	if (!mouseCaptureEnabled || !isCursorCaptureActive || isCursorCapturePaused()) {
		return;
	}

	const point = getNormalizedCursorPoint();
	if (!point) {
		return;
	}

	pushCursorSample(point.cx, point.cy, getCursorCaptureElapsedMs(), "mouseup");
}

/**
 * 为当前录制订阅已选择的物理输入，退出只解除所属监听。
 * @returns 本次输入订阅完成后的 Promise，不重复启动 Windows 全局采集。
 */
export async function startInteractionCapture() {
	if (!isCursorCaptureActive || (!keyboardCaptureEnabled && !mouseCaptureEnabled)) {
		return;
	}

	if (!["darwin", "win32", "linux"].includes(process.platform)) {
		return;
	}

	if (!shouldStartGlobalInteractionHook()) {
		console.warn("[CursorTelemetry] Skipping the blocking global interaction hook on macOS.");
		return;
	}

	stopInteractionCapture();

	try {
		const hook = loadUiohookModule();
		console.log(
			"[CursorTelemetry] hook loaded:",
			!!hook,
			"has.on:",
			typeof hook?.on,
			"has.start:",
			typeof hook?.start,
		);
		if (!isCursorCaptureActive) {
			return;
		}

		if (!hook || typeof hook.on !== "function" || typeof hook.start !== "function") {
			console.log("[CursorTelemetry] hook unusable — aborting interaction capture");
			return;
		}

		const onMouseDown = (event: HookMouseEvent) => {
			recordCursorMouseDown(getHookMouseButton(event));
		};

		const onMouseUp = () => {
			recordCursorMouseUp();
		};

		const onMouseMove = (event: HookMouseEvent) => {
			if (process.platform !== "linux" || !isCursorCaptureActive || isCursorCapturePaused()) {
				return;
			}

			const point = getHookCursorScreenPoint(event);
			if (!point) {
				return;
			}

			setLinuxCursorScreenPoint({ x: point.x, y: point.y, updatedAt: Date.now() });
		};


    const keyNames = (__TABDO_PRESENTATION_HOST__.inputHook?.UiohookKey ?? nodeRequire("uiohook-napi").UiohookKey) as Record<string, number>;
    const keyboardCapture = createKeyboardCapture(keyNames);
    /**
     * Collect physical keyboard input only while the recording and its toggle are active.
     * @param event - Native key event.
     * @returns Nothing; appends a bounded key sample to the recording telemetry.
     */
    const onKeyDown = (event: CaptureKeyEvent): void => {
      if (!keyboardCaptureEnabled || !isCursorCaptureActive || isCursorCapturePaused()) { keyboardCapture.reset(); return; }
      const keyText = keyboardCapture.keydown(event);
      if (!keyText) return;
      const hud = getHudOverlayWindow();
      if (hud && !hud.isDestroyed()) hud.webContents.send("keyboard-display", keyText);
      // 键盘事件沿用当时鼠标位置，不能把光标轨迹拉回画面中心。
      const point = mouseCaptureEnabled ? getNormalizedCursorPoint() : { cx: 0.5, cy: 0.5 };
      activeCursorSamples.push({ timeMs: getCursorCaptureElapsedMs(), cx: point.cx, cy: point.cy, keyText });
      if (activeCursorSamples.length > 200000) activeCursorSamples.shift();
    };
    /**
     * 即使采集暂停也解除松开的修饰键，避免恢复后组合键粘连。
     * @param event 原生松开事件。
     * @returns 无返回值；不追加松开遥测。
     */
    const onKeyUp = (event: CaptureKeyEvent): void => { keyboardCapture.keyup(event); };
    const keyboardHook = hook as unknown as { on: (event: string, listener: typeof onKeyDown) => void; off?: (event: string, listener: typeof onKeyDown) => void; removeListener?: (event: string, listener: typeof onKeyDown) => void };
    keyboardHook.on("keydown", onKeyDown);
    keyboardHook.on("keyup", onKeyUp);
		hook.on("mousedown", onMouseDown);
		hook.on("mouseup", onMouseUp);
		if (process.platform === "linux") {
			hook.on("mousemove", onMouseMove);
		}

		setInteractionCaptureCleanup(() => {
      (keyboardHook.off ?? keyboardHook.removeListener)?.call(keyboardHook, "keydown", onKeyDown);
      (keyboardHook.off ?? keyboardHook.removeListener)?.call(keyboardHook, "keyup", onKeyUp);
      keyboardCapture.reset();
			try {
				if (typeof hook.off === "function") {
					hook.off("mousedown", onMouseDown);
					hook.off("mouseup", onMouseUp);
					if (process.platform === "linux") {
						hook.off("mousemove", onMouseMove);
					}
				} else if (typeof hook.removeListener === "function") {
					hook.removeListener("mousedown", onMouseDown);
					hook.removeListener("mouseup", onMouseUp);
					if (process.platform === "linux") {
						hook.removeListener("mousemove", onMouseMove);
					}
				}
			} catch {
				// ignore listener cleanup errors
			}

			// uiohook 由 TabDo 宿主持有；这里只撤销所属录制监听，不能停止全局采集。
		});

		// Windows 宿主已经启动全局输入监听，重复 start 可能阻塞原生事件线程。
		if (process.platform !== 'win32') hook.start();
	} catch (error) {
		if (!hasLoggedInteractionHookFailure) {
			setHasLoggedInteractionHookFailure(true);
			console.warn("[CursorTelemetry] Global interaction capture unavailable:", error);
		}
	}
}
