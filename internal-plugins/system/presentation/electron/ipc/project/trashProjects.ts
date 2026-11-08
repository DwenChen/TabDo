import path from "node:path";
import fs from "node:fs/promises";
import { getProjectBackupPath } from "./atomicSave";

type Dependencies = {
	list: () => Promise<{ entries: Array<{ path: string }> }>;
	trash: (path: string) => Promise<void>;
	thumbnailPath: (path: string) => string;
	trashBundle?: (paths: string[]) => Promise<void>;
};
/**
 * 回收已列入库的项目文件及附属文件，不依赖其素材仍然存在。
 * @param paths 用户明确选择的项目路径。
 * @param deps 库清单、系统回收与附属文件入口。
 * @returns 已回收路径及逐项目错误；失败项目原件保留。
 * @throws 选择格式无效或目标不在库中时抛错。
 */
export async function trashLibraryProjects(paths: unknown, deps: Dependencies) {
	if (
		!Array.isArray(paths) ||
		!paths.length ||
		paths.length > 500 ||
		paths.some((p) => typeof p !== "string")
	)
		throw new Error("项目选择无效");
	const allowed = new Set((await deps.list()).entries.map((e) => path.resolve(e.path)));
	const selected = [...new Set((paths as string[]).map((p) => path.resolve(p)))];
	if (selected.some((p) => !allowed.has(p))) throw new Error("该项目不在当前项目库中");
	const deleted: string[] = [];
	const errors: string[] = [];
	for (const projectPath of selected) {
		try {
			if (deps.trashBundle) {
				await deps.trashBundle([projectPath, deps.thumbnailPath(projectPath), getProjectBackupPath(projectPath)]);
				deleted.push(projectPath);
				continue;
			}
			await deps.trash(projectPath);
			deleted.push(projectPath);
			for (const sidecar of [
				deps.thumbnailPath(projectPath),
				getProjectBackupPath(projectPath),
			]) {
				try {
					await fs.access(sidecar);
					await deps.trash(sidecar);
				} catch (e) {
					if ((e as NodeJS.ErrnoException).code !== "ENOENT")
						errors.push(`无法回收项目附属文件：${sidecar}`);
				}
			}
		} catch {
			errors.push(`无法移入回收站：${path.basename(projectPath)}`);
		}
	}
	return { deleted, errors };
}
