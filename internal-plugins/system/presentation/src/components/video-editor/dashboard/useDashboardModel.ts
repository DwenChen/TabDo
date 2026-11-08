import { removeProjectShareLinks } from "../cloud/projectShareLinks";
import { useRawLibrary } from "./useRawLibrary";
import { useEffect, useMemo, useState } from "react";
import { toast } from "@presentation/components/ui/toast";
import type { ProjectLibraryEntry } from "../ProjectBrowserDialog";
import type { DashboardProps } from "./types";
import { useDashboardMetadata } from "./useDashboardMetadata";
import { useProjectFolders } from "./useProjectFolders";
/**
 * 管理项目筛选、批量归类及关联素材提示，不将项目局部问题写入全局错误。
 * @param props 项目库与宿主打开、保存和回收入口。
 * @returns 项目页状态及对应操作。
 */
export function useDashboardModel({
	entries,
	onOpenChange,
	onOpenProject,
	onRenameProject,
	onDeleteProjects,
	onBeforeDeleteRecordings,
	onRefreshProjects,
	open,
}: DashboardProps) {
	const { metadata, update } = useDashboardMetadata();
	const [selecting, setSelecting] = useState(false);
	const [selected, setSelected] = useState<string[]>([]);
	const [pendingDeletion, setPendingDeletion] = useState<{ paths: string[]; projects: string[] } | null>(null);
	const [problem, setProblem] = useState<{ entry: ProjectLibraryEntry; message: string } | null>(null);
	const toggleSelected = (path: string) =>
		setSelected((prev) =>
			prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
		);
	const { folders, save } = useProjectFolders();
	const assignFolder = (path: string, id: string) =>
		save(
			folders.map((f) => ({
				...f,
				paths:
					f.id === id
						? f.paths.includes(path)
							? f.paths.filter((p) => p !== path)
							: [...f.paths, path]
						: id === "none"
							? f.paths.filter((p) => p !== path)
							: f.paths,
			})),
		);
	const [query, setQuery] = useState("");
	const [period, setPeriod] = useState("all");
	const [sort, setSort] = useState("recent");
	const [section, changeSection] = useState("projects");
	const [library, setLibrary] = useState("projects");
	useEffect(() => {
		if (!open) return;
		changeSection("projects");
		setLibrary("projects");
		setQuery("");
		setSelecting(false);
		setSelected([]);
	}, [open]);
	const raw = useRawLibrary(open && library === "raw");
	const [rawPreview, setRawPreview] = useState<ProjectLibraryEntry | null>(null);
	const isRaw = library === "raw";
	const setSection = (next: string) => {
		if (next === "projects" || next === "raw") setLibrary(next);
		changeSection(next);
		setQuery("");
		setSelecting(false);
		setSelected([]);
	};
	const libraryEntries = isRaw ? raw.entries : entries;
	const [busy, setBusy] = useState(false);
	/**
	 * 将选中项目追加到目标文件夹，重复添加不取消已有归类。
	 * @param id 目标文件夹身份。
	 * @returns 无返回值；保留其他文件夹中的成员关系。
	 */
	const assignSelectedFolder = (id: string): void => {
		save(folders.map((folder) => folder.id === id ? { ...folder, paths: [...new Set([...folder.paths, ...selected])] } : folder));
		toast.success(`已将 ${selected.length} 个项目加入文件夹`);
	};
	const visible = useMemo(
		() =>
			libraryEntries
				.filter((entry) => {
					const cutoff =
						period === "week"
							? Date.now() - 7 * 86400000
							: period === "month"
								? Date.now() - 30 * 86400000
								: 0;
					const folder = folders.find((f) => f.id === section);
					return (
						entry.updatedAt >= cutoff &&
						entry.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) &&
						(!folder || folder.paths.includes(entry.path))
					);
				})
				.sort((a, b) =>
					sort === "name"
						? a.name.localeCompare(b.name)
						: sort === "created"
							? (b.createdAt ?? b.updatedAt) - (a.createdAt ?? a.updatedAt)
							: b.updatedAt - a.updatedAt,
				),
		[libraryEntries, query, period, sort, folders, section],
	);
	const run = async (action: () => Promise<void>) => {
		if (busy) return;
		setBusy(true);
		try {
			await action();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "操作未能完成");
		} finally {
			setBusy(false);
		}
	};
	/**
	 * 回收明确选择的项目或素材，删除当前录制前先释放编辑器和待保存队列。
	 * @param paths 已确认的库内路径。
	 * @returns 操作完成后的 Promise。
	 */
	const performDelete = (paths: string[]) =>
		run(async () => {
			if (isRaw) await onBeforeDeleteRecordings?.(paths);
			const deleted = await (isRaw ? raw.remove : onDeleteProjects)(paths);
			if (isRaw) await onRefreshProjects?.();
			removeProjectShareLinks(deleted);
			save(
				folders.map((folder) => ({
					...folder,
					paths: folder.paths.filter((path) => !deleted.includes(path)),
				})),
			);
			setSelected((current) => current.filter((path) => !deleted.includes(path)));
			if (selected.every((path) => deleted.includes(path))) setSelecting(false);
		});
	/**
	 * 删除前展示引用这些原始录制的项目；无关联时沿普通回收流程处理。
	 * @param paths 当前选择的库内路径。
	 * @returns 无返回值；关联素材等待界面内的明确选择。
	 */
	const deleteEntries = (paths: string[]): void => {
		const normalize = (value: string) => value.replaceAll('\\', '/').toLowerCase();
		const projects = isRaw ? entries.filter((entry) => entry.mediaPaths?.some((file) => paths.some((raw) => normalize(file) === normalize(raw)))).map((entry) => entry.name) : [];
		if (projects.length) setPendingDeletion({ paths, projects });
		else void performDelete(paths);
	};

	/**
	 * 将素材缺失及打开失败关联到具体项目，不将错误带入设置或其他项目。
	 * @param entry 用户选择的项目或原始录制。
	 * @returns 无返回值；必要时展示项目管理提示。
	 */
	const openEntry = (entry: ProjectLibraryEntry): void => {
		if (entry.rawSource) { setRawPreview(entry); return; }
		if (entry.missingMediaPaths?.length) { setProblem({ entry, message: '项目引用的素材已删除或移动，暂时无法播放或导出。编辑记录仍然保留，请将素材恢复到下方列出的原路径后重试，也可删除不再需要的项目。从系统回收站还原录制文件包后，需要将其中的素材放回原路径。' }); return; }
		if (entry.isCurrent) { onOpenChange(false); return; }
		void run(async () => {
			try { await onOpenProject(entry.path); }
			catch (error) { setProblem({ entry, message: error instanceof Error ? error.message : '暂时无法打开该项目，请检查素材是否仍在原位置。' }); }
		});
	};
	const navClass = (active: boolean) =>
		`h-10 w-full justify-start gap-3 px-3 text-[13px] ${active ? "bg-default/50 font-medium" : "text-muted-foreground"}`;

	return {
		pendingDeletion, setPendingDeletion, problem, setProblem, performDelete,
		assignSelectedFolder,
		isRaw,
		rawPreview,
		setRawPreview,
		rawLoading: raw.loading,
		rawError: raw.error,
		refreshRaw: raw.refresh,
		onRenameProject: isRaw ? raw.rename : onRenameProject,
		onDeleteProjects: isRaw ? raw.remove : onDeleteProjects,
		metadata,
		update,
		selecting,
		setSelecting,
		selected,
		setSelected,
		deleteEntries,
		toggleSelected,
		assignFolder,
		query,
		hasActiveFilters:
			Boolean(query.trim()) || period !== "all" || folders.some((f) => f.id === section),
		setQuery,
		period,
		setPeriod,
		sort,
		setSort,
		section,
		setSection,
		busy,
		folders,
		save,
		visible,
		run,
		openEntry,
		navClass,
	};
}
export type DashboardModel = ReturnType<typeof useDashboardModel>;
