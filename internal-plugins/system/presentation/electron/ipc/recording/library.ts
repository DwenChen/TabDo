import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { recycleRecordingBundle } from "./recycle";
import { buildMediaUrl, getMediaServerBaseUrl } from "../../mediaServer";
import { rememberApprovedLocalReadPath } from "../project/manager";
import { getRecordingsDir } from "../utils";
import type { RecordingLibraryEntry } from "../../../src/types/recordingLibrary";

let mutation = Promise.resolve();
const undoBatches = new Map<string, { bundle: string; files: string[] }>();
const isRecording = (name: string) =>
	/\.(mp4|mov|webm|mkv|m4v)$/i.test(name) && !/[.-]webcam[.-]/i.test(name);
const isSource = (name: string) => /\.(mp4|mov|webm|mkv|m4v|wav|m4a|mp3|ogg|flac)$/i.test(name);
const batchKey = (paths: string[]) => JSON.stringify([...new Set(paths)].sort());
/**
 * 将选择和素材库目录都规范到真实父目录，保留移入暂存后已经不存在的文件名。
 * @param paths 用户选择的绝对素材路径，可包含Windows短路径或目录别名。
 * @returns 真实素材库根目录及去重后的规范素材路径。
 * @throws 路径不属于当前素材库、类型无效或父目录不可读取时抛错。
 */
async function resolveRecordingSelection(paths: string[]): Promise<{ root: string; selected: string[] }> {
	const root = await fs.realpath(await getRecordingsDir());
	const parents = new Map<string, string>([[root, root]]);
	const selected: string[] = [];
	for (const candidate of paths) {
		if (typeof candidate !== "string" || !path.isAbsolute(candidate) || !isSource(path.basename(candidate)))
			throw new Error("Recording is outside the Videos library");
		const parent = path.dirname(candidate);
		let resolvedParent = parents.get(parent);
		if (!resolvedParent) {
			resolvedParent = await fs.realpath(parent);
			parents.set(parent, resolvedParent);
		}
		// 别名只允许解析回同一素材库；链接到外部目录的选择仍拒绝。
		if (resolvedParent !== root) throw new Error("Recording is outside the Videos library");
		selected.push(path.join(root, path.basename(candidate)));
	}
	return { root, selected: [...new Set(selected)] };
}

/**
 * 列出当前素材库；只读查询不触发遗留删除事务。
 * @param includeSources 是否包括独立音频等来源。
 * @returns 已批准的素材列表。
 * @throws 目录读取失败或媒体服务未就绪时抛错。
 */
export function listRecordings(includeSources = false): Promise<RecordingLibraryEntry[]> {
	const task = mutation.then(async () => {
		const root = await fs.realpath(await getRecordingsDir());
		const server = getMediaServerBaseUrl();
		if (!server) throw new Error("Media server is not ready. Try again.");
		const entries = await fs.readdir(root, { withFileTypes: true });
		for (const entry of entries) {
			const staged = path.join(root, entry.name);
			if (
				entry.isDirectory() &&
				/^\.recordly-trash-[A-Za-z0-9]{6}$/.test(entry.name) &&
				![...undoBatches.values()].some((batch) => batch.bundle === staged)
			) {
				// 列表查询不能自动请求系统删除或提权，遗留包保留用于恢复。
				console.warn("[Recordings] Preserved interrupted removal bundle:", staged);
			}
		}
		const result: RecordingLibraryEntry[] = [];
		for (const entry of entries) {
			if (!entry.isFile() || !(includeSources ? isSource(entry.name) : isRecording(entry.name))) continue;
			const filePath = path.join(root, entry.name);
			const stat = await fs.stat(filePath);
			if (!stat.size) continue;
			await rememberApprovedLocalReadPath(filePath);
			result.push({
				path: filePath,
				name: entry.name,
				bytes: stat.size,
				createdAt: stat.mtimeMs,
				url: buildMediaUrl(server, filePath),
			});
		}
		return result.sort((a, b) => b.createdAt - a.createdAt);
	});
	mutation = task.then(
		() => undefined,
		() => undefined,
	);
	return task;
}

/**
 * 判断文件是否属于同一录制，只匹配专属伴随文件而非相邻素材或项目。
 * @param name 待检查文件名。
 * @param video 主录制文件名。
 * @returns 是否属于该录制包。
 */
export function belongsToRecording(name: string, video: string) {
	const stem = video.slice(0, -path.extname(video).length);
	return (
		name === video ||
		name === `${video}.cursor.json` ||
		name === `${video}.json` ||
		(name.startsWith(`${stem}.`) &&
			/\.(?:system|mic|microphone|audio|webcam)\.(?:wav|webm|mp4|m4a)(?:\.json)?$/i.test(
				name,
			)) ||
		name === `${stem}.recordly-session.json` ||
		name === `${stem}.recording-session.json` ||
		name === `${stem}.recording-diagnostics.json` ||
		(name.startsWith(`${stem}-webcam.`) && /\.(?:mp4|webm|mov|mkv|avi)(?:\.cursor\.json)?$/i.test(name))
	);
}

/**
 * Stage selected library sources and their exact sidecars for reversible removal.
 * @param paths Absolute paths inside the recordings library.
 * @param removed Whether to remove or restore the last selected bundle.
 * @returns Resolves after the entire bundle moves or rolls back.
 * @throws When a selected path is invalid, resolves outside the library or a filesystem operation fails.
 */
export function setRecordingsRemoved(paths: string[], removed: boolean): Promise<void> {
	const task = mutation.then(async () => {
		if (
			typeof removed !== "boolean" ||
			!Array.isArray(paths) ||
			!paths.length ||
			paths.some((value) => typeof value !== "string")
		)
			throw new Error("录制选择无效");
		const { root, selected } = await resolveRecordingSelection(paths);
		const key = batchKey(selected);
		if (!removed) {
			const batch = undoBatches.get(key);
			if (!batch)
				throw new Error(
					"This removal can no longer be undone. Restore the files from Trash.",
				);
			// Check every destination before restoring any file; never overwrite newer media.
			for (const file of batch.files) {
				if (
					await fs.lstat(file).then(
						() => true,
						(error) => {
							if (error.code === "ENOENT") return false;
							throw error;
						},
					)
				)
					throw new Error(
						"A file with this name already exists. Restore it from Trash instead.",
					);
			}
			const restored: string[] = [];
			try {
				for (const file of batch.files) {
					const staged = path.join(batch.bundle, path.basename(file));
					try {
						await fs.link(staged, file);
					} catch (error) {
						if (
							!["EPERM", "ENOTSUP", "EOPNOTSUPP", "EXDEV"].includes(
								(error as NodeJS.ErrnoException).code ?? "",
							)
						)
							throw error;
						await fs.copyFile(staged, file, constants.COPYFILE_EXCL);
					}
					restored.push(file);
				}
			} catch (error) {
				await Promise.all(restored.map((file) => fs.unlink(file)));
				throw error;
			}
			undoBatches.delete(key);
			await fs.rm(batch.bundle, { recursive: true, force: true });
			return;
		}
		const available = await fs.readdir(root, { withFileTypes: true });
		for (const file of selected) {
			if (!available.some((entry) => entry.name === path.basename(file) && entry.isFile()))
				throw new Error("Recording is missing or is not a regular file");
		}
		const files = available
			.filter(
				(entry) =>
					entry.isFile() &&
					selected.some((file) => belongsToRecording(entry.name, path.basename(file))),
			)
			.map((entry) => path.join(root, entry.name));
		const bundle = await fs.mkdtemp(path.join(root, ".recordly-trash-"));
		const moved: string[] = [];
		try {
			for (const file of files) {
				await fs.rename(file, path.join(bundle, path.basename(file)));
				moved.push(file);
			}
			undoBatches.set(key, { bundle, files });
		} catch (error) {
			for (const file of moved) await fs.rename(path.join(bundle, path.basename(file)), file);
			await fs.rmdir(bundle);
			throw error;
		}
	});
	mutation = task.catch(() => undefined);
	return task;
}

/**
 * 完成指定或全部明确登记的删除事务，不处理未知目录。
 * @param paths 指定的素材选择；省略时处理会话剩余事务。
 * @returns 系统回收结束后的 Promise。
 * @throws 系统拒绝回收时保留对应暂存包并抛错。
 */
async function finishPendingTrash(paths?: string[]) {
	// 移除、撤销和指定事务回收必须使用同一规范身份，不能丢失短路径选择的事务。
	const selectedKey = paths ? batchKey((await resolveRecordingSelection(paths)).selected) : null;
	for (const [key, batch] of undoBatches) {
		if (selectedKey !== null && key !== selectedKey) continue;
		await recycleRecordingBundle(batch.bundle);
		undoBatches.delete(key);
	}
}
/**
 * 串行回收当前明确选择的录制包，避免其他旧事务阻断本次删除。
 * @param paths 当前素材选择；退出清理时可以省略。
 * @returns 系统完成回收后的 Promise。
 */
export function clearRecordingTrashUndo(paths?: string[]) {
	const task = mutation.then(() => finishPendingTrash(paths));
	mutation = task.catch(() => undefined);
	return task;
}
