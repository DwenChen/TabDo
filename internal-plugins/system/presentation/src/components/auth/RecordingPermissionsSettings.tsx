import { useCallback, useEffect, useState } from "react";
import { Button } from "@presentation/components/ui/button";
import { SettingsRow } from "@presentation/components/video-editor/SettingsRow";

export function RecordingPermissionsSettings({ onReview }: { onReview?: () => void }) {
	const [status, setStatus] = useState<{
		mac: boolean;
		screen: boolean;
		accessibility: boolean;
	}>();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string>();
	const refresh = useCallback(async () => {
		setBusy(true);
		try {
			const mac = (await window.electronAPI.getPlatform()) === "darwin";
			if (mac) {
				const [screen, accessibility] = await Promise.all([
					window.electronAPI.getScreenRecordingPermissionStatus(),
					window.electronAPI.getAccessibilityPermissionStatus(),
				]);
				if (!screen.success || !accessibility.success)
					throw new Error("无法检查权限，请重试。");
				setStatus({
					mac,
					screen: screen.status === "granted",
					accessibility: accessibility.trusted,
				});
			} else setStatus({ mac, screen: true, accessibility: true });
			setError(undefined);
		} catch (error) {
			setError(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy(false);
		}
	}, []);
	useEffect(() => {
		void refresh();
		const check = () => void refresh();
		window.addEventListener("focus", check);
		return () => window.removeEventListener("focus", check);
	}, [refresh]);

	return (
		<div className="space-y-6">
			{!status && !error && (
				<p role="status" className="text-xs text-muted">

					正在检查权限…
				</p>
			)}
			{status?.mac && (
				<>
					{[
						{
							title: "屏幕录制",
							description: "捕获屏幕、窗口或选定区域。",
							granted: status.screen,
						},
						{
							title: "辅助功能",
							description: "记录鼠标轨迹并突出显示点击。",
							granted: status.accessibility,
						},
					].map(({ title, description, granted }) => (
						<SettingsRow key={title} title={title} description={description}>
							<span
								className={`text-xs font-medium ${granted ? "text-success" : "text-muted"}`}
							>
								{granted ? "已允许" : "必需"}
							</span>
						</SettingsRow>
					))}
					<Button
						variant="secondary"
						size="sm"
						disabled={busy}
						onClick={() => void refresh()}
					>

						重新检查
					</Button>
				</>
			)}
			{status && !status.mac && (
				<p className="text-xs leading-relaxed text-muted">

					开始录制时选择需要捕获的内容。
				</p>
			)}
			<SettingsRow
				title="麦克风与摄像头"
				description="Access is requested when you enable a microphone or camera for recording."
				stacked
			>
				<span className="text-xs text-muted">使用时请求权限</span>
			</SettingsRow>
			{error && (
				<div className="space-y-3">
					<p role="alert" className="text-xs text-danger">
						{error}
					</p>
					<Button
						variant="secondary"
						size="sm"
						disabled={busy}
						onClick={() => void refresh()}
					>

						重试
					</Button>
				</div>
			)}
			{onReview && (
				<SettingsRow
					title="权限设置"
					description="Review access and open system permission settings."
					stacked
				>
					<Button variant="secondary" size="sm" onClick={onReview}>

						查看权限
					</Button>
				</SettingsRow>
			)}
		</div>
	);
}
