import { useEffect, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { TextField, Label, Input } from "@heroui/react";
import { AccountAvatar, getAccountProfile } from "@presentation/components/ui/account-avatar";
import { Button } from "@presentation/components/ui/button";
import { SettingsRow } from "@presentation/components/video-editor/SettingsRow";
import {
	requestAccountEmailChange,
	signOutRecordly,
	updateAccountName,
} from "@presentation/lib/auth/recordlyAuth";

const providerNames: Record<string, string> = {
	email: "Email magic link",
	google: "Google",
	azure: "Microsoft",
	github: "GitHub",
};

function profileName(user: User | null): string {
	const name = user?.user_metadata?.full_name ?? user?.user_metadata?.name;
	return typeof name === "string" ? name : "";
}

export function AccountSettings({ user }: { user: User | null }) {
	const [name, setName] = useState(() => profileName(user));
	const [email, setEmail] = useState(user?.email ?? "");
	const [busy, setBusy] = useState<string>();
	const [error, setError] = useState<string>();
	const [message, setMessage] = useState<string>();
	const savedName = profileName(user);
	useEffect(() => setName(savedName), [savedName]);
	useEffect(() => setEmail(user?.email ?? ""), [user?.email]);

	const run = async (action: string, work: () => Promise<void>) => {
		if (busy) return;
		setBusy(action);
		setError(undefined);
		setMessage(undefined);
		try {
			await work();
		} catch (error) {
			setError(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy(undefined);
		}
	};
	const submitName = (event: FormEvent) => {
		event.preventDefault();
		void run("name", async () => {
			await updateAccountName(name);
			setMessage("Profile saved.");
		});
	};
	const submitEmail = (event: FormEvent) => {
		event.preventDefault();
		void run("email", async () => {
			const updated = await requestAccountEmailChange(email);
			setMessage(
				updated.email === email.trim()
					? "Email address updated."
					: "Check your current and new inboxes for confirmation instructions.",
			);
		});
	};

	if (!user) return <p className="text-sm text-muted">登录后管理账户。</p>;
	const profile = getAccountProfile(user);
	const providers = [
		...new Set([
			...(user.identities?.map((identity) => identity.provider) ?? []),
			...(Array.isArray(user.app_metadata.providers) ? user.app_metadata.providers : []),
		]),
	].filter((provider): provider is string => typeof provider === "string");
	const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
	return (
		<div className="space-y-6">
			<div className="flex min-w-0 items-center gap-3">
				<AccountAvatar user={user} className="size-12" />
				<div className="min-w-0">
					<p className="truncate text-sm font-semibold">{profile.name}</p>
					<p className="break-all text-xs text-muted">{user.email}</p>
				</div>
			</div>
			<form onSubmit={submitName} className="space-y-3" aria-label="个人资料设置">
				<TextField
					name="displayName"
					value={name}
					onChange={setName}
					isRequired
					isDisabled={Boolean(busy)}
				>
					<Label>显示名称</Label>
					<Input maxLength={80} autoComplete="name" className="w-full" />
				</TextField>
				<Button
					type="submit"
					variant="secondary"
					size="sm"
					disabled={Boolean(busy) || !name.trim() || name.trim() === profileName(user)}
				>
					{busy === "name" ? "正在保存…" : "保存资料"}
				</Button>
			</form>
			<form onSubmit={submitEmail} className="space-y-3" aria-label="邮箱设置">
				<TextField
					name="email"
					type="email"
					value={email}
					onChange={setEmail}
					isRequired
					isDisabled={Boolean(busy)}
				>
					<Label>邮箱地址</Label>
					<Input autoComplete="email" className="w-full" />
				</TextField>
				<p className="text-xs leading-relaxed text-muted">

					请先通过确认邮件验证新地址，再用其登录。
				</p>
				{user.new_email && user.new_email !== user.email && (
					<p role="status" className="break-words text-xs text-muted">

						等待确认： {user.new_email}
					</p>
				)}
				<Button
					type="submit"
					variant="secondary"
					size="sm"
					disabled={
						Boolean(busy) ||
						!validEmail ||
						email.trim().toLowerCase() === user.email?.toLowerCase() ||
						email.trim() === user.new_email
					}
				>
					{busy === "email" ? "正在发送…" : "更改邮箱"}
				</Button>
			</form>
			<SettingsRow
				title="登录方式"
				description="Methods connected to your account."
				stacked
			>
				<ul className="flex flex-wrap gap-2" aria-label="已关联的登录方式">
					{providers.map((provider) => (
						<li
							key={provider}
							className="rounded-lg bg-surface-secondary px-3 py-2 text-xs"
						>
							{providerNames[provider] ?? provider}
						</li>
					))}
				</ul>
			</SettingsRow>
			{message && (
				<p role="status" className="text-xs leading-relaxed text-success">
					{message}
				</p>
			)}
			{error && (
				<p role="alert" className="text-xs leading-relaxed text-danger">
					{error}
				</p>
			)}
			<SettingsRow
				title="退出登录"
				description="Sign out of Recordly on all devices. Local projects stay on this computer."
				stacked
			>
				<Button
					variant="destructive-soft"
					size="sm"
					disabled={Boolean(busy)}
					onClick={() => void run("signout", signOutRecordly)}
				>
					{busy === "signout" ? "正在退出…" : "退出登录"}
				</Button>
			</SettingsRow>
		</div>
	);
}
