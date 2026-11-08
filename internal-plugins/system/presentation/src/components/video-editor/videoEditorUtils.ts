import { localizePresentationMessage } from '@presentation/lib/presentationMessages';

/**
 * 提取故障首行并提供可展示的中文说明。
 * @param message 原始故障文本。
 * @returns 简短中文故障说明。
 */
export function summarizeErrorMessage(message: string): string {
	const firstLine = message
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find((line) => line.length > 0);

	return localizePresentationMessage(firstLine ?? message);
}

export function cloneStructured<T>(value: T): T {
	return globalThis.structuredClone(value);
}

/**
 * 规范化系统及第三方故障，避免把未知英文直接展示给用户。
 * @param error 捕获的故障值。
 * @returns 可展示的中文错误说明。
 */
export function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return localizePresentationMessage(error.message);
	if (typeof error === "string") return localizePresentationMessage(error);
	return "操作未能完成，请重试";
}
