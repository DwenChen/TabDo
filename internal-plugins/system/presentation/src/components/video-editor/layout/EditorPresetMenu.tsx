import { BookmarkSimple, CaretDown, Check, X } from "@presentation/components/ui/icons";
import { Button } from "@presentation/components/ui/button";
import { Input } from "@presentation/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@presentation/components/ui/popover";
import type { useI18n } from "@presentation/contexts/I18nContext";
import { cn } from "@presentation/lib/utils";
import type { useVideoEditorPresets } from "../presets/useVideoEditorPresets";

type Props = {
	t: ReturnType<typeof useI18n>["t"];
	presets: ReturnType<typeof useVideoEditorPresets>;
};

export function EditorPresetMenu({ t, presets }: Props) {
	const {
		editorPresets,
		presetPopoverOpen,
		setPresetPopoverOpen,
		presetNameDraft,
		setPresetNameDraft,
		currentEditorPreset,
		handleApplyEditorPreset,
		handleDeleteEditorPreset,
		handleSavePresetSubmit,
	} = presets;

	return (
		<Popover open={presetPopoverOpen} onOpenChange={setPresetPopoverOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					type="button"
					title={t("editor.presets.open", "打开预设")}
					aria-label={t("editor.presets.open", "打开预设")}
					className="inline-flex h-9 min-w-0 max-w-40 items-center gap-2 px-3 text-sm"
				>
					<span className="flex min-w-0 items-center gap-2">
						<BookmarkSimple weight="fill" className="h-4 w-4" />
						<span className="truncate">
							{currentEditorPreset?.name ?? t("editor.presets.label", "预设")}
						</span>
					</span>
					<CaretDown className="h-3.5 w-3.5 text-foreground" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				sideOffset={10}
				aria-label="预设"
				className="w-[320px] p-4"
			>
				<div className="space-y-4">
					<h3 className="text-sm font-medium">{t("editor.presets.label", "预设")}</h3>
					<form
						onSubmit={(event) => {
							event.preventDefault();
							handleSavePresetSubmit();
						}}
						className="space-y-2"
					>
						<p className="text-xs font-medium text-foreground">
							{t("editor.presets.saveCurrentAs", "另存当前预设")}
						</p>
						<div className="flex items-center gap-2">
							<Input
								value={presetNameDraft}
								onChange={(event) => setPresetNameDraft(event.target.value)}
								className="h-9 min-w-0 flex-1 text-[13px]"
								placeholder={t("editor.presets.namePlaceholder", "预设名称")}
								aria-label={t("editor.presets.namePlaceholder", "预设名称")}
							/>
							<Button type="submit" size="sm" className="h-9 shrink-0 px-3">
								{t("common.actions.save", "保存")}
							</Button>
						</div>
					</form>
					<div className="space-y-2">
						<p className="text-xs font-medium text-foreground">
							{t("editor.presets.savedList", "已保存的预设")}
						</p>
						<div className="max-h-56 space-y-1 overflow-y-auto pr-1 custom-scrollbar">
							{editorPresets.length === 0 ? (
								<div className="rounded-lg bg-default px-3 py-4 text-center text-[11px] text-muted-foreground">
									{t("editor.presets.empty", "暂无预设。")}
								</div>
							) : (
								editorPresets.map((preset) => {
									const isActive = preset.id === currentEditorPreset?.id;
									return (
										<div
											key={preset.id}
											className={cn(
												"flex min-w-0 items-center gap-1 rounded-lg p-1 text-[13px] transition-colors",
												isActive
													? "bg-default text-foreground"
													: "text-muted hover:bg-default hover:text-foreground",
											)}
										>
											<Button
												variant="ghost"
												type="button"
												onClick={() => handleApplyEditorPreset(preset.id)}
												className="flex h-8 min-w-0 flex-1 items-center justify-between px-2 text-left text-[13px]"
											>
												<span className="truncate pr-3">{preset.name}</span>
												{isActive ? (
													<Check className="h-3.5 w-3.5 shrink-0 text-accent" />
												) : null}
											</Button>
											<Button
												variant="ghost"
												type="button"
												onClick={() => handleDeleteEditorPreset(preset.id)}
												size="icon"
												className="inline-flex h-7 w-7 min-w-7 shrink-0 items-center justify-center p-0"
												aria-label={t(
													"editor.presets.deleteAriaLabel",
													"删除预设 {{name}}",
													{ name: preset.name },
												)}
												title={t(
													"editor.presets.deleteAriaLabel",
													"删除预设 {{name}}",
													{ name: preset.name },
												)}
											>
												<X className="h-3.5 w-3.5" />
											</Button>
										</div>
									);
								})
							)}
						</div>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}
