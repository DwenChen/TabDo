import { Plus } from "@presentation/components/ui/icons";
import { Button } from "@presentation/components/ui/button";
import { cn } from "@presentation/lib/utils";

export function RecordNewButton({
	busy,
	run,
	className,
	first = false,
}: {
	busy: boolean;
	run: (action: () => Promise<void>) => Promise<void>;
	className?: string;
	first?: boolean;
}) {
	return (
		<Button
			variant="default"
			disabled={busy}
			onClick={() => void run(() => window.electronAPI.showRecordingHud())}
			className={cn("h-10 shrink-0 gap-2 text-[13px]", className)}
		>
			<Plus className="size-4" />
			{first ? "录制第一个视频" : "开始录制"}
		</Button>
	);
}
