import { useCallback, useEffect, useState } from "react";
import { localizePresentationMessage } from '@presentation/lib/presentationMessages';
import type { ProjectLibraryEntry } from "../ProjectBrowserDialog";

const NAMES_KEY = "recordly.raw-names.v1";
function loadNames(): Record<string, string> {
	try {
		const value = JSON.parse(localStorage.getItem(NAMES_KEY) || "{}");
		if (!value || typeof value !== "object" || Array.isArray(value)) return {};
		return Object.fromEntries(
			Object.entries(value).filter(
				(entry): entry is [string, string] => typeof entry[1] === "string",
			),
		);
	} catch {
		return {};
	}
}
export function useRawLibrary(enabled: boolean) {
	const [entries, setEntries] = useState<ProjectLibraryEntry[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			const result = await window.electronAPI.listRecordings(true);
			if (!result.success) throw Error(result.error);
			const names = loadNames();
			setEntries(
				result.value
					.map((rawSource) => ({
						path: rawSource.path,
						name: names[rawSource.path] || rawSource.name,
						createdAt: rawSource.createdAt,
						updatedAt: rawSource.createdAt,
						thumbnailPath: null,
						isCurrent: false,
						isInProjectsDirectory: false,
						rawSource,
					})),
			);
			setError(null);
		} catch (error) {
			setError(localizePresentationMessage(String(error)));
		} finally {
			setLoading(false);
		}
	}, []);
	useEffect(() => {
		if (enabled) void refresh();
	}, [enabled, refresh]);
	const rename = async (path: string, name: string) => {
		localStorage.setItem(NAMES_KEY, JSON.stringify({ ...loadNames(), [path]: name }));
		setEntries((previous) =>
			previous.map((entry) => (entry.path === path ? { ...entry, name } : entry)),
		);
		return path;
	};
	/**
	 * 登记完整删除任务，系统确认回收或原件恢复后再更新素材列表。
	 * @param paths Selected library source paths.
	 * @returns Paths actually removed from disk.
	 * @throws When the host cannot complete the removal.
	 */
	const remove = (paths: string[]) => window.electronAPI.runNecessaryTask(async () => {
		const result = await window.electronAPI.trashRecordingFiles(paths);
		if (!result.success) throw new Error(result.error || "无法删除原始录制");
		// Publish the UI removal only after the host confirms the filesystem move.
		setEntries((previous) => previous.filter((entry) => !paths.includes(entry.path)));
		return paths;
	});
	return { entries, error, loading, refresh, rename, remove };
}
