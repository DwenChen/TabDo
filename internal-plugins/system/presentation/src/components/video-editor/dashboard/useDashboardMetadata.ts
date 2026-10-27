import { useState } from "react";
import { toast } from "@presentation/components/ui/toast";

type Metadata = { colors: string[] };
const KEY = "recordly.dashboard-metadata.v1";
function load(): Metadata {
	try {
		const value = JSON.parse(localStorage.getItem(KEY) || "{}");
		return {
			colors: Array.isArray(value.colors)
				? value.colors.filter(
						(c: unknown) => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c),
					)
				: [],
		};
	} catch {
		return { colors: [] };
	}
}
export function useDashboardMetadata() {
	const [metadata, setMetadata] = useState(load);
	const update = (next: Metadata) => {
		try {
			localStorage.setItem(KEY, JSON.stringify(next));
			setMetadata(next);
		} catch {
			toast.error("无法保存素材库偏好");
		}
	};
	return { metadata, update };
}
