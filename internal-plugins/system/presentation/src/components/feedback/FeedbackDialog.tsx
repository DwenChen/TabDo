import { useRef, useState } from "react";
import { Button, Description, Form, Input, Label, TextArea, TextField } from "@heroui/react";
import { useRecordlyAuth } from "@presentation/components/auth/useRecordlyAuth";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@presentation/components/ui/dialog";
import { ChatDots, File, X } from "@presentation/components/ui/icons";
import { feedbackDiagnostics } from "@presentation/lib/feedback/diagnostics";
import {
	feedbackErrorMessage,
	submitFeedback,
	validateAttachments,
} from "@presentation/lib/feedback/submitFeedback";

export function FeedbackDialog({
	className,
	showLabel = true,
	onSignIn,
}: {
	className?: string;
	showLabel?: boolean;
	onSignIn?: () => void;
}) {
	const auth = useRecordlyAuth();
	const [open, setOpen] = useState(false);
	const [subject, setSubject] = useState("");
	const [message, setMessage] = useState("");
	const [files, setFiles] = useState<File[]>([]);
	const [error, setError] = useState("");
	const [sending, setSending] = useState(false);
	const [sent, setSent] = useState(false);
	const sendingRef = useRef(false);
	const picker = useRef<HTMLInputElement>(null);
	function addFiles(incoming: File[]) {
		const next = [...files, ...incoming];
		const issue = validateAttachments(next);
		if (issue) {
			setError(issue);
			return;
		}
		setFiles(next);
		setError("");
	}
	return (
		<Dialog
			open={open}
			onOpenChange={(value) => {
				if (sendingRef.current) return;
				setOpen(value);
				if (value) setSent(false);
			}}
		>
			<DialogTrigger asChild>
				<Button variant="ghost" size="sm" className={className} aria-label="反馈">
					<ChatDots className="size-4" />
					{showLabel && "反馈"}
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>{sent ? "感谢反馈" : "发送反馈"}</DialogTitle>
				</DialogHeader>
				{sent ? (
					<Button onPress={() => setOpen(false)}>完成</Button>
				) : !auth.user ? (
					<div className="flex flex-col gap-4">
						<Description>登录后发送反馈。</Description>
						{onSignIn ? (
							<Button
								onPress={() => {
									setOpen(false);
									onSignIn();
								}}
							>
								登录
							</Button>
						) : (
							<Description>返回项目主页登录。</Description>
						)}
					</div>
				) : (
					<Form
						className="flex flex-col gap-4"
						onSubmit={async (event) => {
							event.preventDefault();
							if (sendingRef.current) return;
							if (!subject.trim() || !message.trim()) {
								setError("Add a subject and description.");
								return;
							}
							sendingRef.current = true;
							setSending(true);
							setError("");
							try {
								await submitFeedback({
									title: subject,
									subject: "other",
									message,
									files,
									logs: feedbackDiagnostics(),
								});
								setSent(true);
								setSubject("");
								setMessage("");
								setFiles([]);
							} catch (error) {
								setError(feedbackErrorMessage(error));
							} finally {
								sendingRef.current = false;
								setSending(false);
							}
						}}
					>
						<TextField
							name="subject"
							isRequired
							isDisabled={sending}
							value={subject}
							onChange={(value) => {
								setSubject(value);
								setError("");
							}}
							className="w-full"
						>
							<Label>主题</Label>
							<Input maxLength={160} placeholder="反馈主题" />
						</TextField>
						<TextField
							name="description"
							isRequired
							isDisabled={sending}
							value={message}
							onChange={(value) => {
								setMessage(value);
								setError("");
							}}
							className="w-full"
						>
							<Label>说明</Label>
							<TextArea
								maxLength={10000}
								rows={5}
								className="resize-y"
								placeholder="请描述具体情况…"
								onPaste={(event) => {
									const pasted = Array.from(event.clipboardData.files);
									if (pasted.length) {
										event.preventDefault();
										addFiles(pasted);
									}
								}}
							/>
						</TextField>
						<input
							ref={picker}
							type="file"
							multiple
							hidden
							disabled={sending}
							aria-label="添加附件"
							onChange={(event) => {
								addFiles(Array.from(event.target.files ?? []));
								event.target.value = "";
							}}
						/>
						<Button
							type="button"
							variant="secondary"
							size="sm"
							className="self-start"
							isDisabled={sending}
							onPress={() => picker.current?.click()}
						>
							<File className="size-4" />

							添加附件
						</Button>
						{files.length > 0 && (
							<div className="flex flex-col gap-1">
								{files.map((file, index) => (
									<div
										key={`${file.name}-${index}`}
										className="flex items-center gap-2 text-sm"
									>
										<span className="min-w-0 flex-1 truncate">{file.name}</span>
										<Button
											type="button"
											isIconOnly
											size="sm"
											variant="ghost"
											isDisabled={sending}
											aria-label={`移除${file.name}`}
											onPress={() =>
												setFiles(files.filter((_, i) => i !== index))
											}
										>
											<X className="size-3" />
										</Button>
									</div>
								))}
							</div>
						)}
						<Description className="text-xs">

							反馈将附带诊断信息。
						</Description>
						{error && (
							<Description role="alert" className="text-danger">
								{error}
							</Description>
						)}
						<Button type="submit" isDisabled={sending} className="w-full">
							{sending ? "正在发送…" : "发送反馈"}
						</Button>
					</Form>
				)}
			</DialogContent>
		</Dialog>
	);
}
