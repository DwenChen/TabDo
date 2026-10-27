import { MagnifyingGlass, UploadSimple, ArrowClockwise } from "@presentation/components/ui/icons";
import { type CSSProperties } from "react";
import { Button } from "@presentation/components/ui/button";

import { Input } from "@presentation/components/ui/input";

import type { DashboardProps } from "./types";

import type { DashboardModel } from "./useDashboardModel";

export function DashboardToolbar({
	onImportFile,
	isRaw,
	query,
	setQuery,
	run,
	busy,
	actionLabel = "导入",
	action = "import",
}: Pick<
	DashboardProps & DashboardModel,
	"onImportFile" | "query" | "setQuery" | "run" | "busy" | "isRaw"
> & { actionLabel?: string; action?: "import" | "refresh" }) {
	return (
		<>
			<header
				className="flex h-24 shrink-0 items-center gap-5 px-7 pt-5 lg:px-10"
				style={{ WebkitAppRegion: "drag" } as CSSProperties}
			>
				<div
					className="relative min-w-0 flex-1"
					style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
				>
					<MagnifyingGlass className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground/60" />
					<Input
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						aria-label={isRaw ? "搜索原始录制" : "搜索项目"}
						placeholder={isRaw ? "搜索原始录制…" : "搜索项目…"}
						className="h-11 w-full border-0 bg-default/30 pl-10 shadow-none"
					/>
				</div>
				<div style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
					<Button
						variant="secondary"
						disabled={busy}
						onClick={() => void run(onImportFile)}
						className="h-10 shrink-0 gap-2 text-[13px]"
					>
						{action === "refresh" ? (
							<ArrowClockwise className="size-4" />
						) : (
							<UploadSimple className="size-4" />
						)}
						{actionLabel}
					</Button>
				</div>
			</header>
		</>
	);
}
