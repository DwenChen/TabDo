import type { DashboardProps } from "./types";
import { Dropdown } from "@heroui/react";
import { CaretDown, Trash } from "@presentation/components/ui/icons";
import { ListChecks } from '@phosphor-icons/react';

import { Button } from "@presentation/components/ui/button";

import type { DashboardModel } from "./useDashboardModel";

/**
 * 展示项目筛选与批量选择入口，使用常见的列表勾选图标。
 * @param props 当前项目列表、筛选及批量操作。
 * @returns 筛选栏与按需显示的批量操作栏。
 */
export function DashboardFilters({
	isRaw,
	period,
	setPeriod,
	selecting,
	setSelecting,
	selected,
	setSelected,
	sort,
	setSort,
	visible,
	busy,
	deleteEntries,
	folders,
	assignSelectedFolder,
	hideSelection = false,
}: Pick<
	DashboardModel & DashboardProps,
	| "isRaw"
	| "period"
	| "setPeriod"
	| "selecting"
	| "setSelecting"
	| "selected"
	| "setSelected"
	| "sort"
	| "setSort"
	| "visible"
	| "busy"
	| "deleteEntries"
	| "folders"
	| "assignSelectedFolder"
> & { hideSelection?: boolean }) {
	return (
		<>
			<div className="flex items-center gap-3 px-7 pb-7 lg:px-10">
				<div className="flex gap-2" aria-label="时间筛选">
					{[
						["all", "全部"],
						["week", "最近 7 天"],
						["month", "最近 30 天"],
					].map(([id, label]) => (
						<Button
							key={id}
							variant="ghost"
							size="sm"
							aria-pressed={period === id}
							onClick={() => setPeriod(id)}
							className={`h-7 rounded-lg px-3 text-xs ${period === id ? "bg-default/60 text-foreground" : "text-muted-foreground"}`}
						>
							{label}
						</Button>
					))}
					{!hideSelection && (
						<Button
							variant="ghost"
							size="icon"
							className={`size-7 min-w-7 ${isRaw ? 'text-danger' : 'text-muted-foreground'}`}
							title={isRaw ? '选择要删除的录制' : '多选项目，可加入文件夹或删除'}
							aria-label={
								isRaw ? "选择要删除的录制" : "选择项目"
							}
							aria-pressed={selecting}
							onClick={() => {
								setSelecting(!selecting);
								setSelected([]);
							}}
						>
							{isRaw ? <Trash weight="fill" className="size-4" /> : <ListChecks className="size-4" />}
						</Button>
					)}
				</div>
				<div className="ml-auto">
					<Dropdown>
						<Button
							variant="ghost"
							size="sm"
							aria-label={isRaw ? "录制排序" : "项目排序"}
							className="h-7 gap-2 text-xs text-muted-foreground"
						>
							{sort === "recent"
								? isRaw
									? "最近创建"
									: "最近编辑"
								: sort === "created"
									? "最近创建"
									: "名称"}
							<CaretDown className="size-3" />
						</Button>
						<Dropdown.Popover>
							<Dropdown.Menu aria-label={isRaw ? "录制排序" : "项目排序"}>
								{!isRaw && (
									<Dropdown.Item id="recent" onAction={() => setSort("recent")}>
										最近编辑
									</Dropdown.Item>
								)}
								<Dropdown.Item id="created" onAction={() => setSort("created")}>
									最近创建
								</Dropdown.Item>
								<Dropdown.Item id="name" onAction={() => setSort("name")}>
									名称
								</Dropdown.Item>
							</Dropdown.Menu>
						</Dropdown.Popover>
					</Dropdown>
				</div>
			</div>
			{selecting && (
				<div className="flex items-center gap-3 px-7 pb-5 text-xs lg:px-10">
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setSelected(visible.map((e) => e.path))}
					>
						全选
					</Button>
					<span>{selected.length} 项已选择</span>
					{!isRaw && <Dropdown>
						<Button variant="secondary" size="sm" disabled={!selected.length || busy}>加入文件夹</Button>
						<Dropdown.Popover><Dropdown.Menu aria-label="批量加入文件夹">
							{folders.map((folder) => <Dropdown.Item key={folder.id} id={folder.id} onAction={() => assignSelectedFolder(folder.id)}>{folder.name}</Dropdown.Item>)}
							{!folders.length && <Dropdown.Item id="empty" isDisabled>请先在侧栏新建文件夹</Dropdown.Item>}
						</Dropdown.Menu></Dropdown.Popover>
					</Dropdown>}
					<Button
						variant="destructive"
						size="sm"
						disabled={!selected.length || busy}
						onClick={() => void deleteEntries(selected)}
					>
						删除
					</Button>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => {
							setSelecting(false);
							setSelected([]);
						}}
					>
						取消
					</Button>
				</div>
			)}
		</>
	);
}
