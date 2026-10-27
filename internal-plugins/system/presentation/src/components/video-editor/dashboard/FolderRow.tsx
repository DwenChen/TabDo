import { Dropdown, Input } from "@heroui/react";
import { DotsThree } from "@presentation/components/ui/icons";
import { useState } from "react";
import { Button } from "@presentation/components/ui/button";
import { FolderColors } from "./FolderColors";
import type { ProjectFolder } from "./useProjectFolders";

export function FolderRow({
	folder,
	active,
	onSelect,
	onChange,
	onRemove,
	colors,
	onColors,
}: {
	folder: ProjectFolder;
	active: boolean;
	onSelect: () => void;
	onChange: (folder: ProjectFolder) => void;
	onRemove: () => void;
	colors: string[];
	onColors: (colors: string[]) => void;
}) {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(folder.name);
	const finish = () => {
		if (draft.trim()) onChange({ ...folder, name: draft.trim() });
		setEditing(false);
	};
	const edit = () => {
		setDraft(folder.name);
		requestAnimationFrame(() => requestAnimationFrame(() => setEditing(true)));
	};
	return (
		<div
			className={`folder-row group flex h-10 items-center gap-1 rounded-lg px-1 ${active ? "bg-default/70" : "hover:bg-default/40"}`}
		>
			<FolderColors
				value={folder.color}
				name={folder.name}
				onChange={(color) => onChange({ ...folder, color })}
				custom={colors}
				onCustomChange={onColors}
			/>
			{editing ? (
				<form
					className="min-w-0 flex-1"
					onSubmit={(event) => {
						event.preventDefault();
						finish();
					}}
				>
					<Input
						autoFocus
						onFocus={(event) => event.currentTarget.select()}
						aria-label="文件夹名称"
						className="h-8 w-full min-w-0 border-0 bg-transparent px-0 text-[13px] shadow-none"
						value={draft}
						maxLength={80}
						onChange={(event) => setDraft(event.target.value)}
						onBlur={finish}
						onKeyDown={(event) => {
							if (event.key === "Escape") {
								event.preventDefault();
								setEditing(false);
							}
						}}
					/>
				</form>
			) : (
				<Button
					variant="ghost"
					aria-current={active ? "page" : undefined}
					onClick={onSelect}
					onDoubleClick={edit}
					className="h-full min-w-0 flex-1 justify-start rounded-none px-0 text-[13px]"
				>
					<span className="truncate">{folder.name}</span>
				</Button>
			)}
			<Dropdown>
				<Button
					variant="ghost"
					size="icon"
					aria-label={`Options for ${folder.name}`}
					className="size-6 min-w-6 text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100"
				>
					<DotsThree className="size-4" />
				</Button>
				<Dropdown.Popover>
					<Dropdown.Menu aria-label="文件夹选项">
						<Dropdown.Item id="rename" onAction={edit}>
							重命名
						</Dropdown.Item>
						<Dropdown.Item id="remove" onAction={onRemove}>
							移除文件夹
						</Dropdown.Item>
					</Dropdown.Menu>
				</Dropdown.Popover>
			</Dropdown>
		</div>
	);
}
